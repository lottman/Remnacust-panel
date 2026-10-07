import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { SubscriptionResponseRulesModule } from '@modules/subscription-response-rules/subscription-response-rules.module';

import { QUERIES } from './queries';
import { SubscriptionSettingsRepository } from './repositories/subscription-settings.repository';
import { SubscriptionSettingsController } from './subscription-settings.controller';
import { SubscriptionSettingsConverter } from './subscription-settings.converter';
import { SubscriptionSettingsService } from './subscription-settings.service';

@Module({
    imports: [CqrsModule, SubscriptionResponseRulesModule],
    controllers: [SubscriptionSettingsController],
    providers: [
        SubscriptionSettingsService,
        SubscriptionSettingsRepository,
        SubscriptionSettingsConverter,
        ...QUERIES,
    ],
    exports: [],
})
export class SubscriptionSettingsModule {}
