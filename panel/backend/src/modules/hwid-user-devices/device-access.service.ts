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
import { settleConcurrent } from '@common/utils/settle-concurrent';
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
    private reconciliation: Promise<void> | null = null;
    private reconciliationScheduled = false;

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

    public kickReconciliation(): void {
        if (this.reconciliationScheduled) return;
        this.reconciliationScheduled = true;
        setImmediate(() => {
            this.reconciliationScheduled = false;
            void this.reconcilePendingDevices().catch(() =>
                this.logger.warn('Device reconciliation will retry from the database'),
            );
        });
    }

    public reconcilePendingDevices(): Promise<void> {
        if (this.reconciliation) return this.reconciliation;
        const running = Promise.allSettled([
            this.processPendingUserAccess(),
            this.processPendingDevices(),
        ])
            .then((results) => {
                const failed = results.find((result) => result.status === 'rejected');
                if (failed?.status === 'rejected') throw failed.reason;
            })
            .finally(() => {
                if (this.reconciliation === running) this.reconciliation = null;
            });
        this.reconciliation = running;
        return running;
    }

    private async processPendingUserAccess(): Promise<void> {
        const pending = await this.devices.claimUserAccessReconciliation();
        await settleConcurrent(pending, 2, async (task) => {
            let success = false;
            try {
                const result = await this.queryBus.execute(
                    new GetUserByUniqueFieldQuery(
                        { id: task.userId },
                        { activeInternalSquads: true },
                    ),
                );
                success = result.isOk && (await this.synchronizeUserStatus(result.response));
            } catch {
                this.logger.warn(`User access reconciliation pending for user ${task.userId}`);
            }
            await this.devices.finishUserAccessReconciliation(task, success);
        });
    }

    private async processPendingDevices(): Promise<void> {
        if (!this.enabled) return;
        const pending = await this.devices.claimDeviceReconciliation();
        await settleConcurrent(pending, 4, async (task) => {
            let success = false;
            try {
                // Reconcile the current row, not a stale delete event. Registration or an
                // administrator may have deliberately changed this device in the meantime.
                const current = await this.devices.checkHwidExists(task.hwid, task.userId);
                const operations = [
                    this.syncDevice(task.userId, task.hwid, !current.exists || current.blocked),
                ];
                if (current.blocked) {
                    operations.push(this.retireBlockedSharedCredential(task.userId));
                }
                const results = await Promise.allSettled(operations);
                success = results.every((result) => result.status === 'fulfilled' && result.value);
            } catch {
                this.logger.warn(`Device reconciliation pending for user ${task.userId}`);
            }
            await this.devices.finishDeviceReconciliation(task, success, task.attempts);
        });
    }

    public async register(
        user: UserEntity,
        headers: HwidHeaders,
        settings: THwidSettings,
        requestIp?: string,
    ): Promise<
        'OK' | 'LEGACY' | 'BLOCKED' | 'LIMIT_REACHED' | 'REGISTRATION_BLOCKED' | 'NODE_ERROR'
    > {
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
        if (result.status === 'CREATED') this.kickReconciliation();
        if (result.hwidDevice.blocked) {
            return 'BLOCKED';
        }
        const latest = await this.devices.checkHwidExists(headers.hwid, user.id);
        if (!latest.exists) return 'NODE_ERROR';
        if (latest.blocked) return 'BLOCKED';
        return 'OK';
    }

    private async retireBlockedSharedCredential(userId: bigint): Promise<boolean> {
        const user = await this.queryBus.execute(
            new GetUserByUniqueFieldQuery({ id: userId }, { activeInternalSquads: false }),
        );
        return user.isOk && this.retireSharedCredential(userId, user.response.vlessUuid);
    }

    public async retireSharedCredential(
        userId: bigint,
        vlessUuid: string,
        allowOfflineNodes = false,
    ): Promise<boolean> {
        const { nodes, complete } = await this.getNodeTargets();
        const results = await settleConcurrent(nodes, 8, (node) =>
            this.axios.deleteUser(
                {
                    username: userId.toString(),
                    hashData: { vlessUuid },
                },
                {
                    uuid: node.uuid,
                    address: node.address,
                    port: node.port,
                    proxyUrl: node.proxyUrl,
                },
            ),
        );
        if (!complete && allowOfflineNodes) {
            this.logger.warn(
                `Shared credential revocation is pending on offline nodes for user ${userId}`,
            );
        }
        return (
            (complete || allowOfflineNodes) &&
            results.every(
                (result) =>
                    result.status === 'fulfilled' &&
                    result.value.isOk &&
                    result.value.response?.success === true &&
                    (
                        result.value.response as typeof result.value.response & {
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
        const results = await settleConcurrent(devices, 4, (device) =>
            this.syncDevice(user.id, device.hwid, device.blocked),
        );
        return (
            hostSynced &&
            sharedRevoked &&
            results.every((result) => result.status === 'fulfilled' && result.value)
        );
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
                        {
                            uuid: node.uuid,
                            address: node.address,
                            port: node.port,
                            proxyUrl: node.proxyUrl,
                        },
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
            const results = await settleConcurrent(nodes, 8, (node) =>
                this.axios.deleteUser(
                    {
                        username: credentials.username,
                        hashData: { vlessUuid: credentials.vlessUuid },
                    },
                    {
                        uuid: node.uuid,
                        address: node.address,
                        port: node.port,
                        proxyUrl: node.proxyUrl,
                    },
                ),
            );
            if (!complete && allowOfflineNodes) {
                this.logger.warn(`HWID revocation is pending on offline nodes for user ${userId}`);
            }
            return (
                (complete || allowOfflineNodes) &&
                results.every(
                    (result) =>
                        result.status === 'fulfilled' &&
                        result.value.isOk &&
                        result.value.response?.success === true &&
                        (
                            result.value.response as typeof result.value.response & {
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

        const results = await settleConcurrent(nodes, 8, async (node) => {
            const inbounds = resolved.response.inbounds.filter((inbound) =>
                node.activeInbounds.some((active) => active.uuid === inbound.uuid),
            );
            if (!inbounds.length) {
                const response = await this.axios.deleteUser(
                    {
                        username: credentials.username,
                        hashData: { vlessUuid: credentials.vlessUuid },
                    },
                    {
                        uuid: node.uuid,
                        address: node.address,
                        port: node.port,
                        proxyUrl: node.proxyUrl,
                    },
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
                {
                    uuid: node.uuid,
                    address: node.address,
                    port: node.port,
                    proxyUrl: node.proxyUrl,
                },
            );
            return response.isOk && response.response?.success === true;
        });
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
            await settleConcurrent(nodes, 8, (node) =>
                this.axios.deleteUser(
                    {
                        username: credentials.username,
                        hashData: { vlessUuid: credentials.vlessUuid },
                    },
                    {
                        uuid: node.uuid,
                        address: node.address,
                        port: node.port,
                        proxyUrl: node.proxyUrl,
                    },
                ),
            );
            return false;
        }
        return results.every((result) => result.status === 'fulfilled' && result.value);
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
