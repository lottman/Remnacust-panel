import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { LegacyBillingService } from '@common/host-policy/legacy-billing.service';
import { ok } from '@common/types';

import { QUEUES_NAMES } from '@queue/queue.enum';

import { USERS_JOB_NAMES } from '../constants/users-job-name.constant';

@Processor(QUEUES_NAMES.USERS.UPDATE_USERS_USAGE, { concurrency: 5 })
export class UpdateUsersUsageQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(UpdateUsersUsageQueueProcessor.name);
    constructor(private readonly billing: LegacyBillingService) {
        super();
    }
    async process(job: Job) {
        if (job.name !== USERS_JOB_NAMES.UPDATE_USERS_USAGE) {
            this.logger.warn(`Job "${job.name}" is not handled.`);
            return;
        }
        try {
            const receipt = await this.billing.prepare(job);
            return ok({ affectedRows: await this.billing.settle(receipt) });
        } catch (error) {
            this.logger.error(`Legacy usage billing failed: ${error}`);
            throw error;
        }
    }
}
