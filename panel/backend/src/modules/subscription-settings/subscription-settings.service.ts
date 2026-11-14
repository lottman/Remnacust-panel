import { Injectable, Logger } from '@nestjs/common';

import { RawCacheService } from '@common/raw-cache';
import { fail, ok, TResult } from '@common/types';
import { CACHE_KEYS, ERRORS } from '@libs/contracts/constants';

import { ResponseRulesParserService } from '@modules/subscription-response-rules/services/response-rules-parser.service';

import { validateCustomRemarks } from '../../common/utils/templates/validate-custom-remarks';
import { UpdateSubscriptionSettingsBodyDto } from './dtos';
import { SubscriptionSettingsEntity } from './entities/subscription-settings.entity';
import { SubscriptionSettingsRepository } from './repositories/subscription-settings.repository';

@Injectable()
export class SubscriptionSettingsService {
    private readonly logger = new Logger(SubscriptionSettingsService.name);

    constructor(
        private readonly rawCacheService: RawCacheService,
        private readonly srrParser: ResponseRulesParserService,
        private readonly subscriptionSettingsRepository: SubscriptionSettingsRepository,
    ) {}

    public async getSubscriptionSettings(): Promise<TResult<SubscriptionSettingsEntity>> {
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

    public async updateSettings(
        dto: UpdateSubscriptionSettingsBodyDto,
    ): Promise<TResult<SubscriptionSettingsEntity>> {
        try {
            const settings = await this.subscriptionSettingsRepository.findByUUID(dto.uuid);

            if (!settings) {
                return fail(ERRORS.SUBSCRIPTION_SETTINGS_NOT_FOUND);
            }

            if (dto.responseRules) {
                try {
                    dto.responseRules = await this.srrParser.parseConfig(dto.responseRules);
                } catch (error) {
                    return fail(
                        ERRORS.CONFIG_VALIDATION_ERROR.withMessage(
                            error instanceof Error ? error.message : 'Unknown error',
                        ),
                    );
                }
            }

            if (dto.customRemarks) {
                const error = validateCustomRemarks(dto.customRemarks);
                if (error)
                    return fail(ERRORS.CUSTOM_RAW_REMARK_VALIDATION_ERROR.withMessage(error));
            }

            if (dto.customResponseHeaders && Object.keys(dto.customResponseHeaders).length > 0) {
                dto.customResponseHeaders = Object.fromEntries(
                    Object.entries(dto.customResponseHeaders).map(([key, value]) => [
                        key.toLowerCase(),
                        value,
                    ]),
                );
            }

            const updatedSettings = await this.subscriptionSettingsRepository.update({
                ...dto,
            });

            await this.rawCacheService.del(CACHE_KEYS.SUBSCRIPTION_SETTINGS);

            return ok(updatedSettings);
        } catch (error) {
            if (
                error instanceof Error &&
                [
                    'GEOFILES_REQUIRE_BASE_JSON',
                    'GEOFILES_PER_TEMPLATE',
                    'GEOFILES_SYSTEM_DISABLED',
                ].includes(error.message)
            )
                return fail(ERRORS.CONFIG_VALIDATION_ERROR.withMessage(error.message));
            this.logger.error(error);
            return fail(ERRORS.UPDATE_SUBSCRIPTION_SETTINGS_ERROR);
        }
    }
}
