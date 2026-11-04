import { sql } from 'kysely';
import { InboundConfig } from 'xray-typed';

import { Injectable, Logger } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { TxKyselyService } from '@common/database';
import {
    getCipherTypeFromString,
    getSsPassword,
    isSS2022Method,
} from '@common/helpers/xray-config/ss-cipher';
import { BoundedWorkQueue } from '@common/utils/bounded-work-queue';
import { getVlessFlow } from '@common/utils/flow';
import { settleConcurrent } from '@common/utils/settle-concurrent';

import { UserEntity } from '@modules/users/entities/user.entity';

import { autoselectRouteUuid } from './autoselect-route-policy';
import { HostPolicyService } from './host-policy.service';
import { identityAccessQuery } from './identity-access-query';

type HostSyncResult = { allSynchronized: boolean; readyHosts: Set<string> };

@Injectable()
export class HostAccessService {
    private readonly logger = new Logger(HostAccessService.name);
    private readonly preparing = new Map<string, Promise<HostSyncResult>>();
    private readonly synchronizedUntil = new Map<string, number>();
    private readonly background = new BoundedWorkQueue(4, 1000);
    private lastQueueWarning = 0;
    private readonly nodeWarnings = new Map<string, { at: number; suppressed: number }>();
    constructor(
        private readonly db: TxKyselyService,
        private readonly policies: HostPolicyService,
        private readonly axios: AxiosService,
    ) {}

    private warnNode(node: string, operation: string, code: string, elapsed = 0): void {
        const key = JSON.stringify([node, operation, code]);
        const previous = this.nodeWarnings.get(key);
        const now = Date.now();
        if (process.env.XERA_SYNC_DIAGNOSTICS !== 'true' && previous && now - previous.at < 10000) {
            previous.suppressed++;
            return;
        }
        if (this.nodeWarnings.size >= 1000)
            this.nodeWarnings.delete(this.nodeWarnings.keys().next().value!);
        this.nodeWarnings.set(key, { at: now, suppressed: 0 });
        this.logger.warn(
            `Host sync node=${node} operation=${operation} code=${code} durationMs=${elapsed} suppressed=${previous?.suppressed ?? 0}`,
        );
    }

