import { Job } from 'bullmq';

import { BullModule, Processor, WorkerHost } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosModule } from '@common/axios/axios.module';
import { useQueueProcessor } from '@common/utils/startup-app';

import { NodesModule } from '@modules/nodes/nodes.module';

import { CoreManagementController } from './core-management.controller';
import { CoreManagementService } from './core-management.service';
import { CORE_QUEUE, CoreJobData } from './core-management.types';

@Processor(CORE_QUEUE, { concurrency: 1 })
class CoreManagementProcessor extends WorkerHost {
    constructor(private readonly service: CoreManagementService) {
        super();
    }
    async process(job: Job<CoreJobData>) {
        return this.service.process(job);
    }
}
@Module({
    imports: [CqrsModule, NodesModule, AxiosModule, BullModule.registerQueue({ name: CORE_QUEUE })],
    controllers: [CoreManagementController],
    providers: [CoreManagementService, ...(useQueueProcessor() ? [CoreManagementProcessor] : [])],
})
export class CoreManagementModule {}
