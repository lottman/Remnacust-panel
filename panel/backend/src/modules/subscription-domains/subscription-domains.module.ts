import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { SubscriptionDomainEnvironmentService } from './subscription-domain-environment.service';
import { SubscriptionDomainsController } from './subscription-domains.controller';
import { SubscriptionDomainsService } from './subscription-domains.service';
@Global()
@Module({
    imports: [CqrsModule],
    providers: [SubscriptionDomainsService, SubscriptionDomainEnvironmentService],
    exports: [SubscriptionDomainsService],
    controllers: [SubscriptionDomainsController],
})
export class SubscriptionDomainsModule {}
