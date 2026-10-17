import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { TxKyselyService } from '@common/database';

import { DurableUsageService, UsageEffects, UsageNode } from './durable-usage.service';
import { HostUsageService } from './host-usage.service';
import { UsageJournalService } from './usage-journal.service';

type Snapshot = {
    stats: { name: string; value: string }[];
    capturedAt: string;
    coreProcessId: string | null;
};
type Pending = {
    stream: string;
    nodeId: string;
    sequence: string;
    requestedAt: Date | null;
    multiplier: string | null;
    payload: Snapshot | null;
    applied: boolean;
    effects: UsageEffects | null;
};
const maxInt64 = 9223372036854775807n;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function counter(value: unknown): string {
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value < 0)
            throw new Error('Legacy usage counter is not an exact nonnegative integer');
        return String(value);
    }
    if (
        typeof value !== 'string' ||
        !/^(0|[1-9][0-9]{0,18})$/.test(value) ||
        BigInt(value) > maxInt64
    )
        throw new Error('Legacy usage counter exceeds int64');
    return value;
}

export function legacySnapshot(value: unknown): Snapshot {
    if (!value || typeof value !== 'object') throw new Error('Missing legacy usage response');
    const response = value as { users?: unknown; coreProcessId?: unknown };
    if (!Array.isArray(response.users) || response.users.length > 50000)
        throw new Error('Invalid legacy usage response size');
    const stats: Snapshot['stats'] = [];
    const seen = new Set<string>();
    for (const entry of response.users) {
        if (!entry || typeof entry !== 'object') throw new Error('Invalid legacy usage row');
        const { username, uplink, downlink } = entry;
        if (
            typeof username !== 'string' ||
            !username ||
            username.length > 900 ||
            username.includes('>>>') ||
            seen.has(username)
        )
            throw new Error('Invalid or duplicate legacy usage identity');
        seen.add(username);
        for (const [direction, raw] of [
            ['uplink', uplink],
            ['downlink', downlink],
        ] as const) {
            const bytes = counter(raw);
            if (bytes !== '0')
                stats.push({ name: `user>>>${username}>>>traffic>>>${direction}`, value: bytes });
        }
    }
    const snapshot = {
        stats,
        capturedAt: String(Date.now()),
        coreProcessId:
            typeof response.coreProcessId === 'string' && uuid.test(response.coreProcessId)
                ? response.coreProcessId
                : null,
    };
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 8 * 1024 * 1024)
        throw new Error('Legacy usage snapshot exceeds 8 MiB');
    return snapshot;
}

@Injectable()
export class LegacyUsageService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly axios: AxiosService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly billing: DurableUsageService,
        private readonly hostUsage: HostUsageService,
        private readonly journal: UsageJournalService,
    ) {}

    private async lock(nodeId: bigint) {
        await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${nodeId.toString()},20261016))`.execute(
            this.db.kysely,
        );
    }

    private async pending(node: UsageNode) {
        const rows = await sql<Pending>`SELECT stream_id AS stream,node_id::text AS "nodeId",
            next_sequence::text AS sequence,requested_at AS "requestedAt",consumption_multiplier::text AS multiplier,
            payload,applied,pending_effects AS effects FROM xera_legacy_usage_streams
            WHERE node_uuid=${node.nodeUuid}::uuid`.execute(this.db.kysely);
        const row = rows.rows[0];
        if (row && row.nodeId !== node.nodeId.toString())
            throw new Error('Legacy usage node identity changed');
        return row;
    }

    async collect(
        node: UsageNode,
        effects: (receipt: string, value: UsageEffects) => Promise<void>,
        drainOnly = false,
    ) {
        if (this.transactions.isTransactionActive())
            throw new Error('Legacy usage requires committed standalone transactions');
        if (!/^(0|[1-9][0-9]{0,18})$/.test(node.multiplier) || BigInt(node.multiplier) > maxInt64)
            throw new Error('Invalid usage multiplier');
        await this.billing.assertBillingAllowed();
        await this.hostUsage.drain(node.nodeId);
        const committed = await this.transactions.withTransaction(
            { timeout: 30000, isolationLevel: 'ReadCommitted' },
            async () => {
                await this.lock(node.nodeId);
                await this.billing.assertBillingAllowed();
                let current = await this.pending(node);
                if (current?.requestedAt && !current.payload) {
                    // Legacy reset has no replay protocol. Preserve that uncertainty
                    // for cutover, while ordinary collection may continue on old nodes.
                    await this.journal.markUncertain(node);
                    current = await this.pending(node);
                }
                if (!current?.payload) {
                    if (drainOnly || (await this.billing.isManaged(node.nodeUuid))) return null;
                    // Commit the intent independently while the outer node advisory
                    // lock excludes another read or a quota-mode transition.
                    await this.journal.prepare(node);
                    await this.billing.assertBillingAllowed();
                    const result = await this.axios.getUsersStats({ reset: true }, node.opts);
                    if (!result.isOk)
                        throw new Error(
                            'Legacy usage reset response unavailable; continuity is unproven',
                        );
                    const snapshot = legacySnapshot(result.response);
                    // This payload survives rollback of the billing transaction.
                    await this.journal.capture(node, snapshot);
                    current = await this.pending(node);
                }
                if (!current?.payload || !current.requestedAt || current.multiplier === null)
                    throw new Error('Legacy usage snapshot requires recovery');
                if (!current.applied) {
                    const pendingEffects = await this.billing.applySnapshot(
                        node,
                        current,
                        current.payload.stats,
                        current.payload.capturedAt,
                    );
                    await sql`UPDATE xera_legacy_usage_streams SET applied=true,pending_effects=${JSON.stringify(pendingEffects)}::jsonb,updated_at=now()
                    WHERE node_uuid=${node.nodeUuid}::uuid`.execute(this.db.kysely);
                }
                return (await this.pending(node))!;
            },
        );
        if (!committed) return null;
        await this.billing.assertBillingAllowed();
        if (committed.effects)
            await effects(`${committed.stream}-${committed.sequence}`, committed.effects);
        await this.transactions.withTransaction({ timeout: 30000 }, async () => {
            await this.lock(node.nodeId);
            await this.billing.assertBillingAllowed();
            await sql`UPDATE xera_legacy_usage_streams SET next_sequence=next_sequence+1,requested_at=NULL,
                consumption_multiplier=NULL,payload=NULL,applied=false,pending_effects=NULL,updated_at=now()
                WHERE node_uuid=${node.nodeUuid}::uuid AND stream_id=${committed.stream}::uuid
                AND next_sequence=${committed.sequence}::bigint AND applied`.execute(
                this.db.kysely,
            );
        });
        return {
            requestedAt: committed.requestedAt!.getTime(),
            coreProcessId: committed.payload!.coreProcessId,
        };
    }
}
