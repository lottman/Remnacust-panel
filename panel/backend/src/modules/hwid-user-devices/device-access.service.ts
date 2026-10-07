import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios';
import { TypedConfigService } from '@common/config/app-config';
import {
    getCipherTypeFromString,
    getSsPassword,
    isSS2022Method,
} from '@common/helpers/xray-config/ss-cipher';
import { HostAccessService } from '@common/host-policy/host-access.service';
import {
    deviceCredentials,
    deviceLinkToken,
    verifyDeviceLinkToken,
} from '@common/utils/device-identity';
import { HwidHeaders } from '@common/utils/extract-hwid-headers';
import { getVlessFlowFromDbInbound } from '@common/utils/flow/get-vless-flow';
import { USERS_STATUS } from '@libs/contracts/constants';
import { THwidSettings } from '@libs/contracts/models';

import { NodesRepository } from '@modules/nodes/repositories/nodes.repository';
import { UserEntity } from '@modules/users/entities/user.entity';
import { GetUserByUniqueFieldQuery } from '@modules/users/queries/get-user-by-unique-field';
import { GetUserWithResolvedInboundsQuery } from '@modules/users/queries/get-user-with-resolved-inbounds';

import { HwidUserDeviceEntity } from './entities/hwid-user-device.entity';
import { HwidUserDevicesRepository } from './repositories/hwid-user-devices.repository';

@Injectable()
export class DeviceAccessService {
    private readonly logger = new Logger(DeviceAccessService.name);
    private readonly secret: string;

    constructor(
        config: TypedConfigService,
        private readonly devices: HwidUserDevicesRepository,
        private readonly nodes: NodesRepository,
        private readonly axios: AxiosService,
        private readonly hostAccess: HostAccessService,
        private readonly queryBus: QueryBus,
    ) {
        this.secret = config.getOrThrow('APP_SECRET');
    }

    // Enabling this is a credential cutover. Existing shared keys must be retired on every node.
    public get enabled(): boolean {
        return process.env.XERA_PERSONAL_SUBSCRIPTIONS === 'true';
    }

    public credentials(userId: bigint, hwid: string, parentVlessUuid: string) {
        return deviceCredentials(this.secret, userId, hwid, parentVlessUuid);
    }

    public linkToken(user: UserEntity, hwid: string): string {
        return deviceLinkToken(this.secret, user.shortUuid, user.id, hwid);
    }

    public verifyLink(user: UserEntity, token: string): string | null {
        return verifyDeviceLinkToken(this.secret, user.shortUuid, user.id, token);
    }

    public async registrationDenied(userId: bigint, hwid?: string): Promise<boolean> {
        if (await this.devices.registrationAllowed(userId)) return false;
        return !hwid || !(await this.devices.checkHwidExists(hwid, userId)).exists;
    }

    public async hasBlockedDevice(userId: bigint): Promise<boolean> {
        return (await this.devices.findByCriteria({ userId })).some((device) => device.blocked);
    }

    public async devicesForConfig(userIds: bigint[]) {
        return this.devices.findForConfig(userIds);
    }

