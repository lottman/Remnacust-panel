import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';

import { PrismaService } from '@common/database/prisma.service';

import { TruncateNodesUserUsageHistoryCommand } from '@modules/nodes-user-usage-history/commands/truncate-nodes-user-usage-history';
import { VacuumNodesUserUsageHistoryCommand } from '@modules/nodes-user-usage-history/commands/vacuum-nodes-user-usage-history';

import { UsersQueuesService } from '@queue/_users';

import { QUEUES_NAMES } from '../queue.enum';
import { ServiceJobNames } from './enums';

@Processor(QUEUES_NAMES.SERVICE, {
    concurrency: 1,
})
export class ServiceQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(ServiceQueueProcessor.name);

    constructor(
        private readonly commandBus: CommandBus,
        private readonly usersQueuesService: UsersQueuesService,
        private readonly prisma: PrismaService,
    ) {
        super();
    }

    async process(job: Job) {
        switch (job.name) {
            case ServiceJobNames.CLEAN_OLD_USAGE_RECORDS:
                return await this.handleCleanOldUsageRecordsJob();
            case ServiceJobNames.VACUUM_TABLES:
                return await this.handleVacuumTablesJob();
            default:
                this.logger.warn(`Job "${job.name}" is not handled.`);
                break;
        }
    }

    private async handleCleanOldUsageRecordsJob() {
        let paused = false;
        try {
            const [policy] = await this.prisma.$queryRaw<[{ active: boolean }]>`
                SELECT EXISTS(SELECT 1 FROM hosts WHERE user_traffic_limit_bytes > 0)
                    OR EXISTS(SELECT 1 FROM xera_host_tag_limits) AS active
            `;
            if (policy.active) {
                this.logger.warn(
                    'Usage history cleanup skipped while host or tag traffic quotas are active',
                );
                return;
            }
            await this.usersQueuesService.queues.updateUsersUsage.pause();
            paused = true;

            this.logger.log('Resetting tables...');

            await this.commandBus.execute(new TruncateNodesUserUsageHistoryCommand());

            await this.commandBus.execute(new VacuumNodesUserUsageHistoryCommand());

            this.logger.log('Tables resetted');
        } catch (error) {
            this.logger.error(
                `Error handling "${ServiceJobNames.CLEAN_OLD_USAGE_RECORDS}" job: ${error}`,
            );
        } finally {
            if (paused) await this.usersQueuesService.queues.updateUsersUsage.resume();
        }
    }

    private async handleVacuumTablesJob() {
        try {
            await this.commandBus.execute(new VacuumNodesUserUsageHistoryCommand());

            this.logger.log('Tables vacuumed successfully.');
        } catch (error) {
            this.logger.error(`Error handling "${ServiceJobNames.VACUUM_TABLES}" job: ${error}`);
        }
    }
}
