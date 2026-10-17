import { createHash } from 'node:crypto';
import { z } from 'zod';

const maximum = 9223372036854775807n;
const decimal = z.string().refine((v) => /^(0|[1-9][0-9]{0,18})$/.test(v) && BigInt(v) <= maximum);
const owner = decimal.refine((v) => v !== '0');
const uuid = z.uuid().transform((v) => v.toLowerCase());
export const legacyReceipt = z.string().regex(/^[a-f0-9]{64}$/);
export const legacyQueueCapture = z.strictObject({
    generation: uuid,
    offset: z.number().int().min(0).max(1000000).default(0),
});
export const legacyRecoveryDraft = z.strictObject({
    generation: uuid,
    allocations: z
        .array(
            z.discriminatedUnion('action', [
                z.strictObject({
                    owner,
                    action: z.literal('CHARGE'),
                    subject: uuid,
                    period: z.enum(['CURRENT', 'LIFETIME']),
                }),
                z.strictObject({ owner, action: z.literal('LOSS') }),
            ]),
        )
        .max(1500),
    note: z.string().trim().min(10).max(1000),
});
export const legacyRecoveryApproval = legacyRecoveryDraft.extend({
    requestId: uuid,
    planDigest: legacyReceipt,
});
const payloadSchema = z.array(z.strictObject({ u: owner, b: decimal, n: z.uuid() })).max(1500);
const pendingSchema = z.array(owner).max(1500).nullable();
export type LegacyRecoveryDraft = z.infer<typeof legacyRecoveryDraft>;
export type LegacyRecoveryApproval = z.infer<typeof legacyRecoveryApproval>;
export type LegacyRecoverySource = {
    digest: string;
    payload: unknown;
    applied: boolean;
    pendingUsers: unknown;
    committedAt: string;
};
export type LegacyRecoveryTarget = {
    subject: string;
    userId: string;
    username: string;
    used: string;
    lifetime: string;
    epoch: string;
    resetAt: string | null;
    limit: string;
    strategy: string;
};
export class LegacyRecoveryError extends Error {
    constructor(
        readonly code:
            | 'NOT_PENDING'
            | 'SOURCE_MISSING'
            | 'SOURCE_INVALID'
            | 'TARGET_CHANGED'
            | 'INVALID_ALLOCATION'
            | 'OVERFLOW'
            | 'STALE_PLAN'
            | 'ALREADY_RESOLVED'
            | 'REQUEST_CONFLICT'
            | 'QUEUE_UNAVAILABLE'
            | 'DECISION_CORRUPT',
    ) {
        super('LEGACY_RECOVERY_' + code);
    }
}
export function legacyRecoveryDigest(value: string) {
    return createHash('sha256').update(value).digest('hex');
}
export function normalizeLegacyDraft(input: LegacyRecoveryDraft) {
    return {
        generation: input.generation,
        allocations: [...input.allocations].sort((a, b) =>
            BigInt(a.owner) < BigInt(b.owner) ? -1 : BigInt(a.owner) > BigInt(b.owner) ? 1 : 0,
        ),
        note: input.note,
    };
}
export function validateLegacySource(source: LegacyRecoverySource) {
    const result = payloadSchema.safeParse(source.payload),
        pending = pendingSchema.safeParse(source.pendingUsers);
    if (!result.success || !pending.success) throw new LegacyRecoveryError('SOURCE_INVALID');
    const owners = new Set(result.data.map((row) => row.u));
    if (
        legacyRecoveryDigest(JSON.stringify(result.data)) !== source.digest ||
        owners.size !== result.data.length ||
        (!source.applied && pending.data !== null) ||
        (pending.data !== null &&
            (new Set(pending.data).size !== pending.data.length ||
                pending.data.some((id) => !owners.has(id))))
    )
        throw new LegacyRecoveryError('SOURCE_INVALID');
    return { ...source, payload: result.data, pendingUsers: pending.data };
}
export function createLegacyRecoveryPlan(
    receipt: string,
    sourceValue: LegacyRecoverySource,
    draft: LegacyRecoveryDraft,
    targets: LegacyRecoveryTarget[],
) {
    const source = validateLegacySource(sourceValue),
        input = normalizeLegacyDraft(draft);
    if (source.applied && source.pendingUsers === null)
        throw new LegacyRecoveryError('NOT_PENDING');
    const allocations = new Map(input.allocations.map((r) => [r.owner, r]));
    if (
        allocations.size !== input.allocations.length ||
        (source.applied ? allocations.size !== 0 : allocations.size !== source.payload.length)
    )
        throw new LegacyRecoveryError('INVALID_ALLOCATION');
    const bySubject = new Map(targets.map((t) => [t.subject, t]));
    const charged = new Map<
        string,
        LegacyRecoveryTarget & { bytes: bigint; currentBytes: bigint }
    >();
    const losses: { owner: string; bytes: string; nodeUuid: string }[] = [];
    if (!source.applied)
        for (const row of source.payload) {
            const allocation = allocations.get(row.u);
            if (!allocation) throw new LegacyRecoveryError('INVALID_ALLOCATION');
            if (allocation.action === 'LOSS')
                losses.push({ owner: row.u, bytes: row.b, nodeUuid: row.n });
            else {
                const target = bySubject.get(allocation.subject);
                if (
                    !target ||
                    !owner.safeParse(target.userId).success ||
                    !decimal.safeParse(target.used).success ||
                    !decimal.safeParse(target.lifetime).success ||
                    !decimal.safeParse(target.limit).success ||
                    !z.uuid().safeParse(target.epoch).success ||
                    !z.string().max(64).nullable().safeParse(target.resetAt).success ||
                    !z
                        .enum(['NO_RESET', 'DAY', 'WEEK', 'MONTH', 'MONTH_ROLLING'])
                        .safeParse(target.strategy).success
                )
                    throw new LegacyRecoveryError('TARGET_CHANGED');
                const prior = charged.get(target.subject);
                charged.set(target.subject, {
                    ...target,
                    bytes: (prior?.bytes ?? 0n) + BigInt(row.b),
                    currentBytes:
                        (prior?.currentBytes ?? 0n) +
                        (allocation.period === 'CURRENT' ? BigInt(row.b) : 0n),
                });
            }
        }
    const charges = [...charged.values()]
        .sort((a, b) => (BigInt(a.userId) < BigInt(b.userId) ? -1 : 1))
        .map((t) => {
            const used = BigInt(t.used) + t.currentBytes,
                lifetime = BigInt(t.lifetime) + t.bytes;
            if (used > maximum || lifetime > maximum) throw new LegacyRecoveryError('OVERFLOW');
            return {
                subject: t.subject,
                userId: t.userId,
                username: t.username,
                bytes: t.bytes.toString(),
                currentBytes: t.currentBytes.toString(),
                window: {
                    epoch: t.epoch,
                    resetAt: t.resetAt,
                    limit: t.limit,
                    strategy: t.strategy,
                },
                before: { used: t.used, lifetime: t.lifetime },
                after: { used: used.toString(), lifetime: lifetime.toString() },
            };
        });
    const plan = {
        version: 'remnacust-legacy-recovery-v1' as const,
        receipt,
        generation: input.generation,
        source,
        allocations: input.allocations,
        note: input.note,
        ownership: 'EXPLICIT_ADMIN_ASSIGNMENT' as const,
        charges,
        losses,
        discardedEvents: source.applied ? source.pendingUsers! : [],
        totals: {
            charged: charges.reduce((n, r) => n + BigInt(r.bytes), 0n).toString(),
            current: charges.reduce((n, r) => n + BigInt(r.currentBytes), 0n).toString(),
            lost: losses.reduce((n, r) => n + BigInt(r.bytes), 0n).toString(),
        },
    };
    const text = JSON.stringify(plan);
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new LegacyRecoveryError('SOURCE_INVALID');
    return { plan, text, digest: legacyRecoveryDigest(text) };
}
