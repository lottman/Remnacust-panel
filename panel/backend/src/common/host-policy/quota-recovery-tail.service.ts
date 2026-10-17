import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { z } from 'zod';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TxKyselyService } from '@common/database';

import { NativeQuotaRecoveryService } from './native-quota-recovery.service';
import { QuotaReceiptRecoveryService } from './quota-receipt-recovery.service';
import { recoveryStatusSchema } from './quota-recovery-report';
import { recoveryQuiescenceSchema, recoveryQuiescenceMatches } from './recovery-quiescence';
import {
    recoveryTailIdentity,
    recoveryTailInput,
    recoveryTailPlan,
    type RecoveryTailInput,
} from './recovery-tail-plan';
import { recoveryUsageAckReply } from './recovery-usage-ack';
import { recoveryUsageSampleMatches, recoveryUsageSampleRequest } from './recovery-usage-sample';
import { readPersistedUsageJournal, USAGE_JOURNAL_MAX_BYTES } from './usage-archive';
import { frameDigest } from './usage-receipt';

const expand = promisify(gunzip);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const connectionHash = (node: INodeConnectionOpts) =>
    hash(JSON.stringify([node.address, node.port, node.proxyUrl]));
const statusSchema = recoveryStatusSchema.extend({
    quotaRecoveryReceiptsSupported: z.literal(true),
    quotaRecoveryPoliciesSupported: z.literal(true),
    quotaFencesSupported: z.literal(true),
    userQuotaRequired: z.literal(true),
    policyGeneration: z.uuid(),
    quotaRecoveryQuiescenceSupported: z.boolean().optional(),
});
type Preparation = {
    request: string;
    node: string;
    actor: string;
    intent: RecoveryTailInput;
    plan: ReturnType<typeof recoveryTailPlan> & {
        preparedUnder: {
            coreProcessId: string;
            instance: string;
            fenceDigest: string;
            policyRevision: string;
            policyGeneration: string;
        };
    };
    source: string;
};
export class RecoveryTailError extends Error {
    constructor(
        readonly code:
            | 'NOT_PENDING'
            | 'REQUEST_CONFLICT'
            | 'NODE_MISSING'
            | 'SOURCE_CHANGED'
            | 'NODE_UNAVAILABLE'
            | 'SAMPLE_UNSUPPORTED'
            | 'ACK_REQUIRED'
            | 'HELD_POLICY_REQUIRED'
            | 'BUSY',
    ) {
        super(code);
    }
}

