import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { RawCacheService } from '@common/raw-cache';
import { fail, ok } from '@common/types';
import { CACHE_KEYS, CACHE_KEYS_TTL, ERRORS } from '@libs/contracts/constants';

import { ExternalSquadRepository } from '@modules/external-squads/repositories/external-squad.repository';

import { GetCachedTemplateNameQuery } from './get-cached-template-name.query';

@QueryHandler(GetCachedTemplateNameQuery)
export class GetCachedTemplateNameHandler implements IQueryHandler<GetCachedTemplateNameQuery> {
    private readonly logger = new Logger(GetCachedTemplateNameHandler.name);
    constructor(
        private readonly externalSquadRepository: ExternalSquadRepository,
        private readonly rawCacheService: RawCacheService,
    ) {}

    async execute(query: GetCachedTemplateNameQuery) {
        try {
            if (query.templateType === 'XRAY_BASE64') {
                return fail(ERRORS.TEMPLATE_TYPE_NOT_ALLOWED);
            }

            const cacheKey = CACHE_KEYS.EXTERNAL_SQUAD_TEMPLATE_NAME(
                query.externalSquadUuid,
                query.templateType,
            );

            const cached = await this.rawCacheService.getString(cacheKey, true);

            if (cached !== null) {
                return cached === '' ? fail(ERRORS.SUBSCRIPTION_TEMPLATE_NOT_FOUND) : ok(cached);
            }

            const result = await this.externalSquadRepository.getTemplateName(
                query.externalSquadUuid,
                query.templateType,
            );

            await this.rawCacheService.setString(
                cacheKey,
                result ?? '',
                CACHE_KEYS_TTL.EXTERNAL_SQUAD_TEMPLATE_NAME,
            );

            if (!result) {
                return fail(ERRORS.SUBSCRIPTION_TEMPLATE_NOT_FOUND);
            }

            return ok(result);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}
