import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { fail, ok, TResult } from '@common/types';
import { ERRORS, EVENTS } from '@libs/contracts/constants';
import { THwidSettings } from '@libs/contracts/models';

import { UserHwidDeviceEvent } from '@integration-modules/notifications/interfaces';

import { GetCachedExternalSquadSettingsQuery } from '@modules/external-squads/queries/get-cached-external-squad-settings';
import { GetCachedSubscriptionSettingsQuery } from '@modules/subscription-settings/queries/get-cached-subscrtipion-settings';
import { GetUserByUniqueFieldQuery } from '@modules/users/queries/get-user-by-unique-field';

import { DeviceAccessService } from './device-access.service';
import { CreateUserHwidDeviceBodyDto, GetHwidDevicesQueryDto } from './dtos';
import { HwidUserDeviceEntity } from './entities/hwid-user-device.entity';
import { GetHwidDevicesStatsResponseModel, GetTopUsersByHwidDevicesResponseModel } from './models';
import { HwidUserDevicesRepository } from './repositories/hwid-user-devices.repository';

@Injectable()
export class HwidUserDevicesService {
    private readonly logger = new Logger(HwidUserDevicesService.name);

    constructor(
        private readonly eventEmitter: EventEmitter2,
        private readonly hwidUserDevicesRepository: HwidUserDevicesRepository,
        private readonly queryBus: QueryBus,
        private readonly deviceAccess: DeviceAccessService,
    ) {}

