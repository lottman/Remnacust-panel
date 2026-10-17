import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

import { QuotaBankRecoveryService } from './quota-bank-recovery.service';
import { QuotaCutoverService } from './quota-cutover.service';
import {
    readRecoveryObligations,
    requireSettledRecoveryObligations,
} from './quota-recovery-obligations';
import { releaseDraft } from './quota-recovery-release.service';
import { recoveryNodeRoster } from './quota-recovery-roster';
import { QuotaReleaseDeliveryService } from './quota-release-delivery.service';
import { requireApprovedRecoveryQueueProof } from './usage-queue-proof';

const uuid = releaseDraft.shape.requestId;
export const recoveryFinalizationRequest = z.strictObject({
    requestId: uuid,
    approvalRequest: uuid,
    note: releaseDraft.shape.note,
});
const completion = z.strictObject({
    requestId: uuid,
    approvalRequest: uuid,
    generation: uuid,
    attemptId: uuid,
    coordinatorGeneration: uuid,
    completedAt: z.string().datetime({ offset: true, precision: 6 }),
});
type Input = z.infer<typeof recoveryFinalizationRequest>;
type Intent = {
    request: string;
    approval: string;
    generation: string;
    actor: string;
    digest: string;
    baseline: string;
    planText: string;
    planDigest: string;
    result: unknown;
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class RecoveryFinalizationError extends Error {
    constructor(
        readonly code:
            | 'REQUEST_CONFLICT'
            | 'APPROVAL_MISSING'
            | 'NOT_PENDING'
            | 'NOT_READY'
            | 'SOURCE_CHANGED'
            | 'BUSY'
            | 'LEASE_LOST',
    ) {
        super(code);
    }
}

@Injectable()
export class QuotaRecoveryFinalizationService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly banks: QuotaBankRecoveryService,
        private readonly cutover: QuotaCutoverService,
        private readonly delivery: QuotaReleaseDeliveryService,
    ) {}
    private async intent(request: string) {
        return (
            await sql<Intent>`SELECT f.request_id::text AS request,f.approval_request::text AS approval,
            f.generation::text,f.actor_uuid::text AS actor,f.request_digest AS digest,f.result,
            a.baseline_request::text AS baseline,a.plan_text AS "planText",a.plan_digest AS "planDigest"
            FROM xera_quota_recovery_finalizations f JOIN xera_quota_recovery_release_approvals a ON a.request_id=f.approval_request
            WHERE f.request_id=${request}::uuid`.execute(this.db.kysely)
        ).rows[0];
    }
    private exact(item: Intent, input: Input, actor: string) {
        if (
            item.approval !== input.approvalRequest ||
            item.actor !== actor ||
            item.digest !== hash(JSON.stringify(input))
        )
            throw new RecoveryFinalizationError('REQUEST_CONFLICT');
        if (hash(item.planText) !== item.planDigest)
            throw new RecoveryFinalizationError('SOURCE_CHANGED');
        if (item.result !== null) {
            const result = completion.parse(item.result);
            if (
                result.requestId !== item.request ||
                result.approvalRequest !== item.approval ||
                result.generation !== item.generation
            )
                throw new RecoveryFinalizationError('SOURCE_CHANGED');
            return result;
        }
        return null;
    }
    private async pending(generation: string) {
        const state =
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid
            AND reconciled_at IS NULL FOR UPDATE`.execute(this.db.kysely);
        if (!state.rows.length) throw new RecoveryFinalizationError('NOT_PENDING');
    }
    private async financial(item: Intent, requireAll: boolean) {
        const obligations = await readRecoveryObligations(this.db, item.generation);
        if (!obligations) throw new RecoveryFinalizationError('NOT_PENDING');
        if (!requireAll) {
            const own = (
                await sql<{
                    pending: string;
                }>`SELECT count(*) FILTER(WHERE result IS NULL)::text AS pending
                FROM xera_quota_recovery_release_jobs WHERE approval_request=${item.approval}::uuid`.execute(
                    this.db.kysely,
                )
            ).rows[0];
            obligations.recoveryDeliveries = (
                BigInt(obligations.recoveryDeliveries) - BigInt(own.pending)
            ).toString();
        }
        try {
            requireSettledRecoveryObligations(obligations);
        } catch {
            throw new RecoveryFinalizationError('NOT_READY');
        }
        const bank = await this.banks.compareInTransaction(item.baseline, item.generation);
        if (!bank.matches) throw new RecoveryFinalizationError('SOURCE_CHANGED');
        const roster = (
            await sql<{
                node: string;
            }>`SELECT node_uuid::text AS node FROM (${recoveryNodeRoster}) r ORDER BY node_uuid LIMIT 10001`.execute(
                this.db.kysely,
            )
        ).rows;
        const jobs = (
            await sql<{
                request: string;
                node: string;
            }>`SELECT request_id::text AS request,node_uuid::text AS node
            FROM xera_quota_recovery_release_jobs WHERE approval_request=${item.approval}::uuid ORDER BY node_uuid`.execute(
                this.db.kysely,
            )
        ).rows;
        if (
            !jobs.length ||
            jobs.length > 10000 ||
            JSON.stringify(roster.map((r) => r.node)) !== JSON.stringify(jobs.map((j) => j.node))
        )
            throw new RecoveryFinalizationError('SOURCE_CHANGED');
        const endpoints = (
            await sql<{
                connection: string;
                address: string;
                port: number;
                proxy: string | null;
                instance: string | null;
                expected: string;
                disabled: boolean | null;
            }>`SELECT j.connection_hash AS connection,n.address,n.port,n.proxy_url AS proxy,m.instance_uuid::text AS instance,
            j.payload->>'instance' AS expected,n.is_disabled AS disabled FROM xera_quota_recovery_release_jobs j
            LEFT JOIN nodes n ON n.uuid=j.node_uuid LEFT JOIN xera_quota_node_modes m ON m.node_uuid=j.node_uuid
            WHERE j.approval_request=${item.approval}::uuid`.execute(this.db.kysely)
        ).rows;
        if (
            endpoints.some(
                (e) =>
                    e.disabled !== false ||
                    e.instance !== e.expected ||
                    e.connection !== hash(JSON.stringify([e.address, e.port, e.proxy])),
            )
        )
            throw new RecoveryFinalizationError('SOURCE_CHANGED');
        return jobs;
    }
    private async lease(item: Intent, attempt: string, dispatchOwner?: string) {
        await this.pending(item.generation);
        await this.dispatchLease(item.request, dispatchOwner);
        const owned =
            await sql`UPDATE xera_quota_recovery_finalizations SET lease_until=clock_timestamp()+interval '180 seconds'
            WHERE request_id=${item.request}::uuid AND result IS NULL AND lease_owner=${attempt}::uuid AND lease_until>clock_timestamp() RETURNING 1`.execute(
                this.db.kysely,
            );
        if (!owned.rows.length) throw new RecoveryFinalizationError('LEASE_LOST');
    }
    async details(request: string, after?: string) {
        uuid.parse(request);
        if (after) uuid.parse(after);
        const row = (
            await sql<{
                requestId: string;
                approvalRequest: string;
                generation: string;
                actor: string;
                note: string;
                busy: boolean;
                result: unknown;
                total: string;
                dispatch: {
                    state: string;
                    attempts: string;
                    error: string | null;
                    owner: string | null;
                } | null;
            }>`SELECT f.request_id::text AS "requestId",f.approval_request::text AS "approvalRequest",f.generation::text,
            f.actor_uuid::text AS actor,f.note,COALESCE(f.lease_until>clock_timestamp(),false) AS busy,f.result,
            (SELECT jsonb_build_object('state',d.state,'attempts',d.attempts::text,'error',d.last_error,'owner',d.lease_owner::text) FROM xera_quota_recovery_finalization_dispatches d WHERE d.request_id=f.request_id) AS dispatch,
            (SELECT count(*)::text FROM xera_quota_recovery_release_jobs j WHERE j.approval_request=f.approval_request) AS total
            FROM xera_quota_recovery_finalizations f WHERE f.request_id=${request}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!row) throw new RecoveryFinalizationError('APPROVAL_MISSING');
        let cursor: { at: string; id: string } | undefined;
        if (after) {
            cursor = (
                await sql<{
                    at: string;
                    id: string;
                }>`SELECT created_at::text AS at,attempt_id::text AS id
                FROM xera_quota_recovery_finalization_attempts WHERE request_id=${request}::uuid AND attempt_id=${after}::uuid AND phase='REQUESTED'`.execute(
                    this.db.kysely,
                )
            ).rows[0];
            if (!cursor) throw new RecoveryFinalizationError('APPROVAL_MISSING');
        }
        const attempts = (
            await sql<{
                attempt: string;
                requestedAt: Date;
                observedAt: Date | null;
                outcome: unknown;
                checked: string;
                dispatchOwner: string | null;
            }>`
            SELECT r.attempt_id::text AS attempt,r.created_at AS "requestedAt",o.created_at AS "observedAt",o.details AS outcome,r.details->>'dispatchOwner' AS "dispatchOwner",
                (SELECT count(*)::text FROM xera_quota_recovery_finalization_checks c WHERE c.attempt_id=r.attempt_id) AS checked
            FROM xera_quota_recovery_finalization_attempts r LEFT JOIN xera_quota_recovery_finalization_attempts o ON o.attempt_id=r.attempt_id AND o.phase='OBSERVED'
            WHERE r.request_id=${request}::uuid AND r.phase='REQUESTED'
                ${cursor ? sql`AND (r.created_at,r.attempt_id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql``}
            ORDER BY r.created_at DESC,r.attempt_id DESC LIMIT 21`.execute(this.db.kysely)
        ).rows;
        return {
            ...row,
            result: row.result === null ? null : completion.parse(row.result),
            attempts: attempts.slice(0, 20),
            nextAfter: attempts.length > 20 ? attempts[19].attempt : null,
        };
    }
    private async savedIntent(input: Input, actor: string) {
        const approval = (
            await sql<{
                generation: string;
            }>`SELECT generation::text FROM xera_quota_recovery_release_approvals WHERE request_id=${input.approvalRequest}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!approval) throw new RecoveryFinalizationError('APPROVAL_MISSING');
        await this.pending(approval.generation);
        const conflict =
            await sql`SELECT 1 FROM xera_quota_recovery_finalizations WHERE approval_request=${input.approvalRequest}::uuid AND request_id<>${input.requestId}::uuid`.execute(
                this.db.kysely,
            );
        if (conflict.rows.length) throw new RecoveryFinalizationError('REQUEST_CONFLICT');
        await sql`INSERT INTO xera_quota_recovery_finalizations(request_id,approval_request,generation,actor_uuid,request_digest,note)
        VALUES(${input.requestId}::uuid,${input.approvalRequest}::uuid,${approval.generation}::uuid,${actor}::uuid,${hash(JSON.stringify(input))},${input.note}) ON CONFLICT(request_id) DO NOTHING`.execute(
            this.db.kysely,
        );
        const item = (await this.intent(input.requestId))!;
        const result = this.exact(item, input, actor);
        return { item, result };
    }
    async enqueue(value: unknown, actor: string) {
        const input = recoveryFinalizationRequest.parse(value);
        actor = uuid.parse(actor);
        if (this.transactions.isTransactionActive())
            throw Error('Finalization queueing requires standalone transactions');
        const known = await this.intent(input.requestId);
        if (known) {
            const result = this.exact(known, input, actor);
            if (result) return { requestId: input.requestId, state: 'COMPLETED' as const, result };
        }
        return this.transactions.withTransaction(
            { isolationLevel: 'RepeatableRead', timeout: 60000 },
            async () => {
                const { item, result } = await this.savedIntent(input, actor);
                if (result)
                    return { requestId: input.requestId, state: 'COMPLETED' as const, result };
                const existingDispatch = (
                    await sql<{
                        state: 'QUEUED' | 'RUNNING' | 'FAILED' | 'COMPLETED';
                    }>`SELECT state FROM xera_quota_recovery_finalization_dispatches WHERE request_id=${item.request}::uuid`.execute(
                        this.db.kysely,
                    )
                ).rows[0];
                if (existingDispatch?.state === 'QUEUED' || existingDispatch?.state === 'RUNNING')
                    return {
                        requestId: input.requestId,
                        state: existingDispatch.state,
                        result: null,
                    };
                await this.financial(item, false);
                await sql`INSERT INTO xera_quota_recovery_finalization_dispatches(request_id) VALUES(${item.request}::uuid)
                ON CONFLICT(request_id) DO NOTHING`.execute(this.db.kysely);
                await sql`UPDATE xera_quota_recovery_finalization_dispatches SET state='QUEUED',last_error=NULL,queued_at=clock_timestamp(),updated_at=clock_timestamp()
                WHERE request_id=${item.request}::uuid AND state='FAILED'`.execute(this.db.kysely);
                const dispatch = (
                    await sql<{
                        state: 'QUEUED' | 'RUNNING' | 'FAILED' | 'COMPLETED';
                    }>`SELECT state FROM xera_quota_recovery_finalization_dispatches WHERE request_id=${item.request}::uuid`.execute(
                        this.db.kysely,
                    )
                ).rows[0];
                return { requestId: input.requestId, state: dispatch.state, result: null };
            },
        );
    }
    private async dispatchLease(request: string, owner?: string) {
        if (!owner) return;
        const lease =
            await sql`UPDATE xera_quota_recovery_finalization_dispatches SET lease_until=clock_timestamp()+interval '240 seconds',updated_at=clock_timestamp()
            WHERE request_id=${request}::uuid AND state='RUNNING' AND lease_owner=${owner}::uuid AND lease_until>clock_timestamp() RETURNING 1`.execute(
                this.db.kysely,
            );
        if (!lease.rows.length) throw new RecoveryFinalizationError('LEASE_LOST');
    }
    async finalize(value: unknown, actor: string, dispatchOwner?: string) {
        const input = recoveryFinalizationRequest.parse(value);
        actor = uuid.parse(actor);
        if (this.transactions.isTransactionActive())
            throw Error('Recovery finalization requires standalone transactions');
        const known = await this.intent(input.requestId);
        if (known) {
            const result = this.exact(known, input, actor);
            if (result) return result;
        }
        const attempt = randomUUID();
        const prepared = await this.transactions.withTransaction(
            { isolationLevel: 'RepeatableRead', timeout: 60000 },
            async () => {
                const { item, result } = await this.savedIntent(input, actor);
                if (result) return { result, item, jobs: [] };
                await this.dispatchLease(item.request, dispatchOwner);
                const jobs = await this.financial(item, false);
                const owned =
                    await sql`UPDATE xera_quota_recovery_finalizations SET lease_owner=${attempt}::uuid,lease_until=clock_timestamp()+interval '180 seconds'
                WHERE request_id=${item.request}::uuid AND result IS NULL AND (lease_until IS NULL OR lease_until<=clock_timestamp()) RETURNING 1`.execute(
                        this.db.kysely,
                    );
                if (!owned.rows.length) throw new RecoveryFinalizationError('BUSY');
                await sql`INSERT INTO xera_quota_recovery_finalization_attempts(attempt_id,phase,request_id,details)
                VALUES(${attempt}::uuid,'REQUESTED',${item.request}::uuid,${JSON.stringify({ actor, approvalRequest: item.approval, generation: item.generation, baselineRequest: item.baseline, dispatchOwner: dispatchOwner ?? null })}::jsonb)`.execute(
                    this.db.kysely,
                );
                return { result: null, item, jobs };
            },
        );
        if (prepared.result) return prepared.result;
        const { item, jobs } = prepared;
        try {
            for (const job of jobs) {
                await this.transactions.withTransaction({ timeout: 10000 }, () =>
                    this.lease(item, attempt, dispatchOwner),
                );
                const reply = await this.delivery.deliver(job.request, actor, true);
                if (!reply.attemptId || reply.alreadyAcknowledged)
                    throw new RecoveryFinalizationError('NOT_READY');
                await this.transactions.withTransaction({ timeout: 10000 }, async () => {
                    await this.lease(item, attempt, dispatchOwner);
                    await sql`INSERT INTO xera_quota_recovery_finalization_checks(attempt_id,node_uuid,release_request,release_attempt)
                        VALUES(${attempt}::uuid,${job.node}::uuid,${job.request}::uuid,${reply.attemptId}::uuid)`.execute(
                        this.db.kysely,
                    );
                });
            }
            // Redis and Node I/O stays outside the final financial transaction.
            requireApprovedRecoveryQueueProof(
                await this.cutover.recoveryQueueProof(),
                JSON.parse(item.planText).queueIdentity,
            );
            return await this.transactions.withTransaction(
                { isolationLevel: 'RepeatableRead', timeout: 60000 },
                async () => {
                    await this.lease(item, attempt, dispatchOwner);
                    await this.financial(item, true);
                    const checked = (
                        await sql<{
                            n: string;
                        }>`SELECT count(*)::text AS n FROM xera_quota_recovery_finalization_checks WHERE attempt_id=${attempt}::uuid`.execute(
                            this.db.kysely,
                        )
                    ).rows[0];
                    if (BigInt(checked.n) !== BigInt(jobs.length))
                        throw new RecoveryFinalizationError('NOT_READY');
                    const stamp = (
                        await sql<{
                            at: string;
                        }>`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`.execute(
                            this.db.kysely,
                        )
                    ).rows[0].at;
                    const result = completion.parse({
                        requestId: item.request,
                        approvalRequest: item.approval,
                        generation: item.generation,
                        attemptId: attempt,
                        coordinatorGeneration: randomUUID(),
                        completedAt: stamp,
                    });
                    await sql`UPDATE xera_quota_restore_state SET reconciled_at=${stamp}::timestamptz,reconciliation_note=${input.note}
                    WHERE singleton AND generation=${item.generation}::uuid AND reconciled_at IS NULL`.execute(
                        this.db.kysely,
                    );
                    const handoff =
                        await sql`INSERT INTO xera_quota_coordinator(id,phase,generation) VALUES(1,'PREFLIGHT',${result.coordinatorGeneration}::uuid)
                    ON CONFLICT(id) DO UPDATE SET phase='PREFLIGHT',generation=excluded.generation,roster='{}',allocation_cursor=0,
                    lease_owner=NULL,lease_until=NULL,error_code=NULL,updated_at=clock_timestamp() RETURNING 1`.execute(
                            this.db.kysely,
                        );
                    if (!handoff.rows.length) throw new RecoveryFinalizationError('NOT_READY');
                    await sql`UPDATE xera_quota_recovery_finalizations SET completed_at=${stamp}::timestamptz,result=${JSON.stringify(result)}::jsonb,lease_owner=NULL,lease_until=NULL
                    WHERE request_id=${item.request}::uuid AND lease_owner=${attempt}::uuid`.execute(
                        this.db.kysely,
                    );
                    await sql`INSERT INTO xera_quota_recovery_finalization_attempts(attempt_id,phase,request_id,details)
                    VALUES(${attempt}::uuid,'OBSERVED',${item.request}::uuid,${JSON.stringify({ confirmed: true, result })}::jsonb)`.execute(
                        this.db.kysely,
                    );
                    return result;
                },
            );
        } catch (error) {
            await this.transactions.withTransaction({ timeout: 10000 }, async () => {
                await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton FOR UPDATE`.execute(
                    this.db.kysely,
                );
                const reason =
                    error instanceof RecoveryFinalizationError ? error.code : 'UNVERIFIED';
                await sql`INSERT INTO xera_quota_recovery_finalization_attempts(attempt_id,phase,request_id,details)
                    VALUES(${attempt}::uuid,'OBSERVED',${item.request}::uuid,${JSON.stringify({ confirmed: false, error: reason })}::jsonb) ON CONFLICT(attempt_id,phase) DO NOTHING`.execute(
                    this.db.kysely,
                );
                await sql`UPDATE xera_quota_recovery_finalizations SET lease_owner=NULL,lease_until=NULL
                    WHERE request_id=${item.request}::uuid AND lease_owner=${attempt}::uuid AND result IS NULL`.execute(
                    this.db.kysely,
                );
            });
            throw error;
        }
    }
}
