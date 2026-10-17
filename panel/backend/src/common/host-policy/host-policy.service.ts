import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';

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
import {
    PolicyHost,
    PolicyIdentity,
    PolicyTag,
    PolicySnapshot,
    PolicyUser,
} from './host-policy.types';
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
type HostPolicyCapabilities = {
    version?: string;
    supported?: boolean;
    destinationRulesSupported?: boolean;
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
export { normalizeDestinationRule as normalizePolicyDomain } from './destination-rule';
@Injectable()
export class HostPolicyService {
    private readonly logger = new Logger(HostPolicyService.name);
    private readonly secret: string;
    private connectedSynchronization: Promise<void> | null = null;
    private synchronizeAgain = false;
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
    async scopes(userId?: bigint, nodeUuid?: string, userQuota = false): Promise<PolicySnapshot> {
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
            sql<PolicyIdentity>`SELECT k.user_id::text AS "userId",u.expire_at AS "expireAt",k.host_uuid AS "hostUuid",k.hwid,k.parent_vless_uuid AS parent,
    xera_host_identity_allowed(k.user_id,k.host_uuid,k.hwid,k.parent_vless_uuid) AS allowed,
    i.raw_inbound,i.tag AS "inboundTag",i.profile_uuid AS "profileUuid"
    FROM xera_host_identities k JOIN users u ON u.id=k.user_id JOIN hosts h ON h.uuid=k.host_uuid JOIN config_profile_inbounds i ON i.uuid=h.config_profile_inbound_uuid
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
        const snapshot: PolicySnapshot = {
            hosts: hosts.rows,
            groups,
            identities: identities.rows,
            protectedInboundIds,
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
    async syncNode(
        node: INodeConnectionOpts & { uuid: string },
        registrationPass = 0,
    ): Promise<void> {
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
            let capabilities = await this.cache.get<HostPolicyCapabilities>(capabilityKey);
            if (
                quotaMode ||
                !capabilities ||
                typeof capabilities !== 'object' ||
                Array.isArray(capabilities)
            ) {
                const status = await sendPolicy<HostPolicyCapabilities>();
                if (status.isOk) {
                    const value = status.response;
                    capabilities = {
                        version: value.version,
                        supported: value.supported,
                        destinationRulesSupported: value.destinationRulesSupported,
                        policyRevisionsSupported: value.policyRevisionsSupported,
                        policyRevision: value.policyRevision,
                        offlineReserves: value.offlineReserves,
                        quotaReservesSupported: value.quotaReservesSupported,
                        quotaRegistrationsSupported: value.quotaRegistrationsSupported,
                        quotaWatermarksSupported: value.quotaWatermarksSupported,
                        quotaJournalSequence: value.quotaJournalSequence,
                        quotaFencesSupported: value.quotaFencesSupported,
                        quotaInstanceId: value.quotaInstanceId,
                        coreIncarnationSupported: value.coreIncarnationSupported,
                        usageReceiptsSupported: value.usageReceiptsSupported,
                        userQuotaReservesSupported: value.userQuotaReservesSupported,
                        unreservedUsageSupported: value.unreservedUsageSupported,
                        userQuotaRequired: value.userQuotaRequired,
                        coreProcessId: value.coreProcessId,
                        quotaRecovery: value.quotaRecovery,
                        quotaRecoveryPolicyBindingsRequired:
                            value.quotaRecoveryPolicyBindingsRequired,
                        quotaRecoveryPolicyBindingsSupported:
                            value.quotaRecoveryPolicyBindingsSupported,
                    };
                    await this.cache.set(capabilityKey, capabilities, 60);
                }
            }
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
                    await this.cache.del(capabilityKey).catch(() => undefined);
                    throw error;
                }
            };
            lockRequestedAt = performance.now();
            const prepared = await this.transactions
                .withTransaction({ timeout: 30000 }, async () => {
                    const tx = this.db.kysely;
                    await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${node.uuid},20260927))`.execute(
                        tx,
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
                    const state = await this.scopes(undefined, node.uuid, quotaMode?.userQuota);
                    const protectedHosts = state.hosts.filter(
                        (h) =>
                            h.inboundUuid &&
                            state.protectedInboundIds.has(h.inboundUuid) &&
                            h.boundNodes.includes(node.uuid),
                    );
                    if (!protectedHosts.length) {
                        if (
                            !capabilities?.supported ||
                            capabilities.version !== HOST_POLICY_VERSION
                        )
                            return;
                    }
                    const groups: Record<string, unknown> = {};
                    for (const group of state.groups.filter((g) =>
                        g.nodeUuids.includes(node.uuid),
                    )) {
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
                        protectedInbounds: [...new Set(protectedHosts.map((h) => h.inboundTag))],
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
                        await this.syncNode(node, registrationPass + 1);
                    }
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
