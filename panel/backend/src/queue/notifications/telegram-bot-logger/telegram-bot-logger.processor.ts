import { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit, Optional } from '@nestjs/common';

import { TelegramApiError } from '@integration-modules/notifications/telegram-bot/telegram-api.error';
import { TelegramApiService } from '@integration-modules/notifications/telegram-bot/telegram-api.service';

import { QUEUES_NAMES } from '../../queue.enum';
import { TelegramBotLoggerJobNames } from './enums';
import { IMessageEventPayload } from './interfaces';
import { TelegramBotLoggerQueueService } from './telegram-bot-logger.service';

@Processor(QUEUES_NAMES.NOTIFICATIONS.TELEGRAM, {
    concurrency: 100,
    autorun: false,
    limiter: {
        max: 20,
        duration: 1_000,
    },
})
export class TelegramBotLoggerQueueProcessor extends WorkerHost implements OnModuleInit {
    private readonly logger = new Logger(TelegramBotLoggerQueueProcessor.name);

    constructor(
        @Optional()
        private readonly telegramApiService: TelegramApiService,
        private readonly telegramBotLoggerQueueService: TelegramBotLoggerQueueService,
    ) {
        super();
    }

    async onModuleInit() {
        if (!this.telegramApiService) return;

        const isHealthy = await this.telegramApiService.healthcheck();
        if (!isHealthy) {
            this.logger.error('Telegram API is not healthy. Worker will not start.');
            return;
        }

        this.worker.run();
    }

    async process(job: Job) {
        if (!this.telegramApiService) {
            this.logger.error('Telegram API is not healthy. Skipping job.');
            return;
        }

        switch (job.name) {
            case TelegramBotLoggerJobNames.sendTelegramMessage:
                return await this.handleSendTelegramMessage(job);
            default:
                this.logger.warn(`Job "${job.name}" is not handled.`);
                break;
        }
    }

    private async handleSendTelegramMessage(job: Job<IMessageEventPayload>) {
        const { message, chatId, threadId, keyboard } = job.data;

        try {
            await this.telegramApiService.sendMessage(chatId, message, {
                threadId: threadId ? parseInt(threadId, 10) : undefined,
                keyboard,
            });
        } catch (error) {
            if (error instanceof TelegramApiError && error.retryAfter) {
                await this.telegramBotLoggerQueueService.rateLimit(error.retryAfter);

                throw Worker.RateLimitError();
            }
            this.logger.error(
                `Error handling "${TelegramBotLoggerJobNames.sendTelegramMessage}" job: ${error}`,
            );

            throw error;
        }
    }
}
