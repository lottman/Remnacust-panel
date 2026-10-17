import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TxKyselyService } from '@common/database';

import { DurableUsageService, UsageNode } from './durable-usage.service';
import { HostPolicyService, HOST_POLICY_VERSION } from './host-policy.service';
import { QuotaCutoverService } from './quota-cutover.service';
import { quotaRestoreState } from './quota-journal-checkpoint';
import { quotaSourceFingerprint } from './quota-policy';
import { QuotaTransitionService } from './quota-transition.service';
import { UsageEffectsService } from './usage-effects.service';

type Phase = 'PREFLIGHT' | 'FENCING' | 'DRAINING' | 'ALLOCATING' | 'ACTIVE' | 'RECOVERY';
type Coordinator = {
    phase: Phase;
    generation: string;
    roster: string[];
    cursor: string;
    error: string | null;
};
type Node = INodeConnectionOpts & {
    uuid: string;
    id: string;
    multiplier: string;
    phase: 'FENCING' | 'ACTIVE' | null;
    instance: string | null;
    initialCore: string | null;
    fencedCore: string | null;
    fencedSource: string | null;
    fencedAt: Date | null;
    drained: Date | null;
    legacyDrained: Date | null;
    stage: string | null;
    connectionHash: string | null;
    observedCore: string | null;
    lastSample: Date | null;
    lastAttempt: Date | null;
};
type Target = { kind: 'USER' | 'HOST' | 'TAG'; key: string; owner: string; nodes: string[] };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const connectionHash = (node: Node) =>
    createHash('sha256')
        .update(JSON.stringify([node.address, node.port, node.proxyUrl]))
        .digest('hex');
const usageNode = (node: Node): UsageNode => ({
    nodeUuid: node.uuid,
    nodeId: BigInt(node.id),
    opts: node,
    multiplier: node.multiplier,
});

class CoordinationError extends Error {
    constructor(
        readonly code: string,
        readonly node?: string,
    ) {
        super(code);
    }
}

