import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import type { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TxKyselyService } from '@common/database';

import { QuotaBankRecoveryService } from './quota-bank-recovery.service';
import { QuotaCutoverService } from './quota-cutover.service';
import {
    readRecoveryObligations,
    requireSettledRecoveryObligations,
} from './quota-recovery-obligations';
import { recoveryPolicyReplyMatches } from './quota-recovery-policy';
import { QuotaRecoveryReceiptService } from './quota-recovery-receipt.service';
import { recoveryReleaseRequestSchema } from './quota-recovery-release';
import { recoveryStatusSchema, recoveryDigest } from './quota-recovery-report';
import { recoveryNodeRoster } from './quota-recovery-roster';
import { QuotaRecoveryService } from './quota-recovery.service';
import { recoveryQuiescenceAcknowledged } from './recovery-quiescence';
import { requireEmptyRecoveryQueueProof } from './usage-queue-proof';

const uuid = recoveryReleaseRequestSchema.shape.requestId;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const releaseDraft = z.strictObject({
    requestId: uuid,
    generation: uuid,
    bankRequest: uuid,
    note: z
        .string()
        .trim()
        .min(10)
        .max(2000)
        .refine(
            (value) =>
                !value.includes('\u0000') && Buffer.from(value, 'utf8').toString('utf8') === value,
        ),
});
export const releaseApproval = releaseDraft.extend({ planDigest: digest });
type Draft = z.infer<typeof releaseDraft>;
type Approval = z.infer<typeof releaseApproval>;
const liveSchema = recoveryStatusSchema.extend({
    applied: z.literal(true),
    userQuotaRequired: z.literal(true),
    quotaFencesSupported: z.literal(true),
    quotaRecoveryReleasesSupported: z.literal(true),
    quotaRecoveryPoliciesSupported: z.literal(true),
    coreProcessId: uuid,
    quotaInstanceId: uuid,
    policyGeneration: uuid,
});
type Candidate = NonNullable<
    Awaited<ReturnType<QuotaRecoveryReceiptService['acknowledgedQuiescenceSource']>>
