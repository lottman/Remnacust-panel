import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { TxKyselyService } from '@common/database';
import { RawCacheService } from '@common/raw-cache';
import { XrayModeService } from '@common/xray-mode/xray-mode.service';
import { hostCredentials } from '@common/utils/host-identity';

import { BoundedWorkQueue } from '../utils/bounded-work-queue';
import { attachAutoselectRoutes, type AutoselectRoute } from './autoselect-route-policy';
import {
    normalizeDestinationRule as normalizePolicyDomain,
    isIpDestinationRule,
} from './destination-rule';
import { buildPolicyGroups } from './host-policy-scopes';
import {
    PolicyHost,
    PolicyIdentity,
    PolicyTag,
    PolicySnapshot,
    PolicyUser,
} from './host-policy.types';
import { identityAccessQuery } from './identity-access-query';
import { legacyAutoselectPolicy } from './legacy-autoselect-policy';
import { observeQuotaCheckpoint, renderQuotaCheckpoint } from './quota-journal-checkpoint';
import {
    quotaNodeMode,
    quotaSourceFingerprint,
    renderQuotaPolicy,
    type QuotaPolicyBody,
} from './quota-policy';
import { quotaPolicyProof } from './quota-policy-proof';
import { recoveryPolicyTransportProof } from './quota-recovery-policy';
import {
    acknowledgeQuotaRegistrations,
    renderQuotaRegistrations,
    verifyQuotaRegistrations,
} from './quota-registration';