@Injectable()
export class QuotaCoordinatorService {
    private readonly logger = new Logger(QuotaCoordinatorService.name);
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly axios: AxiosService,
        private readonly policies: HostPolicyService,
        private readonly cutover: QuotaCutoverService,
        private readonly usage: DurableUsageService,
        private readonly effects: UsageEffectsService,
        private readonly transitions: QuotaTransitionService,
    ) {}

    private async state(): Promise<Coordinator | undefined> {
        return (
            await sql<Coordinator>`SELECT phase,generation,roster,allocation_cursor::text AS cursor,error_code AS error
            FROM xera_quota_coordinator WHERE id=1`.execute(this.db.kysely)
        ).rows[0];
    }

    private async nodes(): Promise<Node[]> {
        const result =
            await sql<Node>`SELECT n.uuid,n.id::text AS id,n.address,n.port,n.proxy_url AS "proxyUrl",
            n.consumption_multiplier::text AS multiplier,m.phase,m.instance_uuid AS instance,m.initial_core AS "initialCore",
            m.fenced_core AS "fencedCore",m.fenced_source AS "fencedSource",m.fenced_at AS "fencedAt",
            m.initial_drained_at AS drained,m.legacy_usage_drained_at AS "legacyDrained",
            p.stage,p.connection_hash AS "connectionHash",p.observed_core AS "observedCore",s.last_requested_at AS "lastSample",
            p.last_attempted_at AS "lastAttempt"
            FROM nodes n LEFT JOIN xera_quota_node_modes m ON m.node_uuid=n.uuid
            LEFT JOIN xera_node_usage_streams s ON s.node_uuid=n.uuid AND s.node_id=n.id
            LEFT JOIN xera_quota_node_progress p ON p.node_uuid=n.uuid
              AND p.generation=(SELECT generation FROM xera_quota_coordinator WHERE id=1)
            WHERE NOT n.is_disabled AND n.active_config_profile_uuid IS NOT NULL ORDER BY n.id LIMIT 10001`.execute(
                this.db.kysely,
            );
        if (result.rows.length > 10000) throw new CoordinationError('NODE_ROSTER_TOO_LARGE');
        return result.rows;
    }

    private async write<T>(owner: string, action: () => Promise<T>): Promise<T> {
        return this.transactions.withTransaction({ timeout: 30000 }, async () => {
            const lease =
                await sql`SELECT id FROM xera_quota_coordinator WHERE id=1 AND lease_owner=${owner}::uuid
                AND lease_until>clock_timestamp() FOR UPDATE`.execute(this.db.kysely);
            if (!lease.rows.length) throw new CoordinationError('COORDINATOR_LEASE_LOST');
            return action();
        });
    }

    async status() {
        const state = await this.state();
        const restore = await quotaRestoreState(this.db);
        const pendingRestore = !!restore && !restore.reconciledAt;
        const rows = await sql<{
            uuid: string;
            name: string;
            stage: string;
            error: string | null;
            checkedAt: Date;
        }>`
            SELECT p.node_uuid AS uuid,n.name,p.stage,p.error_code AS error,p.checked_at AS "checkedAt"
            FROM xera_quota_node_progress p JOIN nodes n ON n.uuid=p.node_uuid
            WHERE p.generation=(SELECT generation FROM xera_quota_coordinator WHERE id=1) ORDER BY n.id LIMIT 10000`.execute(
            this.db.kysely,
        );
        return {
            phase: pendingRestore ? 'RECOVERY' : (state?.phase ?? 'PREFLIGHT'),
            error: pendingRestore
                ? 'QUOTA_RESTORE_REQUIRES_RECONCILIATION'
                : (state?.error ?? null),
            restore,
            nodes: rows.rows,
        };
    }

    async tick(): Promise<boolean> {
        if (this.transactions.isTransactionActive())
            throw new Error('Quota coordinator requires standalone transactions');
        const restore = await quotaRestoreState(this.db);
        if (restore && !restore.reconciledAt) return false;
        await sql`INSERT INTO xera_quota_coordinator(id) VALUES(1) ON CONFLICT DO NOTHING`.execute(
            this.db.kysely,
        );
        const owner = randomUUID();
        const claimed =
            await sql`UPDATE xera_quota_coordinator SET lease_owner=${owner}::uuid,lease_until=clock_timestamp()+interval '90 seconds'
            WHERE id=1 AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING id`.execute(
                this.db.kysely,
            );
        if (!claimed.rows.length) return false;
        try {
            // Work stays bounded even for a large fleet. All network calls are
            // outside SQL transactions; another scheduler can resume committed phases.
            const started = performance.now();
            for (let round = 0; round < 8 && performance.now() - started < 20000; round++) {
                const state = (await this.state())!,
                    nodes = await this.nodes();
                if (state.phase === 'RECOVERY') return true;
                const advanced = await this.step(owner, state, nodes);
                if (!advanced) break;
            }
            return true;
        } catch (error) {
            const failure =
                error instanceof CoordinationError
                    ? error
                    : new CoordinationError('COORDINATOR_RETRY_REQUIRED');
            if (failure.code !== 'COORDINATOR_LEASE_LOST') {
                await this.write(owner, async () => {
                    await sql`UPDATE xera_quota_coordinator SET error_code=${failure.code},updated_at=now() WHERE id=1`.execute(
                        this.db.kysely,
                    );
                    if (failure.node)
                        await sql`INSERT INTO xera_quota_node_progress(node_uuid,generation,stage,error_code)
                            SELECT ${failure.node}::uuid,generation,'PREFLIGHT',${failure.code} FROM xera_quota_coordinator WHERE id=1
                            ON CONFLICT(node_uuid) DO UPDATE SET error_code=excluded.error_code,checked_at=now(),generation=excluded.generation,
                                stage=CASE WHEN xera_quota_node_progress.generation=excluded.generation THEN xera_quota_node_progress.stage ELSE 'PREFLIGHT' END`.execute(
                            this.db.kysely,
                        );
                });
                this.logger.warn(`Quota coordination awaits retry: ${failure.code}`);
            }
            return true;
        } finally {
            await sql`UPDATE xera_quota_coordinator SET lease_owner=NULL,lease_until=NULL WHERE id=1 AND lease_owner=${owner}::uuid`.execute(
                this.db.kysely,
            );
        }
    }

    private async phase(owner: string, phase: Phase) {
        await this.write(owner, async () => {
            await sql`UPDATE xera_quota_coordinator SET phase=${phase},error_code=NULL,updated_at=now() WHERE id=1`.execute(
                this.db.kysely,
            );
        });
    }

    private async batch(owner: string, state: Coordinator, candidates: Node[]): Promise<Node[]> {
        const selected = [...candidates].sort((a, b) =>
            (a.lastAttempt?.getTime() ?? -1) - (b.lastAttempt?.getTime() ?? -1) ||
            a.uuid.localeCompare(b.uuid),
        ).slice(0, 8);
        if (!selected.length) return selected;
        await this.write(owner, async () => {
            const current = await this.state();
            if (current?.generation !== state.generation || current.phase !== state.phase)
                throw new CoordinationError('COORDINATOR_GENERATION_CHANGED');
            const values = selected.map((node) => sql`(${node.uuid}::uuid,${state.generation}::uuid,
                ${node.stage ?? 'PREFLIGHT'},clock_timestamp())`);
            await sql`INSERT INTO xera_quota_node_progress(node_uuid,generation,stage,last_attempted_at)
                VALUES ${sql.join(values)} ON CONFLICT(node_uuid) DO UPDATE SET
                  generation=excluded.generation,
                  stage=CASE WHEN xera_quota_node_progress.generation=excluded.generation
                    THEN xera_quota_node_progress.stage ELSE excluded.stage END,
                  last_attempted_at=excluded.last_attempted_at`.execute(this.db.kysely);
        });
        return selected;
    }

    private async step(owner: string, state: Coordinator, nodes: Node[]): Promise<boolean> {
        if (state.phase === 'PREFLIGHT') return this.preflight(owner, state, nodes);
        const current = nodes.map((node) => node.uuid).sort(),
            registered = [...state.roster].sort();
        if (JSON.stringify(current) !== JSON.stringify(registered)) {
            await this.write(owner, async () => {
                await sql`UPDATE xera_quota_coordinator SET phase='PREFLIGHT',generation=gen_random_uuid(),allocation_cursor=0,
                    roster='{}',error_code='NODE_SET_CHANGED',updated_at=now() WHERE id=1`.execute(
                    this.db.kysely,
                );
            });
            return true;
        }
        const pending = nodes.filter((node) => node.phase === 'FENCING');
        if (state.phase === 'FENCING') {
            const batch = await this.batch(owner, state, pending
                .filter((node) => node.stage !== 'FENCED' && node.stage !== 'BOOTSTRAPPED'));
            if (!batch.length) {
                await this.phase(owner, 'DRAINING');
                return true;
            }
            const results = await Promise.allSettled(
                batch.map(async (node) => {
                    await this.policies.syncNode(node);
                    const row = (
                        await sql<{
                            core: string | null;
                            initial: string | null;
                        }>`SELECT fenced_core AS core,initial_core AS initial
                    FROM xera_quota_node_modes WHERE node_uuid=${node.uuid}::uuid`.execute(
                            this.db.kysely,
                        )
                    ).rows[0];
                    if (!row?.core || row.core !== row.initial)
                        throw new CoordinationError('INITIAL_CORE_CHANGED', node.uuid);
                    await this.write(owner, async () => {
                        await sql`UPDATE xera_quota_node_progress SET stage='FENCED',error_code=NULL,checked_at=now() WHERE node_uuid=${node.uuid}::uuid`.execute(
                            this.db.kysely,
                        );
                    });
                }),
            );
            for (const result of results) if (result.status === 'rejected') throw result.reason;
            return true;
        }
        if (state.phase === 'DRAINING') {
            const unstarted = await this.batch(owner, state, pending
                .filter(
                    (node) =>
                        node.stage !== 'BOOTSTRAPPED' ||
                        !node.lastSample ||
                        !node.fencedAt ||
                        node.lastSample.getTime() <= node.fencedAt.getTime(),
                ));
            if (unstarted.length) {
                await this.cutover.bootstrap(unstarted.map(usageNode));
                await this.write(owner, async () => {
                    await sql`UPDATE xera_quota_node_progress SET stage='BOOTSTRAPPED',checked_at=now(),error_code=NULL
                        WHERE node_uuid=ANY(${unstarted.map((node) => node.uuid)}::uuid[])`.execute(
                        this.db.kysely,
                    );
                });
                return true;
            }
            if (pending.some((node) => !node.legacyDrained)) {
                if (!(await this.cutover.confirmDrained(pending.map(usageNode)))) return false;
                return true;
            }
            const uncaptured = await this.batch(owner, state, pending.filter((node) => !node.drained));
            if (uncaptured.length) {
                const results = await Promise.allSettled(
                    uncaptured.map((node) =>
                        this.usage.collect(usageNode(node), (receipt, value) =>
                            this.effects.apply(node.uuid, BigInt(node.id), receipt, value),
                        ),
                    ),
                );
                for (const result of results) if (result.status === 'rejected') throw result.reason;
                // A millisecond boundary may require a later pass; never replace
                // that strict database-clock proof with an arbitrary sleep.
                return false;
            }
            await this.write(owner, async () => {
                await sql`UPDATE xera_quota_coordinator SET phase='ALLOCATING',allocation_cursor=0,error_code=NULL,updated_at=now() WHERE id=1`.execute(
                    this.db.kysely,
                );
            });
            return true;
        }
        if (state.phase === 'ALLOCATING') {
            if (await this.fund(owner, state, nodes)) return true;
            for (const node of pending) {
                const source = quotaSourceFingerprint(
                    await this.policies.scopes(undefined, node.uuid, true),
                    node.uuid,
                );
                if (source !== node.fencedSource) {
                    await this.write(owner, async () => {
                        await sql`UPDATE xera_quota_node_progress SET stage='READY' WHERE node_uuid=ANY(${pending.map((item) => item.uuid)}::uuid[])`.execute(
                            this.db.kysely,
                        );
                        await sql`UPDATE xera_quota_coordinator SET phase='FENCING',allocation_cursor=0,error_code='SOURCE_CHANGED' WHERE id=1`.execute(
                            this.db.kysely,
                        );
                    });
                    return true;
                }
            }
            await this.write(owner, async () => {
                await sql`UPDATE xera_quota_node_modes SET phase='ACTIVE' WHERE node_uuid=ANY(${pending.map((node) => node.uuid)}::uuid[])
                    AND initial_drained_at IS NOT NULL AND legacy_usage_drained_at IS NOT NULL`.execute(
                    this.db.kysely,
                );
                await sql`UPDATE xera_quota_coordinator SET phase='ACTIVE',allocation_cursor=0,error_code=NULL,updated_at=now() WHERE id=1`.execute(
                    this.db.kysely,
                );
            });
            return true;
        }
        if (state.phase === 'ACTIVE') {
            const delivery = await this.batch(owner, state, nodes.filter((node) => node.stage !== 'ACTIVE'));
            const results = await Promise.allSettled(
                delivery.map(async (node) => {
                    try {
                        await this.policies.syncNode(node);
                    } catch {
                        await this.write(owner, async () => {
                            await sql`UPDATE xera_quota_node_progress SET error_code='ACTIVE_POLICY_RETRY_REQUIRED',checked_at=now()
                                WHERE node_uuid=${node.uuid}::uuid AND generation=${state.generation}::uuid`.execute(this.db.kysely);
                        });
                        return false;
                    }
                    return this.write(owner, async () => {
                        const acknowledged = await sql`SELECT 1 FROM xera_quota_node_modes
                            WHERE node_uuid=${node.uuid}::uuid AND phase='ACTIVE'
                              AND instance_uuid=${node.instance}::uuid AND applied_core IS NOT NULL
                              AND desired_revision=applied_revision AND desired_source=applied_source`.execute(this.db.kysely);
                        if (!acknowledged.rows.length) {
                            await sql`UPDATE xera_quota_node_progress SET error_code='ACTIVE_POLICY_ACK_PENDING',checked_at=now()
                                WHERE node_uuid=${node.uuid}::uuid AND generation=${state.generation}::uuid`.execute(this.db.kysely);
                            return false;
                        }
                        await sql`UPDATE xera_quota_node_progress SET stage='ACTIVE',error_code=NULL,checked_at=now() WHERE node_uuid=${node.uuid}::uuid`.execute(
                            this.db.kysely,
                        );
                        return true;
                    });
                }),
            );
            for (const result of results) if (result.status === 'rejected') throw result.reason;
            if (await this.transitions.advancePending()) return true;
            // Initial grant delivery must finish before adopting its pools as
            // ordinary ACTIVE transitions. A lost registration ACK is not a
            // request to retire and replace the same credit. Already queued
            // transitions above can still progress while delivery retries.
            if (delivery.length)
                return results.some((result) => result.status === 'fulfilled' && result.value);
            const funded = await this.fund(owner, state, nodes);
            if (!funded)
                await this.write(owner, async () => {
                    await sql`UPDATE xera_quota_coordinator SET allocation_cursor=0 WHERE id=1`.execute(
                        this.db.kysely,
                    );
                });
            return funded || results.some((result) => result.status === 'fulfilled' && result.value);
        }
        return false;
    }

    private async preflight(owner: string, state: Coordinator, nodes: Node[]): Promise<boolean> {
        const pending = nodes.filter((node) => !node.phase || node.phase === 'FENCING');
        const batch = await this.batch(owner, state, pending
            .filter(
                (node) => node.stage !== 'READY' || node.connectionHash !== connectionHash(node),
            ));
        if (batch.length) {
            const results = await Promise.allSettled(
                batch.map(async (node) => {
                    const status = await this.axios.hostPolicy<{
                        version?: string;
                        supported?: boolean;
                        quotaReservesSupported?: boolean;
                        quotaRegistrationsSupported?: boolean;
                        quotaWatermarksSupported?: boolean;
                        quotaFencesSupported?: boolean;
                        policyRevisionsSupported?: boolean;
                        usageReceiptsSupported?: boolean;
                        coreIncarnationSupported?: boolean;
                        userQuotaReservesSupported?: boolean;
                        unreservedUsageSupported?: boolean;
                        coreProcessId?: string | null;
                        quotaInstanceId?: string | null;
                    }>(node);
                    if (!status.isOk) throw new CoordinationError('NODE_UNAVAILABLE', node.uuid);
                    const cap = status.response;
                    if (
                        cap.version !== HOST_POLICY_VERSION ||
                        !cap.supported ||
                        !cap.quotaReservesSupported ||
                        !cap.quotaRegistrationsSupported ||
                        !cap.quotaWatermarksSupported ||
                        !cap.quotaFencesSupported ||
                        !cap.policyRevisionsSupported ||
                        !cap.usageReceiptsSupported ||
                        !cap.coreIncarnationSupported ||
                        !cap.userQuotaReservesSupported ||
                        !cap.unreservedUsageSupported ||
                        !cap.coreProcessId ||
                        !uuid.test(cap.coreProcessId)
                    )
                        throw new CoordinationError('NODE_UPGRADE_REQUIRED', node.uuid);
                    await this.write(owner, async () => {
                        await sql`INSERT INTO xera_quota_node_progress(node_uuid,generation,stage,connection_hash,observed_core,observed_instance)
                        VALUES(${node.uuid}::uuid,${state.generation}::uuid,'READY',${connectionHash(node)},${cap.coreProcessId}::uuid,${cap.quotaInstanceId ?? null}::uuid)
                        ON CONFLICT(node_uuid) DO UPDATE SET generation=excluded.generation,stage=excluded.stage,connection_hash=excluded.connection_hash,
                            observed_core=excluded.observed_core,observed_instance=excluded.observed_instance,error_code=NULL,checked_at=now()`.execute(
                            this.db.kysely,
                        );
                    });
                }),
            );
            for (const result of results) if (result.status === 'rejected') throw result.reason;
            return true;
        }
        await this.write(owner, async () => {
            await sql`SELECT 1 FROM xera_lock_usage_nodes(${nodes.map((node) => node.id)}::bigint[])`.execute(
                this.db.kysely,
            );
            const unknown = await sql`SELECT 1 FROM xera_legacy_usage_streams
                WHERE uncertain_since IS NOT NULL OR (requested_at IS NOT NULL AND payload IS NULL) LIMIT 1`.execute(
                this.db.kysely,
            );
            if (unknown.rows.length) throw new CoordinationError('DEBT_RECONCILIATION_REQUIRED');
            const orphan =
                await sql`SELECT 1 FROM xera_quota_node_modes m WHERE m.phase='FENCING' AND m.initial_drained_at IS NULL
                AND NOT EXISTS(SELECT 1 FROM nodes n WHERE n.uuid=m.node_uuid) LIMIT 1`.execute(
                    this.db.kysely,
                );
            if (orphan.rows.length) throw new CoordinationError('ORPHANED_DEBT_REQUIRES_RECOVERY');
            for (const node of nodes.filter((node) => node.phase === 'ACTIVE')) {
                await sql`INSERT INTO xera_quota_node_progress(node_uuid,generation,stage,connection_hash)
                    VALUES(${node.uuid}::uuid,${state.generation}::uuid,'ACTIVE',${connectionHash(node)})
                    ON CONFLICT(node_uuid) DO UPDATE SET generation=excluded.generation,stage='ACTIVE',connection_hash=excluded.connection_hash,
                        error_code=NULL,checked_at=now()`.execute(this.db.kysely);
            }
            for (const node of pending) {
                if (!node.observedCore)
                    throw new CoordinationError('NODE_UPGRADE_REQUIRED', node.uuid);
                await sql`INSERT INTO xera_quota_node_modes(node_uuid,user_quota,phase,initial_core)
                    VALUES(${node.uuid}::uuid,true,'FENCING',${node.observedCore}::uuid) ON CONFLICT DO NOTHING`.execute(
                    this.db.kysely,
                );
            }
            await sql`UPDATE xera_quota_coordinator SET phase=${pending.length ? 'FENCING' : 'ACTIVE'},roster=${nodes.map((node) => node.uuid)}::uuid[],
                error_code=NULL,allocation_cursor=0,updated_at=now() WHERE id=1`.execute(
                this.db.kysely,
            );
        });
        return true;
    }

    private async fund(owner: string, state: Coordinator, nodes: Node[]): Promise<boolean> {
        const selected = (
            await sql<{
                id: string;
            }>`SELECT id::text AS id FROM users WHERE id>${state.cursor}::bigint ORDER BY id LIMIT 100`.execute(
                this.db.kysely,
            )
        ).rows;
        if (!selected.length) return false;
        const ready = nodes.filter((node) => node.instance && node.drained && node.legacyDrained),
            ids = selected.map((row) => row.id),
            nodeIds = ready.map((node) => node.uuid);
        if (!ready.length) return false;
        const targets =
            await sql<Target>`WITH owners AS (SELECT id,traffic_limit_bytes FROM users WHERE id=ANY(${ids}::bigint[])),
          user_nodes AS (
            SELECT m.user_id AS owner,b.node_uuid FROM internal_squad_members m JOIN internal_squad_inbounds i USING(internal_squad_uuid)
              JOIN config_profile_inbounds_to_nodes b ON b.config_profile_inbound_uuid=i.inbound_uuid WHERE m.user_id=ANY(${ids}::bigint[])
            UNION SELECT k.user_id,b.node_uuid FROM xera_host_identities k JOIN hosts h ON h.uuid=k.host_uuid
              JOIN config_profile_inbounds_to_nodes b ON b.config_profile_inbound_uuid=h.config_profile_inbound_uuid WHERE k.user_id=ANY(${ids}::bigint[])
          ), host_nodes AS (
            SELECT o.id AS owner,h.uuid,h.tags,h.user_traffic_limit_bytes,h.use_tag_traffic_limit,b.node_uuid
              FROM owners o JOIN hosts h ON xera_host_user_entitled(o.id,h.uuid)
              JOIN config_profile_inbounds_to_nodes b ON b.config_profile_inbound_uuid=h.config_profile_inbound_uuid
              WHERE b.node_uuid=ANY(${nodeIds}::uuid[]) AND
                (NOT EXISTS(SELECT 1 FROM hosts_to_nodes hn WHERE hn.host_uuid=h.uuid) OR
                 EXISTS(SELECT 1 FROM hosts_to_nodes hn WHERE hn.host_uuid=h.uuid AND hn.node_uuid=b.node_uuid))
          ), targets AS (
            SELECT 'USER'::text AS kind,'global'::text AS key,o.id AS owner,u.node_uuid FROM owners o JOIN user_nodes u ON u.owner=o.id
              WHERE o.traffic_limit_bytes>0 AND u.node_uuid=ANY(${nodeIds}::uuid[])
            UNION SELECT 'HOST',h.uuid::text,h.owner,h.node_uuid FROM host_nodes h WHERE h.user_traffic_limit_bytes>0
            UNION SELECT 'TAG',t.tag,h.owner,h.node_uuid FROM host_nodes h JOIN xera_host_tag_limits t ON t.tag=ANY(h.tags)
              WHERE h.use_tag_traffic_limit AND t.user_traffic_limit_bytes>0
          ), scopes AS (
            SELECT DISTINCT kind,key,owner FROM targets
            UNION SELECT p.kind,p.key,p.user_id FROM xera_quota_reserve_pools p
              WHERE p.user_id=ANY(${ids}::bigint[]) AND p.expires_at>now()
                AND (p.kind='USER' OR (p.kind='HOST' AND EXISTS(SELECT 1 FROM hosts h WHERE h.uuid::text=p.key))
                  OR (p.kind='TAG' AND EXISTS(SELECT 1 FROM xera_host_tag_limits l WHERE l.tag=p.key)))
          ) SELECT s.kind,s.key,s.owner::text AS owner,
            COALESCE(array_agg(DISTINCT t.node_uuid ORDER BY t.node_uuid) FILTER(WHERE t.node_uuid IS NOT NULL),'{}'::uuid[]) AS nodes
          FROM scopes s LEFT JOIN targets t ON t.kind=s.kind AND t.key=s.key AND t.owner=s.owner
            AND (t.kind='USER' OR NOT EXISTS(SELECT 1 FROM xera_limit_user_adjustments a WHERE a.kind=t.kind AND a.key=t.key AND a.user_id=t.owner AND a.unlimited))
          GROUP BY s.kind,s.key,s.owner ORDER BY s.kind,s.key,s.owner LIMIT 10001`.execute(
                this.db.kysely,
            );
        if (targets.rows.length > 10000)
            throw new CoordinationError('OWNER_SCOPE_ROSTER_TOO_LARGE');
        const fundable: Target[] = [];
        for (const target of targets.rows) {
            if (
                state.phase !== 'ACTIVE' ||
                (await this.transitions.reconcile(target, target.nodes))
            )
                if (target.nodes.length) fundable.push(target);
        }
        const instances = Object.fromEntries(ready.map((node) => [node.uuid, node.instance!]));
        await this.write(owner, async () => {
            for (let offset = 0; offset < fundable.length; offset += 500) {
                const batch = fundable.slice(offset, offset + 500).map((target) => ({
                    ...target,
                    instances: Object.fromEntries(
                        target.nodes.map((node) => [node, instances[node]]),
                    ),
                }));
                await sql`SELECT xera_fund_quota_targets(${JSON.stringify(batch)}::jsonb)`.execute(
                    this.db.kysely,
                );
            }
            await sql`UPDATE xera_quota_coordinator SET allocation_cursor=${selected.at(-1)!.id}::bigint,error_code=NULL,updated_at=now() WHERE id=1`.execute(
                this.db.kysely,
            );
        });
        this.policies.requestSync();
        return true;
    }
}
