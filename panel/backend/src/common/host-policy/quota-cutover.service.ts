import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

import { NodesQueuesService } from '@queue/_nodes/nodes-queues.service';
import { UsersQueuesService } from '@queue/_users/users-queues.service';

import { DurableUsageService, UsageNode } from './durable-usage.service';
import { LegacyBillingService } from './legacy-billing.service';
import { LegacyUsageService } from './legacy-usage.service';
import { UsageEffectsService } from './usage-effects.service';
import { readUsageQueueProof } from './usage-queue-proof';

@Injectable()
export class QuotaCutoverService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly legacy: LegacyUsageService,
        private readonly durable: DurableUsageService,
        private readonly effects: UsageEffectsService,
        private readonly nodeQueues: NodesQueuesService,
        private readonly userQueues: UsersQueuesService,
        private readonly billing: LegacyBillingService,
    ) {}

    private async oldQueuesIdle(): Promise<boolean> {
        const proof = await readUsageQueueProof(
            this.nodeQueues.queues.recordUserUsage,
            this.userQueues.queues.updateUsersUsage,
            'cutover',
        );
        return proof.entries.every((entry) => entry.count === '0');
    }

    // Full recovery also covers queued collection work; the enrollment drain
    // below intentionally has a different, narrower scheduling boundary.
    async recoveryQueueProof() {
        if (this.transactions.isTransactionActive())
            throw new Error('Queue recovery proof requires standalone observations');
        return readUsageQueueProof(
            this.nodeQueues.queues.recordUserUsage,
            this.userQueues.queues.updateUsersUsage,
            'recovery',
        );
    }

    private roster(nodes: UsageNode[]): UsageNode[] {
        if (this.transactions.isTransactionActive())
            throw new Error('Quota cutover requires standalone commits');
        if (
            !nodes.length ||
            nodes.length > 10000 ||
            new Set(nodes.map((node) => node.nodeUuid)).size !== nodes.length ||
            new Set(nodes.map((node) => node.nodeId.toString())).size !== nodes.length
        )
            throw new Error('Invalid quota cutover roster');
        return [...nodes].sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1));
    }

    async bootstrap(nodes: UsageNode[]): Promise<void> {
        const roster = this.roster(nodes);
        await this.billing.replayPending();
        for (let offset = 0; offset < roster.length; offset += 8) {
            const results = await Promise.allSettled(
                roster.slice(offset, offset + 8).map(async (node) => {
                    const effects = (
                        receipt: string,
                        value: Parameters<UsageEffectsService['apply']>[3],
                    ) => this.effects.apply(node.nodeUuid, node.nodeId, receipt, value);
                    await this.legacy.collect(node, effects, true);
                    // Initializing the durable core journal also disables all future
                    // legacy destructive reads. This first sample is not yet proof
                    // that old asynchronous global billing jobs have drained.
                    if (!(await this.durable.collect(node, effects)))
                        throw new Error('Quota fence mode disappeared');
                }),
            );
            for (const result of results) if (result.status === 'rejected') throw result.reason;
        }
    }

    async drain(nodes: UsageNode[]): Promise<boolean> {
        await this.bootstrap(nodes);
        return this.confirmDrained(nodes);
    }

    async confirmDrained(nodes: UsageNode[]): Promise<boolean> {
        const roster = this.roster(nodes);
        if (!(await this.oldQueuesIdle())) return false;
        return this.transactions.withTransaction({ timeout: 30000 }, async () => {
            const debt =
                await sql`SELECT 1 FROM xera_legacy_usage_jobs WHERE NOT applied LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (debt.rows.length)
                throw new Error('Unapplied legacy billing intent requires recovery');
            await sql`SELECT 1 FROM xera_lock_usage_nodes(${roster.map((node) => node.nodeId.toString())}::bigint[])`.execute(
                this.db.kysely,
            );
            const proof = await sql<{ node: string; ready: boolean }>`SELECT m.node_uuid AS node,
                m.user_quota AND m.phase='FENCING' AND m.initial_core=m.fenced_core
                AND s.stream_id=m.instance_uuid AND s.last_core=m.initial_core
                AND s.last_committed_sequence>0 AND floor(extract(epoch FROM s.last_requested_at)*1000)>
                    floor(extract(epoch FROM m.fenced_at)*1000)
                AND NOT EXISTS(SELECT 1 FROM xera_legacy_usage_streams l WHERE l.node_uuid=m.node_uuid
                    AND (l.requested_at IS NOT NULL OR l.uncertain_since IS NOT NULL)) AS ready
                FROM unnest(${roster.map((node) => node.nodeUuid)}::uuid[],${roster.map((node) => node.nodeId.toString())}::bigint[]) AS r(uuid,id)
                JOIN nodes n ON n.uuid=r.uuid AND n.id=r.id
                JOIN xera_quota_node_modes m ON m.node_uuid=n.uuid
                LEFT JOIN xera_node_usage_streams s ON s.node_uuid=m.node_uuid AND s.node_id=n.id
                ORDER BY n.id FOR UPDATE OF m`.execute(this.db.kysely);
            if (proof.rows.length !== roster.length || proof.rows.some((row) => row.ready !== true))
                throw new Error('Legacy debt or native continuity requires recovery');
            await sql`UPDATE xera_quota_node_modes SET legacy_usage_drained_at=COALESCE(legacy_usage_drained_at,clock_timestamp())
                WHERE node_uuid=ANY(${roster.map((node) => node.nodeUuid)}::uuid[])`.execute(
                this.db.kysely,
            );
            // A later native sample, prepared strictly after this commit, is
            // required by both the collector and the SQL allocator.
            return true;
        });
    }
}
