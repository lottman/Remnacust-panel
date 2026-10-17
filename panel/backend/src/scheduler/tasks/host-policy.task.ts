import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { HostPolicyService } from '@common/host-policy/host-policy.service';
import { QuotaSettlementService } from '@common/host-policy/quota-settlement.service';

@Injectable()
export class HostPolicyTask {
    private readonly logger = new Logger(HostPolicyTask.name);
    constructor(
        private readonly policies: HostPolicyService,
        private readonly settlement: QuotaSettlementService,
    ) {}

    @Cron('*/10 * * * * *', { name: 'hostPolicySync', waitForCompletion: true })
    async run() {
        const results = await Promise.allSettled([
            this.policies.syncConnected(),
            this.settlement.syncConnected(),
        ]);
        for (const result of results)
            if (result.status === 'rejected') this.logger.error(String(result.reason));
    }
}
