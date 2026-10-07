import { Queue } from 'bullmq';
import _ from 'lodash';

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { QUEUES_NAMES } from '../../queue.enum';
import { AbstractQueueService } from '../../queue.service';
import { WebhookLoggerJobNames } from './enums';
import { IBaseWebhookLogger } from './interfaces';

@Injectable()
export class WebhookLoggerQueueService
    extends AbstractQueueService
    implements OnApplicationBootstrap
{
    protected readonly logger: Logger = new Logger(
        _.upperFirst(_.camelCase(QUEUES_NAMES.NOTIFICATIONS.WEBHOOK)),
    );

    private _queue: Queue;

    get queue(): Queue {
        return this._queue;
    }

    constructor(
        @InjectQueue(QUEUES_NAMES.NOTIFICATIONS.WEBHOOK) private readonly webhookLoggerQueue: Queue,
    ) {
        super();
        this._queue = this.webhookLoggerQueue;
    }

    public async onApplicationBootstrap(): Promise<void> {
        await this.checkConnection();
    }

    public async sendWebhooks(payload: IBaseWebhookLogger, webhookUrls: string[]) {
        if (webhookUrls.length === 0) {
            return;
        }

        return this.addBulk(
            webhookUrls.map((url) => ({
                name: WebhookLoggerJobNames.sendWebhook,
                data: {
                    ...payload,
                    url: url,
                },
                opts: {
                    removeOnComplete: {
                        count: 800,
                    },
                    removeOnFail: {
                        count: 2000,
                    },
                },
            })),
        );
    }
}
