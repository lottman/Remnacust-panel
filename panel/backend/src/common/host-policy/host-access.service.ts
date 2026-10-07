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
import { getVlessFlow } from '@common/utils/flow';
import { settleConcurrent } from '@common/utils/settle-concurrent';
import { BoundedWorkQueue } from '@common/utils/bounded-work-queue';

import { UserEntity } from '@modules/users/entities/user.entity';

import { HostPolicyService } from './host-policy.service';

type HostSyncResult = { allSynchronized: boolean; readyHosts: Set<string> };

@Injectable()
export class HostAccessService {
    private readonly logger = new Logger(HostAccessService.name);
    private readonly preparing = new Map<string, Promise<HostSyncResult>>();
    private readonly synchronizedUntil = new Map<string, number>();
    private readonly background = new BoundedWorkQueue(4, 1000);
    private lastQueueWarning = 0;
    constructor(
        private readonly db: TxKyselyService,
        private readonly policies: HostPolicyService,
        private readonly axios: AxiosService,
    ) {}

    async prepare(
        user: UserEntity,
        hosts: { uuid: string; configProfileInboundUuid: string | null }[],
    ): Promise<Map<string, UserEntity | null>> {
        const state = await this.policies.scopes(user.id);
        const result = new Map<string, UserEntity | null>();
        const protectedHosts = hosts.filter(
            (h) =>
                h.configProfileInboundUuid &&
                state.protectedInboundIds.has(h.configProfileInboundUuid),
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
        const records = hostIds.map(
            (id) =>
                sql`(${user.id},${id}::uuid,${context.hwid ?? ''},${context.hwid},${context.parentVlessUuid}::uuid)`,
        );
        await sql`INSERT INTO xera_host_identities(user_id,host_uuid,device_key,hwid,parent_vless_uuid)
            VALUES ${sql.join(records)}
            ON CONFLICT(user_id,host_uuid,device_key) DO UPDATE SET parent_vless_uuid=excluded.parent_vless_uuid
            WHERE xera_host_identities.parent_vless_uuid IS DISTINCT FROM excluded.parent_vless_uuid`.execute(
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
                        if (this.preparing.get(flightKey) === flight) this.preparing.delete(flightKey);
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
        }>`SELECT h.id AS "hostUuid", xera_host_identity_allowed(${userId},h.id,${hwid},${parent}::uuid) AS allowed
            FROM (VALUES ${sql.join(hostIds.map((id) => sql`(${id}::uuid)`))}) AS h(id)`.execute(
            this.db.kysely,
        );
        return new Set(
            result.rows.filter((row) => row.allowed === true).map((row) => row.hostUuid),
        );
    }

    async configIdentities(profileUuid: string) {
        const state = await this.policies.scopes();
        return state.identities
            .filter((k) => k.allowed && k.profileUuid === profileUuid)
            .map((k) => ({
                ...this.policies.keys(k),
                id: this.policies.keys(k).username,
                tags: [k.inboundTag],
            }));
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
        const identities = state.identities.filter(
            (k) =>
                k.userId === userId.toString() &&
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
        const hostsById = new Map(state.hosts.map((host) => [host.uuid, host]));
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
                this.logger.warn(`Host sync node=${node.uuid} operation=connect code=NODE_OFFLINE`);
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
            } catch {
                this.logger.warn(
                    `Host sync node=${node.uuid} operation=${operation} code=SYNC_FAILED durationMs=${Math.round(performance.now() - started)}`,
                );
                success = false;
            } finally {
                const elapsed = Math.round(performance.now() - started);
                if (process.env.XERA_SYNC_DIAGNOSTICS === 'true' || elapsed >= 1000 || !success)
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
