import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HostPolicyService } from '@common/host-policy/host-policy.service';

@Injectable()
export class HostPolicyTask {
    private readonly logger = new Logger(HostPolicyTask.name);
    constructor(private readonly policies: HostPolicyService) {}

    @Cron('*/10 * * * * *', { name: 'hostPolicySync', waitForCompletion: true })
    async run() {
        try { await this.policies.syncConnected(); }
        catch (error) { this.logger.error(String(error)); }
    }
}
