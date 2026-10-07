import { Global, Module } from '@nestjs/common';

import { HostAccessService } from './host-access.service';
import { HostPolicyService } from './host-policy.service';
import { HostUsageService } from './host-usage.service';
@Global()
@Module({
    providers: [HostPolicyService, HostAccessService, HostUsageService],
    exports: [HostPolicyService, HostAccessService, HostUsageService],
})
export class HostPolicyModule {}
