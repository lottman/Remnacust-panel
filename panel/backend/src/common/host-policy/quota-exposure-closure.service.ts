import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TxKyselyService } from '@common/database';

import { bankUuid, bankDigest } from './quota-bank-model';
import { QuotaBankRecoveryService } from './quota-bank-recovery.service';
import { QuotaRecoveryReceiptService } from './quota-recovery-receipt.service';
import { recoveryQuiescenceAcknowledged, RecoveryQuiescenceReply } from './recovery-quiescence';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const exposureClosureDraft = z.strictObject({
    generation: bankUuid,
    bankRequest: bankUuid,
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
export const exposureClosureApproval = exposureClosureDraft.extend({
    requestId: bankUuid,
    planDigest: bankDigest,
});
type Draft = z.infer<typeof exposureClosureDraft>;
type Approval = z.infer<typeof exposureClosureApproval>;
type Candidate = NonNullable<
    Awaited<ReturnType<QuotaRecoveryReceiptService['acknowledgedQuiescenceSource']>>
>;
type Scope = { revision: string; requestedAt: string; eligible: string; remaining: string };
type Plan = {
    version: 'remnacust-exposure-closure-v1';
    node: string;
    generation: string;
    bankRequest: string;
    bankDigest: string;
    acknowledgementRequest: string;
    decisionRequest: string;
    decisionDigest: string;
    witnessRequest: string;
    witnessDigest: string;
    sourceDigest: string;
    connectionHash: string;
    core: string;
    instance: string;
    sequence: string;
    frameDigest: string;
    journalDigest: string;
    scope: Scope;
    note: string;
};
type Decision = {
    requestId: string;
    node: string;
    generation: string;
    actor: string;
    requestDigest: string;
    planDigest: string;
    planText: string;
    createdAt: string;
};
export class ExposureClosureError extends Error {
    constructor(
        readonly code:
            | 'NOT_PENDING'
            | 'SOURCE_CHANGED'
            | 'STALE_PLAN'
            | 'REQUEST_CONFLICT'
            | 'NODE_UNAVAILABLE'
            | 'NOTHING_TO_CLOSE'
            | 'NODE_MISSING',
    ) {
        super(code);
    }
}
@Injectable()
export class QuotaExposureClosureService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly axios: AxiosService,
        private readonly receipts: QuotaRecoveryReceiptService,
        private readonly banks: QuotaBankRecoveryService,
    ) {}
    private standalone() {
        if (this.transactions.isTransactionActive())
            throw Error('Exposure closure requires standalone transactions');
    }
    private async pending(generation: string) {
        const p =
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL FOR UPDATE`.execute(
                this.db.kysely,
            );
        if (!p.rows.length) throw new ExposureClosureError('NOT_PENDING');
    }
    private async endpoint(node: string) {
        const n = (
            await sql<INodeConnectionOpts>`SELECT address,port,proxy_url AS "proxyUrl" FROM nodes WHERE uuid=${node}::uuid AND NOT is_disabled`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!n) throw new ExposureClosureError('NODE_MISSING');
        return n;
    }
    private async observe(node: string, generation: string) {
        const initial = await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            await this.pending(generation);
            const candidate = await this.receipts.acknowledgedQuiescenceSource(node, generation);
            if (!candidate) throw new ExposureClosureError('SOURCE_CHANGED');
            return { candidate, endpoint: await this.endpoint(node) };
        });
        const reply = await this.axios.usageRecoveryQuiescence(
            initial.endpoint,
            initial.candidate.witness.request,
        );
        if (!reply.isOk) throw new ExposureClosureError('NODE_UNAVAILABLE');
        if (!recoveryQuiescenceAcknowledged(initial.candidate.witness.request, reply.response))
            throw new ExposureClosureError('SOURCE_CHANGED');
        return { candidate: initial.candidate, reply: reply.response };
    }
    private async plan(
        node: string,
        input: Draft,
        observed: { candidate: Candidate; reply: RecoveryQuiescenceReply },
    ) {
        await this.pending(input.generation);
        const candidate = await this.receipts.acknowledgedQuiescenceSource(node, input.generation);
        if (
            !candidate ||
            hash(JSON.stringify(candidate)) !== hash(JSON.stringify(observed.candidate)) ||
            !recoveryQuiescenceAcknowledged(candidate.witness.request, observed.reply)
        )
            throw new ExposureClosureError('SOURCE_CHANGED');
        const bank = await this.banks.compareInTransaction(input.bankRequest, input.generation);
        if (!bank.matches) throw new ExposureClosureError('STALE_PLAN');
        const w = candidate.witness;
        const preparation = (
            await sql<{
                revision: string;
                core: string;
                instance: string;
                fence: string;
                sampling: boolean;
            }>`SELECT plan->'preparedUnder'->>'policyRevision' AS revision,plan->'preparedUnder'->>'coreProcessId' AS core,
                plan->'preparedUnder'->>'instance' AS instance,plan->'preparedUnder'->>'fenceDigest' AS fence,
                (plan->>'requiresSampling')::boolean AS sampling FROM xera_quota_recovery_tail_preparations
                WHERE request_id=${w.request.requestId}::uuid AND generation=${input.generation}::uuid AND node_uuid=${node}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (
            !preparation ||
            !preparation.sampling ||
            preparation.core !== w.request.coreProcessId ||
            preparation.instance !== w.frame.stream ||
            preparation.fence !== w.request.previous ||
            !/^[1-9][0-9]{0,18}$/.test(preparation.revision) ||
            BigInt(preparation.revision) > 9223372036854775807n
        )
            throw new ExposureClosureError('SOURCE_CHANGED');
        const scope = (
            await sql<Scope>`SELECT ${preparation.revision}::text AS revision,
            to_char(s.requested_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "requestedAt",
            (SELECT count(*)::text FROM xera_quota_usage_exposures e WHERE e.node_uuid=${node}::uuid
                AND e.core_uuid=${w.frame.coreProcessId}::uuid AND e.instance_uuid=${w.frame.stream}::uuid
                AND e.last_revision<=${preparation.revision}::bigint AND e.exposed_at<s.requested_at
                AND (e.fenced_sequence IS NULL OR e.fenced_sequence<=${w.frame.sequence}::bigint)) AS eligible,
            (SELECT count(*)::text FROM xera_quota_usage_exposures e WHERE e.node_uuid=${node}::uuid
                AND NOT(e.core_uuid=${w.frame.coreProcessId}::uuid AND e.instance_uuid=${w.frame.stream}::uuid
                    AND e.last_revision<=${preparation.revision}::bigint AND e.exposed_at<s.requested_at
                    AND (e.fenced_sequence IS NULL OR e.fenced_sequence<=${w.frame.sequence}::bigint))) AS remaining
            FROM xera_node_usage_streams s WHERE s.node_uuid=${node}::uuid AND s.requested_at IS NOT NULL`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!scope) throw new ExposureClosureError('SOURCE_CHANGED');
        const plan: Plan = {
            version: 'remnacust-exposure-closure-v1',
            node,
            generation: input.generation,
            bankRequest: input.bankRequest,
            bankDigest: bank.originalDigest,
            acknowledgementRequest: candidate.acknowledgementRequest,
            decisionRequest: candidate.decisionRequest,
            decisionDigest: candidate.decisionDigest,
            witnessRequest: w.request.requestId,
            witnessDigest: w.digest,
            sourceDigest: candidate.sourceDigest,
            connectionHash: candidate.connectionHash,
            core: w.frame.coreProcessId,
            instance: w.frame.stream,
            sequence: w.frame.sequence,
            frameDigest: w.frame.digest,
            journalDigest: observed.reply.journal.digest,
            scope,
            note: input.note,
        };
        const text = JSON.stringify(plan);
        return { plan, text, digest: hash(text) };
    }
    async preview(node: string, body: Draft) {
        this.standalone();
        bankUuid.parse(node);
        const input = exposureClosureDraft.parse(body),
            observed = await this.observe(node, input.generation);
        return this.transactions.withTransaction(
            { timeout: 60000, isolationLevel: 'RepeatableRead' },
            async () => {
                const p = await this.plan(node, input, observed);
                return { plan: p.plan, planDigest: p.digest };
            },
        );
    }
    private async decision(request: string) {
        return (
            await sql<Decision>`SELECT request_id::text AS "requestId",node_uuid::text AS node,generation::text,
        actor_uuid::text AS actor,request_digest AS "requestDigest",plan_digest AS "planDigest",plan_text AS "planText",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
        FROM xera_quota_recovery_exposure_closures WHERE request_id=${request}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
    }
    private view(row: Decision) {
        if (hash(row.planText) !== row.planDigest) throw new ExposureClosureError('SOURCE_CHANGED');
        return {
            requestId: row.requestId,
            node: row.node,
            generation: row.generation,
            actor: row.actor,
            planDigest: row.planDigest,
            plan: JSON.parse(row.planText) as Plan,
            createdAt: new Date(row.createdAt).toISOString(),
        };
    }
    private replay(row: Decision, digest: string) {
        if (row.requestDigest !== digest) throw new ExposureClosureError('REQUEST_CONFLICT');
        return this.view(row);
    }
    async resolve(node: string, body: Approval, actor: string) {
        this.standalone();
        bankUuid.parse(node);
        bankUuid.parse(actor);
        const input = exposureClosureApproval.parse(body),
            requestDigest = hash(JSON.stringify({ node, actor, ...input }));
        const prior = await this.decision(input.requestId);
        if (prior) return this.replay(prior, requestDigest);
        try {
            const observed = await this.observe(node, input.generation);
            return await this.transactions.withTransaction(
                { timeout: 60000, isolationLevel: 'RepeatableRead' },
                async () => {
                    await this.pending(input.generation);
                    const known = await this.decision(input.requestId);
                    if (known) return this.replay(known, requestDigest);
                    const p = await this.plan(node, input, observed);
                    if (p.digest !== input.planDigest) throw new ExposureClosureError('STALE_PLAN');
                    if (p.plan.scope.eligible === '0')
                        throw new ExposureClosureError('NOTHING_TO_CLOSE');
                    const deleted = await sql<{
                        count: string;
                    }>`WITH closed AS (DELETE FROM xera_quota_usage_exposures e USING xera_node_usage_streams s
                WHERE s.node_uuid=${node}::uuid AND e.node_uuid=s.node_uuid AND e.core_uuid=${p.plan.core}::uuid AND e.instance_uuid=${p.plan.instance}::uuid
                AND e.last_revision<=${p.plan.scope.revision}::bigint AND e.exposed_at<s.requested_at
                AND (e.fenced_sequence IS NULL OR e.fenced_sequence<=${p.plan.sequence}::bigint) RETURNING 1) SELECT count(*)::text FROM closed`.execute(
                        this.db.kysely,
                    );
                    if (deleted.rows[0]?.count !== p.plan.scope.eligible)
                        throw new ExposureClosureError('STALE_PLAN');
                    await sql`INSERT INTO xera_quota_recovery_exposure_closures(request_id,generation,node_uuid,actor_uuid,witness_request,acknowledgement_request,bank_request,request_digest,plan_digest,plan_text)
                VALUES(${input.requestId}::uuid,${input.generation}::uuid,${node}::uuid,${actor}::uuid,${p.plan.witnessRequest}::uuid,${p.plan.acknowledgementRequest}::uuid,
                    ${input.bankRequest}::uuid,${requestDigest},${p.digest},${p.text})`.execute(
                        this.db.kysely,
                    );
                    return this.view((await this.decision(input.requestId))!);
                },
            );
        } catch (error) {
            const committed = await this.decision(input.requestId);
            if (committed) return this.replay(committed, requestDigest);
            throw error;
        }
    }
    async details(node: string, generation: string, request: string) {
        bankUuid.parse(node);
        bankUuid.parse(generation);
        bankUuid.parse(request);
        const row = await this.decision(request);
        if (!row || row.node !== node || row.generation !== generation)
            throw new ExposureClosureError('NODE_MISSING');
        return this.view(row);
    }
    async list(node: string, generation: string, after?: string) {
        bankUuid.parse(node);
        bankUuid.parse(generation);
        let cursor: Decision | undefined;
        if (after) {
            bankUuid.parse(after);
            cursor = await this.decision(after);
            if (!cursor || cursor.node !== node || cursor.generation !== generation)
                throw new ExposureClosureError('SOURCE_CHANGED');
        }
        const rows = (
            await sql<Decision>`SELECT request_id::text AS "requestId",node_uuid::text AS node,generation::text,actor_uuid::text AS actor,
            request_digest AS "requestDigest",plan_digest AS "planDigest",plan_text AS "planText",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
            FROM xera_quota_recovery_exposure_closures WHERE node_uuid=${node}::uuid AND generation=${generation}::uuid
            ${cursor ? sql`AND (created_at,request_id)<(${cursor.createdAt}::timestamptz,${cursor.requestId}::uuid)` : sql``}
            ORDER BY created_at DESC,request_id DESC LIMIT 21`.execute(this.db.kysely)
        ).rows;
        return {
            entries: rows.slice(0, 20).map((row) => this.view(row)),
            nextAfter: rows.length > 20 ? rows[19].requestId : null,
        };
    }
}
