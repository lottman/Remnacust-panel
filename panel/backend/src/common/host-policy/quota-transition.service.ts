import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TxKyselyService } from '@common/database';

import { DurableUsageService } from './durable-usage.service';
import { HostPolicyService } from './host-policy.service';
import { QuotaPolicyProof } from './quota-policy-proof';
import { QuotaSettlementService } from './quota-settlement.service';
import { UsageEffectsService } from './usage-effects.service';

type Scope = { kind: 'USER' | 'HOST' | 'TAG'; key: string; owner: string };
type Transition = Scope & {
    id: string;
    generation: string;
    source: string;
    phase: string;
    finite: boolean;
    limit: string;
    window: string;
    epoch: string;
    nodes: string[];
};
type Participant = INodeConnectionOpts & {
    uuid: string;
    id: string | null;
    multiplier: string;
    required: boolean;
    initialCore: string | null;
    instance: string | null;
    preflightAt: Date | null;
    fencedCore: string | null;
    fencedAt: Date | null;
    drainedAt: Date | null;
    releaseReady: boolean;
    releasedAt: Date | null;
};
const canonicalUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

@Injectable()
export class QuotaTransitionService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly policies: HostPolicyService,
        private readonly usage: DurableUsageService,
        private readonly settlements: QuotaSettlementService,
        private readonly effects: UsageEffectsService,
        private readonly axios: AxiosService,
    ) {}

    private async lock(scope: Scope) {
        await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${scope.kind + ':' + scope.key},20261015))`.execute(
            this.db.kysely,
        );
    }

    private async read(scope: Scope) {
        return (
            await sql<Transition>`SELECT id,generation,source,phase,kind,key,user_id::text AS owner,finite,
            limit_bytes::text AS "limit",to_char(window_start,'YYYY-MM-DD') AS window,budget_epoch AS epoch,desired_nodes AS nodes
            FROM xera_quota_transitions WHERE kind=${scope.kind} AND key=${scope.key} AND user_id=${scope.owner}::bigint`.execute(
                this.db.kysely,
            )
        ).rows[0];
    }

    // The caller supplies eligibility, never a balance or an epoch. Financial
    // boundaries are read under the same scope lock as funding and RESET.
    async request(scope: Scope, recipients: string[]): Promise<string> {
        return this.prepare(scope, recipients, false);
    }

    async reconcile(scope: Scope, recipients: string[]): Promise<boolean> {
        await this.prepare(scope, recipients, true);
        return (await this.read(scope))?.phase === 'ACTIVE';
    }

    private async prepare(scope: Scope, recipients: string[], adopt: boolean): Promise<string> {
        if (this.transactions.isTransactionActive())
            throw new Error('Quota transition requires standalone transactions');
        if (
            !['USER', 'HOST', 'TAG'].includes(scope.kind) ||
            !scope.key ||
            scope.key.length > 200 ||
            (scope.kind === 'USER' && scope.key !== 'global') ||
            !/^[1-9][0-9]{0,18}$/.test(scope.owner) ||
            BigInt(scope.owner) > 9223372036854775807n ||
            recipients.length > 10000 ||
            recipients.some((node) => !canonicalUuid.test(node))
        )
            throw new Error('Invalid quota transition target');
        const nodes = [...new Set(recipients)].sort();
        return this.transactions.withTransaction({ timeout: 30000 }, async () => {
            await this.lock(scope);
            const meter = (
                await sql<{
                    limit: string;
                    window: string;
                    epoch: string;
                    reason: string;
                    unlimited: boolean;
                    poolLimit: string | null;
                    creditBarrier: boolean;
                }>`
                SELECT q.effective_limit::text AS "limit",to_char(q.window_start,'YYYY-MM-DD') AS window,
                  xera_current_quota_epoch(${scope.kind},${scope.key},${scope.owner}::bigint,q.window_start) AS epoch,
                  COALESCE(h.reason,'RESET') AS reason,COALESCE(a.unlimited,false) AS unlimited,
                  (SELECT max(p.limit_bytes)::text FROM xera_quota_reserve_pools p WHERE p.kind=${scope.kind} AND p.key=${scope.key}
                    AND p.user_id=${scope.owner}::bigint AND p.window_start=q.window_start
                    AND p.budget_epoch=xera_current_quota_epoch(${scope.kind},${scope.key},${scope.owner}::bigint,q.window_start)) AS "poolLimit",
                  (q.effective_limit>0 AND EXISTS(SELECT 1 FROM xera_quota_usage_exposures e
                    WHERE e.kind=${scope.kind} AND e.key=${scope.key} AND e.user_id=${scope.owner}::bigint)
                    AND NOT EXISTS(SELECT 1 FROM xera_quota_reserve_pools p WHERE p.kind=${scope.kind} AND p.key=${scope.key}
                      AND p.user_id=${scope.owner}::bigint AND p.window_start=q.window_start
                      AND p.budget_epoch=xera_current_quota_epoch(${scope.kind},${scope.key},${scope.owner}::bigint,q.window_start)
                      AND p.allocated_at IS NOT NULL AND p.baseline_bytes::numeric+COALESCE((SELECT sum(CASE WHEN g.closed_usage_bytes IS NULL THEN g.ceiling_bytes ELSE g.closed_usage_bytes END)
                        FROM xera_quota_reserves g WHERE (g.kind,g.key,g.user_id,g.window_start,g.budget_epoch)=(p.kind,p.key,p.user_id,p.window_start,p.budget_epoch)),0)>=q.effective_limit)) AS "creditBarrier"
                FROM xera_quota_budget_state(${scope.kind},${scope.key},${scope.owner}::bigint) q
                LEFT JOIN xera_quota_budget_heads h ON h.kind=${scope.kind} AND h.key=${scope.key} AND h.user_id=${scope.owner}::bigint AND h.window_start=q.window_start
                LEFT JOIN xera_limit_user_adjustments a ON a.kind=${scope.kind} AND a.key=${scope.key} AND a.user_id=${scope.owner}::bigint
            `.execute(this.db.kysely)
            ).rows[0];
            if (!meter) throw new Error('Quota transition scope is missing');
            const finite = BigInt(meter.limit) > 0n && !meter.unlimited;
            const source = createHash('sha256')
                .update(JSON.stringify([finite, meter.limit, meter.window, meter.epoch, nodes]))
                .digest('hex');
            const previous = await this.read(scope);
            const group = scope.kind.toLowerCase() + ':' + scope.key;
            if (previous?.source === source) {
                if (!adopt || previous.phase !== 'ACTIVE' || !finite) return previous.id;
                const drift = (
                    await sql<{ changed: boolean }>`SELECT EXISTS(
                    SELECT 1 FROM unnest(${nodes}::uuid[]) n(node_uuid) LEFT JOIN xera_quota_node_modes m USING(node_uuid)
                    LEFT JOIN xera_quota_reserves g ON g.node_uuid=n.node_uuid AND g.kind=${scope.kind} AND g.key=${scope.key}
                      AND g.user_id=${scope.owner}::bigint AND g.window_start=${meter.window}::date AND g.budget_epoch=${meter.epoch}::uuid
                      AND g.retired_at IS NULL AND g.closed_usage_bytes IS NULL
                    WHERE g.id IS NULL OR m.instance_uuid IS DISTINCT FROM g.instance_uuid
                      OR m.applied_policy->'scopes'->${group}->${scope.owner}->>0 IS DISTINCT FROM 'R'
                      OR m.applied_policy->'scopes'->${group}->${scope.owner}->>1 IS DISTINCT FROM g.id::text
                      OR (m.desired_policy->'scopes'->${group}->${scope.owner}->>0) IS DISTINCT FROM 'R'
                      OR (m.desired_policy->'scopes'->${group}->${scope.owner}->>1) IS DISTINCT FROM g.id::text
                ) OR EXISTS(SELECT 1 FROM xera_quota_usage_exposures e LEFT JOIN xera_quota_node_modes m ON m.node_uuid=e.node_uuid
                    WHERE e.kind=${scope.kind} AND e.key=${scope.key} AND e.user_id=${scope.owner}::bigint
                      AND (e.unbounded OR e.fenced_at IS NOT NULL OR e.core_uuid IS DISTINCT FROM m.applied_core OR e.instance_uuid IS DISTINCT FROM m.instance_uuid)) AS changed`.execute(
                        this.db.kysely,
                    )
                ).rows[0].changed;
                if (!drift && !meter.creditBarrier) return previous.id;
            }
            // An unchanged, already applied initial cutover needs no second
            // fleet fence. Adopt only exact live grant/owner/instance bindings.
            const increaseCandidate =
                adopt &&
                previous?.phase === 'ACTIVE' &&
                previous.finite &&
                finite &&
                previous.window === meter.window &&
                previous.epoch === meter.epoch &&
                JSON.stringify(previous.nodes) === JSON.stringify(nodes) &&
                BigInt(meter.limit) > BigInt(previous.limit);
            const applied =
                adopt &&
                !meter.creditBarrier &&
                (!previous || increaseCandidate) &&
                finite &&
                nodes.length > 0
                    ? (
                          await sql<{ ok: boolean }>`
                SELECT EXISTS(SELECT 1 FROM xera_quota_reserve_pools p WHERE p.kind=${scope.kind} AND p.key=${scope.key}
                    AND p.user_id=${scope.owner}::bigint AND p.window_start=${meter.window}::date AND p.budget_epoch=${meter.epoch}::uuid
                    AND p.limit_bytes BETWEEN ${previous?.limit ?? meter.limit}::bigint AND ${meter.limit}::bigint AND p.allocated_at IS NOT NULL AND p.expires_at>now())
                  AND NOT EXISTS(SELECT 1 FROM unnest(${nodes}::uuid[]) n(node_uuid)
                    LEFT JOIN xera_quota_node_modes m USING(node_uuid)
                    LEFT JOIN xera_quota_reserves g ON g.node_uuid=n.node_uuid AND g.kind=${scope.kind} AND g.key=${scope.key}
                      AND g.user_id=${scope.owner}::bigint AND g.window_start=${meter.window}::date AND g.budget_epoch=${meter.epoch}::uuid
                      AND g.retired_at IS NULL AND g.closed_usage_bytes IS NULL
                    WHERE g.id IS NULL OR m.instance_uuid IS DISTINCT FROM g.instance_uuid OR m.applied_revision IS DISTINCT FROM m.desired_revision
                      OR m.applied_policy->'scopes'->${group}->${scope.owner}->>0 IS DISTINCT FROM 'R'
                      OR m.applied_policy->'scopes'->${group}->${scope.owner}->>1 IS DISTINCT FROM g.id::text
                      OR m.applied_policy->'scopes'->${group}->${scope.owner}->>2 IS DISTINCT FROM g.ceiling_bytes::text)
                  AND NOT EXISTS(SELECT 1 FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
                    WHERE g.kind=${scope.kind} AND g.key=${scope.key} AND g.user_id=${scope.owner}::bigint
                      AND g.closed_usage_bytes IS NULL AND p.expires_at>now() AND NOT g.node_uuid=ANY(${nodes}::uuid[]))
                  AND NOT EXISTS(SELECT 1 FROM xera_quota_node_modes m WHERE NOT m.node_uuid=ANY(${nodes}::uuid[])
                    AND m.applied_policy->'scopes'->${group}->${scope.owner} IS NOT NULL)
                  AND NOT EXISTS(SELECT 1 FROM xera_quota_usage_exposures e LEFT JOIN xera_quota_node_modes m ON m.node_uuid=e.node_uuid
                    WHERE e.kind=${scope.kind} AND e.key=${scope.key} AND e.user_id=${scope.owner}::bigint
                      AND (e.unbounded OR e.fenced_at IS NOT NULL OR e.core_uuid IS DISTINCT FROM m.applied_core OR e.instance_uuid IS DISTINCT FROM m.instance_uuid)) AS ok
            `.execute(this.db.kysely)
                      ).rows[0].ok
                    : false;
            const stable = !previous && applied;
            const increase = increaseCandidate && applied;
            if (stable || increase) {
                const row = (
                    await sql<{
                        id: string;
                    }>`INSERT INTO xera_quota_transitions(kind,key,user_id,source,phase,finite,limit_bytes,window_start,budget_epoch,desired_nodes)
                    VALUES(${scope.kind},${scope.key},${scope.owner}::bigint,${source},'ACTIVE',${finite},${meter.limit}::bigint,${meter.window}::date,${meter.epoch}::uuid,${nodes}::uuid[])
                    ON CONFLICT(kind,key,user_id) DO UPDATE SET source=excluded.source,limit_bytes=excluded.limit_bytes,updated_at=clock_timestamp()
                    RETURNING id`.execute(this.db.kysely)
                ).rows[0];
                return row.id;
            }
            const participants = (
                await sql<{
                    uuid: string;
                    core: string | null;
                    instance: string | null;
                    bounded: boolean;
                    hold: boolean;
                }>`
                WITH participants AS (
                    SELECT unnest(${nodes}::uuid[]) AS node_uuid
                    UNION SELECT g.node_uuid FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
                      WHERE g.kind=${scope.kind} AND g.key=${scope.key} AND g.user_id=${scope.owner}::bigint AND g.closed_usage_bytes IS NULL AND p.expires_at>now()
                    UNION SELECT node_uuid FROM xera_quota_node_modes WHERE applied_policy->'scopes'->${group}->${scope.owner} IS NOT NULL
                    UNION SELECT node_uuid FROM xera_quota_usage_exposures WHERE kind=${scope.kind} AND key=${scope.key} AND user_id=${scope.owner}::bigint
                    UNION SELECT p.node_uuid FROM xera_quota_transition_nodes p WHERE p.transition_id=${previous?.id ?? null}::uuid
                ) SELECT p.node_uuid AS uuid,COALESCE(CASE WHEN old.drained_at IS NULL THEN old.initial_core END,m.applied_core,m.initial_core) AS core,
                    COALESCE(old.instance_uuid,m.instance_uuid) AS instance,
                    COALESCE(NOT old.release_ready AND (${previous?.phase ?? 'ACTIVE'} NOT IN ('ACTIVE','PREFLIGHT') OR old.hold_barrier),false) AS hold,
                    COALESCE(m.applied_policy->'scopes'->${group}->${scope.owner}->>0='R'
                      AND m.applied_policy->'scopes'->${group}->${scope.owner}->>4='false',false)
                      AND NOT EXISTS(SELECT 1 FROM xera_quota_usage_exposures e WHERE e.node_uuid=p.node_uuid
                        AND e.kind=${scope.kind} AND e.key=${scope.key} AND e.user_id=${scope.owner}::bigint
                        AND (e.core_uuid IS DISTINCT FROM m.applied_core OR e.instance_uuid IS DISTINCT FROM m.instance_uuid)) AS bounded
                  FROM participants p LEFT JOIN xera_quota_node_modes m ON m.node_uuid=p.node_uuid
                    LEFT JOIN xera_quota_transition_nodes old ON old.transition_id=${previous?.id ?? null}::uuid AND old.node_uuid=p.node_uuid
                  ORDER BY p.node_uuid LIMIT 10001
            `.execute(this.db.kysely)
            ).rows;
            if (participants.length > 10000)
                throw new Error('Quota transition participant limit exceeded');
            const row = (
                await sql<{
                    id: string;
                }>`INSERT INTO xera_quota_transitions(kind,key,user_id,source,phase,finite,limit_bytes,window_start,budget_epoch,desired_nodes)
                VALUES(${scope.kind},${scope.key},${scope.owner}::bigint,${source},'PREFLIGHT',${finite},${meter.limit}::bigint,${meter.window}::date,${meter.epoch}::uuid,${nodes}::uuid[])
                ON CONFLICT(kind,key,user_id) DO UPDATE SET generation=gen_random_uuid(),source=excluded.source,phase='PREFLIGHT',finite=excluded.finite,
                  limit_bytes=excluded.limit_bytes,window_start=excluded.window_start,budget_epoch=excluded.budget_epoch,desired_nodes=excluded.desired_nodes,error_code=NULL,updated_at=clock_timestamp()
                RETURNING id`.execute(this.db.kysely)
            ).rows[0];
            await sql`DELETE FROM xera_quota_transition_nodes WHERE transition_id=${row.id}::uuid`.execute(
                this.db.kysely,
            );
            // A first observed edit has no transition descriptor. Its existing
            // pool is still the authority for credit already sent to the fleet.
            // Explicit reset/new-period credit has a separate boundary; offline
            // reserves of the old boundary remain committed without blocking it.
            const previousLimit =
                previous?.finite &&
                previous.window === meter.window &&
                previous.epoch === meter.epoch
                    ? BigInt(previous.limit)
                    : 0n;
            const poolLimit = BigInt(meter.poolLimit ?? '0');
            const decrease =
                finite &&
                BigInt(meter.limit) < (poolLimit > previousLimit ? poolLimit : previousLimit);
            for (let offset = 0; offset < participants.length; offset += 500) {
                const values = participants.slice(offset, offset + 500).map(
                    (p) => sql`(${row.id}::uuid,${p.uuid}::uuid,
                    ${finite && (!p.bounded || !!decrease || meter.reason === 'ENTITLEMENT')},${p.hold},${p.core}::uuid,${p.instance}::uuid)`,
                );
                await sql`INSERT INTO xera_quota_transition_nodes(transition_id,node_uuid,required,hold_barrier,initial_core,instance_uuid) VALUES ${sql.join(values)}`.execute(
                    this.db.kysely,
                );
            }
            return row.id;
        });
    }

    private async participants(t: Transition) {
        return (
            await sql<Participant>`SELECT p.node_uuid AS uuid,n.id::text AS id,n.address,n.port,n.proxy_url AS "proxyUrl",
            n.consumption_multiplier::text AS multiplier,p.required,p.initial_core AS "initialCore",p.instance_uuid AS instance,
            p.preflight_at AS "preflightAt",p.fenced_core AS "fencedCore",p.fenced_at AS "fencedAt",p.drained_at AS "drainedAt",p.release_ready AS "releaseReady",p.released_at AS "releasedAt"
            FROM xera_quota_transition_nodes p LEFT JOIN nodes n ON n.uuid=p.node_uuid
            WHERE p.transition_id=${t.id}::uuid ORDER BY p.last_attempted_at ASC NULLS FIRST,p.required DESC,p.node_uuid`.execute(
                this.db.kysely,
            )
        ).rows;
    }

    private async write(t: Transition, action: () => Promise<void>) {
        return this.transactions.withTransaction({ timeout: 30000 }, async () => {
            await this.lock(t);
            const current = await this.read(t);
            if (current?.generation !== t.generation || current.phase !== t.phase)
                throw new Error('Quota transition was superseded');
            await action();
        });
    }

    private async proof(node: string) {
        return (
            await sql<{
                core: string;
                instance: string;
                revision: string;
                appliedPolicy: QuotaPolicyProof;
            }>`
            SELECT applied_core AS core,instance_uuid AS instance,applied_revision::text AS revision,applied_policy
            FROM xera_quota_node_modes WHERE node_uuid=${node}::uuid AND applied_revision=desired_revision AND applied_source=desired_source
        `.execute(this.db.kysely)
        ).rows[0];
    }

    private async fence(t: Transition, p: Participant) {
        if (!p.id) throw new Error('TRANSITION_NODE_MISSING');
        await this.policies.syncNode(p);
        const proof = await this.proof(p.uuid);
        const owner = proof?.appliedPolicy.scopes[t.kind.toLowerCase() + ':' + t.key]?.[t.owner];
        if (
            !proof ||
            !proof.core ||
            proof.instance !== p.instance ||
            !p.initialCore ||
            proof.core !== p.initialCore
        )
            throw new Error('TRANSITION_CORE_REQUIRES_RECOVERY');
        if (owner && owner[0] !== 'F') throw new Error('TRANSITION_FENCE_NOT_APPLIED');
        await this.write(t, async () => {
            await sql`UPDATE xera_quota_transition_nodes SET fenced_core=${proof.core}::uuid,fenced_revision=${proof.revision}::bigint,
                fenced_at=clock_timestamp(),error_code=NULL WHERE transition_id=${t.id}::uuid AND node_uuid=${p.uuid}::uuid`.execute(
                this.db.kysely,
            );
        });
    }

    private async drain(t: Transition, p: Participant) {
        if (!p.id || !p.fencedAt || !p.fencedCore) throw new Error('TRANSITION_FENCE_MISSING');
        const receipt = await this.usage.collect(
            { nodeUuid: p.uuid, nodeId: BigInt(p.id), opts: p, multiplier: p.multiplier },
            (key, value) => this.effects.apply(p.uuid, BigInt(p.id!), key, value),
        );
        if (!receipt || receipt.coreProcessId !== p.fencedCore)
            throw new Error('TRANSITION_CORE_REQUIRES_RECOVERY');
        // A replay prepared before the barrier is valid billing but cannot prove
        // that its uncaptured tail has drained. A later pass captures the tail.
        if (receipt.requestedAt <= p.fencedAt.getTime()) return;
        await this.settlements.syncNode(p, t);
        await this.write(t, async () => {
            const pending =
                await sql`SELECT 1 FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
                WHERE g.node_uuid=${p.uuid}::uuid AND g.kind=${t.kind} AND g.key=${t.key} AND g.user_id=${t.owner}::bigint
                  AND g.retired_at IS NOT NULL AND g.closed_usage_bytes IS NULL AND p.expires_at>now() LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (pending.rows.length) throw new Error('TRANSITION_SETTLEMENT_PENDING');
            const exposure =
                await sql`SELECT 1 FROM xera_quota_usage_exposures WHERE node_uuid=${p.uuid}::uuid
                AND kind=${t.kind} AND key=${t.key} AND user_id=${t.owner}::bigint LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (exposure.rows.length) throw new Error('TRANSITION_USAGE_CAPTURE_PENDING');
            await sql`UPDATE xera_quota_transition_nodes SET drained_at=clock_timestamp(),error_code=NULL
                WHERE transition_id=${t.id}::uuid AND node_uuid=${p.uuid}::uuid AND fenced_core=${receipt.coreProcessId}::uuid`.execute(
                this.db.kysely,
            );
        });
    }

    private async fund(t: Transition) {
        await this.write(t, async () => {
            const meter = (
                await sql<{ limit: string; epoch: string; window: string; unlimited: boolean }>`
                SELECT q.effective_limit::text AS "limit",to_char(q.window_start,'YYYY-MM-DD') AS window,
                    xera_current_quota_epoch(${t.kind},${t.key},${t.owner}::bigint,q.window_start) AS epoch,COALESCE(a.unlimited,false) AS unlimited
                FROM xera_quota_budget_state(${t.kind},${t.key},${t.owner}::bigint) q
                LEFT JOIN xera_limit_user_adjustments a ON a.kind=${t.kind} AND a.key=${t.key} AND a.user_id=${t.owner}::bigint
            `.execute(this.db.kysely)
            ).rows[0];
            if (
                !meter ||
                meter.limit !== t.limit ||
                meter.epoch !== t.epoch ||
                meter.window !== t.window ||
                (BigInt(meter.limit) > 0n && !meter.unlimited) !== t.finite
            )
                throw new Error('TRANSITION_TARGET_CHANGED');
            const participants = await this.participants(t);
            if (participants.some((p) => p.required && !p.drainedAt))
                throw new Error('TRANSITION_DRAIN_PENDING');
            const ready = participants.filter(
                (p) => p.drainedAt && p.instance && t.nodes.includes(p.uuid),
            );
            if (t.finite && ready.length) {
                const target = {
                    kind: t.kind,
                    key: t.key,
                    owner: t.owner,
                    nodes: ready.map((p) => p.uuid),
                    instances: Object.fromEntries(ready.map((p) => [p.uuid, p.instance])),
                };
                await sql`SELECT xera_fund_quota_targets(${JSON.stringify([target])}::jsonb)`.execute(
                    this.db.kysely,
                );
            }
            await sql`UPDATE xera_quota_transition_nodes SET release_ready=true WHERE transition_id=${t.id}::uuid AND drained_at IS NOT NULL`.execute(
                this.db.kysely,
            );
            await sql`UPDATE xera_quota_transitions SET phase='RELEASING',error_code=NULL,updated_at=clock_timestamp() WHERE id=${t.id}::uuid`.execute(
                this.db.kysely,
            );
        });
    }

    // Bounded work; the fleet coordinator owns scheduling/lease. Calling this
    // repeatedly only resumes committed work, including a lost release ACK.
    async advance(scope: Scope): Promise<boolean> {
        if (this.transactions.isTransactionActive())
            throw new Error('Quota transition requires standalone transactions');
        const t = await this.read(scope);
        if (!t || t.phase === 'ACTIVE' || t.phase === 'RECOVERY') return false;
        const participants = await this.participants(t);
        const work =
            t.phase === 'PREFLIGHT'
                ? participants.filter((p) => !p.preflightAt)
                : t.phase === 'FENCING'
                  ? participants.filter((p) => !p.fencedAt)
                  : t.phase === 'DRAINING'
                    ? participants.filter((p) => p.fencedAt && !p.drainedAt)
                    : t.phase === 'RELEASING'
                      ? participants.filter((p) => !p.releasedAt)
                      : [];
        const batch = work.slice(0, 8);
        if (batch.length)
            await this.write(t, async () => {
                // Commit before network IO. Even a crashed or timed-out batch
                // yields its place to unattempted nodes on the next pass.
                await sql`UPDATE xera_quota_transition_nodes SET last_attempted_at=clock_timestamp()
                    WHERE transition_id=${t.id}::uuid AND node_uuid=ANY(${batch.map((p) => p.uuid)}::uuid[])`.execute(
                    this.db.kysely,
                );
            });
        const results = await Promise.allSettled(
            batch.map(async (p) => {
                try {
                    if (t.phase === 'PREFLIGHT') {
                        if (!p.id) throw new Error('TRANSITION_NODE_MISSING');
                        const unresolved =
                            await sql`SELECT 1 FROM xera_quota_usage_exposures WHERE node_uuid=${p.uuid}::uuid
                            AND kind=${t.kind} AND key=${t.key} AND user_id=${t.owner}::bigint
                            AND (core_uuid IS DISTINCT FROM ${p.initialCore}::uuid OR instance_uuid IS DISTINCT FROM ${p.instance}::uuid) LIMIT 1`.execute(
                                this.db.kysely,
                            );
                        if (unresolved.rows.length)
                            throw new Error('TRANSITION_DEBT_REQUIRES_RECOVERY');
                        const status = await this.axios.hostPolicy<{
                            applied?: boolean;
                            quotaReservesSupported?: boolean;
                            quotaRegistrationsSupported?: boolean;
                            quotaWatermarksSupported?: boolean;
                            quotaFencesSupported?: boolean;
                            policyRevisionsSupported?: boolean;
                            usageReceiptsSupported?: boolean;
                            unreservedUsageSupported?: boolean;
                            userQuotaReservesSupported?: boolean;
                            coreProcessId?: string;
                            quotaInstanceId?: string;
                        }>(p);
                        const cap = status.isOk ? status.response : null;
                        if (
                            !cap?.applied ||
                            !cap.quotaReservesSupported ||
                            !cap.quotaRegistrationsSupported ||
                            !cap.quotaWatermarksSupported ||
                            !cap.quotaFencesSupported ||
                            !cap.policyRevisionsSupported ||
                            !cap.usageReceiptsSupported ||
                            !cap.unreservedUsageSupported ||
                            !cap.userQuotaReservesSupported
                        )
                            throw new Error('TRANSITION_NODE_UNAVAILABLE');
                        if (
                            !p.initialCore ||
                            cap.coreProcessId !== p.initialCore ||
                            cap.quotaInstanceId !== p.instance
                        )
                            throw new Error('TRANSITION_CORE_REQUIRES_RECOVERY');
                        await this.write(t, async () => {
                            await sql`UPDATE xera_quota_transition_nodes SET preflight_at=clock_timestamp(),error_code=NULL
                        WHERE transition_id=${t.id}::uuid AND node_uuid=${p.uuid}::uuid`.execute(
                                this.db.kysely,
                            );
                        });
                    } else if (!p.fencedAt) await this.fence(t, p);
                    else if (!p.drainedAt) await this.drain(t, p);
                    else if (p.releaseReady) {
                        if (!p.id) throw new Error('TRANSITION_NODE_MISSING');
                        await this.policies.syncNode(p);
                        const proof = await this.proof(p.uuid);
                        const owner =
                            proof?.appliedPolicy.scopes[t.kind.toLowerCase() + ':' + t.key]?.[
                                t.owner
                            ];
                        if (
                            !proof ||
                            proof.instance !== p.instance ||
                            proof.core !== p.fencedCore ||
                            owner?.[0] === 'F'
                        )
                            throw new Error('TRANSITION_RELEASE_NOT_APPLIED');
                        await this.write(t, async () => {
                            await sql`UPDATE xera_quota_transition_nodes SET released_at=clock_timestamp(),error_code=NULL
                        WHERE transition_id=${t.id}::uuid AND node_uuid=${p.uuid}::uuid`.execute(
                                this.db.kysely,
                            );
                        });
                    }
                } catch (error) {
                    const code =
                        error instanceof Error && /^TRANSITION_[A-Z_]+$/.test(error.message)
                            ? error.message
                            : 'TRANSITION_RETRY_REQUIRED';
                    await this.write(t, async () => {
                        await sql`UPDATE xera_quota_transition_nodes SET error_code=${code} WHERE transition_id=${t.id}::uuid AND node_uuid=${p.uuid}::uuid`.execute(
                            this.db.kysely,
                        );
                    });
                }
            }),
        );
        for (const result of results) if (result.status === 'rejected') throw result.reason;
        const after = await this.participants(t);
        let phase: string | null = null;
        if (t.phase === 'PREFLIGHT' && !after.some((p) => p.required && !p.preflightAt)) {
            await this.write(t, async () => {
                // Retirement never closes/refunds an unreachable node's ledger.
                await sql`UPDATE xera_quota_reserves g SET retired_at=COALESCE(retired_at,clock_timestamp())
                    FROM xera_quota_reserve_pools p WHERE (p.kind,p.key,p.user_id,p.window_start,p.budget_epoch)=(g.kind,g.key,g.user_id,g.window_start,g.budget_epoch)
                    AND g.kind=${t.kind} AND g.key=${t.key} AND g.user_id=${t.owner}::bigint AND g.closed_usage_bytes IS NULL AND p.expires_at>now()`.execute(
                    this.db.kysely,
                );
                await sql`UPDATE xera_quota_transitions SET phase='FENCING',updated_at=clock_timestamp() WHERE id=${t.id}::uuid`.execute(
                    this.db.kysely,
                );
            });
            return true;
        }
        if (t.phase === 'FENCING' && !after.some((p) => p.required && !p.fencedAt))
            phase = 'DRAINING';
        if (t.phase === 'DRAINING' && !after.some((p) => p.required && !p.drainedAt))
            phase = 'FUNDING';
        if (
            t.phase === 'FUNDING' ||
            (t.phase === 'RELEASING' && after.some((p) => p.drainedAt && !p.releaseReady))
        ) {
            await this.fund(t);
            return true;
        }
        if (t.phase === 'RELEASING' && after.every((p) => p.releasedAt)) phase = 'ACTIVE';
        if (phase)
            await this.write(t, async () => {
                await sql`UPDATE xera_quota_transitions SET phase=${phase},updated_at=clock_timestamp() WHERE id=${t.id}::uuid`.execute(
                    this.db.kysely,
                );
            });
        return (
            !!phase ||
            JSON.stringify(
                [...after].sort((a, b) => a.uuid.localeCompare(b.uuid)).map((p) => [
                    p.preflightAt,
                    p.fencedAt,
                    p.drainedAt,
                    p.releaseReady,
                    p.releasedAt,
                ]),
            ) !==
                JSON.stringify(
                [...participants].sort((a, b) => a.uuid.localeCompare(b.uuid)).map((p) => [
                        p.preflightAt,
                        p.fencedAt,
                        p.drainedAt,
                        p.releaseReady,
                        p.releasedAt,
                    ]),
                )
        );
    }

    async advancePending(): Promise<boolean> {
        const target = (
            await sql<Scope>`SELECT kind,key,user_id::text AS owner FROM xera_quota_transitions
            WHERE phase NOT IN ('ACTIVE','RECOVERY') ORDER BY checked_at NULLS FIRST,kind,key,user_id LIMIT 1`.execute(
                this.db.kysely,
            )
        ).rows[0];
        if (!target) return false;
        await sql`UPDATE xera_quota_transitions SET checked_at=clock_timestamp() WHERE kind=${target.kind} AND key=${target.key} AND user_id=${target.owner}::bigint`.execute(
            this.db.kysely,
        );
        try {
            return await this.advance(target);
        } catch (error) {
            // A concurrent RESET/limit edit must allow the owner scan to prepare
            // its new target; retrying the obsolete FUNDING step alone starves it.
            if (!(error instanceof Error) || error.message !== 'TRANSITION_TARGET_CHANGED')
                throw error;
            const t = await this.read(target);
            if (t)
                await this.write(t, async () => {
                    await sql`UPDATE xera_quota_transitions SET error_code='TRANSITION_TARGET_CHANGED'
                WHERE id=${t.id}::uuid`.execute(this.db.kysely);
                });
            return false;
        }
    }
}