@Injectable()
export class QuotaRecoveryTailService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly axios: AxiosService,
        private readonly captures: QuotaReceiptRecoveryService,
        private readonly native: NativeQuotaRecoveryService,
    ) {}

    private async pending(generation: string) {
        const rows =
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL FOR UPDATE`.execute(
                this.db.kysely,
            );
        if (!rows.rows.length) throw new RecoveryTailError('NOT_PENDING');
    }
    private async existing(node: string, input: RecoveryTailInput, actor: string) {
        const row = (
            await sql<Preparation>`SELECT request_id::text AS request,node_uuid::text AS node,actor_uuid::text AS actor,intent,plan,source_request::text AS source
            FROM xera_quota_recovery_tail_preparations WHERE request_id=${input.requestId}::uuid OR acknowledgement_request=${input.acknowledgementRequest}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (
            row &&
            (row.node !== node ||
                row.actor !== actor ||
                row.request !== input.requestId ||
                Object.entries(input).some(
                    ([key, value]) => row.intent[key as keyof RecoveryTailInput] !== value,
                ))
        )
            throw new RecoveryTailError('REQUEST_CONFLICT');
        return row;
    }
    private async node(node: string) {
        return (
            await sql<
                INodeConnectionOpts & { id: string; instance: string | null }
            >`SELECT n.id::text,n.address,n.port,n.proxy_url AS "proxyUrl",m.instance_uuid::text AS instance FROM nodes n
            JOIN xera_quota_node_modes m ON m.node_uuid=n.uuid WHERE n.uuid=${node}::uuid AND NOT n.is_disabled`.execute(
                this.db.kysely,
            )
        ).rows[0];
    }

    async details(node: string, acknowledgement: string, generation: string) {
        for (const id of [node, acknowledgement, generation]) recoveryTailIdentity.parse(id);
        const preparation = (
            await sql<Preparation>`SELECT request_id::text AS request,node_uuid::text AS node,actor_uuid::text AS actor,intent,plan,source_request::text AS source
            FROM xera_quota_recovery_tail_preparations WHERE node_uuid=${node}::uuid AND acknowledgement_request=${acknowledgement}::uuid AND generation=${generation}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!preparation) return { preparation: null, sourceRequest: null, sourceConflict: false };
        const plan = preparation.plan;
        const sources = (
            await sql<{
                request: string;
                digest: string;
            }>`SELECT DISTINCT ON(c.metadata->'pending'->>'digest') r.request_id::text AS request,c.metadata->'pending'->>'digest' AS digest
            FROM xera_quota_receipt_requests r JOIN xera_quota_receipt_captures c USING(request_id)
            WHERE r.node_uuid=${node}::uuid AND c.node_uuid=${node}::uuid AND r.generation=${generation}::uuid AND c.state='PRESENT'
            AND c.metadata->>'stream'=${plan.sample.stream} AND c.metadata->>'acked'=${plan.previous.sequence} AND c.metadata->>'ackDigest'=${plan.previous.digest}
            AND c.metadata->'pending'->>'sequence'=${plan.sample.sequence} AND c.metadata->'pending'->>'coreProcessId'=${plan.sample.coreProcessId}
            ORDER BY c.metadata->'pending'->>'digest',r.requested_at DESC,r.request_id DESC LIMIT 2`.execute(
                this.db.kysely,
            )
        ).rows;
        const sourceConflict =
            sources.length > 1 ||
            (sources.length === 1 &&
                preparation.plan.retainedDigest !== null &&
                sources[0].digest !== preparation.plan.retainedDigest);
        return {
            preparation,
            sourceRequest:
                !sourceConflict && sources.length === 1
                    ? preparation.plan.requiresSampling
                        ? sources[0].request
                        : preparation.source
                    : null,
            sourceConflict,
        };
    }
    async prepare(node: string, body: RecoveryTailInput, actor: string) {
        recoveryTailIdentity.parse(node);
        recoveryTailIdentity.parse(actor);
        const input = recoveryTailInput.parse(body);
        if (this.transactions.isTransactionActive())
            throw Error('Recovery tail preparation requires standalone transactions');
        const known = await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            await this.pending(input.generation);
            return this.existing(node, input, actor);
        });
        if (known) return known;
        const endpoint = await this.node(node);
        if (!endpoint) throw new RecoveryTailError('NODE_MISSING');
        // Capture only reads the original file. No counter sample is sent
        // until its next SQL ticket has committed successfully.
        const capture = await this.captures.capture(node, input.generation, actor);
        if (capture.state !== 'PRESENT') throw new RecoveryTailError('SOURCE_CHANGED');
        const archive = await this.captures.download(node, capture.requestId);
        const original = await expand(archive.data, { maxOutputLength: USAGE_JOURNAL_MAX_BYTES });
        const response = await this.axios.hostPolicy<unknown>(endpoint);
        const status = response.isOk ? statusSchema.safeParse(response.response) : null;
        return this.transactions.withTransaction({ timeout: 10000 }, async () => {
            await this.pending(input.generation);
            const existing = await this.existing(node, input, actor);
            if (existing) return existing;
            const current = await this.node(node);
            const live = status?.success ? status.data : null,
                fence = live?.quotaRecovery?.record;
            if (
                !current ||
                connectionHash(current) !== connectionHash(endpoint) ||
                !live?.applied ||
                !live.coreProcessId ||
                !live.quotaInstanceId ||
                current.instance !== live.quotaInstanceId ||
                fence?.state !== 'FENCED' ||
                fence.generation !== input.generation
            )
                throw new RecoveryTailError('SOURCE_CHANGED');
            const job = (
                await sql<{
                    decision: string;
                    source: {
                        receipt: { sequence: string; digest: string; coreProcessId: string };
                    };
                    result: unknown;
                    connection: string;
                }>`SELECT decision_request::text AS decision,source,result,connection_hash AS connection
                FROM xera_quota_recovery_receipt_jobs WHERE request_id=${input.acknowledgementRequest}::uuid AND generation=${input.generation}::uuid AND node_uuid=${node}::uuid FOR UPDATE`.execute(
                    this.db.kysely,
                )
            ).rows[0];
            if (!job?.result) throw new RecoveryTailError('ACK_REQUIRED');
            const ack = recoveryUsageAckReply.parse(job.result);
            if (job.connection !== connectionHash(current) || ack.instance !== current.instance)
                throw new RecoveryTailError('SOURCE_CHANGED');
            const held =
                await sql`SELECT 1 FROM xera_quota_recovery_policy_jobs WHERE generation=${input.generation}::uuid AND node_uuid=${node}::uuid AND connection_hash=${connectionHash(current)} AND result IS NOT NULL
                AND payload->>'coreProcessId'=${live.coreProcessId} AND payload->>'instance'=${live.quotaInstanceId} AND payload->>'previous'=${fence.digest}
                AND payload->>'policyRevision'=${live.policyRevision} AND result->>'policyGeneration'=${live.policyGeneration} LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (!held.rows.length) throw new RecoveryTailError('HELD_POLICY_REQUIRED');
            const busy =
                await sql`SELECT 1 FROM xera_quota_recovery_receipt_jobs WHERE generation=${input.generation}::uuid AND node_uuid=${node}::uuid AND lease_until>clock_timestamp()
                UNION ALL SELECT 1 FROM xera_quota_recovery_policy_jobs WHERE generation=${input.generation}::uuid AND node_uuid=${node}::uuid AND lease_until>clock_timestamp() LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (busy.rows.length) throw new RecoveryTailError('BUSY');
            const source = await this.native.recoveryAcknowledgementSource(
                node,
                job.decision,
                input.generation,
            );
            if (
                source.receipt.sequence !== ack.journal.acked ||
                source.receipt.digest !== ack.journal.ackDigest ||
                source.receipt.stream !== ack.instance ||
                source.receipt.coreProcessId !== job.source.receipt.coreProcessId ||
                source.decisionDigest !== ack.decisionDigest ||
                source.sourceDigest !== ack.sourceDigest
            )
                throw new RecoveryTailError('SOURCE_CHANGED');
            const proof =
                await sql`SELECT 1 FROM xera_quota_receipt_requests r JOIN xera_quota_receipt_captures c USING(request_id)
                WHERE r.request_id=${capture.requestId}::uuid AND r.node_uuid=${node}::uuid AND r.generation=${input.generation}::uuid
                AND c.node_uuid=${node}::uuid AND r.metadata_digest=${hash(JSON.stringify([current.id, current.address, current.port, current.proxyUrl]))} AND c.state='PRESENT' AND c.source_digest=${hash(original)}`.execute(
                    this.db.kysely,
                );
            if (!proof.rows.length) throw new RecoveryTailError('SOURCE_CHANGED');
            const plan = {
                ...recoveryTailPlan(ack, original, live.coreProcessId, input.consumptionMultiplier),
                preparedUnder: {
                    coreProcessId: live.coreProcessId,
                    instance: live.quotaInstanceId,
                    fenceDigest: fence.digest,
                    policyRevision: live.policyRevision,
                    policyGeneration: live.policyGeneration,
                },
            };
            if (plan.requiresSampling && !live.quotaRecoverySamplesSupported)
                throw new RecoveryTailError('SAMPLE_UNSUPPORTED');
            const updated =
                await sql`UPDATE xera_node_usage_streams SET next_sequence=${plan.sample.sequence}::bigint,expected_core=${plan.sample.coreProcessId}::uuid,
                requested_at=clock_timestamp(),consumption_multiplier=${plan.consumptionMultiplier}::bigint,committed_digest=NULL,updated_at=now()
                WHERE node_uuid=${node}::uuid AND node_id=${current.id}::bigint AND stream_id=${plan.sample.stream}::uuid AND next_sequence=${plan.previous.sequence}::bigint
                AND expected_core=${source.receipt.coreProcessId}::uuid AND committed_digest=${plan.previous.digest} AND pending_effects IS NULL RETURNING node_uuid`.execute(
                    this.db.kysely,
                );
            if (updated.rows.length !== 1) throw new RecoveryTailError('SOURCE_CHANGED');
            await sql`INSERT INTO xera_quota_recovery_tail_preparations(request_id,acknowledgement_request,source_request,generation,node_uuid,actor_uuid,intent,plan)
                VALUES(${input.requestId}::uuid,${input.acknowledgementRequest}::uuid,${capture.requestId}::uuid,${input.generation}::uuid,${node}::uuid,${actor}::uuid,${JSON.stringify(input)}::jsonb,${JSON.stringify(plan)}::jsonb)`.execute(
                this.db.kysely,
            );
            return {
                request: input.requestId,
                node,
                actor,
                intent: input,
                plan,
                source: capture.requestId,
            };
        });
    }

    private async executionState(node: string, request: string, generation: string, actor: string) {
        await this.pending(generation);
        const saved = (
            await sql<Preparation>`SELECT request_id::text AS request,node_uuid::text AS node,actor_uuid::text AS actor,intent,plan,source_request::text AS source
            FROM xera_quota_recovery_tail_preparations WHERE request_id=${request}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (
            !saved ||
            saved.node !== node ||
            saved.actor !== actor ||
            saved.intent.generation !== generation
        )
            throw new RecoveryTailError('REQUEST_CONFLICT');
        const current = await this.node(node);
        if (!current || current.instance !== saved.plan.sample.stream)
            throw new RecoveryTailError('SOURCE_CHANGED');
        const proof =
            await sql`SELECT 1 FROM xera_node_usage_streams s JOIN xera_quota_receipt_requests r ON r.request_id=${saved.source}::uuid
            WHERE s.node_uuid=${node}::uuid AND s.node_id=${current.id}::bigint AND s.stream_id=${saved.plan.sample.stream}::uuid
            AND s.next_sequence=${saved.plan.sample.sequence}::bigint AND s.expected_core=${saved.plan.sample.coreProcessId}::uuid
            AND s.consumption_multiplier=${saved.plan.consumptionMultiplier}::bigint AND s.requested_at IS NOT NULL AND s.committed_digest IS NULL AND s.pending_effects IS NULL
            AND r.node_uuid=${node}::uuid AND r.generation=${generation}::uuid AND r.metadata_digest=${hash(JSON.stringify([current.id, current.address, current.port, current.proxyUrl]))}`.execute(
                this.db.kysely,
            );
        if (!proof.rows.length) throw new RecoveryTailError('SOURCE_CHANGED');
        if (
            (await this.details(node, saved.intent.acknowledgementRequest, generation))
                .sourceConflict
        )
            throw new RecoveryTailError('SOURCE_CHANGED');
        return { saved, current };
    }

    async execute(node: string, request: string, generation: string, actor: string) {
        for (const id of [node, request, generation, actor]) recoveryTailIdentity.parse(id);
        if (this.transactions.isTransactionActive())
            throw Error('Recovery tail execution requires standalone transactions');
        const prepared = await this.transactions.withTransaction({ timeout: 10000 }, () =>
            this.executionState(node, request, generation, actor),
        );
        const { saved, current } = prepared,
            plan = saved.plan;
        const archive = await this.captures.download(node, saved.source);
        const original = await expand(archive.data, { maxOutputLength: USAGE_JOURNAL_MAX_BYTES });
        const journal = readPersistedUsageJournal(original);
        if (
            plan.version !== 'remnacust-recovery-tail-v1' ||
            hash(original) !== plan.journalDigest ||
            journal.stream !== plan.sample.stream ||
            journal.acked !== plan.previous.sequence ||
            journal.ackDigest !== plan.previous.digest ||
            (journal.pending === null) !== plan.requiresSampling ||
            (journal.pending &&
                (journal.pending.sequence !== plan.sample.sequence ||
                    journal.pending.coreProcessId !== plan.sample.coreProcessId)) ||
            (journal.pending ? frameDigest(journal.pending) : null) !== plan.retainedDigest
        )
            throw new RecoveryTailError('SOURCE_CHANGED');
        const observed = await this.axios.hostPolicy<unknown>(current);
        const status = observed.isOk ? statusSchema.safeParse(observed.response) : null;
        const live = status?.success ? status.data : null,
            fence = live?.quotaRecovery?.record;
        if (
            !live?.applied ||
            !live.coreProcessId ||
            live.quotaInstanceId !== current.instance ||
            fence?.state !== 'FENCED' ||
            fence.generation !== generation
        )
            throw new RecoveryTailError('SOURCE_CHANGED');
        if (plan.requiresSampling && !live.quotaRecoverySamplesSupported)
            throw new RecoveryTailError('SAMPLE_UNSUPPORTED');
        await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            const latest = await this.executionState(node, request, generation, actor);
            if (connectionHash(latest.current) !== connectionHash(current))
                throw new RecoveryTailError('SOURCE_CHANGED');
            const held =
                await sql`SELECT 1 FROM xera_quota_recovery_policy_jobs WHERE generation=${generation}::uuid AND node_uuid=${node}::uuid AND connection_hash=${connectionHash(current)} AND result IS NOT NULL
                AND payload->>'coreProcessId'=${live.coreProcessId} AND payload->>'instance'=${live.quotaInstanceId} AND payload->>'previous'=${fence.digest}
                AND payload->>'policyRevision'=${live.policyRevision} AND result->>'policyGeneration'=${live.policyGeneration} LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (!held.rows.length) throw new RecoveryTailError('HELD_POLICY_REQUIRED');
            const busy =
                await sql`SELECT 1 FROM xera_quota_recovery_receipt_jobs WHERE generation=${generation}::uuid AND node_uuid=${node}::uuid AND lease_until>clock_timestamp()
                UNION ALL SELECT 1 FROM xera_quota_recovery_policy_jobs WHERE generation=${generation}::uuid AND node_uuid=${node}::uuid AND lease_until>clock_timestamp() LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (busy.rows.length) throw new RecoveryTailError('BUSY');
        });
        let source = saved.source,
            frame = journal.pending,
            sourceDigest = plan.journalDigest;
        let alreadyCaptured = true;
        let witness: z.infer<typeof recoveryQuiescenceSchema> | null = null;
        if (plan.requiresSampling) {
            // Fixed ordering keeps the intent digest stable across JSONB key
            // ordering and process restarts. Only the live guard may rebind.
            const preparationDigest = hash(
                JSON.stringify([
                    saved.request,
                    saved.node,
                    saved.actor,
                    saved.source,
                    saved.intent.generation,
                    saved.intent.acknowledgementRequest,
                    saved.intent.consumptionMultiplier,
                    saved.intent.note,
                    plan.sample.stream,
                    plan.sample.sequence,
                    plan.sample.coreProcessId,
                    plan.previous.sequence,
                    plan.previous.digest,
                    plan.journalDigest,
                    plan.retainedDigest,
                    plan.preparedUnder.coreProcessId,
                    plan.preparedUnder.instance,
                    plan.preparedUnder.fenceDigest,
                    plan.preparedUnder.policyRevision,
                    plan.preparedUnder.policyGeneration,
                ]),
            );
            const body = recoveryUsageSampleRequest.parse({
                requestId: request,
                generation,
                coreProcessId: live.coreProcessId,
                instance: live.quotaInstanceId,
                previous: fence.digest,
                preparationDigest,
                sourceDigest: plan.journalDigest,
                retainedDigest: plan.retainedDigest,
                prior: plan.previous,
                receipt: plan.sample,
            });
            const sampled = await this.axios.usageRecoverySample(current, body);
            if (!sampled.isOk || !recoveryUsageSampleMatches(body, sampled.response))
                throw new RecoveryTailError('NODE_UNAVAILABLE');
            alreadyCaptured = sampled.response.alreadyCaptured;
            const capture = await this.captures.capture(node, generation, actor);
            if (capture.state !== 'PRESENT') throw new RecoveryTailError('SOURCE_CHANGED');
            const captured = await this.captures.download(node, capture.requestId);
            const bytes = await expand(captured.data, { maxOutputLength: USAGE_JOURNAL_MAX_BYTES });
            const state = readPersistedUsageJournal(bytes);
            sourceDigest = hash(bytes);
            if (
                sourceDigest !== sampled.response.journalDigest ||
                state.stream !== plan.sample.stream ||
                state.acked !== plan.previous.sequence ||
                state.ackDigest !== plan.previous.digest ||
                !state.pending ||
                state.pending.sequence !== plan.sample.sequence ||
                state.pending.coreProcessId !== plan.sample.coreProcessId ||
                frameDigest(state.pending) !== sampled.response.frame.digest
            )
                throw new RecoveryTailError('SOURCE_CHANGED');
            source = capture.requestId;
            frame = state.pending;
            if (live.quotaRecoveryQuiescenceSupported && frame.stats.length === 0) {
                const proof = await this.axios.usageRecoveryQuiescence(current, body);
                if (
                    proof.isOk &&
                    proof.response.witness &&
                    recoveryQuiescenceMatches(body, proof.response.witness) &&
                    proof.response.witness.journalDigest === sourceDigest &&
                    proof.response.witness.frame.digest === frameDigest(frame)
                )
                    witness = proof.response.witness;
            }
        }
        if (!frame) throw new RecoveryTailError('SOURCE_CHANGED');
        await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            const latest = await this.executionState(node, request, generation, actor);
            if (connectionHash(latest.current) !== connectionHash(current))
                throw new RecoveryTailError('SOURCE_CHANGED');
            const captured =
                await sql`SELECT 1 FROM xera_quota_receipt_requests r JOIN xera_quota_receipt_captures c USING(request_id)
                WHERE r.request_id=${source}::uuid AND r.node_uuid=${node}::uuid AND c.node_uuid=${node}::uuid AND r.generation=${generation}::uuid
                AND r.metadata_digest=${hash(JSON.stringify([current.id, current.address, current.port, current.proxyUrl]))} AND c.state='PRESENT' AND c.source_digest=${sourceDigest}`.execute(
                    this.db.kysely,
                );
            if (!captured.rows.length) throw new RecoveryTailError('SOURCE_CHANGED');
            if (witness) {
                await sql`INSERT INTO xera_quota_recovery_quiescence(preparation_request,source_request,generation,node_uuid,witness_digest,witness)
                    VALUES(${request}::uuid,${source}::uuid,${generation}::uuid,${node}::uuid,${witness.digest},${JSON.stringify(witness)}::jsonb)
                    ON CONFLICT(preparation_request) DO NOTHING`.execute(this.db.kysely);
                const stored =
                    await sql`SELECT 1 FROM xera_quota_recovery_quiescence WHERE preparation_request=${request}::uuid
                    AND generation=${generation}::uuid AND node_uuid=${node}::uuid AND witness_digest=${witness.digest}`.execute(
                        this.db.kysely,
                    );
                if (!stored.rows.length) throw new RecoveryTailError('SOURCE_CHANGED');
            }
        });
        // This is a captured source for the normal reviewed native import,
        // not a monetary decision or permission to release traffic.
        return {
            preparationRequest: request,
            sourceRequest: source,
            alreadyCaptured,
            sequence: frame.sequence,
            coreProcessId: frame.coreProcessId,
            digest: frameDigest(frame),
            counters: frame.stats.length,
            quiescenceDigest: witness?.digest ?? null,
        };
    }
}