>;
type Check = { request: string; report: unknown; finishedAt: Date };
type Observation = {
    node: string;
    endpoint: INodeConnectionOpts;
    candidate: Candidate;
    check: Check;
    status: z.infer<typeof liveSchema>;
    journalDigest: string;
};
export class RecoveryReleaseError extends Error {
    constructor(
        readonly code:
            | 'NOT_PENDING'
            | 'NOT_READY'
            | 'NODE_UNAVAILABLE'
            | 'SOURCE_CHANGED'
            | 'STALE_PLAN'
            | 'REQUEST_CONFLICT'
            | 'ALREADY_APPROVED'
            | 'CAPACITY',
    ) {
        super(code);
    }
}
// UUIDv8 carries a deterministic per-node operation name, not a financial hash.
export function releaseNodeRequestId(approval: string, node: string) {
    uuid.parse(approval);
    uuid.parse(node);
    const bytes = createHash('sha256')
        .update('remnacust-recovery-release-v1:' + approval + ':' + node)
        .digest()
        .subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 128;
    bytes[8] = (bytes[8] & 63) | 128;
    const h = bytes.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const connectionHash = (value: INodeConnectionOpts) =>
    hash(JSON.stringify([value.address, value.port, value.proxyUrl]));
@Injectable()
export class QuotaRecoveryReleaseService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly axios: AxiosService,
        private readonly banks: QuotaBankRecoveryService,
        private readonly receipts: QuotaRecoveryReceiptService,
        private readonly recovery: QuotaRecoveryService,
        private readonly cutover: QuotaCutoverService,
    ) {}
    private standalone() {
        if (this.transactions.isTransactionActive())
            throw Error('Release approval requires standalone observations');
    }
    private async pending(generation: string) {
        const rows =
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL FOR UPDATE`.execute(
                this.db.kysely,
            );
        if (!rows.rows.length) throw new RecoveryReleaseError('NOT_PENDING');
    }
    private async roster() {
        const rows = (
            await sql<{
                node: string;
            }>`SELECT node_uuid::text AS node FROM (${recoveryNodeRoster}) r ORDER BY node_uuid LIMIT 10001`.execute(
                this.db.kysely,
            )
        ).rows;
        if (!rows.length) throw new RecoveryReleaseError('NOT_READY');
        if (rows.length > 10000) throw new RecoveryReleaseError('CAPACITY');
        return rows.map((row) => row.node);
    }
    private async endpoint(node: string) {
        const row = (
            await sql<INodeConnectionOpts>`SELECT address,port,proxy_url AS "proxyUrl" FROM nodes WHERE uuid=${node}::uuid AND NOT is_disabled FOR SHARE`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!row) throw new RecoveryReleaseError('NOT_READY');
        return row;
    }
    private async checked(node: string, generation: string, report?: unknown) {
        const row = (
            await sql<Check>`SELECT c.request_id::text AS request,c.report,c.finished_at AS "finishedAt"
            FROM xera_quota_recovery_checks c JOIN xera_quota_recovery_evidence e ON e.request_id=c.request_id
                AND e.node_uuid=c.node_uuid AND e.generation=c.generation AND e.report=c.report
            WHERE c.node_uuid=${node}::uuid AND c.generation=${generation}::uuid AND c.finished_at IS NOT NULL ${report === undefined ? sql`` : sql`AND c.report=${JSON.stringify(report)}::jsonb`}`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!row) throw new RecoveryReleaseError('NOT_READY');
        return row;
    }
    private async existing(request: string) {
        const row = (
            await sql<{
                request: string;
                generation: string;
                actor: string;
                requestDigest: string;
                planDigest: string;
                planText: string;
                baseline: string;
            }>`SELECT request_id::text AS request,generation::text,actor_uuid::text AS actor,request_digest AS "requestDigest",plan_digest AS "planDigest",plan_text AS "planText",baseline_request::text AS baseline
            FROM xera_quota_recovery_release_approvals WHERE request_id=${request}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (row && hash(row.planText) !== row.planDigest)
            throw new RecoveryReleaseError('SOURCE_CHANGED');
        return row;
    }
    private async noOtherApproval(input: Draft) {
        const found = (
            await sql<{
                request: string;
            }>`SELECT request_id::text AS request FROM xera_quota_recovery_release_approvals WHERE generation=${input.generation}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (found && found.request !== input.requestId)
            throw new RecoveryReleaseError('ALREADY_APPROVED');
    }
    private async collect(input: Draft, actor: string) {
        const roster = await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            await this.pending(input.generation);
            await this.noOtherApproval(input);
            requireSettledRecoveryObligations(
                await readRecoveryObligations(this.db, input.generation),
            );
            return this.roster();
        });
        const observations: Observation[] = [];
        // Each check archives the complete journal and SQL comparison. This
        // internal operation may run as a background job; no SQL lock spans RPC.
        for (const node of roster) {
            const checked = await this.recovery.check(node, input.generation, actor);
            if (checked.report.issues.length || !checked.report.acknowledgedReceipt)
                throw new RecoveryReleaseError('NOT_READY');
            const initial = await this.transactions.withTransaction(
                { timeout: 10000 },
                async () => {
                    await this.pending(input.generation);
                    const candidate = await this.receipts.acknowledgedQuiescenceSource(
                        node,
                        input.generation,
                    );
                    if (!candidate) throw new RecoveryReleaseError('NOT_READY');
                    const check = await this.checked(node, input.generation, checked.report);
                    return { candidate, check, endpoint: await this.endpoint(node) };
                },
            );
            const [status, proof] = await Promise.all([
                this.axios.hostPolicy<unknown>(initial.endpoint),
                this.axios.usageRecoveryQuiescence(
                    initial.endpoint,
                    initial.candidate.witness.request,
                ),
            ]);
            if (!status.isOk || !proof.isOk) throw new RecoveryReleaseError('NODE_UNAVAILABLE');
            const live = liveSchema.safeParse(status.response),
                w = initial.candidate.witness;
            if (
                !live.success ||
                !recoveryQuiescenceAcknowledged(w.request, proof.response) ||
                live.data.coreProcessId !== w.frame.coreProcessId ||
                live.data.quotaInstanceId !== w.frame.stream ||
                live.data.quotaRecovery?.record?.state !== 'FENCED' ||
                live.data.quotaRecovery.record.digest !== w.fence.digest ||
                checked.report.instance !== live.data.quotaInstanceId ||
                checked.report.sequence !== live.data.quotaJournalSequence ||
                checked.report.policyRevision !== live.data.policyRevision ||
                checked.report.recoveryFence?.digest !== w.fence.digest ||
                checked.report.acknowledgedReceipt.digest !== w.frame.digest ||
                checked.report.acknowledgedReceipt.witnessDigest !== w.digest ||
                connectionHash(initial.endpoint) !== initial.candidate.connectionHash
            )
                throw new RecoveryReleaseError('SOURCE_CHANGED');
            observations.push({
                node,
                ...initial,
                status: live.data,
                journalDigest: proof.response.journal.digest,
            });
        }
        const queues = requireEmptyRecoveryQueueProof(await this.cutover.recoveryQueueProof());
        return { observations, queues };
    }
    private async plan(
        input: Draft,
        observed: Awaited<ReturnType<QuotaRecoveryReleaseService['collect']>>,
    ) {
        await this.pending(input.generation);
        await this.noOtherApproval(input);
        if (
            JSON.stringify(await this.roster()) !==
            JSON.stringify(observed.observations.map((value) => value.node))
        )
            throw new RecoveryReleaseError('SOURCE_CHANGED');
        requireSettledRecoveryObligations(await readRecoveryObligations(this.db, input.generation));
        const bank = await this.banks.compareInTransaction(input.bankRequest, input.generation);
        if (!bank.matches) throw new RecoveryReleaseError('STALE_PLAN');
        const nodes = [];
        for (const value of observed.observations) {
            const candidate = await this.receipts.acknowledgedQuiescenceSource(
                value.node,
                input.generation,
            );
            const check = await this.checked(value.node, input.generation);
            if (
                !candidate ||
                recoveryDigest(candidate) !== recoveryDigest(value.candidate) ||
                recoveryDigest(check) !== recoveryDigest(value.check) ||
                connectionHash(await this.endpoint(value.node)) !== candidate.connectionHash
            )
                throw new RecoveryReleaseError('SOURCE_CHANGED');
            const status = value.status;
            const held = (
                await sql<{
                    payload: unknown;
                    result: unknown;
                }>`SELECT payload,result FROM xera_quota_recovery_policy_jobs WHERE node_uuid=${value.node}::uuid AND generation=${input.generation}::uuid
                AND result->>'policyRevision'=${status.policyRevision} AND result->>'policyGeneration'=${status.policyGeneration}
                ORDER BY created_at DESC,request_id DESC LIMIT 1`.execute(this.db.kysely)
            ).rows[0];
            if (
                !held ||
                !recoveryPolicyReplyMatches(
                    held.payload as Parameters<typeof recoveryPolicyReplyMatches>[0],
                    held.result,
                )
            )
                throw new RecoveryReleaseError('SOURCE_CHANGED');
            const reply = held.result as {
                coreProcessId: string;
                instance: string;
                quotaRecovery: { record: { digest: string } };
            };
            if (
                reply.coreProcessId !== status.coreProcessId ||
                reply.instance !== status.quotaInstanceId ||
                reply.quotaRecovery.record.digest !== candidate.witness.fence.digest
            )
                throw new RecoveryReleaseError('SOURCE_CHANGED');
            const payload = recoveryReleaseRequestSchema.parse({
                requestId: releaseNodeRequestId(input.requestId, value.node),
                generation: input.generation,
                coreProcessId: status.coreProcessId,
                instance: status.quotaInstanceId,
                previous: candidate.witness.fence.digest,
                policyRevision: status.policyRevision,
                policyGeneration: status.policyGeneration,
                witnessDigest: candidate.witness.digest,
                journalDigest: value.journalDigest,
            });
            nodes.push({
                node: value.node,
                connectionHash: candidate.connectionHash,
                payload,
                previous: candidate.witness.fence,
                witnessRequest: candidate.witness.request.requestId,
                acknowledgementRequest: candidate.acknowledgementRequest,
                decisionRequest: candidate.decisionRequest,
                decisionDigest: candidate.decisionDigest,
                sourceDigest: candidate.sourceDigest,
            });
        }
        const { observedAt: _time, ...queueIdentity } = observed.queues;
        const plan = {
            version: 'remnacust-recovery-release-plan-v1',
            ...input,
            bankDigest: bank.originalDigest,
            queueIdentity,
            nodes,
        };
        const text = JSON.stringify(plan);
        if (Buffer.byteLength(text) > 32 * 1024 * 1024) throw new RecoveryReleaseError('CAPACITY');
        return { plan, text, digest: hash(text) };
    }
    async preview(body: Draft, actor: string) {
        this.standalone();
        uuid.parse(actor);
        const input = releaseDraft.parse(body);
        const existing = await this.existing(input.requestId);
        if (existing) {
            const expected = hash(
                JSON.stringify({ actor, ...input, planDigest: existing.planDigest }),
            );
            if (existing.requestDigest !== expected)
                throw new RecoveryReleaseError('REQUEST_CONFLICT');
            return {
                plan: JSON.parse(existing.planText),
                planDigest: existing.planDigest,
                approved: true,
            };
        }
        const observed = await this.collect(input, actor);
        return this.transactions.withTransaction(
            { isolationLevel: 'RepeatableRead', timeout: 60000 },
            async () => {
                const result = await this.plan(input, observed);
                return { plan: result.plan, planDigest: result.digest, approved: false };
            },
        );
    }
    async status(generation: string) {
        uuid.parse(generation);
        return (
            (
                await sql<{
                    request: string;
                    generation: string;
                    actor: string;
                    planDigest: string;
                    bankRequest: string;
                    baseline: string;
                    note: string;
                    createdAt: Date;
                    total: string;
                    acknowledged: string;
                    active: string;
                    finalization: string | null;
                }>`SELECT a.request_id::text AS request,a.generation::text,a.actor_uuid::text AS actor,
            a.plan_digest AS "planDigest",a.bank_request::text AS "bankRequest",a.baseline_request::text AS baseline,
            a.plan_text::jsonb->>'note' AS note,a.created_at AS "createdAt",
            (SELECT count(*)::text FROM xera_quota_recovery_release_jobs j WHERE j.approval_request=a.request_id) AS total,
            (SELECT count(*)::text FROM xera_quota_recovery_release_jobs j WHERE j.approval_request=a.request_id AND j.result IS NOT NULL) AS acknowledged,
            (SELECT count(*)::text FROM xera_quota_recovery_release_jobs j WHERE j.approval_request=a.request_id AND j.lease_until>clock_timestamp()) AS active,
            f.request_id::text AS finalization FROM xera_quota_recovery_release_approvals a
            LEFT JOIN xera_quota_recovery_finalizations f ON f.approval_request=a.request_id WHERE a.generation=${generation}::uuid`.execute(
                    this.db.kysely,
                )
            ).rows[0] ?? null
        );
    }
    async approve(body: Approval, actor: string) {
        this.standalone();
        uuid.parse(actor);
        const input = releaseApproval.parse(body),
            requestDigest = hash(JSON.stringify({ actor, ...input }));
        const known = await this.existing(input.requestId);
        if (known) {
            if (known.requestDigest !== requestDigest)
                throw new RecoveryReleaseError('REQUEST_CONFLICT');
            return known;
        }
        try {
            const observed = await this.collect(input, actor);
            return await this.transactions.withTransaction(
                { isolationLevel: 'RepeatableRead', timeout: 60000 },
                async () => {
                    await this.pending(input.generation);
                    const replay = await this.existing(input.requestId);
                    if (replay) {
                        if (replay.requestDigest !== requestDigest)
                            throw new RecoveryReleaseError('REQUEST_CONFLICT');
                        return replay;
                    }
                    const { planDigest: _approvalDigest, ...draft } = input;
                    const result = await this.plan(draft, observed);
                    if (result.digest !== input.planDigest)
                        throw new RecoveryReleaseError('STALE_PLAN');
                    const baseline = randomUUID();
                    const observations = observed.observations.map((value) => ({
                        node: value.node,
                        checkRequest: value.check.request,
                        reportDigest: recoveryDigest(value.check.report),
                        finishedAt: value.check.finishedAt,
                    }));
                    await sql`INSERT INTO xera_quota_recovery_release_approvals(request_id,generation,actor_uuid,bank_request,baseline_request,request_digest,plan_digest,plan_text,observations,queue_proof)
                    VALUES(${input.requestId}::uuid,${input.generation}::uuid,${actor}::uuid,${input.bankRequest}::uuid,${baseline}::uuid,${requestDigest},${result.digest},${result.text},${JSON.stringify(observations)}::jsonb,${JSON.stringify(observed.queues)}::jsonb)`.execute(
                        this.db.kysely,
                    );
                    for (const node of result.plan.nodes)
                        await sql`INSERT INTO xera_quota_recovery_release_jobs(request_id,approval_request,node_uuid,evidence_request,connection_hash,payload,previous)
                    VALUES(${node.payload.requestId}::uuid,${input.requestId}::uuid,${node.node}::uuid,${observed.observations.find((value) => value.node === node.node)!.check.request}::uuid,${node.connectionHash},${JSON.stringify(node.payload)}::jsonb,${JSON.stringify(node.previous)}::jsonb)`.execute(
                            this.db.kysely,
                        );
                    await this.banks.captureInTransaction(input.generation, baseline, actor);
                    return (await this.existing(input.requestId))!;
                },
            );
        } catch (error) {
            const saved = await this.existing(input.requestId);
            if (saved) {
                if (saved.requestDigest !== requestDigest)
                    throw new RecoveryReleaseError('REQUEST_CONFLICT');
                return saved;
            }
            throw error;
        }
    }
}