    public async register(
        user: UserEntity,
        headers: HwidHeaders,
        settings: THwidSettings,
        requestIp?: string,
    ): Promise<
        'OK' | 'LEGACY' | 'BLOCKED' | 'LIMIT_REACHED' | 'REGISTRATION_BLOCKED' | 'NODE_ERROR'
    > {
        // Keep the shared credential during migration so older clients and
        // temporarily unavailable nodes do not cause a service-wide outage.
        // A blocked HWID requires strict revocation before any personal key is issued.
        const hasBlockedDevice = await this.hasBlockedDevice(user.id);
        const sharedRevoked = hasBlockedDevice
            ? await this.retireSharedCredential(user.id, user.vlessUuid)
            : true;
        if (user.status !== USERS_STATUS.ACTIVE || user.expireAt <= new Date()) {
            // Resolve the dedicated exception inbounds from the database. Ordinary
            // inbounds stay revoked; an existing device can still reach renewal hosts.
            const devices = await this.devices.findByCriteria({ userId: user.id });
            const revoked = await Promise.all(
                devices.map((device) => this.syncDevice(user.id, device.hwid, device.blocked)),
            );
            if (sharedRevoked && revoked.every(Boolean)) return 'OK';
            return hasBlockedDevice ? 'NODE_ERROR' : 'LEGACY';
        }
        const existing = await this.devices.checkHwidExists(headers.hwid, user.id);
        if (existing.blocked) {
            const deviceRevoked = await this.syncDevice(user.id, headers.hwid, true);
            return sharedRevoked && deviceRevoked ? 'BLOCKED' : 'NODE_ERROR';
        }
        if (!sharedRevoked) return 'NODE_ERROR';
        const limit =
            settings.enabled && user.hwidDeviceLimit !== 0
                ? (user.hwidDeviceLimit ?? settings.fallbackDeviceLimit)
                : Number.MAX_SAFE_INTEGER;
        const result = await this.devices.createWithAdvisoryLock(
            new HwidUserDeviceEntity({
                hwid: headers.hwid,
                userId: user.id,
                platform: headers.platform,
                osVersion: headers.osVersion,
                deviceModel: headers.deviceModel,
                userAgent: headers.userAgent,
                requestIp,
            }),
            limit,
        );
        if (result.status === 'REGISTRATION_BLOCKED') return 'REGISTRATION_BLOCKED';
        if (result.status === 'LIMIT_REACHED') return 'LIMIT_REACHED';
        if (!result.hwidDevice) return 'NODE_ERROR';
        if (result.hwidDevice.blocked) {
            return (await this.syncDevice(user.id, headers.hwid, true)) ? 'BLOCKED' : 'NODE_ERROR';
        }
        // The renderer prepares host-scoped keys separately for the requested hosts.
        // Confirm the personal grant here without waiting for a fleet policy refresh.
        if (!(await this.syncDeviceCredential(user.id, headers.hwid, false, false))) {
            this.logger.error(`Device ${user.id} could not be present on all connected nodes`);
            return hasBlockedDevice ? 'NODE_ERROR' : 'LEGACY';
        }
        // An administrator may have blocked the device while node sync was running.
        const latest = await this.devices.checkHwidExists(headers.hwid, user.id);
        if (!latest.exists) {
            await this.syncDevice(user.id, headers.hwid, true);
            return 'NODE_ERROR';
        }
        if (latest.blocked) {
            return (await this.syncDevice(user.id, headers.hwid, true)) ? 'BLOCKED' : 'NODE_ERROR';
        }
        return 'OK';
    }

