import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

import {
    createLegacyRecoveryPlan,
    LegacyRecoveryApproval,
    LegacyRecoveryDraft,
    legacyRecoveryDigest,
    LegacyRecoveryError,
    LegacyRecoverySource,
    LegacyRecoveryTarget,
    normalizeLegacyDraft,
    validateLegacySource,
} from './legacy-recovery-plan';

type Decision = {
    requestId: string;
    generation: string;
    actorUuid: string;
    receipt: string;
    requestDigest: string;
    planDigest: string;
    planText: string;
    createdAt: Date;
};

@Injectable()
export class LegacyQuotaRecoveryService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
    ) {}

    private standalone() {
        if (this.transactions.isTransactionActive())
            throw new Error('Legacy recovery requires a standalone commit');
    }
    private async pending(generation: string, lock = false) {
        const result =
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL ${lock ? sql`FOR UPDATE` : sql``}`.execute(
                this.db.kysely,
            );
        if (!result.rows.length) throw new LegacyRecoveryError('NOT_PENDING');
    }
    private async source(receipt: string, lock = false) {
        const rows =
            await sql<LegacyRecoverySource>`SELECT digest,payload,applied,pending_users AS "pendingUsers",committed_at::text AS "committedAt"
            FROM xera_legacy_usage_jobs WHERE receipt=${receipt} ${lock ? sql`FOR UPDATE` : sql``}`.execute(
                this.db.kysely,
            );
        if (!rows.rows[0]) throw new LegacyRecoveryError('SOURCE_MISSING');
        return validateLegacySource(rows.rows[0]);
    }
    private async targets(subjects: string[], lock = false) {
        if (!subjects.length) return [];
        const rows =
            await sql<LegacyRecoveryTarget>`SELECT c.subject_uuid::text AS subject,u.id::text AS "userId",u.username,
            t.used_traffic_bytes::text AS used,t.lifetime_used_traffic_bytes::text AS lifetime,
            xera_current_quota_epoch('USER','global',u.id,'1970-01-01')::text AS epoch,
            u.last_traffic_reset_at::text AS "resetAt",u.traffic_limit_bytes::text AS "limit",u.traffic_limit_strategy AS strategy
            FROM xera_quota_current_subjects c JOIN users u ON u.id=c.user_id JOIN user_traffic t ON t.id=u.id
            WHERE c.subject_uuid=ANY(${subjects}::uuid[]) ORDER BY u.id ${lock ? sql`FOR UPDATE OF u,t` : sql``}`.execute(
                this.db.kysely,
            );
        return rows.rows;
    }
    private async decision(request: string, receipt?: string) {
        const result =
            await sql<Decision>`SELECT request_id AS "requestId",generation,actor_uuid AS "actorUuid",receipt,
            request_digest AS "requestDigest",plan_digest AS "planDigest",plan_text AS "planText",created_at AS "createdAt"
            FROM xera_legacy_quota_recovery_decisions WHERE ${receipt ? sql`receipt=${receipt}` : sql`request_id=${request}::uuid`}`.execute(
                this.db.kysely,
            );
        return result.rows[0];
    }
    private view(row: Decision) {
        if (legacyRecoveryDigest(row.planText) !== row.planDigest)
            throw new LegacyRecoveryError('DECISION_CORRUPT');
        return {
            requestId: row.requestId,
            generation: row.generation,
            actorUuid: row.actorUuid,
            receipt: row.receipt,
            createdAt: row.createdAt,
            planDigest: row.planDigest,
            plan: JSON.parse(row.planText) as ReturnType<typeof createLegacyRecoveryPlan>['plan'],
        };
    }
    async list(after?: string) {
        const rows = await sql<{
            receipt: string;
            applied: boolean;
            owners: number;
            committedAt: Date;
            requestId: string | null;
        }>`
            SELECT receipt,COALESCE(j.applied,true) AS applied,jsonb_array_length(COALESCE(j.payload,d.plan_text::jsonb->'source'->'payload')) AS owners,
                COALESCE(j.committed_at,d.created_at) AS "committedAt",d.request_id AS "requestId"
            FROM xera_legacy_usage_jobs j FULL JOIN xera_legacy_quota_recovery_decisions d USING(receipt)
            WHERE (NOT j.applied OR j.pending_users IS NOT NULL OR d.request_id IS NOT NULL) ${after ? sql`AND receipt>${after}` : sql``}
            ORDER BY receipt LIMIT 21`.execute(this.db.kysely);
        const entries = rows.rows.slice(0, 20);
        return { entries, nextAfter: rows.rows.length > 20 ? entries[19].receipt : null };
    }
    async details(receipt: string) {
        const decision = await this.decision('', receipt);
        if (decision) return { decision: this.view(decision), source: null, candidates: [] };
        const source = await this.source(receipt);
        const ids = source.payload.map((r) => r.u);
        const candidates = ids.length
            ? await sql<{
                  owner: string;
                  subject: string;
                  username: string;
              }>`SELECT u.id::text AS owner,c.subject_uuid::text AS subject,u.username
            FROM xera_quota_current_subjects c JOIN users u ON u.id=c.user_id WHERE u.id=ANY(${ids}::bigint[]) ORDER BY u.id`.execute(
                  this.db.kysely,
              )
            : { rows: [] };
        return { decision: null, source, candidates: candidates.rows };
    }

    async searchTargets(search: string) {
        const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
        const rows = await sql<{
            subject: string;
            userId: string;
            username: string;
        }>`SELECT c.subject_uuid::text AS subject,u.id::text AS "userId",u.username
            FROM xera_quota_current_subjects c JOIN users u ON u.id=c.user_id JOIN user_traffic t ON t.id=u.id
            WHERE u.username ILIKE ${pattern} ESCAPE E'\\\\' OR u.id::text=${search} ORDER BY (u.id::text=${search}) DESC,u.username,u.id LIMIT 20`.execute(
            this.db.kysely,
        );
        return { entries: rows.rows };
    }
    async preview(receipt: string, draft: LegacyRecoveryDraft) {
        this.standalone();
        return this.transactions.withTransaction(
            { timeout: 15000, isolationLevel: 'RepeatableRead' },
            async () => {
                await this.pending(draft.generation);
                if (await this.decision('', receipt))
                    throw new LegacyRecoveryError('ALREADY_RESOLVED');
                const source = await this.source(receipt);
                const subjects = [
                    ...new Set(
                        draft.allocations.flatMap((r) =>
                            r.action === 'CHARGE' ? [r.subject] : [],
                        ),
                    ),
                ];
                const result = createLegacyRecoveryPlan(
                    receipt,
                    source,
                    draft,
                    await this.targets(subjects),
                );
                return { plan: result.plan, planDigest: result.digest };
            },
        );
    }
    async resolve(receipt: string, approval: LegacyRecoveryApproval, actor: string) {
        this.standalone();
        const draft = normalizeLegacyDraft(approval);
        const requestDigest = legacyRecoveryDigest(
            JSON.stringify({
                receipt,
                ...draft,
                requestId: approval.requestId,
                planDigest: approval.planDigest,
            }),
        );
        return this.transactions.withTransaction(
            { timeout: 30000, isolationLevel: 'ReadCommitted' },
            async () => {
                // Serialize this idempotency key before taking the restore/job locks.
                await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${approval.requestId},20261018))`.execute(
                    this.db.kysely,
                );
                const prior = await this.decision(approval.requestId);
                if (prior) {
                    if (prior.requestDigest !== requestDigest)
                        throw new LegacyRecoveryError('REQUEST_CONFLICT');
                    return this.view(prior);
                }
                await this.pending(draft.generation, true);
                if (await this.decision('', receipt))
                    throw new LegacyRecoveryError('ALREADY_RESOLVED');
                const source = await this.source(receipt, true);
                const subjects = [
                    ...new Set(
                        draft.allocations.flatMap((r) =>
                            r.action === 'CHARGE' ? [r.subject] : [],
                        ),
                    ),
                ];
                const result = createLegacyRecoveryPlan(
                    receipt,
                    source,
                    draft,
                    await this.targets(subjects, true),
                );
                if (result.digest !== approval.planDigest)
                    throw new LegacyRecoveryError('STALE_PLAN');
                // Historical import changes accounting only. It does not fabricate
                // online/first-connected timestamps or replay notifications.
                for (let offset = 0; offset < result.plan.charges.length; offset += 500) {
                    const batch = result.plan.charges.slice(offset, offset + 500);
                    const values = batch.map(
                        (c) =>
                            sql`(${c.userId}::bigint,${c.before.used}::bigint,${c.before.lifetime}::bigint,${c.after.used}::bigint,${c.after.lifetime}::bigint)`,
                    );
                    const updated =
                        await sql`WITH charges(id,old_used,old_lifetime,new_used,new_lifetime) AS (VALUES ${sql.join(values)})
                    UPDATE user_traffic t SET used_traffic_bytes=c.new_used,lifetime_used_traffic_bytes=c.new_lifetime FROM charges c
                    WHERE t.id=c.id AND t.used_traffic_bytes=c.old_used AND t.lifetime_used_traffic_bytes=c.old_lifetime RETURNING t.id`.execute(
                            this.db.kysely,
                        );
                    if (updated.rows.length !== batch.length)
                        throw new LegacyRecoveryError('TARGET_CHANGED');
                }
                await sql`UPDATE xera_legacy_usage_jobs SET applied=true,pending_users=NULL WHERE receipt=${receipt}`.execute(
                    this.db.kysely,
                );
                await sql`INSERT INTO xera_legacy_quota_recovery_decisions(request_id,generation,actor_uuid,receipt,source_digest,request_digest,plan_digest,plan_text)
                VALUES(${approval.requestId}::uuid,${draft.generation}::uuid,${actor}::uuid,${receipt},${source.digest},${requestDigest},${result.digest},${result.text})`.execute(
                    this.db.kysely,
                );
                return this.view((await this.decision(approval.requestId))!);
            },
        );
    }
}