    async prepare(
        user: UserEntity,
        hosts: { uuid: string; configProfileInboundUuid: string | null }[],
        quotaOwnerUuid?: string,
    ): Promise<Map<string, UserEntity | null>> {
        const state = await this.policies.scopes(user.id, undefined, false, { identities: false });
        const policyHosts = new Map(state.hosts.map((host) => [host.uuid, host]));
        const result = new Map<string, UserEntity | null>();
        for (const host of hosts) {
            if (
                host.configProfileInboundUuid &&
                state.legacyInboundIds?.has(host.configProfileInboundUuid) &&
                (user.status !== 'ACTIVE' || user.expireAt <= new Date())
            )
                result.set(host.uuid, null);
        }
        const protectedHosts = hosts.filter(
            (h) =>
                h.configProfileInboundUuid &&
                (!quotaOwnerUuid || policyHosts.get(h.uuid)?.quotaHostUuid === quotaOwnerUuid) &&
                (state.protectedInboundIds.has(h.configProfileInboundUuid) ||
                    policyHosts.get(h.uuid)?.quotaHostUuid),
        );
        if (!protectedHosts.length) return result;
        // Explicit null prevents the renderer from substituting unrestricted credentials.
        for (const host of protectedHosts) result.set(host.uuid, null);
        const context = user.hostIdentityContext ?? { hwid: null, parentVlessUuid: user.vlessUuid };
        const requestedIds = [...new Set(protectedHosts.map((host) => host.uuid))].sort();
        const permitted = await this.checkAccess(
            user.id,
            requestedIds,
            context.hwid,
            context.parentVlessUuid,
        );
        const hostIds = requestedIds.filter((id) => permitted.has(id));
        if (!hostIds.length) return result;
        if (context.preview) {
            // Preview derives the same keys without persisting identities or
            // synchronizing users/policies to a live node.
            const current = await this.checkAccess(
                user.id,
                hostIds,
                context.hwid,
                context.parentVlessUuid,
            );
            for (const id of hostIds) {
                if (!current.has(id)) continue;
                const keys = this.policies.keys({
                    userId: user.id.toString(),
                    hostUuid: id,
                    quotaHostUuid: policyHosts.get(id)?.quotaHostUuid,
                    hwid: context.hwid,
                    parent: context.parentVlessUuid,
                });
                result.set(
                    id,
                    Object.assign(Object.create(Object.getPrototypeOf(user)), user, keys),
                );
            }
            return result;
        }
        const routeIds = new Set(
            state.hosts.filter((host) => host.quotaHostUuid).map((host) => host.uuid),
        );
        const records = hostIds
            .filter((id) => !routeIds.has(id))
            .map(
                (id) =>
                    sql`(${user.id},${id}::uuid,${context.hwid ?? ''},${context.hwid},${context.parentVlessUuid}::uuid)`,
            );
        if (records.length)
            await sql`INSERT INTO xera_host_identities(user_id,host_uuid,device_key,hwid,parent_vless_uuid)
            VALUES ${sql.join(records)}
            ON CONFLICT(user_id,host_uuid,device_key) DO UPDATE SET parent_vless_uuid=excluded.parent_vless_uuid
            WHERE xera_host_identities.parent_vless_uuid IS DISTINCT FROM excluded.parent_vless_uuid`.execute(
                this.db.kysely,
            );
        const routed = hostIds
            .filter((id) => routeIds.has(id))
            .map(
                (id) =>
                    sql`(${user.id},${id}::uuid,${context.hwid ?? ''},${context.hwid},${context.parentVlessUuid}::uuid)`,
            );
        if (routed.length)
            await sql`INSERT INTO xera_autoselect_identities(user_id,route_uuid,device_key,hwid,parent_vless_uuid)
            VALUES ${sql.join(routed)}
            ON CONFLICT(user_id,route_uuid,device_key) DO UPDATE SET parent_vless_uuid=excluded.parent_vless_uuid
            WHERE xera_autoselect_identities.parent_vless_uuid IS DISTINCT FROM excluded.parent_vless_uuid`.execute(
                this.db.kysely,
            );
        // Coalesce only overlapping preparations of the exact same credentials/hosts.
        // Every waiter still validates current permissions after synchronization.
        const flightKey = JSON.stringify([
            user.id.toString(),
            context.hwid,
            context.parentVlessUuid,
            hostIds,
        ]);
        if (
            !this.preparing.has(flightKey) &&
            (this.synchronizedUntil.get(flightKey) ?? 0) <= Date.now()
        ) {
            const queued = this.background.submit(() =>
                this.synchronize(user.id, context.hwid, false, hostIds),
            );
            if (queued) {
                const flight = queued
                    .then((synced) => {
                        if (synced.allSynchronized) {
                            // Bound the retry cache; authorization itself is never cached here.
                            if (this.synchronizedUntil.size >= 1000)
                                this.synchronizedUntil.delete(
                                    this.synchronizedUntil.keys().next().value!,
                                );
                            this.synchronizedUntil.set(flightKey, Date.now() + 30000);
                        }
                        return synced;
                    })
                    .catch(() => {
                        this.logger.warn(
                            'Background host synchronization failed; next refresh will retry',
                        );
                        return { allSynchronized: false, readyHosts: new Set<string>() };
                    })
                    .finally(() => {
                        if (this.preparing.get(flightKey) === flight)
                            this.preparing.delete(flightKey);
                    });
                this.preparing.set(flightKey, flight);
            } else if (Date.now() - this.lastQueueWarning > 60000) {
                this.lastQueueWarning = Date.now();
                this.logger.warn('Host synchronization queue is full; next refresh will retry');
            }
        }
        // Subscription delivery must not wait for a slow or unavailable node.
        // Re-read permissions before issuing the same stable, host-scoped credentials.
        const current = await this.checkAccess(
            user.id,
            hostIds,
            context.hwid,
            context.parentVlessUuid,
        );
        if (hostIds.some((id) => !current.has(id))) {
            this.synchronizedUntil.delete(flightKey);
            void this.synchronizeUser(user.id, context.hwid).catch(() => {
                this.logger.warn('Host permission reconciliation failed; access remains denied');
            });
        }
        for (const id of hostIds) {
            // Visibility follows database permissions, independently of node API health.
            // Preserve the host-scoped key even while synchronization is pending.
            if (!current.has(id)) continue;
            const keys = this.policies.keys({
                userId: user.id.toString(),
                hostUuid: id,
                quotaHostUuid: policyHosts.get(id)?.quotaHostUuid,
                hwid: context.hwid,
                parent: context.parentVlessUuid,
            });
            result.set(id, Object.assign(Object.create(Object.getPrototypeOf(user)), user, keys));
        }
        return result;
    }