    public async retireSharedCredential(
        userId: bigint,
        vlessUuid: string,
        allowOfflineNodes = false,
    ): Promise<boolean> {
        const { nodes, complete } = await this.getNodeTargets();
        const results = await Promise.all(
            nodes.map((node) =>
                this.axios.deleteUser(
                    {
                        username: userId.toString(),
                        hashData: { vlessUuid },
                    },
                    { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
                ),
            ),
        );
        if (!complete && allowOfflineNodes) {
            this.logger.warn(
                `Shared credential revocation is pending on offline nodes for user ${userId}`,
            );
        }
        // Callers issuing credentials still require a complete fleet confirmation. A block
        // may persist while nodes are offline; their next full start uses the current config.
        return (
            (complete || allowOfflineNodes) &&
            results.every(
                (result) =>
                    result.isOk &&
                    result.response?.success === true &&
                    (
                        result.response as typeof result.response & {
                            deviceRevocationSupported?: boolean;
                        }
                    ).deviceRevocationSupported === true,
            )
        );
    }

    public async synchronizeUserStatus(user: UserEntity): Promise<boolean> {
        const hostSynced = await this.hostAccess.synchronizeUser(user.id);
        if (!this.enabled) return hostSynced;
        const devices = await this.devices.findByCriteria({ userId: user.id });
        const inactive = user.status !== USERS_STATUS.ACTIVE || user.expireAt <= new Date();
        const sharedRevoked =
            inactive || devices.some((device) => device.blocked)
                ? await this.retireSharedCredential(user.id, user.vlessUuid)
                : true;
        const results = await Promise.all(
            devices.map((device) => this.syncDevice(user.id, device.hwid, device.blocked)),
        );
        return hostSynced && sharedRevoked && results.every(Boolean);
    }

    public async synchronizeCredentialRotation(
        user: UserEntity,
        previousVlessUuid: string,
    ): Promise<boolean> {
        const hostSynced = await this.hostAccess.synchronizeUser(user.id);
        if (!this.enabled) return hostSynced;
        const sharedRevoked = await this.retireSharedCredential(user.id, previousVlessUuid);

        const [devices, { nodes, complete }] = await Promise.all([
            this.devices.findByCriteria({ userId: user.id }),
            this.getNodeTargets(),
        ]);

        const revoked = await Promise.all(
            devices.flatMap((device) => {
                const old = this.credentials(user.id, device.hwid, previousVlessUuid);
                return nodes.map((node) =>
                    this.axios.deleteUser(
                        {
                            username: old.username,
                            hashData: { vlessUuid: old.vlessUuid },
                        },
                        { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
                    ),
                );
            }),
        );
        if (
            !sharedRevoked ||
            !complete ||
            !revoked.every(
                (result) =>
                    result.isOk &&
                    result.response?.success === true &&
                    (
                        result.response as typeof result.response & {
                            deviceRevocationSupported?: boolean;
                        }
                    ).deviceRevocationSupported === true,
            )
        ) {
            return false;
        }
        return this.synchronizeUserStatus(user);
    }

    public async syncDevice(
        userId: bigint,
        hwid: string,
        blocked: boolean,
        allowOfflineNodes = false,
    ): Promise<boolean> {
        // Start host-key and device-key synchronization together. A slow policy
        // update must not delay revoking an already connected device.
        const results = await Promise.allSettled([
            this.hostAccess.synchronizeUser(userId, hwid, blocked),
            this.syncDeviceCredential(userId, hwid, blocked, allowOfflineNodes),
        ]);
        return results.every((result) => result.status === 'fulfilled' && result.value);
    }

    private async syncDeviceCredential(
        userId: bigint,
        hwid: string,
        blocked: boolean,
        allowOfflineNodes: boolean,
    ): Promise<boolean> {
        let resolved = await this.queryBus.execute(new GetUserWithResolvedInboundsQuery(userId));
        if (!resolved.isOk) return false;
        const credentials = this.credentials(userId, hwid, resolved.response.vlessUuid);
        const { nodes, complete } = await this.getNodeTargets();
        if (!blocked) {
            const [user, device] = await Promise.all([
                this.queryBus.execute(
                    new GetUserByUniqueFieldQuery({ id: userId }, { activeInternalSquads: false }),
                ),
                this.devices.checkHwidExists(hwid, userId),
            ]);
            blocked = !user.isOk || !device.exists || device.blocked;
            if (
                !blocked &&
                user.isOk &&
                (user.response.status !== USERS_STATUS.ACTIVE ||
                    user.response.expireAt <= new Date())
            ) {
                // Re-resolve after checking expiry: the first query may have run
                // just before the subscription expired. This query enforces squads.
                resolved = await this.queryBus.execute(
                    new GetUserWithResolvedInboundsQuery(userId),
                );
                if (!resolved.isOk) return false;
            }
        }
        if (blocked) {
            const results = await Promise.all(
                nodes.map((node) =>
                    this.axios.deleteUser(
                        {
                            username: credentials.username,
                            hashData: { vlessUuid: credentials.vlessUuid },
                        },
                        { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
                    ),
                ),
            );
            if (!complete && allowOfflineNodes) {
                this.logger.warn(`HWID revocation is pending on offline nodes for user ${userId}`);
            }
            return (
                (complete || allowOfflineNodes) &&
                results.every(
                    (result) =>
                        result.isOk &&
                        result.response?.success === true &&
                        (
                            result.response as typeof result.response & {
                                deviceRevocationSupported?: boolean;
                            }
                        ).deviceRevocationSupported === true,
                )
            );
        }

        // A grant is valid only on nodes that acknowledged it. An unreachable
        // node cannot install a new key and receives the current device state
        // on its next full start. Revocations above still require confirmation.
        if (!nodes.length && !complete) return false;

        const results = await Promise.all(
            nodes.map(async (node) => {
                const inbounds = resolved.response.inbounds.filter(
                    (inbound) =>
                        inbound.profileUuid === node.activeConfigProfileUuid &&
                        node.activeInbounds.some((active) => active.uuid === inbound.uuid),
                );
                if (!inbounds.length) {
                    const response = await this.axios.deleteUser(
                        {
                            username: credentials.username,
                            hashData: { vlessUuid: credentials.vlessUuid },
                        },
                        { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
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
                }
                const data = inbounds.map((inbound) => {
                    const common = { tag: inbound.tag, username: credentials.username };
                    switch (inbound.type) {
                        case 'vless':
                            return {
                                ...common,
                                type: 'vless' as const,
                                uuid: credentials.vlessUuid,
                                flow: getVlessFlowFromDbInbound(inbound),
                            };
                        case 'trojan':
                            return {
                                ...common,
                                type: 'trojan' as const,
                                password: credentials.trojanPassword,
                            };
                        case 'masque':
                        case 'hysteria':
                            return {
                                ...common,
                                type: inbound.type as 'masque' | 'hysteria',
                                password: credentials.vlessUuid,
                            };
                        case 'shadowsocks':
                            if (isSS2022Method(inbound.rawInbound))
                                return {
                                    ...common,
                                    type: 'shadowsocks22' as const,
                                    password: getSsPassword(
                                        credentials.ssPassword,
                                        true,
                                        (
                                            inbound.rawInbound as {
                                                settings?: { method?: string };
                                            } | null
                                        )?.settings?.method,
                                    ),
                                };
                            return {
                                ...common,
                                type: 'shadowsocks' as const,
                                password: credentials.ssPassword,
                                cipherType: getCipherTypeFromString(inbound.rawInbound),
                                ivCheck: false,
                            };
                        default:
                            throw new Error(`Unsupported device inbound: ${inbound.type}`);
                    }
                });
                const response = await this.axios.addUser(
                    {
                        hashData: { vlessUuid: credentials.vlessUuid },
                        data,
                    },
                    { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
                );
                return response.isOk && response.response?.success === true;
            }),
        );
        // Recheck after I/O: a concurrent block, expiry or rotation must not leave
        // credentials installed by an older subscription request.
        const [latestUser, latestDevice, latestResolved] = await Promise.all([
            this.queryBus.execute(
                new GetUserByUniqueFieldQuery({ id: userId }, { activeInternalSquads: false }),
            ),
            this.devices.checkHwidExists(hwid, userId),
            this.queryBus.execute(new GetUserWithResolvedInboundsQuery(userId)),
        ]);
        if (
            !latestUser.isOk ||
            !latestResolved.isOk ||
            JSON.stringify(latestResolved.response.inbounds.map((i) => i.uuid).sort()) !==
                JSON.stringify(resolved.response.inbounds.map((i) => i.uuid).sort()) ||
            latestUser.response.vlessUuid !== resolved.response.vlessUuid ||
            !latestDevice.exists ||
            latestDevice.blocked
        ) {
            await Promise.all(
                nodes.map((node) =>
                    this.axios.deleteUser(
                        {
                            username: credentials.username,
                            hashData: { vlessUuid: credentials.vlessUuid },
                        },
                        { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
                    ),
                ),
            );
            return false;
        }
        return results.every(Boolean);
    }

    private async getNodeTargets() {
        const [all, connected] = await Promise.all([
            this.nodes.findAllNodes(),
            this.nodes.findConnectedNodes(),
        ]);
        const active = (node: (typeof all)[number]) =>
            !node.isDisabled &&
            Boolean(node.activeConfigProfileUuid) &&
            node.activeInbounds.length > 0;
        const targets = connected.filter(active);
        const connectedIds = new Set(targets.map((node) => node.uuid));
        const complete = all.filter(active).every((node) => connectedIds.has(node.uuid));
        // Always revoke on reachable nodes, even when another node is offline.
        return { nodes: targets, complete };
    }
}
