import type { Queue } from 'bullmq';

import { z } from 'zod';

const states = [
    'active',
    'wait',
    'paused',
    'delayed',
    'prioritized',
    'waiting-children',
    'failed',
] as const;
const scopeSchema = z.enum(['cutover', 'recovery']);
const entriesFor = (scope: z.infer<typeof scopeSchema>) => [
    ...(scope === 'recovery' ? states : (['active'] as const)).map((state) => ({
        queue: 'node' as const,
        state,
    })),
    ...states.map((state) => ({ queue: 'user' as const, state })),
];
export const usageQueueProofSchema = z
    .strictObject({
        version: z.literal('remnacust-usage-queue-proof-v1'),
        scope: scopeSchema,
        serverRunId: z.string().regex(/^[a-f0-9]{40}$/),
        database: z.int().nonnegative().max(2147483647),
        observedAt: z.iso.datetime(),
        entries: z
            .array(
                z.strictObject({
                    queue: z.enum(['node', 'user']),
                    state: z.enum(states),
                    key: z.string().min(1).max(512),
                    count: z
                        .string()
                        .regex(/^(0|[1-9][0-9]{0,18})$/)
                        .refine((value) => BigInt(value) <= 9223372036854775807n),
                }),
            )
            .min(8)
            .max(14),
    })
    .refine((value) => {
        const expected = entriesFor(value.scope);
        return (
            value.entries.length === expected.length &&
            new Set(value.entries.map((entry) => entry.key)).size === expected.length &&
            value.entries.every(
                (entry, index) =>
                    entry.queue === expected[index].queue && entry.state === expected[index].state,
            )
        );
    });
export type UsageQueueProof = z.infer<typeof usageQueueProofSchema>;
type UsageQueue = Pick<Queue, 'toKey' | 'getBackend'>;

// Use the primary connection, not a readOnly script hint which some adapters
// route to replicas. Every state is read in one Lua command on the same DB.
export async function readUsageQueueProof(
    nodes: UsageQueue,
    users: UsageQueue,
    scope: z.infer<typeof scopeSchema> = 'recovery',
    timeoutMs = 3000,
): Promise<UsageQueueProof> {
    scopeSchema.parse(scope);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
        throw new Error('Invalid queue proof timeout');
    const operation = async () => {
        const [nodeClient, userClient] = await Promise.all([
            nodes.getBackend().connection.client,
            users.getBackend().connection.client,
        ]);
        const identity = async (client: typeof userClient) => {
            if (client.isCluster || client.status !== 'ready')
                throw new Error('Queue primary connection is unavailable');
            const info = await client.info();
            const runId = /^run_id:([a-f0-9]{40})\r?$/m.exec(info)?.[1];
            if (!runId || !/^role:master\r?$/m.test(info))
                throw new Error('Queue primary identity is unavailable');
            const database = client.options.db ?? client.options.database ?? 0;
            if (
                !Number.isSafeInteger(database) ||
                database < 0 ||
                database > 2147483647 ||
                (client.options.db !== undefined &&
                    client.options.database !== undefined &&
                    client.options.db !== client.options.database)
            )
                throw new Error('Queue database identity is unavailable');
            return { runId, database };
        };
        const [nodeIdentity, userIdentity] = await Promise.all([
            identity(nodeClient),
            identity(userClient),
        ]);
        if (
            nodeIdentity.runId !== userIdentity.runId ||
            nodeIdentity.database !== userIdentity.database
        )
            throw new Error('Usage queues do not share one primary database');
        const entries = entriesFor(scope).map((entry) => ({
            ...entry,
            key: (entry.queue === 'node' ? nodes : users).toKey(entry.state),
        }));
        if (
            entries.some((entry) => !entry.key || entry.key.length > 512) ||
            new Set(entries.map((entry) => entry.key)).size !== entries.length
        )
            throw new Error('Invalid usage queue keys');
        const command =
            scope === 'recovery'
                ? 'remnacustUsageQueueProofV1Recovery'
                : 'remnacustUsageQueueProofV1Cutover';
        userClient.defineCommand(command, {
            numberOfKeys: entries.length,
            lua: `
            local result = {}
            for i,key in ipairs(KEYS) do
                if ARGV[i] == 'list' then result[i] = tostring(redis.call('LLEN',key))
                else result[i] = tostring(redis.call('ZCARD',key)) end
            end
            return result`,
        });
        const counts: unknown = await userClient.runCommand(command, [
            ...entries.map((entry) => entry.key),
            ...entries.map((entry) =>
                ['active', 'wait', 'paused'].includes(entry.state) ? 'list' : 'zset',
            ),
        ]);
        if (!Array.isArray(counts) || counts.length !== entries.length)
            throw new Error('Invalid usage queue proof');
        const [nodeAfter, userAfter] = await Promise.all([
            identity(nodeClient),
            identity(userClient),
        ]);
        if (
            JSON.stringify(nodeAfter) !== JSON.stringify(nodeIdentity) ||
            JSON.stringify(userAfter) !== JSON.stringify(userIdentity)
        )
            throw new Error('Usage queue primary changed during proof');
        return usageQueueProofSchema.parse({
            version: 'remnacust-usage-queue-proof-v1',
            scope,
            serverRunId: userIdentity.runId,
            database: userIdentity.database,
            observedAt: new Date().toISOString(),
            entries: entries.map((entry, index) => ({ ...entry, count: counts[index] })),
        });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error('Usage queue proof timed out')),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

// This LIVE observation is necessary, not authorization to resume. It must be
// obtained by trusted server code again before the durable financial decision.
export function requireEmptyRecoveryQueueProof(value: unknown) {
    const proof = usageQueueProofSchema.parse(value);
    if (proof.scope !== 'recovery' || proof.entries.some((entry) => entry.count !== '0'))
        throw new Error('Usage queues still require recovery');
    return proof;
}

export function requireApprovedRecoveryQueueProof(value: unknown, expected: unknown) {
    const proof = requireEmptyRecoveryQueueProof(value);
    if (!expected || typeof expected !== 'object' || Array.isArray(expected))
        throw new Error('Usage queue source changed');
    const prior = requireEmptyRecoveryQueueProof({ ...expected, observedAt: proof.observedAt });
    const { observedAt: _one, ...left } = prior,
        { observedAt: _two, ...right } = proof;
    if (JSON.stringify(left) !== JSON.stringify(right))
        throw new Error('Usage queue source changed');
    return proof;
}