    private async checkAccess(
        userId: bigint,
        hostIds: string[],
        hwid: string | null,
        parent: string,
    ): Promise<Set<string>> {
        const result = await sql<{
            hostUuid: string;
            allowed: boolean;
        }>`SELECT a."hostUuid" AS "hostUuid",a.allowed FROM (${identityAccessQuery(sql`
            SELECT ${userId}::bigint AS user_id,h.id AS host_uuid,
                COALESCE(r.owner_host_uuid,h.id) AS owner_uuid,
                COALESCE(r.source_host_uuid,h.id) AS source_uuid,
                ${hwid}::text AS hwid,${parent}::uuid AS parent
            FROM (VALUES ${sql.join(hostIds.map((id) => sql`(${id}::uuid)`))}) AS h(id)
            LEFT JOIN xera_autoselect_routes r ON r.uuid=h.id`)}) a`.execute(this.db.kysely);
        return new Set(
            result.rows.filter((row) => row.allowed === true).map((row) => row.hostUuid),
        );
    }

    async prepareAutoselect(
        user: UserEntity,
        ownerUuid: string,
        sources: { uuid: string; configProfileInboundUuid: string | null }[],
    ): Promise<Map<string, UserEntity | null>> {
        const result = new Map<string, UserEntity | null>(sources.map((host) => [host.uuid, null]));
        if (!sources.length) return result;
        if (sources.length > 1000) throw new Error('Too many autoselect sources');
        if (
            (await this.policies.routedIdentitySupport([
                ...sources.map((host) => host.uuid),
                ownerUuid,
            ])) === false
        )
            return this.prepare(user, sources);
        const context = user.hostIdentityContext ?? { hwid: null, parentVlessUuid: user.vlessUuid };
        const aliases = new Map(
            sources.map((host) => [host.uuid, autoselectRouteUuid(ownerUuid, host.uuid)]),
        );
        const allowed =
            await identityAccessQuery(sql`SELECT ${user.id}::bigint AS user_id,h.uuid AS host_uuid,
            ${ownerUuid}::uuid AS owner_uuid,h.uuid AS source_uuid,${context.hwid}::text AS hwid,
            ${context.parentVlessUuid}::uuid AS parent FROM hosts h
            WHERE h.uuid=ANY(${[...aliases.keys()]}::uuid[])`).execute(this.db.kysely);
        const permitted = new Set(
            allowed.rows.filter((host) => host.allowed).map((host) => host.hostUuid),
        );
        const selected = sources.filter((host) => permitted.has(host.uuid));
        if (!selected.length) return result;
        if (context.preview) {
            for (const source of selected) {
                const keys = this.policies.keys({
                    userId: user.id.toString(),
                    hostUuid: aliases.get(source.uuid)!,
                    quotaHostUuid: ownerUuid,
                    hwid: context.hwid,
                    parent: context.parentVlessUuid,
                });
                result.set(
                    source.uuid,
                    Object.assign(Object.create(Object.getPrototypeOf(user)), user, keys),
                );
            }
            return result;
        }
        const values = selected.map(
            (source) =>
                sql`(${aliases.get(source.uuid)}::uuid,${ownerUuid}::uuid,${source.uuid}::uuid)`,
        );
        await sql`INSERT INTO xera_autoselect_routes(uuid,owner_host_uuid,source_host_uuid)
            SELECT value.id,value.owner,value.source FROM (VALUES ${sql.join(values)}) AS value(id,owner,source)
            WHERE NOT EXISTS(SELECT 1 FROM hosts h WHERE h.uuid=value.id)
            ON CONFLICT(uuid) DO UPDATE SET source_host_uuid=excluded.source_host_uuid
            WHERE xera_autoselect_routes.owner_host_uuid=excluded.owner_host_uuid
              AND xera_autoselect_routes.source_host_uuid IS NULL`.execute(this.db.kysely);
        const prepared = await this.prepare(
            user,
            selected.map((source) => ({
                uuid: aliases.get(source.uuid)!,
                configProfileInboundUuid: source.configProfileInboundUuid,
            })),
            ownerUuid,
        );
        for (const source of selected)
            result.set(source.uuid, prepared.get(aliases.get(source.uuid)!) ?? null);
        return result;
    }

