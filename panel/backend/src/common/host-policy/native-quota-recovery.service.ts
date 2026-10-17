import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

import { LegacyRecoveryTarget, legacyRecoveryDigest } from './legacy-recovery-plan';
import {
    NativeRecoveryApproval,
    NativeRecoveryDraft,
    NativeRecoveryError,
    NativeRecoveryTicket,
    nativeRecoveryPlan,
    nativeRecoverySource,
} from './native-recovery-plan';
import { QuotaBankRecoveryService } from './quota-bank-recovery.service';
import { USAGE_JOURNAL_MAX_BYTES } from './usage-archive';
import { usageReceiptRequest } from './usage-receipt';

const expand = promisify(gunzip);
type Decision = {
    requestId: string;
    requestDigest: string;
    planDigest: string;
    planText: string;
    actor: string;
    createdAt: Date;
};
@Injectable()
export class NativeQuotaRecoveryService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly banks: QuotaBankRecoveryService,
    ) {}

    private standalone() {
        if (this.transactions.isTransactionActive())
            throw Error('Native recovery requires standalone transactions');
    }
    private async pending(generation: string, lock = false) {
        const result =
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL ${lock ? sql`FOR UPDATE` : sql``}`.execute(
                this.db.kysely,
            );
        if (!result.rows.length) throw new NativeRecoveryError('NOT_PENDING');
    }
    private async source(node: string, request: string, lock: boolean) {
        const artifact = (
            await sql<{
                compressed: Uint8Array;
                compressedDigest: string;
                digest: string;
                bytes: number;
            }>`SELECT a.compressed,a.compressed_sha256 AS "compressedDigest",a.digest,a.raw_bytes AS bytes
            FROM xera_quota_receipt_captures c JOIN xera_quota_recovery_artifacts a ON a.digest=c.source_digest AND a.kind='USAGE_JOURNAL'
            WHERE c.node_uuid=${node}::uuid AND c.request_id=${request}::uuid AND c.state='PRESENT'`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!artifact) throw new NativeRecoveryError('SOURCE_MISSING');
        let original: Buffer;
        try {
            const data = Buffer.from(artifact.compressed);
            if (createHash('sha256').update(data).digest('hex') !== artifact.compressedDigest)
                throw Error('Compressed checksum');
            original = await expand(data, { maxOutputLength: USAGE_JOURNAL_MAX_BYTES });
            if (
                original.length !== artifact.bytes ||
                createHash('sha256').update(original).digest('hex') !== artifact.digest
            )
                throw Error('Source checksum');
        } catch {
            throw new NativeRecoveryError('SOURCE_INVALID');
        }
        const ticket = (
            await sql<NativeRecoveryTicket>`SELECT stream_id AS stream,next_sequence::text AS sequence,expected_core AS core,
            requested_at::text AS "requestedAt",consumption_multiplier::text AS multiplier,committed_digest AS digest,pending_effects AS effects
            FROM xera_node_usage_streams WHERE node_uuid=${node}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!ticket) throw new NativeRecoveryError('TICKET_CHANGED');
        try {
            const source = nativeRecoverySource(node, original, ticket);
            const fork =
                await sql`SELECT 1 FROM xera_quota_receipt_captures c WHERE c.node_uuid=${node}::uuid AND c.state='PRESENT'
                AND c.metadata->>'stream'=${source.stream} AND c.metadata->'pending'->>'sequence'=${source.frame.sequence}
                AND c.metadata->'pending'->>'coreProcessId'=${source.frame.coreProcessId}
                AND c.metadata->'pending'->>'digest'<>${source.digest} LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (fork.rows.length) throw new NativeRecoveryError('SOURCE_INVALID');
            return source;
        } catch (error) {
            if (error instanceof NativeRecoveryError) throw error;
            throw new NativeRecoveryError('SOURCE_INVALID');
        }
    }
    // The caller persists a delivery intent in this same transaction before
    // any Node RPC. An archived plan alone is insufficient without its current
    // committed stream binding and independently verified original journal.
    async recoveryAcknowledgementSource(node: string, decisionRequest: string, generation: string) {
        if (!this.transactions.isTransactionActive())
            throw new Error('Recovery ACK source requires an active transaction');
        await this.pending(generation, true);
        const decision = (
            await sql<{
                generation: string;
                node: string;
                sourceRequest: string;
                sourceDigest: string;
                planDigest: string;
                planText: string;
            }>`SELECT d.generation::text,d.node_uuid::text AS node,d.source_request::text AS "sourceRequest",c.source_digest AS "sourceDigest",d.plan_digest AS "planDigest",d.plan_text AS "planText"
            FROM xera_native_quota_recovery_decisions d JOIN xera_quota_receipt_captures c ON c.request_id=d.source_request AND c.node_uuid=d.node_uuid AND c.state='PRESENT'
            WHERE d.request_id=${decisionRequest}::uuid AND d.node_uuid=${node}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!decision) throw new NativeRecoveryError('SOURCE_MISSING');
        if (decision.generation !== generation) throw new NativeRecoveryError('NOT_PENDING');
        if (legacyRecoveryDigest(decision.planText) !== decision.planDigest)
            throw new NativeRecoveryError('SOURCE_INVALID');
        const source = await this.source(node, decision.sourceRequest, true);
        if (!source.alreadyCommitted || source.ticket.effects != null)
            throw new NativeRecoveryError('TICKET_CHANGED');
        try {
            const plan = JSON.parse(decision.planText) as ReturnType<
                typeof nativeRecoveryPlan
            >['plan'];
            if (
                plan.version !== 'remnacust-native-recovery-v1' ||
                plan.node !== node ||
                plan.generation !== generation ||
                plan.sourceRequest !== decision.sourceRequest ||
                plan.source.stream !== source.stream ||
                plan.source.digest !== source.digest ||
                plan.source.frame.sequence !== source.frame.sequence ||
                plan.source.frame.coreProcessId !== source.frame.coreProcessId
            )
                throw new Error('Original plan binding differs');
        } catch {
            throw new NativeRecoveryError('SOURCE_INVALID');
        }
        return {
            decisionRequest,
            sourceRequest: decision.sourceRequest,
            decisionDigest: decision.planDigest,
            sourceDigest: decision.sourceDigest,
            receipt: usageReceiptRequest.options[1].parse({
                action: 'ack',
                stream: source.stream,
                sequence: source.frame.sequence,
                coreProcessId: source.frame.coreProcessId,
                digest: source.digest,
            }),
        };
    }

    private async targets(input: NativeRecoveryDraft, lock: boolean) {
        const subjects = [
            ...new Set(
                input.allocations.flatMap((row) => (row.action === 'CHARGE' ? [row.subject] : [])),
            ),
        ];
        if (!subjects.length) return [];
        return (
            await sql<LegacyRecoveryTarget>`SELECT c.subject_uuid::text AS subject,u.id::text AS "userId",u.username,
            t.used_traffic_bytes::text AS used,t.lifetime_used_traffic_bytes::text AS lifetime,
            xera_current_quota_epoch('USER','global',u.id,'1970-01-01')::text AS epoch,
            u.last_traffic_reset_at::text AS "resetAt",u.traffic_limit_bytes::text AS "limit",u.traffic_limit_strategy AS strategy
            FROM xera_quota_current_subjects c JOIN users u ON u.id=c.user_id JOIN user_traffic t ON t.id=u.id
            WHERE c.subject_uuid=ANY(${subjects}::uuid[]) ORDER BY u.id ${lock ? sql`FOR UPDATE OF u,t` : sql``}`.execute(
                this.db.kysely,
            )
        ).rows;
    }
    private async accountProof(
        source: ReturnType<typeof nativeRecoverySource>,
        input: NativeRecoveryDraft,
        lock: boolean,
    ) {
        const ids = input.accounts
            .filter((row) => row.action === 'APPLY')
            .map((row) => row.account)
            .sort();
        if (source.alreadyCommitted && ids.length)
            throw new NativeRecoveryError('INVALID_ALLOCATION');
        if (!ids.length) return [];
        if (lock) {
            const scopes = await sql<{
                kind: string;
                key: string;
            }>`SELECT DISTINCT kind,key FROM xera_quota_reserve_pools WHERE usage_account=ANY(${ids}::uuid[]) ORDER BY kind,key`.execute(
                this.db.kysely,
            );
            for (const scope of scopes.rows)
                await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${scope.kind + ':' + scope.key},20261015))`.execute(
                    this.db.kysely,
                );
        }
        const rows = (
            await sql<{
                account: string;
                owner: string;
                subject: string | null;
                current: string | null;
                origin: string;
                kind: string;
                body: string;
                baseline: string;
                nano: string;
            }>`SELECT p.usage_account AS account,p.user_id::text AS owner,b.subject_uuid AS subject,c.subject_uuid AS current,b.source AS origin,p.kind,to_jsonb(p)::text AS body,
                p.baseline_bytes::text AS baseline,p.unreserved_nano::text AS nano
            FROM xera_quota_reserve_pools p JOIN xera_quota_pool_subjects b USING(usage_account) LEFT JOIN xera_quota_current_subjects c ON c.user_id=p.user_id
            WHERE p.usage_account=ANY(${ids}::uuid[]) ORDER BY p.usage_account ${lock ? sql`FOR UPDATE OF p` : sql``}`.execute(
                this.db.kysely,
            )
        ).rows;
        if (
            rows.length !== ids.length ||
            rows.some(
                (row) => row.origin !== 'ISSUED' || !row.subject || row.subject !== row.current,
            )
        )
            throw new NativeRecoveryError('ACCOUNT_UNPROVEN');
        const byId = new Map(rows.map((row) => [row.account, row]));
        const selected = new Set(ids),
            entries = source.outside.filter((row) => selected.has(row.account));
        for (const entry of entries) {
            const pool = byId.get(entry.account)!;
            if (
                entry.owner !== pool.owner ||
                entry.scale !== (pool.kind === 'USER' ? '1000000000' : '100')
            )
                throw new NativeRecoveryError('ACCOUNT_UNPROVEN');
        }
        const missing =
            await sql`SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS e(account UUID,factor BIGINT,scale BIGINT)
            WHERE NOT EXISTS(SELECT 1 FROM xera_quota_usage_deliveries d WHERE d.usage_account=e.account AND d.node_uuid=${source.node}::uuid
                AND d.instance_uuid=${source.stream}::uuid AND d.factor=e.factor AND d.scale=e.scale) LIMIT 1`.execute(
                this.db.kysely,
            );
        if (missing.rows.length) throw new NativeRecoveryError('ACCOUNT_UNPROVEN');
        return rows;
    }
    private async prepare(node: string, input: NativeRecoveryDraft, lock = false) {
        const source = await this.source(node, input.sourceRequest, lock);
        if (lock)
            await sql`SELECT 1 FROM xera_quota_node_modes WHERE node_uuid=${node}::uuid FOR UPDATE`.execute(
                this.db.kysely,
            );
        const proof = await this.accountProof(source, input, lock);
        const targets = await this.targets(input, lock);
        const bank = await this.banks.compareInTransaction(input.bankRequest, input.generation);
        if (!bank.matches) throw new NativeRecoveryError('STALE_PLAN');
        return nativeRecoveryPlan(node, source, input, targets, bank.originalDigest, proof);
    }
    async preview(node: string, input: NativeRecoveryDraft) {
        this.standalone();
        return this.transactions.withTransaction(
            { isolationLevel: 'RepeatableRead', timeout: 60000 },
            async () => {
                await this.pending(input.generation);
                const result = await this.prepare(node, input);
                return { plan: result.plan, planDigest: result.digest };
            },
        );
    }
    async details(node: string, request: string, generation: string) {
        this.standalone();
        return this.transactions.withTransaction(
            { isolationLevel: 'RepeatableRead', timeout: 60000 },
            async () => {
                await this.pending(generation);
                const imported = (
                    await sql<{
                        request: string;
                    }>`SELECT request_id AS request FROM xera_native_quota_recovery_decisions
                    WHERE node_uuid=${node}::uuid AND source_request=${request}::uuid`.execute(
                        this.db.kysely,
                    )
                ).rows[0];
                if (imported) {
                    const decision = this.view((await this.decision(imported.request))!);
                    const source = decision.plan.source;
                    return {
                        sourceRequest: request,
                        generation,
                        node,
                        stream: source.stream,
                        sequence: source.frame.sequence,
                        core: source.frame.coreProcessId,
                        multiplier: source.ticket.multiplier,
                        requestedAt: source.ticket.requestedAt,
                        alreadyCommitted: true,
                        owners: [],
                        accounts: [],
                        decision,
                    };
                }
                const source = await this.source(node, request, false);
                const proof = source.outside.length
                    ? (
                          await sql<{
                              account: string;
                              eligible: boolean;
                              label: string | null;
                              kind: string | null;
                              key: string | null;
                          }>`
                        SELECT i.account,bool_and(COALESCE(p.usage_account IS NOT NULL AND b.source='ISSUED'
                            AND b.subject_uuid=c.subject_uuid AND p.user_id=i.owner
                            AND i.scale=CASE WHEN p.kind='USER' THEN 1000000000 ELSE 100 END
                            AND d.usage_account IS NOT NULL,false)) AS eligible,max(p.kind) AS kind,max(p.key) AS key,
                            max(CASE WHEN p.kind='HOST' THEN h.remark WHEN p.kind='TAG' THEN p.key ELSE NULL END) AS label
                        FROM jsonb_to_recordset(${JSON.stringify(source.outside)}::jsonb) AS i(account UUID,owner BIGINT,factor BIGINT,scale BIGINT)
                        LEFT JOIN xera_quota_reserve_pools p ON p.usage_account=i.account
                        LEFT JOIN xera_quota_pool_subjects b ON b.usage_account=p.usage_account
                        LEFT JOIN hosts h ON p.kind='HOST' AND h.uuid::text=p.key
                        LEFT JOIN xera_quota_current_subjects c ON c.user_id=p.user_id
                        LEFT JOIN xera_quota_usage_deliveries d ON d.usage_account=i.account AND d.node_uuid=${node}::uuid
                            AND d.instance_uuid=${source.stream}::uuid AND d.factor=i.factor AND d.scale=i.scale
                        GROUP BY i.account ORDER BY i.account`.execute(this.db.kysely)
                      ).rows
                    : [];
                const accounts = new Map<
                    string,
                    {
                        account: string;
                        eligible: boolean;
                        label: string | null;
                        kind: string | null;
                        key: string | null;
                        prices: { owner: string; factor: string; scale: string; bytes: string }[];
                    }
                >();
                for (const row of proof) accounts.set(row.account, { ...row, prices: [] });
                const prices = new Map<
                    string,
                    { owner: string; factor: string; scale: string; bytes: string }
                >();
                for (const row of source.outside) {
                    const account = accounts.get(row.account)!;
                    const key = [row.account, row.owner, row.factor, row.scale].join(':');
                    const price = prices.get(key);
                    if (price) price.bytes = (BigInt(price.bytes) + BigInt(row.bytes)).toString();
                    else {
                        const value = {
                            owner: row.owner,
                            factor: row.factor,
                            scale: row.scale,
                            bytes: row.bytes,
                        };
                        prices.set(key, value);
                        account.prices.push(value);
                    }
                }
                return {
                    sourceRequest: request,
                    generation,
                    node,
                    stream: source.stream,
                    sequence: source.frame.sequence,
                    core: source.frame.coreProcessId,
                    multiplier: source.ticket.multiplier,
                    requestedAt: source.ticket.requestedAt,
                    alreadyCommitted: source.alreadyCommitted,
                    owners: source.payload,
                    accounts: [...accounts.values()],
                    candidates:
                        source.alreadyCommitted || !source.payload.length
                            ? []
                            : (
                                  await sql<{ owner: string; subject: string; username: string }>`
                        SELECT u.id::text AS owner,c.subject_uuid AS subject,u.username FROM users u
                        JOIN xera_quota_current_subjects c ON c.user_id=u.id JOIN user_traffic t ON t.id=u.id
                        WHERE u.id=ANY(${source.payload.map((row) => row.u)}::bigint[]) ORDER BY u.id`.execute(
                                      this.db.kysely,
                                  )
                              ).rows,
                    decision: null,
                };
            },
        );
    }
    private async decision(request: string) {
        return (
            await sql<Decision>`SELECT request_id AS "requestId",request_digest AS "requestDigest",plan_digest AS "planDigest",plan_text AS "planText",actor_uuid AS actor,created_at AS "createdAt"
            FROM xera_native_quota_recovery_decisions WHERE request_id=${request}::uuid`.execute(
                this.db.kysely,
            )
        ).rows[0];
    }
    private view(row: Decision) {
        if (legacyRecoveryDigest(row.planText) !== row.planDigest)
            throw new NativeRecoveryError('SOURCE_INVALID');
        return {
            requestId: row.requestId,
            actor: row.actor,
            createdAt: row.createdAt,
            planDigest: row.planDigest,
            plan: JSON.parse(row.planText) as ReturnType<typeof nativeRecoveryPlan>['plan'],
        };
    }
    async resolve(node: string, input: NativeRecoveryApproval, actor: string) {
        this.standalone();
        const normalized = {
            ...input,
            allocations: [...input.allocations].sort((a, b) =>
                BigInt(a.owner) < BigInt(b.owner) ? -1 : 1,
            ),
            accounts: [...input.accounts].sort((a, b) => a.account.localeCompare(b.account)),
        };
        const digest = legacyRecoveryDigest(JSON.stringify({ node, actor, ...normalized }));
        const prior = await this.decision(input.requestId);
        if (prior) {
            if (prior.requestDigest !== digest) throw new NativeRecoveryError('REQUEST_CONFLICT');
            return this.view(prior);
        }
        try {
            return await this.transactions.withTransaction(
                { isolationLevel: 'RepeatableRead', timeout: 60000 },
                async () => {
                    await this.pending(input.generation, true);
                    const result = await this.prepare(node, normalized, true),
                        source = result.plan.source;
                    if (result.digest !== input.planDigest)
                        throw new NativeRecoveryError('STALE_PLAN');
                    const previous =
                        await sql`SELECT 1 FROM xera_native_quota_recovery_decisions WHERE node_uuid=${node}::uuid AND stream_id=${source.stream}::uuid AND sequence=${source.frame.sequence}::bigint`.execute(
                            this.db.kysely,
                        );
                    if (previous.rows.length) throw new NativeRecoveryError('ALREADY_RESOLVED');
                    for (const charge of result.plan.billing.charges) {
                        const updated =
                            await sql`UPDATE user_traffic SET used_traffic_bytes=${charge.after.used}::bigint,lifetime_used_traffic_bytes=${charge.after.lifetime}::bigint
                        WHERE id=${charge.userId}::bigint AND used_traffic_bytes=${charge.before.used}::bigint AND lifetime_used_traffic_bytes=${charge.before.lifetime}::bigint RETURNING id`.execute(
                                this.db.kysely,
                            );
                        if (updated.rows.length !== 1) throw new NativeRecoveryError('STALE_PLAN');
                    }
                    if (result.plan.applyOutside.length)
                        await sql`SELECT 1 FROM xera_account_unreserved_usage(${node}::uuid,${source.stream}::uuid,${JSON.stringify(result.plan.applyOutside)}::jsonb)`.execute(
                            this.db.kysely,
                        );
                    if (result.plan.accountChanges.length) {
                        const applied = (
                            await sql<{
                                account: string;
                                baseline: string;
                                nano: string;
                            }>`SELECT usage_account AS account,baseline_bytes::text AS baseline,unreserved_nano::text AS nano
                            FROM xera_quota_reserve_pools WHERE usage_account=ANY(${result.plan.accountChanges.map((row) => row.account)}::uuid[])`.execute(
                                this.db.kysely,
                            )
                        ).rows;
                        const balances = new Map(applied.map((row) => [row.account, row]));
                        if (
                            result.plan.accountChanges.some(
                                (row) =>
                                    balances.get(row.account)?.baseline !== row.after ||
                                    balances.get(row.account)?.nano !== row.afterNano,
                            )
                        )
                            throw new NativeRecoveryError('STALE_PLAN');
                    }
                    await sql`SELECT xera_cover_quota_usage_exposure(${node}::uuid,${source.frame.coreProcessId}::uuid,${source.stream}::uuid,
                        ${source.frame.sequence}::bigint,${source.ticket.requestedAt}::timestamptz)`.execute(
                        this.db.kysely,
                    );
                    if (!source.alreadyCommitted)
                        await sql`UPDATE xera_node_usage_streams SET last_core=expected_core,last_requested_at=requested_at,
                            last_captured_at=to_timestamp(${source.frame.capturedAt}::numeric/1000),last_committed_at=clock_timestamp(),last_committed_sequence=next_sequence
                            WHERE node_uuid=${node}::uuid`.execute(this.db.kysely);
                    await sql`UPDATE xera_node_usage_streams SET committed_digest=${source.digest},pending_effects=NULL,updated_at=now() WHERE node_uuid=${node}::uuid`.execute(
                        this.db.kysely,
                    );
                    await sql`INSERT INTO xera_native_quota_recovery_decisions(request_id,generation,actor_uuid,node_uuid,stream_id,sequence,source_request,bank_request,request_digest,plan_digest,plan_text)
                    VALUES(${input.requestId}::uuid,${input.generation}::uuid,${actor}::uuid,${node}::uuid,${source.stream}::uuid,${source.frame.sequence}::bigint,${input.sourceRequest}::uuid,${input.bankRequest}::uuid,${digest},${result.digest},${result.text})`.execute(
                        this.db.kysely,
                    );
                    return this.view((await this.decision(input.requestId))!);
                },
            );
        } catch (error) {
            const committed = await this.decision(input.requestId);
            if (committed) {
                if (committed.requestDigest !== digest)
                    throw new NativeRecoveryError('REQUEST_CONFLICT');
                return this.view(committed);
            }
            throw error;
        }
    }
}
