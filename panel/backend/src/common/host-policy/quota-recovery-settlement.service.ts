import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

import { QuotaBankRecoveryService } from './quota-bank-recovery.service';
import {
    createSettlementPlan,
    RecoverySettlementError,
    SettlementApproval,
    SettlementDraft,
    SettlementGrant,
    settlementDigest,
} from './quota-recovery-settlement-plan';
import { decodeRecoverySnapshot } from './quota-recovery-snapshot';

type Decision = {
    requestId: string;
    generation: string;
    actorUuid: string;
    requestDigest: string;
    planDigest: string;
    planText: string;
    createdAt: Date;
};
@Injectable()
export class QuotaRecoverySettlementService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly banks: QuotaBankRecoveryService,
    ) {}
    private standalone() {
        if (this.transactions.isTransactionActive())
            throw Error('Recovery settlement requires standalone transactions');
    }
    private async pending(generation: string, lock = false) {
        const rows =
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL ${lock ? sql`FOR UPDATE` : sql``}`.execute(
                this.db.kysely,
            );
        if (!rows.rows.length) throw new RecoverySettlementError('NOT_PENDING');
    }
    private async source(node: string, request: string) {
        const result = await sql<{
            generation: string;
            digest: string;
            bytes: number;
            compressed: Uint8Array;
            compressedDigest: string;
        }>`SELECT e.generation,e.journal_digest AS digest,a.raw_bytes AS bytes,a.compressed,a.compressed_sha256 AS "compressedDigest"
            FROM xera_quota_recovery_evidence e JOIN xera_quota_recovery_artifacts a ON a.digest=e.journal_digest AND a.kind='NODE_JOURNAL'
            WHERE e.node_uuid=${node}::uuid AND e.request_id=${request}::uuid`.execute(
            this.db.kysely,
        );
        const row = result.rows[0];
        if (!row) throw new RecoverySettlementError('SOURCE_MISSING');
        try {
            const data = Buffer.from(row.compressed);
            if (createHash('sha256').update(data).digest('hex') !== row.compressedDigest)
                throw Error('Corrupt artifact');
            return await decodeRecoverySnapshot(
                {
                    version: 'remnacust-quota-snapshots-v1',
                    encoding: 'gzip-base64',
                    bytes: row.bytes,
                    sha256: row.digest,
                    data: data.toString('base64'),
                },
                { generation: row.generation, requestId: request },
            );
        } catch {
            throw new RecoverySettlementError('SOURCE_INVALID');
        }
    }
    private async grants(ids: string[], lock = false) {
        if (lock) {
            const scopes = await sql<{
                kind: string;
                key: string;
            }>`SELECT DISTINCT kind,key FROM xera_quota_reserves
                WHERE id=ANY(${ids}::uuid[]) ORDER BY kind,key`.execute(this.db.kysely);
            for (const scope of scopes.rows)
                await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${scope.kind + ':' + scope.key},20261015))`.execute(
                    this.db.kysely,
                );
        }
        const result =
            await sql<SettlementGrant>`SELECT g.id,g.node_uuid AS node,g.instance_uuid AS instance,g.kind,g.key,g.user_id::text AS owner,g.ceiling_bytes::text AS ceiling,
            p.expires_at::text AS "expiresAt",floor(extract(epoch FROM p.expires_at)*1000)::text AS "expiresMs",g.closed_usage_bytes::text AS "closedUsage",g.closed_revision::text AS "closedRevision",
            b.subject_uuid AS subject,c.subject_uuid AS "currentSubject",b.source AS origin,r.revision::text AS revision
            FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
            JOIN users u ON u.id=g.user_id LEFT JOIN xera_quota_grant_subjects b ON b.grant_id=g.id LEFT JOIN xera_quota_current_subjects c ON c.user_id=u.id
            LEFT JOIN xera_node_policy_revisions r ON r.node_uuid=g.node_uuid
            WHERE g.id=ANY(${ids}::uuid[]) ORDER BY g.id ${lock ? sql`FOR UPDATE OF g,p FOR KEY SHARE OF u` : sql``}`.execute(
                this.db.kysely,
            );
        return result.rows;
    }
    private async prepare(node: string, input: SettlementDraft, lock = false) {
        const source = await this.source(node, input.sourceRequest),
            grants = await this.grants(input.ids, lock);
        const bank = await this.banks.compareInTransaction(input.bankRequest, input.generation);
        if (!bank.matches) throw new RecoverySettlementError('STALE_PLAN');
        return createSettlementPlan(node, source, bank.originalDigest, input, grants);
    }
    async preview(node: string, input: SettlementDraft) {
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
    private async decision(id: string) {
        return (
            await sql<Decision>`SELECT request_id AS "requestId",generation,actor_uuid AS "actorUuid",request_digest AS "requestDigest",plan_digest AS "planDigest",plan_text AS "planText",created_at AS "createdAt"
        FROM xera_quota_recovery_settlements WHERE request_id=${id}::uuid`.execute(this.db.kysely)
        ).rows[0];
    }
    private view(row: Decision) {
        if (settlementDigest(row.planText) !== row.planDigest)
            throw new RecoverySettlementError('SOURCE_INVALID');
        return {
            requestId: row.requestId,
            generation: row.generation,
            actorUuid: row.actorUuid,
            planDigest: row.planDigest,
            plan: JSON.parse(row.planText) as ReturnType<typeof createSettlementPlan>['plan'],
            createdAt: row.createdAt,
        };
    }
    async resolve(node: string, input: SettlementApproval, actor: string) {
        this.standalone();
        const normalized = { ...input, ids: [...input.ids].sort() },
            digest = settlementDigest(JSON.stringify({ node, actor, ...normalized }));
        const prior = await this.decision(input.requestId);
        if (prior) {
            if (prior.requestDigest !== digest)
                throw new RecoverySettlementError('REQUEST_CONFLICT');
            return this.view(prior);
        }
        try {
            return await this.transactions.withTransaction(
                { isolationLevel: 'RepeatableRead', timeout: 60000 },
                async () => {
                    await this.pending(input.generation, true);
                    const result = await this.prepare(node, normalized, true);
                    if (result.digest !== input.planDigest)
                        throw new RecoverySettlementError('STALE_PLAN');
                    for (const row of result.plan.changes) {
                        if (row.alreadySettled) continue;
                        const returned = await sql<{
                            returned: string;
                        }>`SELECT xera_settle_quota_reserve(${row.grant.id}::uuid,${node}::uuid,${result.plan.source.instance}::uuid,
                ${row.entry.group},${row.grant.owner}::bigint,${row.entry.ceiling}::bigint,${row.grant.expiresAt}::timestamptz,${row.entry.reserved}::bigint,${result.plan.source.policyRevision}::bigint)::text AS returned`.execute(
                            this.db.kysely,
                        );
                        if (returned.rows[0]?.returned !== row.returned)
                            throw new RecoverySettlementError('BINDING_CHANGED');
                    }
                    await sql`INSERT INTO xera_quota_recovery_settlements(request_id,generation,actor_uuid,bank_request,source_request,node_uuid,request_digest,plan_digest,plan_text)
                VALUES(${input.requestId}::uuid,${input.generation}::uuid,${actor}::uuid,${input.bankRequest}::uuid,${input.sourceRequest}::uuid,${node}::uuid,${digest},${result.digest},${result.text})`.execute(
                        this.db.kysely,
                    );
                    return this.view((await this.decision(input.requestId))!);
                },
            );
        } catch (error) {
            const committed = await this.decision(input.requestId);
            if (committed) {
                if (committed.requestDigest !== digest)
                    throw new RecoverySettlementError('REQUEST_CONFLICT');
                return this.view(committed);
            }
            throw error;
        }
    }
}
