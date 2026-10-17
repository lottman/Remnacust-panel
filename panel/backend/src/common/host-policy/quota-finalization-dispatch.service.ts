import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

import { QuotaRecoveryFinalizationService } from './quota-recovery-finalization.service';

const errors = new Set([
    'REQUEST_CONFLICT',
    'APPROVAL_MISSING',
    'NOT_PENDING',
    'NOT_READY',
    'SOURCE_CHANGED',
    'BUSY',
    'NODE_UNAVAILABLE',
    'INVALID_ACK',
    'LEASE_LOST',
]);
@Injectable()
export class QuotaFinalizationDispatchService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly finalizations: QuotaRecoveryFinalizationService,
    ) {}
    private async claim() {
        return this.transactions.withTransaction(
            { isolationLevel: 'RepeatableRead', timeout: 10000 },
            async () => {
                // Same lock order as finalization: restore state before dispatch row.
                await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton FOR UPDATE`.execute(
                    this.db.kysely,
                );
                const job = (
                    await sql<{ request: string; approval: string; actor: string; note: string }>`
                SELECT d.request_id::text AS request,f.approval_request::text AS approval,f.actor_uuid::text AS actor,f.note
                FROM xera_quota_recovery_finalization_dispatches d JOIN xera_quota_recovery_finalizations f ON f.request_id=d.request_id
                WHERE (d.state='QUEUED' OR (d.state='RUNNING' AND d.lease_until<=clock_timestamp()))
                    AND (f.lease_until IS NULL OR f.lease_until<=clock_timestamp() OR f.result IS NOT NULL)
                ORDER BY d.queued_at,d.request_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED`.execute(
                        this.db.kysely,
                    )
                ).rows[0];
                if (!job) return null;
                const owner = randomUUID();
                await sql`UPDATE xera_quota_recovery_finalization_dispatches SET state='RUNNING',attempts=attempts+1,
                lease_owner=${owner}::uuid,lease_until=clock_timestamp()+interval '240 seconds',last_error=NULL,updated_at=clock_timestamp()
                WHERE request_id=${job.request}::uuid`.execute(this.db.kysely);
                return { ...job, owner };
            },
        );
    }
    async runOne() {
        if (this.transactions.isTransactionActive())
            throw Error('Finalization dispatch requires standalone transactions');
        const job = await this.claim();
        if (!job) return false;
        let error: string | null = null;
        try {
            await this.finalizations.finalize(
                { requestId: job.request, approvalRequest: job.approval, note: job.note },
                job.actor,
                job.owner,
            );
        } catch (failure) {
            const code =
                failure && typeof failure === 'object' && 'code' in failure
                    ? failure.code
                    : undefined;
            error = typeof code === 'string' && errors.has(code) ? code : 'UNVERIFIED';
        }
        // A failed outcome COMMIT leaves RUNNING intact. After expiry another
        // worker reuses the immutable intent and can read its completed result.
        await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton FOR UPDATE`.execute(
                this.db.kysely,
            );
            await sql`UPDATE xera_quota_recovery_finalization_dispatches SET state=${error ? 'FAILED' : 'COMPLETED'},last_error=${error},
                lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp()
                WHERE request_id=${job.request}::uuid AND state='RUNNING' AND lease_owner=${job.owner}::uuid AND lease_until>clock_timestamp()`.execute(
                this.db.kysely,
            );
        });
        return true;
    }
}
