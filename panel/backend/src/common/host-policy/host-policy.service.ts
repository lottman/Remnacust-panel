import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';

import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { TxKyselyService } from '@common/database';
import { RawCacheService } from '@common/raw-cache';
import { hostCredentials } from '@common/utils/host-identity';

import {
    normalizeDestinationRule as normalizePolicyDomain,
    isIpDestinationRule,
} from './destination-rule';
import { buildPolicyGroups } from './host-policy-scopes';
import { PolicyHost, PolicyIdentity, PolicyTag, PolicySnapshot } from './host-policy.types';

export const HOST_POLICY_VERSION = 'xera-host-policy-v2';
export { normalizeDestinationRule as normalizePolicyDomain } from './destination-rule';
@Injectable()
export class HostPolicyService {
    private readonly logger = new Logger(HostPolicyService.name);
    private readonly secret: string;
    constructor(
        private readonly db: TxKyselyService,
        private readonly axios: AxiosService,
        private readonly cache: RawCacheService,
        @Inject(forwardRef(() => TypedConfigService)) config: TypedConfigService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
    ) {
        this.secret = config.getOrThrow('APP_SECRET');
    }
    keys(row: Pick<PolicyIdentity, 'userId' | 'hostUuid' | 'hwid' | 'parent'>) {
        return hostCredentials(this.secret, BigInt(row.userId), row.hostUuid, row.hwid, row.parent);
    }
    async scopes(userId?: bigint, nodeUuid?: string): Promise<PolicySnapshot> {
        const [hosts, tags, identities] = await Promise.all([
            sql<PolicyHost>`SELECT h.uuid,h.tags,h.config_profile_inbound_uuid AS "inboundUuid",i.tag AS "inboundTag",i.profile_uuid AS "profileUuid",
    h.always_available AS "alwaysAvailable",h.only_when_inactive AS "onlyWhenInactive",
    h.user_traffic_limit_bytes::text AS "userLimit",h.traffic_multiplier AS "trafficMultiplier",
    h.server_speed_limit_mbps AS "userSpeed",h.total_speed_limit_mbps AS "totalSpeed",
    h.use_tag_traffic_limit AS "useTagTrafficLimit",h.use_tag_speed_limit AS "useTagSpeedLimit",h.use_tag_total_speed_limit AS "useTagTotalSpeedLimit",
    h.traffic_limit_reset_anchor_at AS anchor,h.traffic_limit_reset_value AS "resetValue",h.traffic_limit_reset_unit AS "resetUnit",h.domain_rules AS domains,
    COALESCE((SELECT json_agg(n.node_uuid) FROM hosts_to_nodes n WHERE n.host_uuid=h.uuid),'[]') AS nodes,
    COALESCE((SELECT json_agg(n.node_uuid) FROM config_profile_inbounds_to_nodes n WHERE n.config_profile_inbound_uuid=h.config_profile_inbound_uuid),'[]') AS "boundNodes",
    EXISTS(SELECT 1 FROM xera_host_identities k WHERE k.host_uuid=h.uuid) AS issued,
    EXISTS(SELECT 1 FROM xera_limit_scopes c WHERE c.kind='HOST' AND c.key=h.uuid::text) AS managed
    FROM hosts h LEFT JOIN config_profile_inbounds i ON i.uuid=h.config_profile_inbound_uuid`.execute(
                this.db.kysely,
            ),
            sql<PolicyTag>`
    SELECT tag,total_speed_limit_mbps AS "totalSpeed",traffic_multiplier AS "trafficMultiplier",user_traffic_limit_bytes::text AS "userLimit",speed_limit_mbps AS "userSpeed",reset_anchor_at AS anchor,
    reset_value AS "resetValue",reset_unit AS "resetUnit" FROM xera_host_tag_limits`.execute(
                this.db.kysely,
            ),
            sql<PolicyIdentity>`SELECT k.user_id::text AS "userId",k.host_uuid AS "hostUuid",k.hwid,k.parent_vless_uuid AS parent,
    xera_host_identity_allowed(k.user_id,k.host_uuid,k.hwid,k.parent_vless_uuid) AS allowed,
    i.raw_inbound,i.tag AS "inboundTag",i.profile_uuid AS "profileUuid"
    FROM xera_host_identities k JOIN hosts h ON h.uuid=k.host_uuid JOIN config_profile_inbounds i ON i.uuid=h.config_profile_inbound_uuid
    WHERE 1=1 ${userId === undefined ? sql`` : sql`AND k.user_id=${userId}`}
    ${nodeUuid === undefined ? sql`` : sql`AND EXISTS(SELECT 1 FROM config_profile_inbounds_to_nodes n WHERE n.config_profile_inbound_uuid=i.uuid AND n.node_uuid=${nodeUuid}::uuid)`}`.execute(
                this.db.kysely,
            ),
        ]);
        const groups = buildPolicyGroups(hosts.rows, tags.rows);
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
                        h.totalSpeed ||
                        (h.domains && h.domains.mode !== 'OFF') ||
                        ((h.useTagTrafficLimit !== false ||
                            h.useTagSpeedLimit !== false ||
                            h.useTagTotalSpeedLimit !== false) &&
                            tags.rows.some((t) => h.tags.includes(t.tag))),
                )
                .flatMap((h) => (h.inboundUuid ? [h.inboundUuid] : [])),
        );
        return { hosts: hosts.rows, groups, identities: identities.rows, protectedInboundIds };
    }
    async syncNode(node: INodeConnectionOpts & { uuid: string }): Promise<void> {
        // Keep cross-worker ordering until nodes support a fencing token for out-of-order writes.
        const started = performance.now();
        let lockedAt = started,
            networkMs = 0;
        const sendPolicy = async <T>(data?: unknown) => {
            const sentAt = performance.now();
            try {
                return await this.axios.hostPolicy<T>(node, data);
            } finally {
                networkMs += performance.now() - sentAt;
            }
        };
        try {
            await this.transactions.withTransaction({ timeout: 30000 }, async () => {
                const tx = this.db.kysely;
                await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${node.uuid},20260927))`.execute(
                    tx,
                );
                lockedAt = performance.now();
                const state = await this.scopes(undefined, node.uuid);
                const protectedHosts = state.hosts.filter(
                    (h) =>
                        h.inboundUuid &&
                        state.protectedInboundIds.has(h.inboundUuid) &&
                        h.boundNodes.includes(node.uuid),
                );
                if (!protectedHosts.length) {
                    const status = await sendPolicy<{
                        version?: string;
                        supported?: boolean;
                    }>();
                    if (
                        !status.isOk ||
                        !status.response.supported ||
                        status.response.version !== HOST_POLICY_VERSION
                    )
                        return;
                }
                const groups: Record<string, unknown> = {};
                for (const group of state.groups.filter((g) => g.nodeUuids.includes(node.uuid))) {
                    const kind = group.key.startsWith('host:')
                        ? 'HOST'
                        : group.key.startsWith('tag:')
                          ? 'TAG'
                          : null;
                    const key = kind === 'HOST' ? group.key.slice(5) : group.key.slice(4);
                    const control = kind
                        ? await sql<{
                              paused: boolean;
                          }>`SELECT paused FROM xera_limit_scopes WHERE kind=${kind} AND key=${key}`.execute(
                              this.db.kysely,
                          )
                        : null;
                    let blockAll = control?.rows[0]?.paused ?? false;
                    let blockedOwners: Record<string, boolean> = {};
                    if (BigInt(group.userLimit ?? 0) > 0n) {
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
                    if (kind) {
                        const paused = await sql<{
                            userId: string;
                        }>`SELECT user_id::text AS "userId" FROM xera_limit_user_adjustments WHERE kind=${kind} AND key=${key} AND paused`.execute(
                            this.db.kysely,
                        );
                        for (const row of paused.rows) blockedOwners[row.userId] = true;
                    }
                    const divide = (speed: number | null) =>
                        speed
                            ? Math.max(1, Math.floor((speed * 125000) / group.nodeUuids.length))
                            : 0;
                    groups[group.key] = {
                        bytesPerSecond: divide(group.userSpeed),
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
                                    g.hostUuids.includes(h.uuid) && g.nodeUuids.includes(node.uuid),
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
                    const capabilities = await sendPolicy<{
                        destinationRulesSupported?: boolean;
                    }>();
                    if (!capabilities.isOk || !capabilities.response.destinationRulesSupported) {
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
                const result = await sendPolicy<{
                    version?: string;
                    applied?: boolean;
                    staged?: boolean;
                }>({
                    version: HOST_POLICY_VERSION,
                    protectedInbounds: [...new Set(protectedHosts.map((h) => h.inboundTag))],
                    hosts,
                    groups,
                });
                if (
                    !result.isOk ||
                    result.response.version !== HOST_POLICY_VERSION ||
                    !(result.response.applied || result.response.staged)
                )
                    throw Object.assign(new Error(
                        `Node ${node.uuid}: требуется нода и Xray с изоляцией хостов v2`,
                    ), { code: 'HOST_POLICY_NOT_APPLIED' });
            });
        } finally {
            const elapsed = performance.now() - started;
            if (process.env.XERA_SYNC_DIAGNOSTICS === 'true' || elapsed >= 1000)
                this.logger.log(
                    `Host policy node=${node.uuid} lockWaitMs=${Math.round(lockedAt - started)} sqlAndComputeMs=${Math.round(performance.now() - lockedAt - networkMs)} networkMs=${Math.round(networkMs)} totalMs=${Math.round(elapsed)}`,
                );
        }
    }
    async syncConnected(): Promise<void> {
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