export const HOST_POLICY_VERSION = 'xera-host-policy-v2';
const HOST_POLICY_DISCOVERY_BUDGET_MS = 30000;
type HostPolicyCapabilities = {
    checkedAt?: number;
    native?: boolean;
    version?: string;
    supported?: boolean;
    destinationRulesSupported?: boolean;
    deviceSpeedLimitsSupported?: boolean;
    routedDeviceSpeedLimitsSupported?: boolean;
    policyRevisionsSupported?: boolean;
    policyRevision?: string;
    offlineReserves?: string | null;
    quotaReservesSupported?: boolean;
    quotaRegistrationsSupported?: boolean;
    quotaWatermarksSupported?: boolean;
    quotaJournalSequence?: string | null;
    quotaFencesSupported?: boolean;
    quotaInstanceId?: string | null;
    coreIncarnationSupported?: boolean;
    usageReceiptsSupported?: boolean;
    userQuotaReservesSupported?: boolean;
    unreservedUsageSupported?: boolean;
    userQuotaRequired?: boolean;
    coreProcessId?: string | null;
    quotaRecovery?: unknown;
    quotaRecoveryPolicyBindingsRequired?: boolean;
    quotaRecoveryPolicyBindingsSupported?: boolean;
};
type CompatibilitySnapshot = {
    key: string;
    roots: Set<string>;
    inbounds: Set<string>;
    routed: Set<string>;
    capabilities: Map<string, { connection: string; value: HostPolicyCapabilities }>;
    unavailable: Map<string, Error>;
};
export { normalizeDestinationRule as normalizePolicyDomain } from './destination-rule';
@Injectable()
export class HostPolicyService {
    private readonly logger = new Logger(HostPolicyService.name);
    private readonly secret: string;
    private connectedSynchronization: Promise<void> | null = null;
    private synchronizeAgain = false;
    private readonly nodeWork = new BoundedWorkQueue(3, 256);
    private readonly discoveryWork = new BoundedWorkQueue(3, 256);
    private readonly discoveries = new Map<string, Promise<HostPolicyCapabilities>>();
    private readonly compatibility = new AsyncLocalStorage<CompatibilitySnapshot | undefined>();
    private legacyInventory?: { until: number; inbounds: Set<string>; routed: Set<string> };
    private legacyInventoryPending?: Promise<Set<string>>;
    private readonly nodeSynchronizations = new Map<
        string,
        {
            requested: number;
            queued: boolean;
            waiters: {
                generation: number;
                resolve: () => void;
                reject: (error: unknown) => void;
            }[];
        }
    >();
    constructor(
        private readonly db: TxKyselyService,
        private readonly axios: AxiosService,
        private readonly cache: RawCacheService,
        @Inject(forwardRef(() => TypedConfigService)) config: TypedConfigService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly xrayModes?: XrayModeService,
    ) {
        this.secret = config.getOrThrow('APP_SECRET');
    }
    keys(row: Pick<PolicyIdentity, 'userId' | 'hostUuid' | 'hwid' | 'parent' | 'quotaHostUuid'>) {
        return hostCredentials(
            this.secret,
            BigInt(row.userId),
            row.hostUuid,
            row.hwid,
            row.parent,
            row.quotaHostUuid ?? row.hostUuid,
        );
    }
    async legacyInbounds(): Promise<Set<string>> {
        if (this.xrayModes && !(await this.xrayModes.isCustom())) {
            const rows = await sql<{ uuid: string }>`SELECT uuid FROM config_profile_inbounds`.execute(this.db.kysely);
            const inbounds = new Set(rows.rows.map(row => row.uuid));
            this.legacyInventory = { until: Date.now() + 1000, inbounds, routed: inbounds };
            return inbounds;
        }
        const snapshot = this.compatibility.getStore();
        if (snapshot) return Promise.resolve(snapshot.inbounds);
        if (this.legacyInventory && this.legacyInventory.until > Date.now())
            return Promise.resolve(this.legacyInventory.inbounds);
        if (this.legacyInventoryPending) return this.legacyInventoryPending;
        this.legacyInventoryPending = Promise.resolve()
            .then(async () => {
                const nodes = await sql<
                    INodeConnectionOpts & { uuid: string; inbounds: string[] }
                >`SELECT n.uuid,n.address,n.port,n.proxy_url AS "proxyUrl",
                COALESCE(array_agg(b.config_profile_inbound_uuid) FILTER(WHERE b.config_profile_inbound_uuid IS NOT NULL),'{}'::uuid[]) AS inbounds
                FROM nodes n LEFT JOIN config_profile_inbounds_to_nodes b ON b.node_uuid=n.uuid
                WHERE NOT n.is_disabled GROUP BY n.uuid`.execute(this.db.kysely);
                const inbounds = new Set<string>();
                const routed = new Set<string>();
                await Promise.all(
                    nodes.rows.map(async (node) => {
                        const connection = createHash('sha256')
                            .update(JSON.stringify([node.address, node.port, node.proxyUrl]))
                            .digest('hex');
                        const capability = await this.cache.get<HostPolicyCapabilities>(
                            `xera:host-policy:capabilities:v2:${node.uuid}:${connection}`,
                        );
                        const native = capability?.native === true;
                        if (native) for (const inbound of node.inbounds) inbounds.add(inbound);
                        if (
                            native ||
                            (capability?.version === HOST_POLICY_VERSION &&
                                capability.supported === true &&
                                capability.routedDeviceSpeedLimitsSupported !== true)
                        )
                            for (const inbound of node.inbounds) routed.add(inbound);
                    }),
                );
                this.legacyInventory = { until: Date.now() + 1000, inbounds, routed };
                return inbounds;
            })
            .finally(() => {
                this.legacyInventoryPending = undefined;
            });
        return this.legacyInventoryPending;
    }
    async withCompatibilitySnapshot<T>(
        roots: readonly string[],
        work: () => Promise<T>,
        allowPartial = false,
    ): Promise<T> {
        if (this.xrayModes && !(await this.xrayModes.isCustom())) return this.compatibility.run(undefined, work);
        if (this.transactions.isTransactionActive())
            throw new Error('Node capability discovery must run outside SQL transactions');
        const current = this.compatibility.getStore();
        if (current) {
            if (!roots.every((uuid) => current.roots.has(uuid)))
                throw this.discoveryFailure(
                    'Host policy compatibility snapshot does not cover this node',
                );
            for (const uuid of roots) {
                const failure = current.unavailable.get(uuid);
                if (failure && !allowPartial) throw failure;
            }
            return work();
        }
        let snapshot: CompatibilitySnapshot;
        try {
            snapshot = await this.prepareCompatibilitySnapshot(roots);
        } catch (error) {
            throw this.discoveryFailure(
                error instanceof Error ? error.message : 'Host policy node inventory unavailable',
            );
        }
        for (const uuid of roots) {
            const failure = snapshot.unavailable.get(uuid);
            if (failure && !allowPartial) throw failure;
        }
        return this.compatibility.run(snapshot, work);
    }
    private discoveryFailure(message: string): Error {
        return Object.assign(new Error(message), { code: 'HOST_POLICY_DISCOVERY_FAILED' });
    }
    private async prepareCompatibilitySnapshot(
        roots: readonly string[],
    ): Promise<CompatibilitySnapshot> {
        const nodes = await sql<INodeConnectionOpts & { uuid: string; inbounds: string[] }>`
            SELECT n.uuid,n.address,n.port,n.proxy_url AS "proxyUrl",
                COALESCE(array_agg(b.config_profile_inbound_uuid) FILTER(WHERE b.config_profile_inbound_uuid IS NOT NULL),'{}'::uuid[]) AS inbounds
            FROM nodes n LEFT JOIN config_profile_inbounds_to_nodes b ON b.node_uuid=n.uuid
            WHERE NOT n.is_disabled GROUP BY n.uuid ORDER BY n.uuid LIMIT 10001`.execute(
            this.db.kysely,
        );
        if (nodes.rows.length > 10000) throw new Error('Host policy node inventory exceeds limit');
        const rootIds = new Set(roots);
        const nodesById = new Map(nodes.rows.map((node) => [node.uuid, node]));
        const missing = roots.filter((uuid) => !nodesById.has(uuid));
        const inbounds = new Set(
            nodes.rows.filter((node) => rootIds.has(node.uuid)).flatMap((node) => node.inbounds),
        );
        const dependencies = nodes.rows.filter(
            (node) => rootIds.has(node.uuid) || node.inbounds.some((id) => inbounds.has(id)),
        );
        const capabilities = new Map<
            string,
            { connection: string; value: HostPolicyCapabilities }
        >();
        const failures = new Map<string, Error>();
        const deadline = Date.now() + HOST_POLICY_DISCOVERY_BUDGET_MS;
        for (let offset = 0; offset < dependencies.length; offset += 3)
            await Promise.all(
                dependencies.slice(offset, offset + 3).map(async (node) => {
                    let timer: ReturnType<typeof setTimeout> | undefined;
                    try {
                        const remaining = deadline - Date.now();
                        if (remaining <= 0)
                            throw new Error('Capability discovery budget exhausted');
                        const value = await Promise.race([
                            this.discoverCapabilities(node),
                            new Promise<never>((_resolve, reject) => {
                                timer = setTimeout(
                                    () =>
                                        reject(new Error('Capability discovery budget exhausted')),
                                    remaining,
                                );
                            }),
                        ]);
                        capabilities.set(node.uuid, {
                            connection: this.connectionKey(node),
                            value,
                        });
                    } catch (error) {
                        failures.set(
                            node.uuid,
                            this.discoveryFailure(
                                `Node ${node.uuid}: ${error instanceof Error ? error.message : 'capabilities unavailable'}`,
                            ),
                        );
                    } finally {
                        if (timer) clearTimeout(timer);
                    }
                }),
            );
        const unavailable = new Map<string, Error>(
            missing.map((uuid) => [
                uuid,
                this.discoveryFailure(
                    `Node ${uuid}: host policy node inventory changed before discovery`,
                ),
            ]),
        );
        const failedInbounds = new Map<string, Error>();
        for (const [uuid, failure] of failures)
            for (const inbound of nodesById.get(uuid)?.inbounds ?? [])
                failedInbounds.set(inbound, failure);
        for (const uuid of rootIds) {
            const failure =
                failures.get(uuid) ??
                nodesById
                    .get(uuid)
                    ?.inbounds.map((inbound) => failedInbounds.get(inbound))
                    .find((value) => value !== undefined);
            if (failure) unavailable.set(uuid, failure);
        }
        const legacy = new Set<string>();
        const routed = new Set<string>();
        for (let offset = 0; offset < nodes.rows.length; offset += 64)
            await Promise.all(
                nodes.rows.slice(offset, offset + 64).map(async (node) => {
                    const value =
                        capabilities.get(node.uuid)?.value ??
                        (failures.has(node.uuid)
                            ? undefined
                            : await this.cache.get<HostPolicyCapabilities>(
                                  this.capabilityKey(node),
                              ));
                    if (value?.native === true)
                        for (const inbound of node.inbounds) legacy.add(inbound);
                    if (
                        value?.native === true ||
                        (value?.version === HOST_POLICY_VERSION &&
                            value.supported === true &&
                            value.routedDeviceSpeedLimitsSupported !== true)
                    )
                        for (const inbound of node.inbounds) routed.add(inbound);
                }),
            );
        const snapshot: CompatibilitySnapshot = {
            key: createHash('sha256')
                .update(
                    JSON.stringify([
                        [...legacy].sort(),
                        [...routed].sort(),
                        [...capabilities]
                            .sort(([left], [right]) => left.localeCompare(right))
                            .map(([uuid, value]) => [
                                uuid,
                                value.connection,
                                value.value.native === true,
                                value.value.version,
                                value.value.supported,
                                value.value.routedDeviceSpeedLimitsSupported,
                            ]),
                    ]),
                )
                .digest('hex'),
            roots: rootIds,
            inbounds: legacy,
            routed,
            capabilities,
            unavailable,
        };
        return snapshot;
    }
    private connectionKey(node: INodeConnectionOpts): string {
        return createHash('sha256')
            .update(JSON.stringify([node.address, node.port, node.proxyUrl]))
            .digest('hex');
    }
    private capabilityKey(node: INodeConnectionOpts & { uuid: string }): string {
        return `xera:host-policy:capabilities:v2:${node.uuid}:${this.connectionKey(node)}`;
    }
    private async discoverCapabilities(
        node: INodeConnectionOpts & { uuid: string },
        force = false,
        network?: (duration: number) => void,
    ): Promise<HostPolicyCapabilities> {
        if (this.transactions.isTransactionActive())
            throw new Error('Node capability discovery must run outside SQL transactions');
        const key = this.capabilityKey(node);
        const cached = await this.cache.get<HostPolicyCapabilities>(key);
        if (
            !force &&
            cached &&
            (cached.native === true
                ? cached.supported === false
                : typeof cached.version === 'string' && typeof cached.supported === 'boolean') &&
            typeof cached.checkedAt === 'number' &&
            Date.now() - cached.checkedAt >= 0 &&
            Date.now() - cached.checkedAt < 60000
        )
            return cached;
        const pending = this.discoveries.get(key);
        if (pending) return pending;
        const discovery = this.discoveryWork.submit(async () => {
            const started = performance.now();
            const status = await this.axios
                .hostPolicy<HostPolicyCapabilities>(node)
                .finally(() => network?.(performance.now() - started));
            let value: HostPolicyCapabilities;
            if (
                status.isOk &&
                status.response &&
                typeof status.response === 'object' &&
                !Array.isArray(status.response) &&
                typeof status.response.version === 'string' &&
                typeof status.response.supported === 'boolean'
            ) {
                const response = status.response;
                value = {
                    native: false,
                    checkedAt: Date.now(),
                    version: response.version,
                    supported: response.supported,
                    destinationRulesSupported: response.destinationRulesSupported,
                    deviceSpeedLimitsSupported: response.deviceSpeedLimitsSupported,
                    routedDeviceSpeedLimitsSupported: response.routedDeviceSpeedLimitsSupported,
                    policyRevisionsSupported: response.policyRevisionsSupported,
                    policyRevision: response.policyRevision,
                    offlineReserves: response.offlineReserves,
                    quotaReservesSupported: response.quotaReservesSupported,
                    quotaRegistrationsSupported: response.quotaRegistrationsSupported,
                    quotaWatermarksSupported: response.quotaWatermarksSupported,
                    quotaJournalSequence: response.quotaJournalSequence,
                    quotaFencesSupported: response.quotaFencesSupported,
                    quotaInstanceId: response.quotaInstanceId,
                    coreIncarnationSupported: response.coreIncarnationSupported,
                    usageReceiptsSupported: response.usageReceiptsSupported,
                    userQuotaReservesSupported: response.userQuotaReservesSupported,
                    unreservedUsageSupported: response.unreservedUsageSupported,
                    userQuotaRequired: response.userQuotaRequired,
                    coreProcessId: response.coreProcessId,
                    quotaRecovery: response.quotaRecovery,
                    quotaRecoveryPolicyBindingsRequired:
                        response.quotaRecoveryPolicyBindingsRequired,
                    quotaRecoveryPolicyBindingsSupported:
                        response.quotaRecoveryPolicyBindingsSupported,
                };
            } else if (
                !status.isOk &&
                ['NODE_HTTP_404', 'NODE_HTTP_405'].includes(status.code ?? '')
            ) {
                const healthStarted = performance.now();
                const health = await this.axios
                    .getNodeHealth(node)
                    .finally(() => network?.(performance.now() - healthStarted));
                if (
                    !health.isOk ||
                    typeof health.response.nodeVersion !== 'string' ||
                    !/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(health.response.nodeVersion) ||
                    health.response.nodeVersion.toLowerCase().includes('remnacust')
                )
                    throw new Error(
                        `Node ${node.uuid}: native compatibility could not be verified`,
                    );
                value = { native: true, supported: false, checkedAt: Date.now() };
            } else throw new Error(`Node ${node.uuid}: host policy capabilities unavailable`);
            await this.cache.set(key, value, 86400);
            await this.legacyInventoryPending;
            this.legacyInventory = undefined;
            return value;
        });
        if (!discovery)
            throw Object.assign(new Error('Node capability discovery queue is full'), {
                code: 'HOST_POLICY_BUSY',
            });
        this.discoveries.set(key, discovery);
        try {
            return await discovery;
        } finally {
            if (this.discoveries.get(key) === discovery) this.discoveries.delete(key);
        }
    }
    async scopes(
        userId?: bigint,
        nodeUuid?: string,
        userQuota = false,
        options: { identities?: boolean; profileUuid?: string } = {},
    ): Promise<PolicySnapshot> {
        const custom = !this.xrayModes || await this.xrayModes.isCustom();
        if (!custom) userQuota = false;
        const [hosts, tags, identities, routes] = await Promise.all([
            sql<PolicyHost>`SELECT h.uuid,h.tags,h.config_profile_inbound_uuid AS "inboundUuid",i.tag AS "inboundTag",i.profile_uuid AS "profileUuid",
    h.always_available AS "alwaysAvailable",h.only_when_inactive AS "onlyWhenInactive",
    h.user_traffic_limit_bytes::text AS "userLimit",h.traffic_multiplier AS "trafficMultiplier",
    h.server_speed_limit_mbps AS "userSpeed",h.device_speed_limit_mbps AS "deviceSpeed",h.total_speed_limit_mbps AS "totalSpeed",
    h.use_tag_traffic_limit AS "useTagTrafficLimit",h.use_tag_speed_limit AS "useTagSpeedLimit",h.use_tag_device_speed_limit AS "useTagDeviceSpeedLimit",h.use_tag_total_speed_limit AS "useTagTotalSpeedLimit",
    h.traffic_limit_reset_anchor_at AS anchor,h.traffic_limit_reset_value AS "resetValue",h.traffic_limit_reset_unit AS "resetUnit",h.domain_rules AS domains,
    COALESCE((SELECT json_agg(n.node_uuid) FROM hosts_to_nodes n WHERE n.host_uuid=h.uuid),'[]') AS nodes,
    COALESCE((SELECT json_agg(n.node_uuid) FROM config_profile_inbounds_to_nodes n WHERE n.config_profile_inbound_uuid=h.config_profile_inbound_uuid),'[]') AS "boundNodes",
    EXISTS(SELECT 1 FROM xera_host_identities k WHERE k.host_uuid=h.uuid) AS issued,
    EXISTS(SELECT 1 FROM xera_limit_scopes c WHERE c.kind='HOST' AND c.key=h.uuid::text) AS managed
    FROM hosts h LEFT JOIN config_profile_inbounds i ON i.uuid=h.config_profile_inbound_uuid`.execute(
                this.db.kysely,
            ),
            sql<PolicyTag>`
    SELECT tag,total_speed_limit_mbps AS "totalSpeed",traffic_multiplier AS "trafficMultiplier",user_traffic_limit_bytes::text AS "userLimit",speed_limit_mbps AS "userSpeed",device_speed_limit_mbps AS "deviceSpeed",reset_anchor_at AS anchor,
    reset_value AS "resetValue",reset_unit AS "resetUnit" FROM xera_host_tag_limits`.execute(
                this.db.kysely,
            ),
            !custom || options.identities === false
                ? Promise.resolve({ rows: [] as PolicyIdentity[] })
                : sql<PolicyIdentity>`SELECT a.*,u.expire_at AS "expireAt",i.raw_inbound,i.tag AS "inboundTag",i.profile_uuid AS "profileUuid"
    FROM (${identityAccessQuery(sql`SELECT k.user_id,k.host_uuid,k.host_uuid AS owner_uuid,k.host_uuid AS source_uuid,k.hwid,k.parent_vless_uuid AS parent
    FROM xera_host_identities k JOIN hosts h ON h.uuid=k.host_uuid JOIN config_profile_inbounds i ON i.uuid=h.config_profile_inbound_uuid
    WHERE 1=1 ${userId === undefined ? sql`` : sql`AND k.user_id=${userId}`}
    ${options.profileUuid === undefined ? sql`` : sql`AND i.profile_uuid=${options.profileUuid}::uuid`}
    ${nodeUuid === undefined ? sql`` : sql`AND EXISTS(SELECT 1 FROM config_profile_inbounds_to_nodes n WHERE n.config_profile_inbound_uuid=i.uuid AND n.node_uuid=${nodeUuid}::uuid)`}
    UNION ALL
    SELECT k.user_id,r.uuid,r.owner_host_uuid,r.source_host_uuid,k.hwid,k.parent_vless_uuid
    FROM xera_autoselect_identities k
      JOIN xera_autoselect_routes r ON r.uuid=k.route_uuid JOIN hosts h ON h.uuid=r.source_host_uuid
      JOIN config_profile_inbounds i ON i.uuid=h.config_profile_inbound_uuid
    WHERE 1=1 ${userId === undefined ? sql`` : sql`AND k.user_id=${userId}`}
    ${options.profileUuid === undefined ? sql`` : sql`AND i.profile_uuid=${options.profileUuid}::uuid`}
    ${nodeUuid === undefined ? sql`` : sql`AND EXISTS(SELECT 1 FROM config_profile_inbounds_to_nodes n WHERE n.config_profile_inbound_uuid=i.uuid AND n.node_uuid=${nodeUuid}::uuid)`}`)}) a
    JOIN users u ON u.id=a."userId"::bigint
    LEFT JOIN xera_autoselect_routes r ON r.uuid=a."hostUuid"
    JOIN hosts h ON h.uuid=COALESCE(r.source_host_uuid,a."hostUuid")
    JOIN config_profile_inbounds i ON i.uuid=h.config_profile_inbound_uuid`.execute(this.db.kysely),
            sql<AutoselectRoute>`SELECT uuid,owner_host_uuid AS "ownerUuid",source_host_uuid AS "sourceUuid"
                FROM xera_autoselect_routes WHERE source_host_uuid IS NOT NULL`.execute(
                this.db.kysely,
            ),
        ]);
        const legacyInboundIds = await this.legacyInbounds();
        const legacyRouteInbounds =
            this.compatibility.getStore()?.routed ??
            this.legacyInventory?.routed ??
            legacyInboundIds;
        const hostById = new Map(hosts.rows.map((host) => [host.uuid, host]));
        const policyHosts = attachAutoselectRoutes(
            hosts.rows,
            routes.rows.filter(
                (route) =>
                    !legacyRouteInbounds.has(hostById.get(route.ownerUuid)?.inboundUuid ?? '') &&
                    !legacyRouteInbounds.has(
                        hostById.get(route.sourceUuid ?? '')?.inboundUuid ?? '',
                    ),
            ),
        );
        const groups = buildPolicyGroups(
            policyHosts.filter((host) => !legacyInboundIds.has(host.inboundUuid ?? '')),
            tags.rows,
        );
        const protectedInboundIds = new Set(
            hosts.rows
                .filter(
                    (h) =>
                        h.issued ||
                        h.managed ||
                        h.alwaysAvailable ||
                        h.onlyWhenInactive ||
                        BigInt(h.userLimit ?? 0) > 0n ||
                        h.userSpeed ||
                        h.deviceSpeed ||
                        h.totalSpeed ||
                        (h.domains && h.domains.mode !== 'OFF') ||
                        ((h.useTagTrafficLimit !== false ||
                            h.useTagSpeedLimit !== false ||
                            h.useTagDeviceSpeedLimit !== false ||
                            h.useTagTotalSpeedLimit !== false) &&
                            tags.rows.some((t) => h.tags.includes(t.tag))),
                )
                .flatMap((h) =>
                    h.inboundUuid && !legacyInboundIds.has(h.inboundUuid) ? [h.inboundUuid] : [],
                ),
        );
        const snapshot: PolicySnapshot = {
            hosts: policyHosts,
            groups,
            identities: identities.rows,
            protectedInboundIds,
            legacyInboundIds,
        };
        if (userQuota) {
            if (!nodeUuid) throw new Error('Global quota snapshot requires a node');
            const [users, billing] = await Promise.all([
                sql<PolicyUser>`SELECT u.id::text AS "userId",u.status='ACTIVE' AND (u.expire_at AT TIME ZONE 'UTC')>now() AS allowed,
                    u.expire_at AS "expireAt",u.traffic_limit_bytes::text AS "limit" FROM users u WHERE
                    EXISTS(SELECT 1 FROM internal_squad_members m JOIN internal_squad_inbounds i ON i.internal_squad_uuid=m.internal_squad_uuid
                        JOIN config_profile_inbounds_to_nodes n ON n.config_profile_inbound_uuid=i.inbound_uuid
                        WHERE m.user_id=u.id AND n.node_uuid=${nodeUuid}::uuid)
                    OR EXISTS(SELECT 1 FROM xera_host_identities k JOIN hosts h ON h.uuid=k.host_uuid
                        JOIN config_profile_inbounds_to_nodes n ON n.config_profile_inbound_uuid=h.config_profile_inbound_uuid
                        WHERE k.user_id=u.id AND n.node_uuid=${nodeUuid}::uuid)
                    OR EXISTS(SELECT 1 FROM xera_autoselect_identities k JOIN xera_autoselect_routes r ON r.uuid=k.route_uuid
                        JOIN hosts h ON h.uuid=r.source_host_uuid JOIN config_profile_inbounds_to_nodes n
                          ON n.config_profile_inbound_uuid=h.config_profile_inbound_uuid
                        WHERE k.user_id=u.id AND n.node_uuid=${nodeUuid}::uuid)
                    ORDER BY u.id`.execute(this.db.kysely),
                sql<{
                    factor: string;
                }>`SELECT consumption_multiplier::text AS factor FROM nodes WHERE uuid=${nodeUuid}::uuid`.execute(
                    this.db.kysely,
                ),
            ]);
            snapshot.users = users.rows;
            snapshot.consumptionMultiplier = billing.rows[0]?.factor;
        }
        return snapshot;
    }
    async routedIdentitySupport(hostUuids: string[]): Promise<boolean | undefined> {
        if (this.xrayModes && !(await this.xrayModes.isCustom())) return false;
        if (!hostUuids.length) return undefined;
        const nodes = await sql<
            INodeConnectionOpts & { uuid: string }
        >`SELECT DISTINCT n.uuid,n.address,n.port,n.proxy_url AS "proxyUrl"
            FROM nodes n JOIN config_profile_inbounds_to_nodes b ON b.node_uuid=n.uuid
            JOIN hosts h ON h.config_profile_inbound_uuid=b.config_profile_inbound_uuid
            WHERE h.uuid=ANY(${hostUuids}::uuid[]) AND NOT n.is_disabled
              AND (NOT EXISTS(SELECT 1 FROM hosts_to_nodes hn WHERE hn.host_uuid=h.uuid)
                OR EXISTS(SELECT 1 FROM hosts_to_nodes hn WHERE hn.host_uuid=h.uuid AND hn.node_uuid=n.uuid))`.execute(
            this.db.kysely,
        );
        const values = await Promise.all(
            nodes.rows.map(async (node) => {
                const connection = createHash('sha256')
                    .update(JSON.stringify([node.address, node.port, node.proxyUrl]))
                    .digest('hex');
                return this.cache.get<HostPolicyCapabilities>(
                    `xera:host-policy:capabilities:v2:${node.uuid}:${connection}`,
                );
            }),
        );
        if (
            values.some(
                (value) =>
                    value?.native ||
                    (value?.version === HOST_POLICY_VERSION &&
                        value.supported === true &&
                        value.routedDeviceSpeedLimitsSupported !== true),
            )
        )
            return false;
        return values.length &&
            values.every(
                (value) =>
                    value?.supported === true && value.routedDeviceSpeedLimitsSupported === true,
            )
            ? true
            : undefined;
    }
    async syncNode(node: INodeConnectionOpts & { uuid: string }): Promise<void> {
        if (this.xrayModes && !(await this.xrayModes.isCustom())) return;
        if (this.transactions.isTransactionActive())
            return Promise.reject(
                new Error('Host policy synchronization must run after SQL commit'),
            );
        const snapshot = this.compatibility.getStore();
        const unavailable = snapshot?.unavailable.get(node.uuid);
        if (unavailable) return Promise.reject(unavailable);
        const key = JSON.stringify([
            node.uuid,
            node.address,
            node.port,
            node.proxyUrl,
            snapshot?.key,
        ]);
        let entry = this.nodeSynchronizations.get(key);
        if (!entry) {
            entry = { requested: 0, queued: false, waiters: [] };
            this.nodeSynchronizations.set(key, entry);
        }
        if (entry.waiters.length >= 1000)
            return Promise.reject(
                Object.assign(new Error('Host policy waiters are full'), {
                    code: 'HOST_POLICY_BUSY',
                }),
            );
        const current = entry;
        const promise = new Promise<void>((resolve, reject) => {
            current.waiters.push({ generation: ++current.requested, resolve, reject });
        });
        const schedule = () => {
            if (current.queued) return;
            current.queued = true;
            const queued = this.nodeWork.submit(() =>
                this.compatibility.run(snapshot, () =>
                    Promise.resolve().then(async () => {
                        const target = current.requested;
                        const deadline = Date.now() + 8000;
                        for (;;) {
                            try {
                                await this.applyNodePolicy(node);
                                return target;
                            } catch (error) {
                                if (
                                    !error ||
                                    typeof error !== 'object' ||
                                    !('code' in error) ||
                                    error.code !== 'HOST_POLICY_BUSY' ||
                                    Date.now() >= deadline
                                )
                                    throw error;
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 100 + Math.floor(Math.random() * 100)),
                                );
                            }
                        }
                    }),
                ),
            );
            const fail = (error: unknown) => {
                this.nodeSynchronizations.delete(key);
                for (const waiter of current.waiters.splice(0)) waiter.reject(error);
            };
            if (!queued) {
                fail(
                    Object.assign(
                        new Error('Host policy work queue is full; synchronization will retry'),
                        { code: 'HOST_POLICY_BUSY' },
                    ),
                );
                return;
            }
            void queued.then((target) => {
                const completed = current.waiters.filter((waiter) => waiter.generation <= target);
                current.waiters = current.waiters.filter((waiter) => waiter.generation > target);
                if (current.waiters.length) {
                    queueMicrotask(() => {
                        current.queued = false;
                        schedule();
                    });
                } else this.nodeSynchronizations.delete(key);
                for (const waiter of completed) waiter.resolve();
            }, fail);
        };
        schedule();
        return promise;
    }
    private async applyNodePolicy(
        node: INodeConnectionOpts & { uuid: string },
        registrationPass = 0,
    ): Promise<void> {
        if (this.xrayModes && !(await this.xrayModes.isCustom())) return;
        if (this.transactions.isTransactionActive())
            throw new Error('Host policy synchronization must run after SQL commit');
        // Legacy nodes still need a lock held through delivery. Revision-aware
        // nodes can acknowledge only after the independently committed revision.
        const started = performance.now();
        let lockedAt = started,
            networkMs = 0;
        let lockRequestedAt = started,
            txEnded = started,
            networkAtLock = 0,
            networkAtEnd = 0;
        const sendPolicy = async <T>(data?: unknown, recoveryProof?: string) => {
            const sentAt = performance.now();
            try {
                return await this.axios.hostPolicy<T>(node, data, recoveryProof);
            } finally {
                networkMs += performance.now() - sentAt;
            }
        };
        const connection = createHash('sha256')
            .update(JSON.stringify([node.address, node.port, node.proxyUrl]))
            .digest('hex');
        const capabilityKey = `xera:host-policy:capabilities:v2:${node.uuid}:${connection}`;
        try {
            let quotaMode = await quotaNodeMode(this.db, node.uuid);
            let quotaSource = '';
            const capabilities = await this.discoverCapabilities(node, !!quotaMode, (duration) => {
                networkMs += duration;
            });
            const nativeNode = capabilities.native === true;
            const expected = this.compatibility.getStore()?.capabilities.get(node.uuid);
            if (
                expected &&
                (expected.connection !== connection ||
                    (expected.value.native === true) !== nativeNode ||
                    expected.value.supported !== capabilities.supported ||
                    expected.value.version !== capabilities.version ||
                    expected.value.routedDeviceSpeedLimitsSupported !==
                        capabilities.routedDeviceSpeedLimitsSupported)
            )
                throw new Error(
                    `Node ${node.uuid}: host policy compatibility changed after discovery`,
                );
            await this.cache.set(
                `remnacust:node-compatibility:${node.uuid}`,
                nativeNode
                    ? '[NODE_NATIVE_COMPATIBILITY]'
                    : capabilities?.supported === true &&
                        capabilities.routedDeviceSpeedLimitsSupported !== true
                      ? '[NODE_LEGACY_AUTOSELECT]'
                      : null,
                120,
            );
            if (capabilities?.offlineReserves && !quotaMode)
                throw Object.assign(
                    new Error(
                        `Node ${node.uuid}: autonomous quota policy requires the quota coordinator; a legacy replacement was refused`,
                    ),
                    { code: 'QUOTA_COORDINATION_REQUIRED' },
                );
            const revisionAware = capabilities?.policyRevisionsSupported === true;
            const seenRevision = capabilities?.policyRevision ?? '0';
            if (
                revisionAware &&
                (typeof seenRevision !== 'string' ||
                    !/^(0|[1-9][0-9]{0,18})$/.test(seenRevision) ||
                    BigInt(seenRevision) > 9223372036854775807n)
            )
                throw new Error(`Node ${node.uuid}: invalid saved policy revision`);
            const recoveryProof = recoveryPolicyTransportProof(capabilities ?? {});
            const deliver = async (body: unknown) => {
                try {
                    const result = await sendPolicy<{
                        version?: string;
                        applied?: boolean;
                        staged?: boolean;
                        userQuotaRequired?: boolean;
                    }>(body, recoveryProof);
                    if (
                        !result.isOk ||
                        result.response.version !== HOST_POLICY_VERSION ||
                        !(result.response.applied || result.response.staged)
                    ) {
                        throw Object.assign(
                            new Error(
                                `Node ${node.uuid}: требуется нода и Xray с изоляцией хостов v2`,
                            ),
                            { code: 'HOST_POLICY_NOT_APPLIED' },
                        );
                    }
                    return result.response;
                } catch (error) {
                    await (
                        capabilities && typeof capabilities === 'object'
                            ? this.cache.set(
                                  capabilityKey,
                                  { ...capabilities, checkedAt: 0 },
                                  86400,
                              )
                            : this.cache.del(capabilityKey)
                    ).catch(() => undefined);
                    throw error;
                }
            };
            lockRequestedAt = performance.now();
            const prepared = await this.transactions
                .withTransaction({ timeout: 30000 }, async () => {
                    const tx = this.db.kysely;
                    const ownership = await sql<{
                        acquired: boolean;
                    }>`SELECT pg_try_advisory_xact_lock(hashtextextended(${node.uuid},20260927)) AS acquired`.execute(
                        tx,
                    );
                    if (ownership.rows[0]?.acquired !== true)
                        throw Object.assign(
                            new Error(
                                `Node ${node.uuid}: host policy synchronization is already running`,
                            ),
                            { code: 'HOST_POLICY_BUSY' },
                        );
                    lockedAt = performance.now();
                    networkAtLock = networkMs;
                    // Receipt commits take this row before per-scope billing
                    // locks. Desired-policy preparation follows the same order.
                    await sql`SELECT 1 FROM xera_quota_node_modes WHERE node_uuid=${node.uuid}::uuid FOR UPDATE`.execute(
                        tx,
                    );
                    // Recheck under the node lock: a coordinator may have begun
                    // fencing while the capability request was in flight.
                    quotaMode = await quotaNodeMode(this.db, node.uuid);
                    if (
                        quotaMode &&
                        (!capabilities?.quotaReservesSupported ||
                            !capabilities.quotaFencesSupported ||
                            !capabilities.unreservedUsageSupported ||
                            !revisionAware)
                    )
                        throw new Error(
                            `Node ${node.uuid}: update node and core before autonomous quota activation`,
                        );
                    if (!quotaMode && capabilities?.offlineReserves)
                        throw new Error(
                            `Node ${node.uuid}: quota coordinator state must be recovered`,
                        );
                    if (
                        quotaMode?.phase === 'ACTIVE' &&
                        capabilities?.quotaInstanceId !== quotaMode.instance
                    )
                        throw new Error(
                            `Node ${node.uuid}: quota state identity changed; previous credit remains reserved`,
                        );
                    if (
                        quotaMode?.userQuota &&
                        (!capabilities?.userQuotaReservesSupported ||
                            !capabilities.usageReceiptsSupported ||
                            !capabilities.coreIncarnationSupported)
                    )
                        throw new Error(
                            `Node ${node.uuid}: global quotas require native reserves and durable usage receipts`,
                        );
                    const deferredIdentities =
                        nativeNode || !capabilities?.routedDeviceSpeedLimitsSupported;
                    let state = await this.scopes(undefined, node.uuid, quotaMode?.userQuota, {
                        identities: !deferredIdentities,
                    });
                    if (!capabilities?.routedDeviceSpeedLimitsSupported)
                        state = legacyAutoselectPolicy(state);
                    const protectedHosts = state.hosts.filter(
                        (h) =>
                            h.inboundUuid &&
                            (h.quotaHostUuid || state.protectedInboundIds.has(h.inboundUuid)) &&
                            h.boundNodes.includes(node.uuid),
                    );
                    if (nativeNode && !quotaMode) {
                        const groups = state.groups.filter((group) =>
                            group.nodeUuids.includes(node.uuid),
                        );
                        const required =
                            protectedHosts.some(
                                (host) =>
                                    host.alwaysAvailable ||
                                    host.onlyWhenInactive ||
                                    (host.domains && host.domains.mode !== 'OFF'),
                            ) ||
                            groups.some(
                                (group) =>
                                    BigInt(group.userLimit ?? 0) > 0n ||
                                    (group.userSpeed ?? 0) > 0 ||
                                    (group.deviceSpeed ?? 0) > 0 ||
                                    (group.totalSpeed ?? 0) > 0 ||
                                    group.trafficMultiplier !== 1,
                            );
                        const keys = groups
                            .map((group) => group.key)
                            .filter((key) => key.startsWith('host:') || key.startsWith('tag:'));
                        const controls = keys.length
                            ? await sql`SELECT 1 FROM xera_limit_scopes s
                            WHERE (lower(s.kind)||':'||s.key)=ANY(${keys}::text[]) AND s.paused
                            UNION ALL SELECT 1 FROM xera_limit_user_adjustments a
                            WHERE (lower(a.kind)||':'||a.key)=ANY(${keys}::text[]) AND a.paused LIMIT 1`.execute(
                                  tx,
                              )
                            : { rows: [] };
                        if (!required && !controls.rows.length) return;
                        throw Object.assign(
                            new Error(
                                `Node ${node.uuid}: configured host restrictions require host-policy-v2 support`,
                            ),
                            { code: 'HOST_POLICY_NOT_APPLIED' },
                        );
                    }
                    if (!protectedHosts.length) {
                        if (
                            !capabilities?.supported ||
                            capabilities.version !== HOST_POLICY_VERSION
                        )
                            return;
                    }
                    if (
                        state.groups.some(
                            (group) =>
                                group.nodeUuids.includes(node.uuid) && (group.deviceSpeed ?? 0) > 0,
                        ) &&
                        !capabilities?.deviceSpeedLimitsSupported
                    ) {
                        throw new Error(
                            `Node ${node.uuid}: update node and core before applying device speed limits`,
                        );
                    }
                    if (deferredIdentities) {
                        state = await this.scopes(undefined, node.uuid, quotaMode?.userQuota);
                        if (!capabilities?.routedDeviceSpeedLimitsSupported)
                            state = legacyAutoselectPolicy(state);
                    }
                    const nodeGroups = state.groups.filter((g) => g.nodeUuids.includes(node.uuid));
                    const scopeKeys = nodeGroups
                        .filter((g) => g.key.startsWith('host:') || g.key.startsWith('tag:'))
                        .map((g) => g.key);
                    const controls = scopeKeys.length
                        ? await sql<{ scope: string; userId: string | null }>`
                            SELECT lower(kind)||':'||key AS scope,NULL::text AS "userId"
                            FROM xera_limit_scopes
                            WHERE lower(kind)||':'||key=ANY(${scopeKeys}::text[]) AND paused
                            UNION ALL
                            SELECT lower(kind)||':'||key AS scope,user_id::text AS "userId"
                            FROM xera_limit_user_adjustments
                            WHERE lower(kind)||':'||key=ANY(${scopeKeys}::text[]) AND paused
                        `.execute(this.db.kysely)
                        : { rows: [] };
                    const pausedScopes = new Set<string>();
                    const pausedUsers = new Map<string, string[]>();
                    for (const row of controls.rows) {
                        if (row.userId === null) pausedScopes.add(row.scope);
                        else
                            pausedUsers.set(row.scope, [
                                ...(pausedUsers.get(row.scope) ?? []),
                                row.userId,
                            ]);
                    }
                    const groups: Record<string, unknown> = {};
                    for (const group of nodeGroups) {
                        const kind = group.key.startsWith('host:')
                            ? 'HOST'
                            : group.key.startsWith('tag:')
                              ? 'TAG'
                              : null;
                        const key = kind === 'HOST' ? group.key.slice(5) : group.key.slice(4);
                        let blockAll = pausedScopes.has(group.key);
                        let blockedOwners: Record<string, boolean> = {};
                        if (!quotaMode && BigInt(group.userLimit ?? 0) > 0n) {
                            const usage = await sql<{
                                userId: string;
                                used: string;
                                effectiveLimit: string;
                            }>`
                      WITH owners AS (
                        SELECT DISTINCT user_id FROM xera_host_quota_usage WHERE host_uuid IN (${sql.join(group.hostUuids.map((id) => sql`${id}::uuid`))})
                        UNION SELECT user_id FROM xera_legacy_tag_quota_usage WHERE ${kind}='TAG' AND tag=${key}
                        UNION SELECT user_id FROM xera_limit_user_adjustments WHERE kind=${kind} AND key=${key}
                      )
                      SELECT u.user_id::text AS "userId",q.used_bytes::text AS used,q.effective_limit::text AS "effectiveLimit"
                      FROM owners u CROSS JOIN LATERAL xera_limit_state(${kind},${key},u.user_id) q
                    `.execute(this.db.kysely);
                            blockedOwners = Object.fromEntries(
                                usage.rows
                                    .filter(
                                        (r) =>
                                            BigInt(r.effectiveLimit) > 0n &&
                                            BigInt(r.used) >= BigInt(r.effectiveLimit),
                                    )
                                    .map((r) => [r.userId, true]),
                            );
                            const fresh = await Promise.all(
                                group.nodeUuids.map((id) =>
                                    this.cache.get(`xera:host-policy:stats:${id}`),
                                ),
                            );
                            blockAll ||= fresh.some((v) => !v);
                        }
                        for (const userId of pausedUsers.get(group.key) ?? [])
                            blockedOwners[userId] = true;
                        const divide = (speed: number | null) =>
                            speed
                                ? Math.max(1, Math.floor((speed * 125000) / group.nodeUuids.length))
                                : 0;
                        groups[group.key] = {
                            bytesPerSecond: divide(group.userSpeed),
                            ...((group.deviceSpeed ?? 0) > 0
                                ? { deviceBytesPerSecond: divide(group.deviceSpeed ?? null) }
                                : {}),
                            totalBytesPerSecond: divide(group.totalSpeed),
                            blockAll,
                            blockedOwners,
                        };
                    }
                    const hosts: Record<string, unknown> = {};
                    for (const h of protectedHosts) {
                        const selected = !h.nodes.length || h.nodes.includes(node.uuid);
                        hosts[h.uuid.replaceAll('-', '')] = {
                            inboundTag: h.inboundTag,
                            allowedIdentities: Object.fromEntries(
                                state.identities
                                    .filter((k) => selected && k.hostUuid === h.uuid && k.allowed)
                                    .map((k) => [this.keys(k).username, true]),
                            ),
                            groups: state.groups
                                .filter(
                                    (g) =>
                                        g.hostUuids.includes(h.uuid) &&
                                        g.nodeUuids.includes(node.uuid),
                                )
                                .map((g) => g.key),
                            domainMode: h.domains?.mode ?? 'OFF',
                            domains:
                                h.domains && h.domains.mode !== 'OFF'
                                    ? h.domains.domains.map(normalizePolicyDomain)
                                    : [],
                        };
                    }
                    const destinationHosts = Object.values(hosts)
                        .map(
                            (value) =>
                                value as {
                                    domainMode: string;
                                    domains: string[];
                                    allowedIdentities: Record<string, boolean>;
                                },
                        )
                        .filter(
                            (host) =>
                                host.domainMode !== 'OFF' && host.domains.some(isIpDestinationRule),
                        );
                    if (destinationHosts.length) {
                        if (!capabilities?.destinationRulesSupported) {
                            // A newly attached or downgraded old node must never silently ignore IP rules.
                            for (const host of destinationHosts) {
                                host.allowedIdentities = {};
                                host.domainMode = 'ALLOW_ONLY';
                                host.domains = [];
                            }
                            this.logger.error(
                                `Node ${node.uuid}: IP/CIDR hosts blocked until the node and core are updated`,
                            );
                        }
                    }
                    const body = {
                        version: HOST_POLICY_VERSION,
                        ...(protectedHosts.some((host) => host.quotaHostUuid)
                            ? { routedIdentities: true }
                            : {}),
                        protectedInbounds: [
                            ...new Set(
                                protectedHosts
                                    .filter((h) => state.protectedInboundIds.has(h.inboundUuid!))
                                    .map((h) => h.inboundTag),
                            ),
                        ],
                        hosts,
                        groups,
                    };
                    if (revisionAware) {
                        const revision = await sql<{
                            revision: string;
                        }>`SELECT xera_next_host_policy_revision(${node.uuid}::uuid,${seenRevision}::bigint)::text AS revision`.execute(
                            tx,
                        );
                        if (quotaMode)
                            await renderQuotaPolicy(
                                this.db,
                                node.uuid,
                                quotaMode,
                                state,
                                body as unknown as QuotaPolicyBody,
                                revision.rows[0].revision,
                                (identity) => this.keys(identity).username,
                            );
                        if (quotaMode) {
                            await sql`SELECT 1 FROM xera_assert_quota_restore_reconciled()`.execute(
                                tx,
                            );
                            await renderQuotaRegistrations(
                                this.db,
                                node.uuid,
                                body as unknown as QuotaPolicyBody,
                                revision.rows[0].revision,
                                capabilities?.quotaRegistrationsSupported === true,
                            );
                            await renderQuotaCheckpoint(
                                this.db,
                                node.uuid,
                                quotaMode,
                                body as unknown as QuotaPolicyBody,
                                capabilities,
                            );
                            quotaSource = quotaSourceFingerprint(state, node.uuid);
                            const proof = quotaPolicyProof(body as unknown as QuotaPolicyBody);
                            await sql`UPDATE xera_quota_node_modes SET
                                desired_policy=CASE WHEN desired_source IS DISTINCT FROM ${proof.source} OR desired_policy IS NULL
                                    THEN ${JSON.stringify(proof.proof)}::jsonb ELSE desired_policy END,
                                desired_source=${proof.source},desired_revision=${revision.rows[0].revision}::bigint
                                WHERE node_uuid=${node.uuid}::uuid`.execute(tx);
                            await sql`SELECT xera_record_quota_exposure_intent(${node.uuid}::uuid,
                                ${capabilities?.coreProcessId ?? null}::uuid,${capabilities?.quotaInstanceId ?? null}::uuid,
                                ${revision.rows[0].revision}::bigint,${JSON.stringify(proof.proof)}::jsonb)`.execute(
                                tx,
                            );
                        }
                        return { ...body, revision: revision.rows[0].revision };
                    }
                    await deliver(body);
                })
                .finally(() => {
                    txEnded = performance.now();
                    networkAtEnd = networkMs;
                });
            if (prepared) {
                const acknowledgement = await deliver(prepared);
                if (
                    quotaMode?.userQuota &&
                    acknowledgement.applied &&
                    acknowledgement.userQuotaRequired !== true
                )
                    throw new Error(
                        `Node ${node.uuid}: mandatory global quota checkpoint is not acknowledged`,
                    );
                if (quotaMode && acknowledgement.applied) {
                    // A fresh status binds the ACK to the live process, journal
                    // and revision, including ACTIVE updates and lost responses.
                    const status = await sendPolicy<
                        HostPolicyCapabilities & { applied?: boolean }
                    >();
                    const instance = status.isOk ? status.response.quotaInstanceId : null;
                    const coreProcessId =
                        status.isOk && status.response.coreIncarnationSupported
                            ? status.response.coreProcessId
                            : null;
                    const validIdentity = (value: unknown): value is string =>
                        typeof value === 'string' &&
                        /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
                            value,
                        );
                    if (
                        !status.isOk ||
                        !status.response.applied ||
                        !status.response.unreservedUsageSupported ||
                        (quotaMode.userQuota && status.response.userQuotaRequired !== true) ||
                        status.response.policyRevision !== prepared.revision ||
                        !validIdentity(instance) ||
                        !validIdentity(coreProcessId) ||
                        (quotaMode.instance !== null && quotaMode.instance !== instance)
                    )
                        throw new Error(
                            `Node ${node.uuid}: quota policy acknowledgement is incomplete or its instance changed`,
                        );
                    const proof = quotaPolicyProof(prepared as unknown as QuotaPolicyBody);
                    const registrations =
                        (prepared as unknown as QuotaPolicyBody).registrations ?? [];
                    let registrationReport: ReturnType<typeof verifyQuotaRegistrations> | undefined;
                    if (registrations.length) {
                        if (!status.response.quotaRegistrationsSupported)
                            throw new Error(
                                'The running core did not acknowledge registered quota support',
                            );
                        const result = await this.axios.hostQuotaState<unknown>(node, {
                            ids: registrations.map((item) => item.grant.id),
                        });
                        if (!result.isOk)
                            throw new Error(
                                'Quota registration journal acknowledgement unavailable',
                            );
                        registrationReport = verifyQuotaRegistrations(
                            result.response,
                            registrations,
                            prepared.revision,
                            instance,
                        );
                    }
                    await this.transactions.withTransaction({ timeout: 30000 }, async () => {
                        await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${node.uuid},20260927))`.execute(
                            this.db.kysely,
                        );
                        const current =
                            await sql`SELECT 1 FROM xera_quota_node_modes WHERE node_uuid=${node.uuid}::uuid
                            AND desired_revision=${prepared.revision}::bigint AND desired_source=${proof.source}
                            AND phase=${quotaMode.phase}
                            AND (instance_uuid IS NULL OR instance_uuid=${instance}::uuid) FOR UPDATE`.execute(
                                this.db.kysely,
                            );
                        if (!current.rows.length)
                            throw new Error(
                                `Node ${node.uuid}: quota acknowledgement was superseded; retry delivery`,
                            );
                        if (registrationReport)
                            await observeQuotaCheckpoint(
                                this.db,
                                node.uuid,
                                instance,
                                registrationReport.sequence,
                                registrationReport.policyRevision,
                            );
                        if (registrationReport)
                            await acknowledgeQuotaRegistrations(
                                this.db,
                                node.uuid,
                                registrations,
                                registrationReport,
                            );
                        await sql`SELECT xera_ack_quota_exposure_policy(${node.uuid}::uuid,${coreProcessId}::uuid,
                            ${instance}::uuid,${prepared.revision}::bigint,${JSON.stringify(proof.proof)}::jsonb)`.execute(
                            this.db.kysely,
                        );
                        if (quotaMode.phase === 'ACTIVE') {
                            await sql`SELECT xera_ack_quota_epoch(${node.uuid}::uuid,${instance}::uuid,
                                ${prepared.revision}::bigint)`.execute(this.db.kysely);
                        } else {
                            await sql`UPDATE xera_quota_node_modes SET instance_uuid=${instance}::uuid,
                                fenced_at=CASE WHEN fenced_source=${quotaSource} AND fenced_core IS NOT DISTINCT FROM ${coreProcessId}::uuid
                                    THEN fenced_at ELSE clock_timestamp() END,
                                fenced_core=${coreProcessId}::uuid,
                                fenced_source=${quotaSource},fenced_revision=${prepared.revision}::bigint
                                WHERE node_uuid=${node.uuid}::uuid AND phase='FENCING'
                                  AND (fenced_revision IS NULL OR fenced_revision<=${prepared.revision}::bigint)`.execute(
                                this.db.kysely,
                            );
                        }
                        await sql`UPDATE xera_quota_node_modes SET
                            applied_at=CASE WHEN applied_source=${proof.source} AND applied_core=${coreProcessId}::uuid
                                THEN COALESCE(applied_at,clock_timestamp()) ELSE clock_timestamp() END,
                            applied_policy=CASE WHEN applied_source IS DISTINCT FROM ${proof.source} OR applied_policy IS NULL
                                THEN desired_policy ELSE applied_policy END,
                            applied_source=${proof.source},applied_core=${coreProcessId}::uuid,applied_revision=${prepared.revision}::bigint
                            WHERE node_uuid=${node.uuid}::uuid`.execute(this.db.kysely);
                    });
                    if (registrations.length) {
                        if (registrationPass >= 3)
                            throw Object.assign(
                                new Error('Quota registration batch is pending; retry delivery'),
                                { code: 'QUOTA_REGISTRATION_PENDING' },
                            );
                        await this.applyNodePolicy(node, registrationPass + 1);
                    }
                }
            }
            if (
                !nativeNode &&
                capabilities.version === HOST_POLICY_VERSION &&
                capabilities.supported === true &&
                capabilities.routedDeviceSpeedLimitsSupported === true
            ) {
                try {
                    await sql`UPDATE nodes SET last_status_message=NULL,last_status_change=clock_timestamp()
                        WHERE uuid=${node.uuid}::uuid AND NOT is_disabled
                          AND address=${node.address} AND port IS NOT DISTINCT FROM ${node.port}
                          AND proxy_url IS NOT DISTINCT FROM ${node.proxyUrl ?? null}
                          AND last_status_message='[NODE_LEGACY_AUTOSELECT]'`.execute(
                        this.db.kysely,
                    );
                } catch {
                    this.logger.warn(
                        `Node ${node.uuid}: compatibility notice could not be cleared`,
                    );
                }
            }
        } finally {
            const elapsed = performance.now() - started;
            if (process.env.XERA_SYNC_DIAGNOSTICS === 'true' || elapsed >= 1000)
                this.logger.log(
                    `Host policy node=${node.uuid} lockWaitMs=${Math.max(0, Math.round(lockedAt - lockRequestedAt))} sqlAndComputeMs=${Math.max(0, Math.round(txEnded - lockedAt - (networkAtEnd - networkAtLock)))} networkMs=${Math.round(networkMs)} totalMs=${Math.round(elapsed)}`,
                );
        }
    }
    requestSync(): void {
        // SQL is the durable desired state. A process exit before delivery is
        // recovered by the scheduler; the saved action never waits for a fleet.
        void this.syncConnected().catch((error) => this.logger.error(String(error)));
    }
    syncConnected(): Promise<void> {
        if (this.connectedSynchronization) {
            // A mutation may arrive after its node was already processed.
            // Coalesce requests, retaining one follow-up pass for that change.
            this.synchronizeAgain = true;
            return this.connectedSynchronization;
        }
        this.connectedSynchronization = Promise.resolve().then(async () => {
            try {
                do {
                    this.synchronizeAgain = false;
                    await this.synchronizeConnectedNodes();
                } while (this.synchronizeAgain);
            } finally {
                // Clear in the same microtask as the last dirty check. A later
                // request then starts work rather than joining a finished pass.
                this.connectedSynchronization = null;
            }
        });
        return this.connectedSynchronization;
    }
    private async synchronizeConnectedNodes(): Promise<void> {
        const nodes = await this.db.kysely
            .selectFrom('nodes')
            .select(['uuid', 'address', 'port', 'proxyUrl'])
            .where('isDisabled', '=', false)
            .where('isConnected', '=', true)
            .execute();
        for (let i = 0; i < nodes.length; i += 8)
            await Promise.all(
                nodes.slice(i, i + 8).map(async (n) => {
                    try {
                        await this.syncNode(n);
                    } catch (e) {
                        this.logger.error(String(e));
                    }
                }),
            );
    }
}
