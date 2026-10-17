import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';

import { QUEUES_NAMES } from '@queue/queue.enum';

import { NodeConfigurationService } from '../node-configuration.service';

@Processor(QUEUES_NAMES.NODES.START, { concurrency: 40 })
export class StartNodeProcessor extends WorkerHost {
    constructor(private readonly configurations: NodeConfigurationService) {
        super();
    }

    async process(job: Job<{ nodeUuid: string; force?: boolean }>) {
        return this.configurations.apply(job.data);
    }
}
