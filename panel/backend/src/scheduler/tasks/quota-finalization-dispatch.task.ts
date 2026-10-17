import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { QuotaFinalizationDispatchService } from '@common/host-policy/quota-finalization-dispatch.service';
@Injectable()
export class QuotaFinalizationDispatchTask {
    private readonly logger = new Logger(QuotaFinalizationDispatchTask.name);
    constructor(private readonly dispatcher: QuotaFinalizationDispatchService) {}
    @Cron('*/10 * * * * *', { name: 'quotaFinalizationDispatch', waitForCompletion: true })
    async run(): Promise<void> {
        try {
            await this.dispatcher.runOne();
        } catch {
            this.logger.error('Quota finalization dispatch failed; expired work will be retried');
        }
    }
}
