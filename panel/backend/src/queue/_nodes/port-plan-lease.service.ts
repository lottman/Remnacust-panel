import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

export class PortPlanLeaseLostError extends Error {
    constructor() {
        super('Port-plan delivery ownership changed');
    }
}

@Injectable()
export class PortPlanLeaseService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
    ) {}

    async acquire(nodeUuid: string): Promise<PortPlanLease | 'busy' | null> {
        const owner = randomUUID();
        const result = await sql<{ revision: string; epoch: string }>`
            UPDATE xera_node_port_plans p SET delivery_owner=${owner}::uuid,
              delivery_until=clock_timestamp()+interval '120 seconds',delivery_epoch=delivery_epoch+1
            FROM nodes n WHERE p.node_uuid=${nodeUuid}::uuid AND n.uuid=p.node_uuid AND NOT n.is_disabled
              AND (delivery_until IS NULL OR delivery_until<=clock_timestamp())
              AND delivery_epoch<9223372036854775807
            RETURNING p.revision::text,p.delivery_epoch::text AS epoch`.execute(this.db.kysely);
        if (result.rows[0])
            return new PortPlanLease(
                this,
                nodeUuid,
                owner,
                result.rows[0].epoch,
                result.rows[0].revision,
            );
        const exists =
            await sql`SELECT node_uuid FROM xera_node_port_plans WHERE node_uuid=${nodeUuid}::uuid`.execute(
                this.db.kysely,
            );
        return exists.rows.length ? 'busy' : null;
    }

    async renew(lease: PortPlanLease, minimumEpoch?: string): Promise<string> {
        if (
            minimumEpoch !== undefined &&
            (!/^(0|[1-9][0-9]{0,18})$/.test(minimumEpoch) ||
                BigInt(minimumEpoch) >= 9223372036854775807n)
        )
            throw new PortPlanLeaseLostError();
        const result = await sql<{ epoch: string }>`UPDATE xera_node_port_plans p
            SET delivery_until=clock_timestamp()+interval '120 seconds',
                delivery_epoch=GREATEST(delivery_epoch,${minimumEpoch ?? '0'}::bigint+CASE WHEN ${minimumEpoch !== undefined} THEN 1 ELSE 0 END)
            WHERE node_uuid=${lease.nodeUuid}::uuid AND delivery_owner=${lease.owner}::uuid AND delivery_until>clock_timestamp()
              AND EXISTS(SELECT 1 FROM nodes n WHERE n.uuid=p.node_uuid AND NOT n.is_disabled)
            RETURNING delivery_epoch::text AS epoch`.execute(this.db.kysely);
        if (!result.rows[0]) throw new PortPlanLeaseLostError();
        return result.rows[0].epoch;
    }

    async commit<T>(lease: PortPlanLease, action: () => Promise<T>): Promise<T> {
        if (this.transactions.isTransactionActive())
            throw new Error('Delivery result requires its own commit boundary');
        return this.transactions.withTransaction({ timeout: 10000 }, async () => {
            // Match the editor's node -> header lock order. Never hold a SQL
            // transaction across network I/O, validation or config preparation.
            await sql`SELECT uuid FROM nodes WHERE uuid=${lease.nodeUuid}::uuid FOR UPDATE`.execute(
                this.db.kysely,
            );
            const owned =
                await sql`SELECT p.node_uuid FROM xera_node_port_plans p JOIN nodes n ON n.uuid=p.node_uuid
                WHERE p.node_uuid=${lease.nodeUuid}::uuid AND p.delivery_owner=${lease.owner}::uuid
                AND p.delivery_until>clock_timestamp() AND NOT n.is_disabled FOR UPDATE OF p`.execute(
                    this.db.kysely,
                );
            if (!owned.rows.length) throw new PortPlanLeaseLostError();
            return action();
        });
    }

    async release(lease: PortPlanLease): Promise<void> {
        await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            await sql`SELECT uuid FROM nodes WHERE uuid=${lease.nodeUuid}::uuid FOR UPDATE`.execute(
                this.db.kysely,
            );
            const released =
                await sql`UPDATE xera_node_port_plans SET delivery_owner=NULL,delivery_until=NULL
                WHERE node_uuid=${lease.nodeUuid}::uuid AND delivery_owner=${lease.owner}::uuid RETURNING node_uuid`.execute(
                    this.db.kysely,
                );
            if (released.rows.length)
                await sql`UPDATE nodes SET is_connecting=false WHERE uuid=${lease.nodeUuid}::uuid`.execute(
                    this.db.kysely,
                );
        });
    }
}

export class PortPlanLease {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private renewal: Promise<void> | null = null;
    private lost = false;
    private closed = false;
    constructor(
        private readonly service: PortPlanLeaseService,
        readonly nodeUuid: string,
        readonly owner: string,
        public epoch: string,
        readonly revision: string,
    ) {
        this.schedule();
    }
    get delivery() {
        return { epoch: this.epoch, owner: this.owner };
    }
    private schedule() {
        if (this.closed || this.lost) return;
        this.timer = setTimeout(() => {
            this.renewal = this.assert()
                .catch(() => {
                    this.lost = true;
                })
                .finally(() => {
                    this.renewal = null;
                    this.schedule();
                });
        }, 20000);
        this.timer.unref();
    }
    async assert(minimumEpoch?: string): Promise<void> {
        if (this.lost || this.closed) throw new PortPlanLeaseLostError();
        try {
            const epoch = await this.service.renew(this, minimumEpoch);
            if (BigInt(epoch) > BigInt(this.epoch)) this.epoch = epoch;
        } catch (error) {
            this.lost = true;
            throw error;
        }
    }
    async commit<T>(action: () => Promise<T>): Promise<T> {
        if (this.lost || this.closed) throw new PortPlanLeaseLostError();
        return this.service.commit(this, action);
    }
    async close(): Promise<void> {
        this.closed = true;
        if (this.timer) clearTimeout(this.timer);
        await this.renewal;
        await this.service.release(this);
    }
}
