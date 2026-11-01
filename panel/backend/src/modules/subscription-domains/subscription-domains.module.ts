import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { SubscriptionDomainEnvironmentService } from './subscription-domain-environment.service';
import { SubscriptionDomainGatewayController } from './subscription-domain-gateway.controller';
import { SubscriptionDomainsController } from './subscription-domains.controller';
import { SubscriptionDomainsService } from './subscription-domains.service';
import { UserDomainLinksController } from './user-domain-links.controller';
@Global()
@Module({
    imports: [CqrsModule],
    providers: [SubscriptionDomainsService, SubscriptionDomainEnvironmentService],
    exports: [SubscriptionDomainsService],
    controllers: [
        SubscriptionDomainsController,
        SubscriptionDomainGatewayController,
        UserDomainLinksController,
    ],
})
export class SubscriptionDomainsModule {}