    async configIdentities(profileUuid: string) {
        const state = await this.policies.scopes(undefined, undefined, false, { profileUuid });
        const compatibleHosts = new Set(
            state.hosts
                .filter((host) => !state.legacyInboundIds?.has(host.inboundUuid ?? ''))
                .map((host) => host.uuid),
        );
        return state.identities
            .filter(
                (k) =>
                    k.allowed && k.profileUuid === profileUuid && compatibleHosts.has(k.hostUuid),
            )
            .map((k) => ({
                ...this.policies.keys(k),
                id: this.policies.keys(k).username,
                tags: [k.inboundTag],
            }));
    }

    async legacyInbounds(): Promise<Set<string>> {
        return this.policies.legacyInbounds();
    }

    async synchronizeUser(
        userId: bigint,
        hwid?: string | null,
        revokeOnly = false,
        requestedHosts?: readonly string[],
    ): Promise<boolean> {
        return (await this.synchronize(userId, hwid, revokeOnly, requestedHosts)).allSynchronized;
    }

    private async synchronize(
        userId: bigint,
        hwid?: string | null,
        revokeOnly = false,
        requestedHosts?: readonly string[],
    ): Promise<HostSyncResult> {
        const state = await this.policies.scopes(userId);
        const hostsById = new Map(state.hosts.map((host) => [host.uuid, host]));
        const identities = state.identities.filter(
            (k) =>
                k.userId === userId.toString() &&
                !state.legacyInboundIds?.has(hostsById.get(k.hostUuid)?.inboundUuid ?? '') &&
                (!requestedHosts || requestedHosts.includes(k.hostUuid)) &&
                (hwid === undefined ||
                    k.hwid === hwid ||
                    (revokeOnly && k.hwid === null && !k.allowed)),
        );
        if (!identities.length) return { allSynchronized: true, readyHosts: new Set() };
        const nodes = await this.db.kysely
            .selectFrom('nodes')
            .select(['uuid', 'address', 'port', 'proxyUrl', 'isConnected', 'isDisabled'])
            .execute();
        const results = await settleConcurrent(nodes, 8, async (node) => {
            let success = true;
            const readyHosts = new Set<string>();
            const relevant = identities.filter(
                (k) =>
                    hostsById.get(k.hostUuid)?.boundNodes.includes(node.uuid) &&
                    (!requestedHosts ||
                        !hostsById.get(k.hostUuid)!.nodes.length ||
                        hostsById.get(k.hostUuid)!.nodes.includes(node.uuid)),
            );
            if (!relevant.length || node.isDisabled) return { success: true, readyHosts };
            if (!node.isConnected) {
                this.warnNode(node.uuid, 'connect', 'NODE_OFFLINE');
                return { success: false, readyHosts };
            }
            const started = performance.now();
            let operation = 'revoke';
            try {
                // Revoke before waiting for a fleet policy refresh or unrelated grants.
                const denied = relevant.filter((identity) => {
                    const host = hostsById.get(identity.hostUuid)!;
                    return (
                        revokeOnly ||
                        !identity.allowed ||
                        (host.nodes.length > 0 && !host.nodes.includes(node.uuid))
                    );
                });
                const revoked = await settleConcurrent(denied, 8, async (identity) => {
                    const keys = this.policies.keys(identity);
                    const response = await this.axios.deleteUser(
                        { username: keys.username, hashData: { vlessUuid: keys.vlessUuid } },
                        node,
                    );
                    return (
                        response.isOk &&
                        response.response?.success === true &&
                        (
                            response.response as typeof response.response & {
                                deviceRevocationSupported?: boolean;
                            }
                        ).deviceRevocationSupported === true
                    );
                });
                success = revoked.every((r) => r.status === 'fulfilled' && r.value);
                // A fresh policy gates already installed and new credentials before mutations.
                operation = 'policy';
                await this.policies.syncNode(node);
                const deniedSet = new Set(denied);
                const allowed = relevant.filter((identity) => !deniedSet.has(identity));
                if (!allowed.length) return { success, readyHosts };
                operation = 'add';
                const added = await settleConcurrent(allowed, 8, async (identity) => {
                    const keys = this.policies.keys(identity);
                    const inbound = identity.rawInbound;
                    const common = { tag: identity.inboundTag, username: keys.username };
                    const data = (() => {
                        switch (inbound.protocol) {
                            case 'vless':
                                return {
                                    ...common,
                                    type: 'vless' as const,
                                    uuid: keys.vlessUuid,
                                    flow: getVlessFlow(inbound as InboundConfig),
                                };
                            case 'trojan':
                                return {
                                    ...common,
                                    type: 'trojan' as const,
                                    password: keys.trojanPassword,
                                };
                            case 'masque':
                                return {
                                    ...common,
                                    type: 'masque' as const,
                                    password: keys.vlessUuid,
                                };
                            case 'hysteria':
                                return {
                                    ...common,
                                    type: 'hysteria' as const,
                                    password: keys.vlessUuid,
                                };
                            case 'shadowsocks':
                                return isSS2022Method(inbound)
                                    ? {
                                          ...common,
                                          type: 'shadowsocks22' as const,
                                          password: getSsPassword(
                                              keys.ssPassword,
                                              true,
                                              inbound.settings?.method,
                                          ),
                                      }
                                    : {
                                          ...common,
                                          type: 'shadowsocks' as const,
                                          password: keys.ssPassword,
                                          cipherType: getCipherTypeFromString(inbound),
                                          ivCheck: false,
                                      };
                            default:
                                throw new Error('Unsupported host identity protocol');
                        }
                    })();
                    const response = await this.axios.addUser(
                        { data: [data], hashData: { vlessUuid: keys.vlessUuid } },
                        node,
                    );
                    return response.isOk && response.response.success;
                });
                const revocationsConfirmed = success;
                success &&= added.every((result) => result.status === 'fulfilled' && result.value);
                // Re-read status, device and squad permissions after I/O; old snapshots cannot reopen access.
                operation = 'policy';
                await this.policies.syncNode(node);
                if (revocationsConfirmed && !revokeOnly) {
                    for (let i = 0; i < added.length; i++) {
                        const ack = added[i];
                        if (ack.status === 'fulfilled' && ack.value)
                            readyHosts.add(allowed[i].hostUuid);
                    }
                }
            } catch (error) {
                const code =
                    error &&
                    typeof error === 'object' &&
                    'code' in error &&
                    typeof error.code === 'string' &&
                    /^[A-Z0-9_]{1,64}$/.test(error.code)
                        ? error.code
                        : 'SYNC_FAILED';
                this.warnNode(node.uuid, operation, code, Math.round(performance.now() - started));
                success = false;
            } finally {
                const elapsed = Math.round(performance.now() - started);
                if (process.env.XERA_SYNC_DIAGNOSTICS === 'true' || (success && elapsed >= 1000))
                    this.logger.log(
                        `Host sync node=${node.uuid} identities=${relevant.length} success=${success} durationMs=${elapsed}`,
                    );
            }
            return { success, readyHosts };
        });
        return {
            allSynchronized: results.every((r) => r.status === 'fulfilled' && r.value.success),
            readyHosts: new Set(
                results.flatMap((r) => (r.status === 'fulfilled' ? [...r.value.readyHosts] : [])),
            ),
        };
    }
}
