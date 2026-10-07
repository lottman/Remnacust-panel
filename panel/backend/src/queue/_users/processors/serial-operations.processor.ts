import { Job } from 'bullmq';
import dayjs from 'dayjs';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { TypedConfigService } from '@common/config/app-config';
import { ok, TResult } from '@common/types';
import { wrapBigInt, wrapBigIntNullable } from '@common/utils';
import { EVENTS, TUsersStatus, USERS_STATUS } from '@libs/contracts/constants';

import { BulkAllExtendExpirationDateCommand } from '@modules/users/commands/bulk-all-extend-expiration-date';
import { BulkDeleteByStatusCommand } from '@modules/users/commands/bulk-delete-by-status';
import { BulkSyncUsersCommand } from '@modules/users/commands/bulk-sync-users';
import { BulkUpdateAllUsersCommand } from '@modules/users/commands/bulk-update-all-users';
import { BulkAllUpdateUsersBodyDto } from '@modules/users/dtos/bulk/bulk-operations.dto';
import { GetUsersByExpireAtQuery } from '@modules/users/queries/get-users-by-expire-at/get-users-by-expire-at.query';

import { NodesQueuesService } from '@queue/_nodes/nodes-queues.service';
import { QUEUES_NAMES } from '@queue/queue.enum';

import { USERS_JOB_NAMES } from '../constants/users-job-name.constant';
import { UsersQueuesService } from '../users-queues.service';

