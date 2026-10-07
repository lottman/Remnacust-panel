import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';

import { TypedConfigService } from '@common/config/app-config';

import { JOBS_INTERVALS } from '@scheduler/intervals';

import { ServiceQueueService } from '@queue/service';

@Injectable()
export class CleanOldUsageRecordsTask implements OnApplicationBootstrap {
    private static readonly CRON_NAME = 'cleanOldUsageRecords';
    private readonly logger = new Logger(CleanOldUsageRecordsTask.name);

    constructor(
        private readonly serviceQueueService: ServiceQueueService,
        private readonly configService: TypedConfigService,
        private schedulerRegistry: SchedulerRegistry,
    ) {}

    public async onApplicationBootstrap() {
        const isServiceEnabled = this.configService.getOrThrow('SERVICE_CLEAN_USAGE_HISTORY');

        if (isServiceEnabled) {
            const job = this.schedulerRegistry.getCronJob(CleanOldUsageRecordsTask.CRON_NAME);

            if (job) {
                job.start();
                this.logger.log('Clean old usage records job enabled.');
            } else {
                this.logger.warn('Clean old usage records job not found.');
            }
        } else {
            try {
                this.schedulerRegistry.deleteCronJob(CleanOldUsageRecordsTask.CRON_NAME);

                this.logger.log('Clean old usage records job disabled.');
            } catch (error) {
                this.logger.error(
                    `Error deleting "${CleanOldUsageRecordsTask.CRON_NAME}" cron job: ${error}`,
                );
            }
        }
    }

    @Cron(JOBS_INTERVALS.SERVICE.CLEAN_OLD_USAGE_RECORDS, {
        name: CleanOldUsageRecordsTask.CRON_NAME,
        waitForCompletion: true,
        disabled: true,
    })
    async handleCron() {
        try {
            await this.serviceQueueService.cleanOldUsageRecords({});
        } catch (error) {
            this.logger.error(`Error in CleanOldUsageRecordsTask: ${error}`);
        }
    }
}
