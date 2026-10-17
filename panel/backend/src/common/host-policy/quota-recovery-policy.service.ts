import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TxKyselyService } from '@common/database';

import {
    recoveryPolicyReplyMatches,
    recoveryPolicyRequestSchema,
    type RecoveryPolicyRequest,
    type RecoveryPolicyReply,
} from './quota-recovery-policy';
import { recoveryStatusSchema } from './quota-recovery-report';

const sourceSchema = recoveryStatusSchema.extend({
    quotaRecoveryPoliciesSupported: z.literal(true),
    quotaFencesSupported: z.literal(true),
    userQuotaRequired: z.literal(true),
});
type Job = {
    generation: string;
    node: string;
    actor: string;
    connection: string;
    payload: RecoveryPolicyRequest;
    result: RecoveryPolicyReply | null;
    busy?: boolean;
};
const connectionHash = (node: INodeConnectionOpts) =>
    createHash('sha256')
        .update(JSON.stringify([node.address, node.port, node.proxyUrl]))
        .digest('hex');
export class RecoveryPolicyStageError extends Error {
    constructor(
        readonly code:
            | 'NOT_PENDING'
            | 'JOB_MISSING'
            | 'NODE_MISSING'
            | 'SOURCE_CHANGED'
            | 'REQUEST_CONFLICT'
            | 'BUSY'
            | 'NODE_UNAVAILABLE'
            | 'LEASE_LOST',
    ) {
        super(code);
    }
}