@Processor(QUEUES_NAMES.USERS.SERIAL_OPERATIONS, {
    concurrency: 1,
})
export class SerialUsersOperationsQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(SerialUsersOperationsQueueProcessor.name);

    constructor(
        private readonly queryBus: QueryBus,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly commandBus: CommandBus,
        private readonly configService: TypedConfigService,
        private readonly usersQueuesService: UsersQueuesService,
    ) {
        super();
    }

    async process(job: Job) {
        switch (job.name) {
            case USERS_JOB_NAMES.EXPIRE_USER_NOTIFICATIONS:
                return await this.handleExpireUserNotifications();
            case USERS_JOB_NAMES.DELETE_BY_STATUS:
                return await this.handleBulkDeleteByStatusJob(job);
            case USERS_JOB_NAMES.BULK_UPDATE_ALL_USERS:
                return await this.handleBulkUpdateAllUsersJob(job);
            case USERS_JOB_NAMES.BULK_ALL_EXTEND_EXPIRATION_DATE:
                return await this.handleBulkAllExtendExpirationDateJob(job);
            default:
                this.logger.warn(`Job "${job.name}" is not handled.`);
                break;
        }
    }

    private async handleExpireUserNotifications() {
        const intervals = this.configService.get('EXPIRATION_NOTIFICATIONS');

        if (!intervals) {
            return;
        }

        const now = dayjs().utc();

        try {
            for (const interval of intervals) {
                const targetTime = now.subtract(interval, 'hours');
                const start = targetTime.startOf('minute').toDate();
                const end = targetTime.endOf('minute').toDate();

                const getUsersByExpireAtResult = await this.queryBus.execute(
                    new GetUsersByExpireAtQuery(start, end),
                );

                if (!getUsersByExpireAtResult.isOk) {
                    continue;
                }

                if (getUsersByExpireAtResult.response.length === 0) {
                    continue;
                }

                const { response: users } = getUsersByExpireAtResult;

                this.logger.log(
                    `[${USERS_JOB_NAMES.EXPIRE_USER_NOTIFICATIONS}] interval ${interval > 0 ? '+' : ''}${interval}h → ${users.length} user(s).`,
                );

                let skipTelegramNotification = false;

                if (users.length >= 500) {
                    this.logger.warn(
                        'More than 500 users found for sending expiration notification, skipping Telegram events.',
                    );

                    skipTelegramNotification = true;
                }

                await this.usersQueuesService.fireUserEventBulk({
                    users,
                    userEvent: EVENTS.USER.EXPIRATION,
                    meta: {
                        expiration: interval,
                    },
                    skipTelegramNotification,
                });
            }
        } catch (error) {
            this.logger.error(
                `Error handling "${USERS_JOB_NAMES.EXPIRE_USER_NOTIFICATIONS}" job: ${error}`,
            );
            return {
                isOk: false,
            };
        }
    }

    private async handleBulkDeleteByStatusJob(job: Job<{ status: TUsersStatus }>) {
        try {
            const { status } = job.data;

            let deletedCount = 0;
            let hasMoreData = true;

            while (hasMoreData) {
                const result = await this.bulkDeleteByStatus(status, 30_000);

                if (!result.isOk) {
                    this.logger.error(
                        `Error handling "${USERS_JOB_NAMES.DELETE_BY_STATUS}" job: ${result.message}`,
                    );
                    break;
                }

                this.logger.debug(
                    `Deleted ${result.response.deletedCount} users with status "${status}"`,
                );

                deletedCount += result.response.deletedCount;
                hasMoreData = result.response.deletedCount > 0;
            }

            this.logger.log(
                `Deleted ${deletedCount} users with status "${status}", starting all nodes.`,
            );

            if (status === USERS_STATUS.ACTIVE) {
                await this.nodesQueuesService.startAllNodesWithoutDeduplication({
                    emitter: 'bulkDeleteByStatus',
                });
            }

            return ok({
                deletedCount,
            });
        } catch (error) {
            this.logger.error(`Error handling "${USERS_JOB_NAMES.DELETE_BY_STATUS}" job: ${error}`);
        }
    }

    private async bulkDeleteByStatus(
        status: TUsersStatus,
        limit?: number,
    ): Promise<
        TResult<{
            deletedCount: number;
        }>
    > {
        return this.commandBus.execute<
            BulkDeleteByStatusCommand,
            TResult<{
                deletedCount: number;
            }>
        >(new BulkDeleteByStatusCommand(status, limit));
    }

    private async handleBulkUpdateAllUsersJob(job: Job<{ dto: BulkAllUpdateUsersBodyDto }>) {
        try {
            const { dto } = job.data;

            await this.commandBus.execute(
                new BulkUpdateAllUsersCommand({
                    ...dto,
                    lastTriggeredThreshold: dto.trafficLimitBytes !== undefined ? 0 : undefined,
                    trafficLimitBytes: wrapBigInt(dto.trafficLimitBytes),
                    telegramId: wrapBigIntNullable(dto.telegramId),
                    hwidDeviceLimit: dto.hwidDeviceLimit,
                }),
            );

            if (dto.trafficLimitBytes !== undefined) {
                await this.commandBus.execute(new BulkSyncUsersCommand('limited'));
            }

            if (dto.expireAt !== undefined) {
                await this.commandBus.execute(new BulkSyncUsersCommand('expired'));
            }

            await this.nodesQueuesService.startAllNodesWithoutDeduplication({
                emitter: 'bulkUpdateAllUsers',
            });
        } catch (error) {
            this.logger.error(
                `Error handling "${USERS_JOB_NAMES.BULK_UPDATE_ALL_USERS}" job: ${error}`,
            );
        }
    }

    private async handleBulkAllExtendExpirationDateJob(job: Job<{ extendDays: number }>) {
        try {
            const { extendDays } = job.data;

            await this.commandBus.execute(new BulkAllExtendExpirationDateCommand(extendDays));

            await this.commandBus.execute(new BulkSyncUsersCommand('expired'));

            await this.nodesQueuesService.startAllNodesWithoutDeduplication({
                emitter: 'bulkAllExtendExpirationDate',
            });
        } catch (error) {
            this.logger.error(
                `Error handling "${USERS_JOB_NAMES.BULK_ALL_EXTEND_EXPIRATION_DATE}" job: ${error}`,
            );
        }
    }
}
