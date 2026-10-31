import { Global, Module } from '@nestjs/common';

import { SubscriptionDomainsController } from './subscription-domains.controller';
import { SubscriptionDomainsService } from './subscription-domains.service';
@Global()
@Module({
    providers: [SubscriptionDomainsService],
    exports: [SubscriptionDomainsService],
    controllers: [SubscriptionDomainsController],
})
export class SubscriptionDomainsModule {}
