import { Global, Module } from '@nestjs/common';

import { SubscriptionDomainEnvironmentService } from './subscription-domain-environment.service';
import { SubscriptionDomainsController } from './subscription-domains.controller';
import { SubscriptionDomainsService } from './subscription-domains.service';
@Global()
@Module({
    providers: [SubscriptionDomainsService, SubscriptionDomainEnvironmentService],
    exports: [SubscriptionDomainsService],
    controllers: [SubscriptionDomainsController],
})
export class SubscriptionDomainsModule {}
