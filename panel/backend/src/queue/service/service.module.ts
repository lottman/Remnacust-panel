import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { useBullBoard, useQueueProcessor } from '@common/utils/startup-app';

import { QUEUES_NAMES } from '../queue.enum';
import { ServiceQueueProcessor } from './service.processor';
import { ServiceQueueService } from './service.service';

const requiredModules = [CqrsModule];

const processors = [ServiceQueueProcessor];
const services = [ServiceQueueService];

const queues = [BullModule.registerQueue({ name: QUEUES_NAMES.SERVICE })];

const bullBoard = [
    BullBoardModule.forFeature({ name: QUEUES_NAMES.SERVICE, adapter: BullMQAdapter }),
];

const providers = useQueueProcessor() ? processors : [];
const imports = useBullBoard() ? bullBoard : [];

@Module({
    imports: [...queues, ...imports, ...requiredModules],
    providers: [...providers, ...services],
    exports: [...services],
})
export class ServiceQueueModule {}
