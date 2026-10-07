import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import {
    InfraBillingHistoryConverter,
    InfraBillingNodeConverter,
    InfraProviderConverter,
} from './converters';
import { InfraBillingController } from './infra-billing.controller';
import { InfraBillingService } from './infra-billing.service';
import { QUERIES } from './queries';
import {
    InfraBillingHistoryRepository,
    InfraBillingNodeRepository,
    InfraProviderRepository,
} from './repositories';

@Module({
    imports: [CqrsModule],
    controllers: [InfraBillingController],
    providers: [
        InfraBillingHistoryRepository,
        InfraBillingNodeRepository,
        InfraProviderRepository,
        InfraBillingHistoryConverter,
        InfraBillingNodeConverter,
        InfraProviderConverter,
        InfraBillingService,
        ...QUERIES,
    ],
})
export class InfraBillingModule {}
