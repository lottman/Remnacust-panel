import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TxKyselyService } from '@common/database';

import { NativeQuotaRecoveryService } from './native-quota-recovery.service';
import { recoveryStatusSchema } from './quota-recovery-report';
import { recoveryQuiescenceSchema } from './recovery-quiescence';
import {
    recoveryUsageAckMatches,
    recoveryUsageAckRequest,
    recoveryUsageAckReply,
    type RecoveryUsageAckReply,
} from './recovery-usage-ack';

const statusSchema = recoveryStatusSchema.extend({
    quotaRecoveryReceiptsSupported: z.literal(true),
    quotaRecoveryPoliciesSupported: z.literal(true),
    quotaFencesSupported: z.literal(true),
    userQuotaRequired: z.literal(true),
    policyGeneration: z.uuid(),
});
type Source = Awaited<ReturnType<NativeQuotaRecoveryService['recoveryAcknowledgementSource']>>;
type Job = {
    node: string;
    generation: string;
    actor: string;
    decision: string;
    connection: string;
    source: Source;
    result: RecoveryUsageAckReply | null;
    busy: boolean;
};
const connectionHash = (node: INodeConnectionOpts) =>
    createHash('sha256')
        .update(JSON.stringify([node.address, node.port, node.proxyUrl]))
        .digest('hex');

export class RecoveryReceiptDeliveryError extends Error {
    constructor(
        readonly code:
            | 'JOB_MISSING'
            | 'NOT_PENDING'
            | 'NODE_MISSING'
            | 'REQUEST_CONFLICT'
            | 'SOURCE_CHANGED'
            | 'HELD_POLICY_REQUIRED'
            | 'BUSY'
            | 'NODE_UNAVAILABLE'
            | 'LEASE_LOST',
    ) {
        super(code);
    }
}