@Injectable()
export class QuotaRecoveryPolicyService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly axios: AxiosService,
    ) {}

    private async node(node: string) {
        return (
            await sql<
                INodeConnectionOpts & { instance: string | null }
            >`SELECT n.address,n.port,n.proxy_url AS "proxyUrl",m.instance_uuid::text AS instance
            FROM nodes n LEFT JOIN xera_quota_node_modes m ON m.node_uuid=n.uuid
            WHERE n.uuid=${node}::uuid AND NOT n.is_disabled`.execute(this.db.kysely)
        ).rows[0];
    }
    private async job(request: string, lock = false) {
        return (
            await sql<Job>`SELECT generation::text,node_uuid::text AS node,actor_uuid::text AS actor,connection_hash AS connection,payload,result,COALESCE(lease_until>clock_timestamp(),false) AS busy
            FROM xera_quota_recovery_policy_jobs WHERE request_id=${request}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(
                this.db.kysely,
            )
        ).rows[0];
    }
    private sameJob(job: Job, node: string, generation: string, actor: string) {
        if (job.node !== node || job.generation !== generation || job.actor !== actor)
            throw new RecoveryPolicyStageError('REQUEST_CONFLICT');
    }
    async list(node: string, generation: string, after?: string) {
        for (const value of [node, generation, ...(after ? [after] : [])]) z.uuid().parse(value);
        let cursor: { at: string; id: string } | undefined;
        if (after) {
            cursor = (
                await sql<{
                    at: string;
                    id: string;
                }>`SELECT created_at::text AS at,request_id::text AS id FROM xera_quota_recovery_policy_jobs
                WHERE node_uuid=${node}::uuid AND generation=${generation}::uuid AND request_id=${after}::uuid`.execute(
                    this.db.kysely,
                )
            ).rows[0];
            if (!cursor) throw new RecoveryPolicyStageError('JOB_MISSING');
        }
        const rows = (
            await sql<{
                requestId: string;
                actor: string;
                createdAt: Date;
                revision: string;
                acknowledged: boolean;
                busy: boolean;
            }>`SELECT request_id::text AS "requestId",actor_uuid::text AS actor,
            created_at AS "createdAt",payload->>'policyRevision' AS revision,result IS NOT NULL AS acknowledged,COALESCE(lease_until>clock_timestamp(),false) AS busy
            FROM xera_quota_recovery_policy_jobs WHERE node_uuid=${node}::uuid AND generation=${generation}::uuid
            ${cursor ? sql`AND (created_at,request_id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql``}
            ORDER BY created_at DESC,request_id DESC LIMIT 21`.execute(this.db.kysely)
        ).rows;
        return {
            entries: rows.slice(0, 20),
            nextAfter: rows.length > 20 ? rows[19].requestId : null,
        };
    }

    async details(node: string, request: string, after?: string) {
        for (const value of [node, request, ...(after ? [after] : [])]) z.uuid().parse(value);
        const job = await this.job(request);
        if (!job || job.node !== node) throw new RecoveryPolicyStageError('JOB_MISSING');
        let cursor: { at: string; id: string } | undefined;
        if (after) {
            cursor = (
                await sql<{
                    at: string;
                    id: string;
                }>`SELECT created_at::text AS at,attempt_id::text AS id FROM xera_quota_recovery_policy_attempts
                WHERE request_id=${request}::uuid AND attempt_id=${after}::uuid AND phase='REQUESTED'`.execute(
                    this.db.kysely,
                )
            ).rows[0];
            if (!cursor) throw new RecoveryPolicyStageError('JOB_MISSING');
        }
        const rows = (
            await sql<{
                id: string;
                requestedAt: Date;
                observedAt: Date | null;
                details: unknown;
            }>`SELECT a.attempt_id::text AS id,a.created_at AS "requestedAt",o.created_at AS "observedAt",o.details
            FROM xera_quota_recovery_policy_attempts a LEFT JOIN xera_quota_recovery_policy_attempts o ON o.attempt_id=a.attempt_id AND o.phase='OBSERVED'
            WHERE a.request_id=${request}::uuid AND a.phase='REQUESTED'
                ${cursor ? sql`AND (a.created_at,a.attempt_id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql``}
            ORDER BY a.created_at DESC,a.attempt_id DESC LIMIT 21`.execute(this.db.kysely)
        ).rows;
        return {
            requestId: request,
            generation: job.generation,
            node: job.node,
            actor: job.actor,
            payload: job.payload,
            acknowledgement: job.result,
            busy: !!job.busy,
            attempts: rows.slice(0, 20),
            nextAfter: rows.length > 20 ? rows[19].id : null,
        };
    }

    async stage(node: string, generation: string, actor: string, request: string) {
        for (const value of [node, generation, actor, request]) z.uuid().parse(value);
        if (this.transactions.isTransactionActive())
            throw new Error('Recovery policy delivery requires standalone transactions');
        const existing = await this.job(request);
        if (existing) this.sameJob(existing, node, generation, actor);
        // Only a new immutable intent needs a live source observation. A retry
        // reuses its exact original body even if the first reply was lost.
        const initialNode = existing ? null : await this.node(node);
        if (!existing && !initialNode) throw new RecoveryPolicyStageError('NODE_MISSING');
        const source = initialNode ? await this.axios.hostPolicy<unknown>(initialNode) : null;
        const observed = source?.isOk ? sourceSchema.safeParse(source.response) : null;
        const attempt = randomUUID();
        const prepared = await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            const pending =
                await sql`SELECT generation FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL FOR UPDATE`.execute(
                    this.db.kysely,
                );
            if (!pending.rows.length) throw new RecoveryPolicyStageError('NOT_PENDING');
            let job = await this.job(request, true);
            if (job) this.sameJob(job, node, generation, actor);
            if (job?.result) return { done: job.result };
            const current = await this.node(node);
            if (!current) throw new RecoveryPolicyStageError('NODE_MISSING');
            const busy =
                await sql`SELECT 1 FROM xera_quota_recovery_policy_jobs WHERE node_uuid=${node}::uuid AND generation=${generation}::uuid
                AND lease_until>clock_timestamp()
                UNION ALL SELECT 1 FROM xera_quota_recovery_receipt_jobs WHERE node_uuid=${node}::uuid AND generation=${generation}::uuid
                AND lease_until>clock_timestamp() LIMIT 1`.execute(this.db.kysely);
            if (busy.rows.length) throw new RecoveryPolicyStageError('BUSY');
            if (!job) {
                const status = observed?.success ? observed.data : null;
                const fence = status?.quotaRecovery?.record;
                if (
                    !initialNode ||
                    connectionHash(initialNode) !== connectionHash(current) ||
                    !status?.applied ||
                    !status.coreProcessId ||
                    !status.quotaInstanceId ||
                    current.instance !== status.quotaInstanceId ||
                    fence?.state !== 'FENCED' ||
                    fence.generation !== generation
                )
                    throw new RecoveryPolicyStageError('SOURCE_CHANGED');
                const allocated = await sql<{
                    revision: string;
                }>`SELECT xera_next_host_policy_revision(${node}::uuid,${status.policyRevision}::bigint)::text AS revision`.execute(
                    this.db.kysely,
                );
                const payload = recoveryPolicyRequestSchema.parse({
                    requestId: request,
                    generation,
                    coreProcessId: status.coreProcessId,
                    instance: status.quotaInstanceId,
                    previous: fence.digest,
                    policyRevision: allocated.rows[0].revision,
                });
                job = {
                    generation,
                    node,
                    actor,
                    connection: connectionHash(current),
                    payload,
                    result: null,
                };
                await sql`INSERT INTO xera_quota_recovery_policy_jobs(request_id,generation,node_uuid,actor_uuid,connection_hash,payload)
                    VALUES(${request}::uuid,${generation}::uuid,${node}::uuid,${actor}::uuid,${job.connection},${JSON.stringify(payload)}::jsonb)`.execute(
                    this.db.kysely,
                );
            }
            if (
                job.connection !== connectionHash(current) ||
                current.instance !== job.payload.instance
            )
                throw new RecoveryPolicyStageError('SOURCE_CHANGED');
            const payload = recoveryPolicyRequestSchema.parse(job.payload);
            await sql`UPDATE xera_quota_recovery_policy_jobs SET lease_owner=${attempt}::uuid,lease_until=clock_timestamp()+interval '90 seconds' WHERE request_id=${request}::uuid`.execute(
                this.db.kysely,
            );
            await sql`INSERT INTO xera_quota_recovery_policy_attempts(attempt_id,phase,request_id,details)
                VALUES(${attempt}::uuid,'REQUESTED',${request}::uuid,'{}'::jsonb)`.execute(
                this.db.kysely,
            );
            return { payload, opts: current, connection: job.connection };
        });
        if (prepared.done)
            return {
                requestId: request,
                acknowledgement: prepared.done,
                alreadyAcknowledged: true,
            };
        const payload = prepared.payload!;
        let acknowledgement: RecoveryPolicyReply | null = null;
        try {
            const reply = await this.axios.hostQuotaRecoveryPolicy(prepared.opts!, payload);
            if (reply.isOk && recoveryPolicyReplyMatches(payload, reply.response))
                acknowledgement = reply.response;
        } catch {
            /* The immutable intent remains retryable after transport failure. */
        }
        const result = await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            // Match preparation's restore-row -> job lock order. A new restore
            // cannot race publication of a successful observation.
            const restore = await sql<{
                generation: string;
                pending: boolean;
            }>`SELECT generation::text, reconciled_at IS NULL AS pending FROM xera_quota_restore_state WHERE singleton FOR UPDATE`.execute(
                this.db.kysely,
            );
            const job = await this.job(request, true);
            const lease =
                await sql`SELECT 1 FROM xera_quota_recovery_policy_jobs WHERE request_id=${request}::uuid AND lease_owner=${attempt}::uuid AND lease_until>clock_timestamp()`.execute(
                    this.db.kysely,
                );
            const current = await this.node(node);
            const owns = lease.rows.length > 0;
            const matches =
                !!job &&
                !!current &&
                job.connection === connectionHash(current) &&
                current.instance === payload.instance &&
                restore.rows[0]?.generation === generation &&
                restore.rows[0].pending;
            const confirmed = !!acknowledgement && owns && matches;
            const error = confirmed
                ? null
                : !owns
                  ? 'LEASE_LOST'
                  : !matches
                    ? 'SOURCE_CHANGED'
                    : 'NODE_UNAVAILABLE';
            await sql`INSERT INTO xera_quota_recovery_policy_attempts(attempt_id,phase,request_id,details)
                VALUES(${attempt}::uuid,'OBSERVED',${request}::uuid,${JSON.stringify({ confirmed, error, acknowledgement })}::jsonb)`.execute(
                this.db.kysely,
            );
            if (owns)
                await sql`UPDATE xera_quota_recovery_policy_jobs SET lease_owner=NULL,lease_until=NULL,
                result=CASE WHEN ${confirmed} THEN ${JSON.stringify(acknowledgement)}::jsonb ELSE result END WHERE request_id=${request}::uuid AND lease_owner=${attempt}::uuid`.execute(
                    this.db.kysely,
                );
            return { confirmed, error };
        });
        if (!result.confirmed)
            throw new RecoveryPolicyStageError(
                result.error as 'LEASE_LOST' | 'SOURCE_CHANGED' | 'NODE_UNAVAILABLE',
            );
        // This is durable delivery evidence, never a claim of current readiness
        // or permission to ACK usage, release the global gate, or issue credit.
        return {
            requestId: request,
            acknowledgement: acknowledgement!,
            alreadyAcknowledged: false,
        };
    }
}
