import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';

import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';

import { useBullBoard, useQueueProcessor } from '@common/utils/startup-app';

import { WebhookModule } from '@integration-modules/notifications/webhook-module/webhook.module';

import { QUEUES_NAMES } from '../../queue.enum';
import { WebhookLoggerQueueProcessor } from './webhook-logger.processor';
import { WebhookLoggerQueueService } from './webhook-logger.service';

const requiredModules = [
    HttpModule,
    ConditionalModule.registerWhen(WebhookModule, 'WEBHOOK_ENABLED'),
];

const processors = [WebhookLoggerQueueProcessor];
const services = [WebhookLoggerQueueService];

const queues = [BullModule.registerQueue({ name: QUEUES_NAMES.NOTIFICATIONS.WEBHOOK })];

const bullBoard = [
    BullBoardModule.forFeature({
        name: QUEUES_NAMES.NOTIFICATIONS.WEBHOOK,
        adapter: BullMQAdapter,
    }),
];

const providers = useQueueProcessor() ? processors : [];
const imports = useBullBoard() ? bullBoard : [];

@Module({
    imports: [...queues, ...imports, ...requiredModules],
    providers: [...providers, ...services],
    exports: [...services],
})
export class WebhookLoggerQueueModule {}
