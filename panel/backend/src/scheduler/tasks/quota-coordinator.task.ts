import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { QuotaCoordinatorService } from '@common/host-policy/quota-coordinator.service';

@Injectable()
export class QuotaCoordinatorTask {
    private readonly logger = new Logger(QuotaCoordinatorTask.name);
    constructor(private readonly coordinator: QuotaCoordinatorService) {}
    @Cron('*/10 * * * * *', { name: 'quotaCoordinator', waitForCompletion: true })
    async run(): Promise<void> {
        try {
            await this.coordinator.tick();
        } catch {
            this.logger.error('Quota coordinator tick failed; the next scheduled run will retry');
        }
    }
}
