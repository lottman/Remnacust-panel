import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS, CACHE_KEYS_TTL } from '@libs/contracts/constants';

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
        try {
            const cached = await this.rawCacheService.get<SubscriptionSettingsEntity>(
                CACHE_KEYS.SUBSCRIPTION_SETTINGS,
                true,
            );

            if (cached) {
                return cached;
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
                await this.rawCacheService.set(
                    CACHE_KEYS.SUBSCRIPTION_SETTINGS,
                    settings,
                    CACHE_KEYS_TTL.SUBSCRIPTION_SETTINGS,
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
