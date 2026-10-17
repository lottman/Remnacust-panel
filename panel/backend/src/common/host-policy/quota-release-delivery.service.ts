import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import type { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TxKyselyService } from '@common/database';

import { QuotaBankRecoveryService } from './quota-bank-recovery.service';
import { QuotaCutoverService } from './quota-cutover.service';
import { recoveryFenceSchema, type RecoveryFence } from './quota-recovery-fence';
import {
    readRecoveryObligations,
    requireSettledRecoveryObligations,
} from './quota-recovery-obligations';
import {
    recoveryReleaseRequestSchema,
    recoveryReleaseReplyMatches,
    type RecoveryReleaseRequest,
    type RecoveryReleaseReply,
} from './quota-recovery-release';
import { recoveryStatusSchema } from './quota-recovery-report';
import {
    requireApprovedRecoveryQueueProof,
    requireEmptyRecoveryQueueProof,
    type UsageQueueProof,
} from './usage-queue-proof';

const uuid = recoveryReleaseRequestSchema.shape.requestId;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const connectionHash = (node: INodeConnectionOpts) =>
    hash(JSON.stringify([node.address, node.port, node.proxyUrl]));
const statusSchema = recoveryStatusSchema.extend({
    applied: recoveryStatusSchema.shape.applied.refine(Boolean),
    coreProcessId: uuid,
    quotaInstanceId: uuid,
    policyGeneration: uuid,
});
type Job = {
    request: string;
    approval: string;
    node: string;
    generation: string;
    baseline: string;
    connection: string;
    planText: string;
    planDigest: string;
    payload: RecoveryReleaseRequest;
    previous: RecoveryFence;
    result: RecoveryReleaseReply | null;
};
export class ReleaseDeliveryError extends Error {
    constructor(
        readonly code:
            | 'JOB_MISSING'
            | 'NOT_PENDING'
            | 'NOT_READY'
            | 'SOURCE_CHANGED'
            | 'BUSY'
            | 'NODE_UNAVAILABLE'
            | 'INVALID_ACK'
            | 'LEASE_LOST',
    ) {
        super(code);
    }
}
@Injectable()
export class QuotaReleaseDeliveryService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly axios: AxiosService,
        private readonly banks: QuotaBankRecoveryService,
        private readonly cutover: QuotaCutoverService,
    ) {}
    private async job(request: string, lock = false) {
        const row = (
            await sql<Job>`SELECT j.request_id::text AS request,j.approval_request::text AS approval,j.node_uuid::text AS node,
            a.generation::text,a.baseline_request::text AS baseline,j.connection_hash AS connection,a.plan_text AS "planText",a.plan_digest AS "planDigest",j.payload,j.previous,j.result
            FROM xera_quota_recovery_release_jobs j JOIN xera_quota_recovery_release_approvals a ON a.request_id=j.approval_request
            WHERE j.request_id=${request}::uuid ${lock ? sql`FOR UPDATE OF j FOR SHARE OF a` : sql``}`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!row) throw new ReleaseDeliveryError('JOB_MISSING');
        row.payload = recoveryReleaseRequestSchema.parse(row.payload);
        row.previous = recoveryFenceSchema.parse(row.previous);
        if (
            hash(row.planText) !== row.planDigest ||
            row.payload.requestId !== request ||
            row.payload.generation !== row.generation ||
            row.payload.previous !== row.previous.digest ||
            row.previous.state !== 'FENCED' ||
            row.previous.generation !== row.generation ||
            (row.result !== null &&
                !recoveryReleaseReplyMatches(row.payload, row.previous, row.result))
        )
            throw new ReleaseDeliveryError('SOURCE_CHANGED');
        return row;
    }
    private async pending(generation: string) {
        const rows =
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL FOR UPDATE`.execute(
                this.db.kysely,
            );
        if (!rows.rows.length) throw new ReleaseDeliveryError('NOT_PENDING');
    }
    private async endpoint(node: string) {
        const row = (
            await sql<
                INodeConnectionOpts & { instance: string | null }
            >`SELECT n.address,n.port,n.proxy_url AS "proxyUrl",m.instance_uuid::text AS instance FROM nodes n LEFT JOIN xera_quota_node_modes m ON m.node_uuid=n.uuid
            WHERE n.uuid=${node}::uuid AND NOT n.is_disabled FOR SHARE OF n`.execute(this.db.kysely)
        ).rows[0];
        if (!row) throw new ReleaseDeliveryError('SOURCE_CHANGED');
        return row;
    }
    private async financial(job: Job) {
        const actual = await readRecoveryObligations(this.db, job.generation);
        const own = (
            await sql<{
                pending: string;
                active: string;
            }>`SELECT count(*) FILTER(WHERE result IS NULL)::text AS pending,
            count(*) FILTER(WHERE lease_owner IS NOT NULL AND lease_until>clock_timestamp())::text AS active
            FROM xera_quota_recovery_release_jobs WHERE approval_request=${job.approval}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!actual) throw new ReleaseDeliveryError('NOT_PENDING');
        try {
            requireSettledRecoveryObligations({
                ...actual,
                recoveryDeliveries: (
                    BigInt(actual.recoveryDeliveries) - BigInt(own.pending)
                ).toString(),
                activeWorkers: (BigInt(actual.activeWorkers) - BigInt(own.active)).toString(),
            });
        } catch {
            throw new ReleaseDeliveryError('NOT_READY');
        }
        const bank = await this.banks.compareInTransaction(job.baseline, job.generation);
        if (!bank.matches) throw new ReleaseDeliveryError('SOURCE_CHANGED');
    }
    private queueMatches(job: Job, proof: UsageQueueProof) {
        try {
            requireApprovedRecoveryQueueProof(proof, JSON.parse(job.planText).queueIdentity);
        } catch {
            throw new ReleaseDeliveryError('SOURCE_CHANGED');
        }
    }

    private statusMatches(job: Job, value: unknown) {
        const parsed = statusSchema.safeParse(value);
        if (!parsed.success) return false;
        const status = parsed.data,
            flag = value as {
                quotaRecoveryReleasesSupported?: boolean;
                userQuotaRequired?: boolean;
                quotaFencesSupported?: boolean;
            };
        const record = status.quotaRecovery?.record;
        return (
            flag.quotaRecoveryReleasesSupported === true &&
            flag.userQuotaRequired === true &&
            flag.quotaFencesSupported === true &&
            status.coreProcessId === job.payload.coreProcessId &&
            status.quotaInstanceId === job.payload.instance &&
            status.policyRevision === job.payload.policyRevision &&
            status.policyGeneration === job.payload.policyGeneration &&
            record?.generation === job.generation &&
            ((record.state === 'FENCED' && record.digest === job.previous.digest) ||
                (record.state === 'RELEASED' &&
                    record.token === job.request &&
                    record.previous === job.previous.digest &&
                    record.sequence === (BigInt(job.previous.sequence) + 1n).toString()))
        );
    }
    async deliver(request: string, actor: string, reobserve = false) {
        uuid.parse(request);
        uuid.parse(actor);
        if (this.transactions.isTransactionActive())
            throw Error('Release delivery requires standalone transactions');
        const initial = await this.job(request);
        if (initial.result && !reobserve)
            return {
                requestId: request,
                acknowledgement: initial.result,
                attemptId: null,
                alreadyAcknowledged: true,
            };
        const endpoint = await this.endpoint(initial.node);
        const queues = requireEmptyRecoveryQueueProof(await this.cutover.recoveryQueueProof());
        this.queueMatches(initial, queues);
        const live = await this.axios.hostPolicy<unknown>(endpoint);
        if (!live.isOk) throw new ReleaseDeliveryError('NODE_UNAVAILABLE');
        if (!this.statusMatches(initial, live.response))
            throw new ReleaseDeliveryError('SOURCE_CHANGED');
        const attempt = randomUUID();
        const prepared = await this.transactions.withTransaction(
            { isolationLevel: 'RepeatableRead', timeout: 60000 },
            async () => {
                await this.pending(initial.generation);
                const job = await this.job(request, true);
                if (job.result && !reobserve) return { done: job.result };
                const current = await this.endpoint(job.node);
                if (
                    job.connection !== connectionHash(current) ||
                    connectionHash(current) !== connectionHash(endpoint) ||
                    current.instance !== job.payload.instance
                )
                    throw new ReleaseDeliveryError('SOURCE_CHANGED');
                await this.financial(job);
                const busy =
                    await sql`SELECT 1 FROM xera_quota_recovery_release_jobs WHERE node_uuid=${job.node}::uuid AND lease_until>clock_timestamp()
                UNION ALL SELECT 1 FROM xera_quota_recovery_receipt_jobs WHERE node_uuid=${job.node}::uuid AND lease_until>clock_timestamp()
                UNION ALL SELECT 1 FROM xera_quota_recovery_policy_jobs WHERE node_uuid=${job.node}::uuid AND lease_until>clock_timestamp() LIMIT 1`.execute(
                        this.db.kysely,
                    );
                if (busy.rows.length) throw new ReleaseDeliveryError('BUSY');
                await sql`UPDATE xera_quota_recovery_release_jobs SET lease_owner=${attempt}::uuid,lease_until=clock_timestamp()+interval '90 seconds' WHERE request_id=${request}::uuid`.execute(
                    this.db.kysely,
                );
                await sql`INSERT INTO xera_quota_recovery_release_attempts(attempt_id,phase,request_id,details) VALUES(${attempt}::uuid,'REQUESTED',${request}::uuid,
                ${JSON.stringify({ actor, payload: job.payload, previous: job.previous, baselineRequest: job.baseline })}::jsonb)`.execute(
                    this.db.kysely,
                );
                return { job, opts: current };
            },
        );
        if (prepared.done)
            return {
                requestId: request,
                acknowledgement: prepared.done,
                attemptId: null,
                alreadyAcknowledged: true,
            };
        const original = prepared.job!;
        let acknowledgement: RecoveryReleaseReply | null = null,
            error: 'INVALID_ACK' | 'NODE_UNAVAILABLE' = 'NODE_UNAVAILABLE';
        try {
            const response = await this.axios.hostQuotaRecoveryRelease(
                prepared.opts!,
                original.payload,
                original.previous,
            );
            if (response.isOk) {
                if (
                    recoveryReleaseReplyMatches(
                        original.payload,
                        original.previous,
                        response.response,
                    )
                )
                    acknowledgement = response.response;
                else error = 'INVALID_ACK';
            }
        } catch {
            /* Unknown network outcome retains the approved payload and request UUID. */
        }
        const outcome = await this.transactions.withTransaction(
            { isolationLevel: 'RepeatableRead', timeout: 60000 },
            async () => {
                const state = (
                    await sql<{
                        generation: string;
                        pending: boolean;
                    }>`SELECT generation::text,reconciled_at IS NULL AS pending FROM xera_quota_restore_state WHERE singleton FOR UPDATE`.execute(
                        this.db.kysely,
                    )
                ).rows[0];
                const job = await this.job(request, true);
                const lease =
                    await sql`SELECT 1 FROM xera_quota_recovery_release_jobs WHERE request_id=${request}::uuid AND lease_owner=${attempt}::uuid AND lease_until>clock_timestamp()`.execute(
                        this.db.kysely,
                    );
                const owns = lease.rows.length > 0;
                let matches = state?.generation === job.generation && state.pending;
                if (matches) {
                    try {
                        const current = await this.endpoint(job.node);
                        matches =
                            job.connection === connectionHash(current) &&
                            current.instance === job.payload.instance;
                        await this.financial(job);
                    } catch {
                        matches = false;
                    }
                }
                const confirmed = !!acknowledgement && owns && matches;
                const reason = confirmed
                    ? null
                    : !owns
                      ? 'LEASE_LOST'
                      : !matches
                        ? 'SOURCE_CHANGED'
                        : error;
                await sql`INSERT INTO xera_quota_recovery_release_attempts(attempt_id,phase,request_id,details) VALUES(${attempt}::uuid,'OBSERVED',${request}::uuid,
                ${JSON.stringify({ confirmed, error: reason, acknowledgement })}::jsonb)`.execute(
                    this.db.kysely,
                );
                if (owns)
                    await sql`UPDATE xera_quota_recovery_release_jobs SET lease_owner=NULL,lease_until=NULL,result=CASE WHEN ${confirmed} THEN ${JSON.stringify(acknowledgement)}::jsonb ELSE result END WHERE request_id=${request}::uuid AND lease_owner=${attempt}::uuid`.execute(
                        this.db.kysely,
                    );
                return { confirmed, error: reason };
            },
        );
        if (!outcome.confirmed)
            throw new ReleaseDeliveryError(
                outcome.error as
                    | 'LEASE_LOST'
                    | 'SOURCE_CHANGED'
                    | 'INVALID_ACK'
                    | 'NODE_UNAVAILABLE',
            );
        return {
            requestId: request,
            acknowledgement: acknowledgement!,
            attemptId: attempt,
            alreadyAcknowledged: false,
        };
    }
    async list(approval: string, after?: string) {
        uuid.parse(approval);
        if (after) {
            uuid.parse(after);
            const cursor =
                await sql`SELECT 1 FROM xera_quota_recovery_release_jobs WHERE approval_request=${approval}::uuid AND node_uuid=${after}::uuid`.execute(
                    this.db.kysely,
                );
            if (!cursor.rows.length) throw new ReleaseDeliveryError('JOB_MISSING');
        }
        const rows = (
            await sql<{
                request: string;
                node: string;
                name: string | null;
                acknowledged: boolean;
                busy: boolean;
            }>`SELECT j.request_id::text AS request,j.node_uuid::text AS node,n.name,j.result IS NOT NULL AS acknowledged,COALESCE(j.lease_until>clock_timestamp(),false) AS busy
            FROM xera_quota_recovery_release_jobs j LEFT JOIN nodes n ON n.uuid=j.node_uuid WHERE j.approval_request=${approval}::uuid ${after ? sql`AND j.node_uuid>${after}::uuid` : sql``} ORDER BY j.node_uuid LIMIT 21`.execute(
                this.db.kysely,
            )
        ).rows;
        return { entries: rows.slice(0, 20), nextAfter: rows.length > 20 ? rows[19].node : null };
    }
    async details(request: string, after?: string) {
        uuid.parse(request);
        const job = await this.job(request);
        let cursor: { at: string; id: string } | undefined;
        if (after) {
            uuid.parse(after);
            cursor = (
                await sql<{
                    at: string;
                    id: string;
                }>`SELECT created_at::text AS at,attempt_id::text AS id FROM xera_quota_recovery_release_attempts WHERE request_id=${request}::uuid AND attempt_id=${after}::uuid AND phase='REQUESTED'`.execute(
                    this.db.kysely,
                )
            ).rows[0];
            if (!cursor) throw new ReleaseDeliveryError('JOB_MISSING');
        }
        const rows = (
            await sql<{
                attempt: string;
                requestedAt: Date;
                observedAt: Date | null;
                outcome: unknown;
            }>`SELECT r.attempt_id::text AS attempt,r.created_at AS "requestedAt",o.created_at AS "observedAt",o.details AS outcome
            FROM xera_quota_recovery_release_attempts r LEFT JOIN xera_quota_recovery_release_attempts o ON o.attempt_id=r.attempt_id AND o.phase='OBSERVED'
            WHERE r.request_id=${request}::uuid AND r.phase='REQUESTED' ${cursor ? sql`AND (r.created_at,r.attempt_id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql``}
            ORDER BY r.created_at DESC,r.attempt_id DESC LIMIT 21`.execute(this.db.kysely)
        ).rows;
        return {
            requestId: request,
            approval: job.approval,
            node: job.node,
            generation: job.generation,
            payload: job.payload,
            previous: job.previous,
            acknowledgement: job.result,
            attempts: rows.slice(0, 20),
            nextAfter: rows.length > 20 ? rows[19].attempt : null,
        };
    }
}
