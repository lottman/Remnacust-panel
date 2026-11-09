import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS } from '@libs/contracts/constants';

import { SubscriptionSettingsEntity } from '@modules/subscription-settings/entities';

import { SubscriptionSettingsRepository } from '../../repositories/subscription-settings.repository';
import { GetCachedSubscriptionSettingsQuery } from './get-cached-subscrtipion-settings.query';

@QueryHandler(GetCachedSubscriptionSettingsQuery)
export class GetCachedSubscriptionSettingsHandler implements IQueryHandler<GetCachedSubscriptionSettingsQuery> {
    private readonly logger = new Logger(GetCachedSubscriptionSettingsHandler.name);

    constructor(
        private readonly subscriptionSettingsRepository: SubscriptionSettingsRepository,
        private readonly rawCacheService: RawCacheService,
    ) {}

    async execute() {
        let generation: string | undefined;
        try {
            const snapshot =
                await this.rawCacheService.templateSnapshot<SubscriptionSettingsEntity>(
                    CACHE_KEYS.SUBSCRIPTION_SETTINGS,
                );
            generation = snapshot.generation;
            const cached = snapshot.value;

            if (cached) {
                return structuredClone(cached);
            }
        } catch (error) {
            this.logger.warn(
                `Subscription settings cache read failed: ${error instanceof Error ? error.name : 'unknown'}`,
            );
        }

        try {
            const settings = await this.subscriptionSettingsRepository.findFirst();

            if (!settings) {
                return null;
            }

            try {
                if (generation)
                    await this.rawCacheService.setTemplateSnapshot(
                        CACHE_KEYS.SUBSCRIPTION_SETTINGS,
                        generation,
                        settings,
                    );
            } catch (error) {
                this.logger.warn(
                    `Subscription settings cache write failed: ${error instanceof Error ? error.name : 'unknown'}`,
                );
            }

            return settings;
        } catch (error) {
            this.logger.error(error);
            return null;
        }
    }
}