    public async createUserHwidDevice(
        dto: CreateUserHwidDeviceBodyDto,
    ): Promise<TResult<HwidUserDeviceEntity[]>> {
        try {
            const user = await this.queryBus.execute(
                new GetUserByUniqueFieldQuery(
                    {
                        id: BigInt(dto.userId),
                    },
                    {
                        activeInternalSquads: false,
                    },
                ),
            );

            if (!user.isOk) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            const isDeviceExists = await this.hwidUserDevicesRepository.checkHwidExists(
                dto.hwid,
                user.response.id,
            );

            if (isDeviceExists.exists) {
                return fail(ERRORS.USER_HWID_DEVICE_ALREADY_EXISTS);
            }

            let hwidSettings: THwidSettings | undefined;

            const subscrtipionSettings = await this.queryBus.execute(
                new GetCachedSubscriptionSettingsQuery(),
            );

            if (!subscrtipionSettings) {
                return fail(ERRORS.SUBSCRIPTION_SETTINGS_NOT_FOUND);
            }

            if (subscrtipionSettings.hwidSettings.enabled) {
                hwidSettings = subscrtipionSettings.hwidSettings;
            }

            if (user.response.externalSquadUuid) {
                const externalSquadSettings = await this.queryBus.execute(
                    new GetCachedExternalSquadSettingsQuery(user.response.externalSquadUuid),
                );

                if (externalSquadSettings && externalSquadSettings.hwidSettings) {
                    hwidSettings = externalSquadSettings.hwidSettings;
                }
            }

            const deviceLimit =
                hwidSettings?.enabled && user.response.hwidDeviceLimit !== 0
                    ? (user.response.hwidDeviceLimit ?? hwidSettings.fallbackDeviceLimit)
                    : Number.MAX_SAFE_INTEGER;
            const creation = await this.hwidUserDevicesRepository.createWithAdvisoryLock(
                new HwidUserDeviceEntity({
                    hwid: dto.hwid,
                    userId: user.response.id,
                    platform: dto.platform,
                    osVersion: dto.osVersion,
                    deviceModel: dto.deviceModel,
                    userAgent: dto.userAgent,
                    requestIp: dto.requestIp,
                }),
                deviceLimit,
            );
            if (creation.status === 'REGISTRATION_BLOCKED') return fail(ERRORS.FORBIDDEN);
            if (creation.status === 'LIMIT_REACHED')
                return fail(ERRORS.USER_HWID_DEVICE_LIMIT_REACHED);
            if (creation.status === 'EXISTS') return fail(ERRORS.USER_HWID_DEVICE_ALREADY_EXISTS);
            if (!creation.hwidDevice) return fail(ERRORS.FORBIDDEN);
            const result = creation.hwidDevice;

            if (
                this.deviceAccess.enabled &&
                !(await this.deviceAccess.syncDevice(user.response.id, dto.hwid, false))
            ) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            this.eventEmitter.emit(
                EVENTS.USER_HWID_DEVICES.ADDED,
                new UserHwidDeviceEvent(user.response, result, EVENTS.USER_HWID_DEVICES.ADDED),
            );

            const userHwidDevices = await this.hwidUserDevicesRepository.findByCriteria({
                userId: user.response.id,
            });

            return ok(userHwidDevices);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.CREATE_HWID_USER_DEVICE_ERROR);
        }
    }

    public async getUserHwidDevices(userId: number): Promise<TResult<HwidUserDeviceEntity[]>> {
        try {
            const user = await this.queryBus.execute(
                new GetUserByUniqueFieldQuery(
                    {
                        id: BigInt(userId),
                    },
                    {
                        activeInternalSquads: false,
                    },
                ),
            );

            if (!user.isOk) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            const userHwidDevices = await this.hwidUserDevicesRepository.findByCriteria({
                userId: user.response.id,
            });

            return ok(userHwidDevices);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_USER_HWID_DEVICES_ERROR);
        }
    }

    public async blockUserHwidDevice(
        hwid: string,
        userId: number,
        blocked: boolean,
    ): Promise<TResult<HwidUserDeviceEntity[]>> {
        try {
            const user = await this.queryBus.execute(
                new GetUserByUniqueFieldQuery(
                    {
                        id: BigInt(userId),
                    },
                    {
                        activeInternalSquads: false,
                    },
                ),
            );

            if (!user.isOk) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            const hwidDevice = await this.hwidUserDevicesRepository.findFirstByCriteria({
                hwid,
                userId: user.response.id,
            });

            if (!hwidDevice) {
                return fail(ERRORS.HWID_DEVICE_NOT_FOUND);
            }

            // A shared user credential cannot be revoked for just one HWID. Do not
            // report a successful traffic block when the personal-key cutover is off.
            if (blocked && !this.deviceAccess.enabled) {
                return fail(ERRORS.HWID_DEVICE_ENFORCEMENT_UNAVAILABLE);
            }

            await this.hwidUserDevicesRepository.blockByHwidAndUserId(
                hwid,
                user.response.id,
                blocked,
            );
            if (
                this.deviceAccess.enabled &&
                !blocked &&
                !(await this.deviceAccess.syncDevice(user.response.id, hwid, false))
            ) {
                return fail(ERRORS.HWID_DEVICE_BLOCK_ERROR);
            }
            if (this.deviceAccess.enabled && blocked) {
                const revocations = await Promise.allSettled([
                    this.deviceAccess.retireSharedCredential(
                        user.response.id,
                        user.response.vlessUuid,
                        true,
                    ),
                    this.deviceAccess.syncDevice(user.response.id, hwid, true, true),
                ]);
                if (!revocations.every((r) => r.status === 'fulfilled' && r.value)) {
                    // Keep the deny state durable. Failed or offline nodes are reconciled from
                    // the authoritative panel config when they reconnect; do not roll back ban.
                    return fail(ERRORS.HWID_DEVICE_ENFORCEMENT_UNAVAILABLE);
                }
            }

            const devices = await this.getUserHwidDevices(Number(user.response.id));
            return devices.isOk ? ok(devices.response) : fail(ERRORS.INTERNAL_SERVER_ERROR);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.HWID_DEVICE_BLOCK_ERROR);
        }
    }

    public async deleteUserHwidDevice(
        hwid: string,
        userId: number,
    ): Promise<TResult<HwidUserDeviceEntity[]>> {
        try {
            const user = await this.queryBus.execute(
                new GetUserByUniqueFieldQuery(
                    {
                        id: BigInt(userId),
                    },
                    {
                        activeInternalSquads: false,
                    },
                ),
            );

            if (!user.isOk) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            const hwidDevice = await this.hwidUserDevicesRepository.findFirstByCriteria({
                hwid,
                userId: user.response.id,
            });

            if (!hwidDevice) {
                // Retrying an accepted deletion after a lost HTTP response is harmless.
                return ok(
                    await this.hwidUserDevicesRepository.findByCriteria({
                        userId: user.response.id,
                    }),
                );
            }

            const deleted = await this.hwidUserDevicesRepository.deleteDevicesAndQueue(
                user.response.id,
                [hwidDevice],
                true,
                this.deviceAccess.enabled,
            );
            if (!deleted.includes(hwid)) return fail(ERRORS.DELETE_HWID_USER_DEVICE_ERROR);
            this.deviceAccess.kickReconciliation();

            this.eventEmitter.emit(
                EVENTS.USER_HWID_DEVICES.DELETED,
                new UserHwidDeviceEvent(
                    user.response,
                    hwidDevice,
                    EVENTS.USER_HWID_DEVICES.DELETED,
                ),
            );

            const userHwidDevices = await this.hwidUserDevicesRepository.findByCriteria({
                userId: user.response.id,
            });

            return ok(userHwidDevices);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.DELETE_HWID_USER_DEVICE_ERROR);
        }
    }

    public async deleteAllUserHwidDevices(
        userId: number,
    ): Promise<TResult<HwidUserDeviceEntity[]>> {
        try {
            const user = await this.queryBus.execute(
                new GetUserByUniqueFieldQuery(
                    {
                        id: BigInt(userId),
                    },
                    {
                        activeInternalSquads: false,
                    },
                ),
            );

            if (!user.isOk) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            const devices = await this.hwidUserDevicesRepository.findByCriteria({
                userId: user.response.id,
                blocked: false,
            });
            await this.hwidUserDevicesRepository.deleteDevicesAndQueue(
                user.response.id,
                devices,
                false,
                this.deviceAccess.enabled,
            );
            this.deviceAccess.kickReconciliation();

            const userHwidDevices = await this.hwidUserDevicesRepository.findByCriteria({
                userId: user.response.id,
            });

            return ok(userHwidDevices);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.DELETE_HWID_USER_DEVICES_ERROR);
        }
    }

    public async getAllHwidDevices(dto: GetHwidDevicesQueryDto): Promise<
        TResult<{
            total: number;
            devices: HwidUserDeviceEntity[];
        }>
    > {
        try {
            const [devices, total] = await this.hwidUserDevicesRepository.getAllHwidDevices(dto);

            return ok({ devices, total });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_ALL_HWID_DEVICES_ERROR);
        }
    }

    public async getHwidDevicesStats(): Promise<TResult<GetHwidDevicesStatsResponseModel>> {
        try {
            const stats = await this.hwidUserDevicesRepository.getHwidDevicesStats();

            return ok(
                new GetHwidDevicesStatsResponseModel({
                    byPlatform: stats.byPlatform,
                    stats: stats.stats,
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_HWID_DEVICES_STATS_ERROR);
        }
    }

    public async getTopUsersByHwidDevices(dto: {
        start: number;
        size: number;
    }): Promise<TResult<GetTopUsersByHwidDevicesResponseModel>> {
        try {
            const result = await this.hwidUserDevicesRepository.getTopUsersByHwidDevices(dto);

            return ok(
                new GetTopUsersByHwidDevicesResponseModel({
                    users: result.users,
                    total: result.total,
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}
