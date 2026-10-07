import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';

import { TypedConfigService } from '@common/config/app-config';

import { UsersQueuesService } from '@queue/_users';

import { JOBS_INTERVALS } from '../../../intervals';

@Injectable()
export class FindUsersForExpireNotificationsTask implements OnApplicationBootstrap {
    private static readonly CRON_NAME = 'findUsersForExpireNotifications';
    private readonly logger = new Logger(FindUsersForExpireNotificationsTask.name);

    constructor(
        private readonly usersQueuesService: UsersQueuesService,
        private readonly configService: TypedConfigService,
        private schedulerRegistry: SchedulerRegistry,
    ) {}

    public async onApplicationBootstrap() {
        const isJobEnabled = this.configService.getOrThrow('EXPIRATION_NOTIFICATIONS_ENABLED');

        const isTelegramLoggerEnabled = this.configService.getOrThrow(
            'IS_TELEGRAM_NOTIFICATIONS_ENABLED',
        );

        const isWebhookLoggerEnabled = this.configService.getOrThrow('WEBHOOK_ENABLED');

        if (isJobEnabled && (isTelegramLoggerEnabled || isWebhookLoggerEnabled)) {
            const job = this.schedulerRegistry.getCronJob(
                FindUsersForExpireNotificationsTask.CRON_NAME,
            );

            if (job) {
                job.start();
                this.logger.log('Job enabled.');
            }
        } else {
            this.schedulerRegistry.deleteCronJob(FindUsersForExpireNotificationsTask.CRON_NAME);

            this.logger.log('Job disabled.');
        }
    }

    @Cron(JOBS_INTERVALS.EXPIRE_NOTIFICATIONS, {
        name: FindUsersForExpireNotificationsTask.CRON_NAME,
        waitForCompletion: true,
        disabled: true,
    })
    async handleCron() {
        try {
            await this.usersQueuesService.expireUserNotifications({});
        } catch (error) {
            this.logger.error(`Error in FindUsersForExpireNotificationsTask: ${error}`);
        }
    }
}
