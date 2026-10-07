import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { SubscriptionSettingsEntity } from '../../entities/subscription-settings.entity';
import { SubscriptionSettingsRepository } from '../../repositories/subscription-settings.repository';
import { GetSubscriptionSettingsQuery } from './get-subscription-settings.query';

@QueryHandler(GetSubscriptionSettingsQuery)
export class GetSubscriptionSettingsHandler implements IQueryHandler<
    GetSubscriptionSettingsQuery,
    TResult<SubscriptionSettingsEntity>
> {
    private readonly logger = new Logger(GetSubscriptionSettingsHandler.name);

    constructor(private readonly subscriptionSettingsRepository: SubscriptionSettingsRepository) {}

    async execute(): Promise<TResult<SubscriptionSettingsEntity>> {
        try {
            const settings = await this.subscriptionSettingsRepository.findFirst();

            if (!settings) {
                return fail(ERRORS.SUBSCRIPTION_SETTINGS_NOT_FOUND);
            }

            return ok(settings);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_SUBSCRIPTION_SETTINGS_ERROR);
        }
    }
}