@Injectable()
export class QuotaRecoveryReceiptService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly axios: AxiosService,
        private readonly native: NativeQuotaRecoveryService,
    ) {}

    // A current SQL candidate for a separate LIVE journal lookup. Historical
    // ACK delivery alone never clears a pending receipt or releases traffic.
    async acknowledgedQuiescenceSource(node: string, generation: string) {
        z.uuid().parse(node);
        z.uuid().parse(generation);
        if (!this.transactions.isTransactionActive())
            throw new Error('Final ACK source requires an active transaction');
        const pending =
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL FOR UPDATE`.execute(
                this.db.kysely,
            );
        if (!pending.rows.length) throw new RecoveryReceiptDeliveryError('NOT_PENDING');
        await sql`SELECT uuid FROM nodes WHERE uuid=${node}::uuid FOR SHARE`.execute(
            this.db.kysely,
        );
        const row = (
            await sql<{
                witness: unknown;
                request: string;
                decision: string;
                connection: string;
                result: unknown;
            }>`SELECT q.witness,j.request_id::text AS request,j.decision_request::text AS decision,j.connection_hash AS connection,j.result
            FROM xera_quota_recovery_quiescence q JOIN xera_node_usage_streams s ON s.node_uuid=q.node_uuid
                AND s.stream_id=(q.witness->'frame'->>'stream')::uuid
                AND s.next_sequence=(q.witness->'frame'->>'sequence')::bigint
                AND s.expected_core=(q.witness->'frame'->>'coreProcessId')::uuid
                AND s.committed_digest=q.witness->'frame'->>'digest' AND s.pending_effects IS NULL
            JOIN xera_quota_recovery_receipt_jobs j ON j.node_uuid=q.node_uuid AND j.generation=q.generation AND j.result IS NOT NULL
                AND j.source->'receipt'->>'digest'=q.witness->'frame'->>'digest'
                AND j.source->'receipt'->>'sequence'=q.witness->'frame'->>'sequence'
            WHERE q.node_uuid=${node}::uuid AND q.generation=${generation}::uuid
            ORDER BY q.created_at DESC,j.created_at DESC,j.request_id DESC LIMIT 1`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!row) return null;
        const witness = recoveryQuiescenceSchema.parse(row.witness),
            ack = recoveryUsageAckReply.parse(row.result);
        const current = await this.node(node);
        if (
            !current ||
            current.instance !== witness.request.instance ||
            connectionHash(current) !== row.connection
        )
            throw new RecoveryReceiptDeliveryError('SOURCE_CHANGED');
        const source = await this.native.recoveryAcknowledgementSource(
            node,
            row.decision,
            generation,
        );
        const request = recoveryUsageAckRequest.parse({
            requestId: row.request,
            generation,
            coreProcessId: witness.request.coreProcessId,
            instance: witness.request.instance,
            previous: witness.request.previous,
            decisionDigest: source.decisionDigest,
            sourceDigest: source.sourceDigest,
            receipt: source.receipt,
        });
        if (
            witness.request.generation !== generation ||
            source.sourceDigest !== witness.journalDigest ||
            source.receipt.stream !== witness.frame.stream ||
            source.receipt.sequence !== witness.frame.sequence ||
            source.receipt.coreProcessId !== witness.frame.coreProcessId ||
            source.receipt.digest !== witness.frame.digest ||
            !recoveryUsageAckMatches(request, ack) ||
            ack.journal.pending !== null
        )
            throw new RecoveryReceiptDeliveryError('SOURCE_CHANGED');
        return {
            acknowledgementRequest: row.request,
            decisionRequest: row.decision,
            decisionDigest: source.decisionDigest,
            sourceDigest: source.sourceDigest,
            connectionHash: row.connection,
            witness,
        };
    }

    private async node(node: string) {
        return (
            await sql<
                INodeConnectionOpts & { instance: string | null }
            >`SELECT n.address,n.port,n.proxy_url AS "proxyUrl",m.instance_uuid::text AS instance
            FROM nodes n LEFT JOIN xera_quota_node_modes m ON m.node_uuid=n.uuid
            WHERE n.uuid=${node}::uuid AND NOT n.is_disabled`.execute(this.db.kysely)
        ).rows[0];
    }

    private async job(request: string) {
        return (
            await sql<Job>`SELECT node_uuid::text AS node,generation::text,actor_uuid::text AS actor,decision_request::text AS decision,
            connection_hash AS connection,source,result,COALESCE(lease_until>clock_timestamp(),false) AS busy
            FROM xera_quota_recovery_receipt_jobs WHERE request_id=${request}::uuid FOR UPDATE`.execute(
                this.db.kysely,
            )
        ).rows[0];
    }

    async details(node: string, request: string, after?: string) {
        for (const id of [node, request, ...(after ? [after] : [])]) z.uuid().parse(id);
        const job = (
            await sql<Job>`SELECT node_uuid::text AS node,generation::text,actor_uuid::text AS actor,decision_request::text AS decision,
            connection_hash AS connection,source,result,COALESCE(lease_until>clock_timestamp(),false) AS busy
            FROM xera_quota_recovery_receipt_jobs WHERE request_id=${request}::uuid AND node_uuid=${node}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!job) throw new RecoveryReceiptDeliveryError('JOB_MISSING');
        const cursor = after
            ? (
                  await sql<{
                      at: string;
                      id: string;
                  }>`SELECT created_at::text AS at,attempt_id::text AS id FROM xera_quota_recovery_receipt_attempts
            WHERE request_id=${request}::uuid AND attempt_id=${after}::uuid AND phase='REQUESTED'`.execute(
                      this.db.kysely,
                  )
              ).rows[0]
            : null;
        if (after && !cursor) throw new RecoveryReceiptDeliveryError('JOB_MISSING');
        const rows = (
            await sql<{
                id: string;
                requestedAt: Date;
                observedAt: Date | null;
                details: unknown;
                payload: unknown;
            }>`SELECT a.attempt_id::text AS id,a.created_at AS "requestedAt",o.created_at AS "observedAt",o.details,a.details->'payload' AS payload
            FROM xera_quota_recovery_receipt_attempts a LEFT JOIN xera_quota_recovery_receipt_attempts o ON o.attempt_id=a.attempt_id AND o.phase='OBSERVED'
            WHERE a.request_id=${request}::uuid AND a.phase='REQUESTED'
            ${cursor ? sql`AND (a.created_at,a.attempt_id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql``}
            ORDER BY a.created_at DESC,a.attempt_id DESC LIMIT 21`.execute(this.db.kysely)
        ).rows;
        return {
            requestId: request,
            node: job.node,
            generation: job.generation,
            actor: job.actor,
            decisionRequest: job.decision,
            source: job.source,
            acknowledgement: job.result,
            busy: job.busy,
            attempts: rows.slice(0, 20),
            nextAfter: rows.length > 20 ? rows[19].id : null,
        };
    }

    async list(node: string, generation: string, decision: string, after?: string) {
        for (const id of [node, generation, decision, ...(after ? [after] : [])])
            z.uuid().parse(id);
        const cursor = after
            ? (
                  await sql<{
                      at: string;
                      id: string;
                  }>`SELECT created_at::text AS at,request_id::text AS id FROM xera_quota_recovery_receipt_jobs
            WHERE node_uuid=${node}::uuid AND generation=${generation}::uuid AND decision_request=${decision}::uuid AND request_id=${after}::uuid`.execute(
                      this.db.kysely,
                  )
              ).rows[0]
            : null;
        if (after && !cursor) throw new RecoveryReceiptDeliveryError('JOB_MISSING');
        const rows = (
            await sql<{
                requestId: string;
                actor: string;
                createdAt: Date;
                acknowledged: boolean;
                busy: boolean;
            }>`SELECT request_id::text AS "requestId",actor_uuid::text AS actor,created_at AS "createdAt",result IS NOT NULL AS acknowledged,COALESCE(lease_until>clock_timestamp(),false) AS busy
            FROM xera_quota_recovery_receipt_jobs WHERE node_uuid=${node}::uuid AND generation=${generation}::uuid AND decision_request=${decision}::uuid
            ${cursor ? sql`AND (created_at,request_id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql``}
            ORDER BY created_at DESC,request_id DESC LIMIT 21`.execute(this.db.kysely)
        ).rows;
        return {
            entries: rows.slice(0, 20),
            nextAfter: rows.length > 20 ? rows[19].requestId : null,
        };
    }

    async deliver(
        node: string,
        generation: string,
        actor: string,
        request: string,
        decision: string,
    ) {
        for (const id of [node, generation, actor, request, decision]) z.uuid().parse(id);
        if (this.transactions.isTransactionActive())
            throw Error('Recovery receipt delivery requires standalone transactions');
        const endpoint = await this.node(node);
        if (!endpoint) throw new RecoveryReceiptDeliveryError('NODE_MISSING');
        // Live state is observed outside SQL. All bindings are checked again
        // while serializing through the restore row before persisting the RPC.
        const response = await this.axios.hostPolicy<unknown>(endpoint);
        const parsed = response.isOk ? statusSchema.safeParse(response.response) : null;
        const attempt = randomUUID();
        const prepared = await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            const pending =
                await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL FOR UPDATE`.execute(
                    this.db.kysely,
                );
            if (!pending.rows.length) throw new RecoveryReceiptDeliveryError('NOT_PENDING');
            let job = await this.job(request);
            if (
                job &&
                (job.node !== node ||
                    job.generation !== generation ||
                    job.actor !== actor ||
                    job.decision !== decision)
            )
                throw new RecoveryReceiptDeliveryError('REQUEST_CONFLICT');
            if (job?.result) return { done: job.result };
            const current = await this.node(node);
            const status = parsed?.success ? parsed.data : null;
            const fence = status?.quotaRecovery?.record;
            if (
                !current ||
                connectionHash(current) !== connectionHash(endpoint) ||
                !status?.applied ||
                !status.coreProcessId ||
                !status.quotaInstanceId ||
                current.instance !== status.quotaInstanceId ||
                fence?.state !== 'FENCED' ||
                fence.generation !== generation
            )
                throw new RecoveryReceiptDeliveryError('SOURCE_CHANGED');
            const busy =
                await sql`SELECT 1 FROM xera_quota_recovery_receipt_jobs WHERE generation=${generation}::uuid AND node_uuid=${node}::uuid AND lease_until>clock_timestamp()
                UNION ALL SELECT 1 FROM xera_quota_recovery_policy_jobs WHERE generation=${generation}::uuid AND node_uuid=${node}::uuid AND lease_until>clock_timestamp() LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (busy.rows.length) throw new RecoveryReceiptDeliveryError('BUSY');
            const held =
                await sql`SELECT 1 FROM xera_quota_recovery_policy_jobs WHERE generation=${generation}::uuid AND node_uuid=${node}::uuid
                AND connection_hash=${connectionHash(current)} AND result IS NOT NULL
                AND payload->>'coreProcessId'=${status.coreProcessId} AND payload->>'instance'=${status.quotaInstanceId}
                AND payload->>'previous'=${fence.digest} AND payload->>'policyRevision'=${status.policyRevision}
                AND result->>'policyGeneration'=${status.policyGeneration} LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (!held.rows.length) throw new RecoveryReceiptDeliveryError('HELD_POLICY_REQUIRED');
            const source = await this.native.recoveryAcknowledgementSource(
                node,
                decision,
                generation,
            );
            // JSONB key ordering is not stable; compare canonical primitives.
            if (
                job &&
                (job.connection !== connectionHash(current) ||
                    job.source.decisionRequest !== source.decisionRequest ||
                    job.source.sourceRequest !== source.sourceRequest ||
                    job.source.decisionDigest !== source.decisionDigest ||
                    job.source.sourceDigest !== source.sourceDigest ||
                    Object.entries(source.receipt).some(
                        ([key, value]) =>
                            job!.source.receipt[key as keyof Source['receipt']] !== value,
                    ))
            )
                throw new RecoveryReceiptDeliveryError('SOURCE_CHANGED');
            if (!job) {
                await sql`INSERT INTO xera_quota_recovery_receipt_jobs(request_id,generation,node_uuid,actor_uuid,decision_request,connection_hash,source)
                    VALUES(${request}::uuid,${generation}::uuid,${node}::uuid,${actor}::uuid,${decision}::uuid,${connectionHash(current)},${JSON.stringify(source)}::jsonb)`.execute(
                    this.db.kysely,
                );
                job = (await this.job(request))!;
            }
            const payload = recoveryUsageAckRequest.parse({
                requestId: request,
                generation,
                coreProcessId: status.coreProcessId,
                instance: status.quotaInstanceId,
                previous: fence.digest,
                decisionDigest: source.decisionDigest,
                sourceDigest: source.sourceDigest,
                receipt: source.receipt,
            });
            await sql`UPDATE xera_quota_recovery_receipt_jobs SET lease_owner=${attempt}::uuid,lease_until=clock_timestamp()+interval '90 seconds' WHERE request_id=${request}::uuid`.execute(
                this.db.kysely,
            );
            await sql`INSERT INTO xera_quota_recovery_receipt_attempts(attempt_id,phase,request_id,details)
                VALUES(${attempt}::uuid,'REQUESTED',${request}::uuid,${JSON.stringify({ payload })}::jsonb)`.execute(
                this.db.kysely,
            );
            return { payload, opts: current, source, connection: job.connection };
        });
        if (prepared.done)
            return {
                requestId: request,
                acknowledgement: prepared.done,
                alreadyAcknowledged: true,
            };
        const payload = prepared.payload!;
        let acknowledgement: RecoveryUsageAckReply | null = null;
        try {
            const reply = await this.axios.usageRecoveryAck(prepared.opts!, payload);
            if (reply.isOk && recoveryUsageAckMatches(payload, reply.response))
                acknowledgement = reply.response;
        } catch {
            /* Unknown outcome retains the original intent for retry. */
        }
        const outcome = await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            const restore = await sql<{
                generation: string;
                pending: boolean;
            }>`SELECT generation::text,reconciled_at IS NULL AS pending FROM xera_quota_restore_state WHERE singleton FOR UPDATE`.execute(
                this.db.kysely,
            );
            const job = await this.job(request);
            const lease =
                await sql`SELECT 1 FROM xera_quota_recovery_receipt_jobs WHERE request_id=${request}::uuid AND lease_owner=${attempt}::uuid AND lease_until>clock_timestamp()`.execute(
                    this.db.kysely,
                );
            const current = await this.node(node);
            const owns = lease.rows.length > 0;
            let matches =
                !!job &&
                !!current &&
                job.connection === connectionHash(current) &&
                current.instance === payload.instance &&
                restore.rows[0]?.generation === generation &&
                restore.rows[0].pending;
            if (matches) {
                try {
                    const source = await this.native.recoveryAcknowledgementSource(
                        node,
                        decision,
                        generation,
                    );
                    matches =
                        source.decisionDigest === payload.decisionDigest &&
                        source.sourceDigest === payload.sourceDigest &&
                        source.receipt.digest === payload.receipt.digest &&
                        source.receipt.sequence === payload.receipt.sequence &&
                        source.receipt.stream === payload.instance;
                } catch {
                    matches = false;
                }
            }
            const confirmed = !!acknowledgement && owns && matches;
            const error = confirmed
                ? null
                : !owns
                  ? 'LEASE_LOST'
                  : !matches
                    ? 'SOURCE_CHANGED'
                    : 'NODE_UNAVAILABLE';
            await sql`INSERT INTO xera_quota_recovery_receipt_attempts(attempt_id,phase,request_id,details)
                VALUES(${attempt}::uuid,'OBSERVED',${request}::uuid,${JSON.stringify({ confirmed, error, acknowledgement })}::jsonb)`.execute(
                this.db.kysely,
            );
            if (owns)
                await sql`UPDATE xera_quota_recovery_receipt_jobs SET lease_owner=NULL,lease_until=NULL,
                result=CASE WHEN ${confirmed} THEN ${JSON.stringify(acknowledgement)}::jsonb ELSE result END WHERE request_id=${request}::uuid AND lease_owner=${attempt}::uuid`.execute(
                    this.db.kysely,
                );
            return { confirmed, error };
        });
        if (!outcome.confirmed)
            throw new RecoveryReceiptDeliveryError(
                outcome.error as 'LEASE_LOST' | 'SOURCE_CHANGED' | 'NODE_UNAVAILABLE',
            );
        // This proves only this original packet. Pending tail counters and the
        // global gate still require separate reconciliation and release.
        return {
            requestId: request,
            acknowledgement: acknowledgement!,
            alreadyAcknowledged: false,
        };
    }
}
