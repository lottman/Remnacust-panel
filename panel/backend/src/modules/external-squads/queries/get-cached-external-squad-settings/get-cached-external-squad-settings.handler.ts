import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS, CACHE_KEYS_TTL } from '@libs/contracts/constants';

import { ExternalSquadEntity } from '@modules/external-squads/entities';
import { ExternalSquadRepository } from '@modules/external-squads/repositories/external-squad.repository';

import { GetCachedExternalSquadSettingsQuery } from './get-cached-external-squad-settings.query';

@QueryHandler(GetCachedExternalSquadSettingsQuery)
export class GetCachedExternalSquadSettingsHandler implements IQueryHandler<GetCachedExternalSquadSettingsQuery> {
    private readonly logger = new Logger(GetCachedExternalSquadSettingsHandler.name);
    constructor(
        private readonly externalSquadRepository: ExternalSquadRepository,
        private readonly rawCacheService: RawCacheService,
    ) {}

    async execute(query: GetCachedExternalSquadSettingsQuery) {
        try {
            const cached = await this.rawCacheService.get<
                Pick<
                    ExternalSquadEntity,
                    | 'subscriptionSettings'
                    | 'hostOverrides'
                    | 'responseHeadersAdd'
                    | 'responseHeadersRemove'
                    | 'hwidSettings'
                    | 'customRemarks'
                >
            >(CACHE_KEYS.EXTERNAL_SQUAD_SETTINGS(query.externalSquadUuid), true);

            if (cached) {
                return cached;
            }
        } catch (error) {
            this.logger.warn(
                `External squad settings cache read failed: ${error instanceof Error ? error.name : 'unknown'}`,
            );
        }

        try {
            const result = await this.externalSquadRepository.getExternalSquadSettings(
                query.externalSquadUuid,
            );

            try {
                await this.rawCacheService.set(
                    CACHE_KEYS.EXTERNAL_SQUAD_SETTINGS(query.externalSquadUuid),
                    result,
                    CACHE_KEYS_TTL.EXTERNAL_SQUAD_SETTINGS,
                );
            } catch (error) {
                this.logger.warn(
                    `External squad settings cache write failed: ${error instanceof Error ? error.name : 'unknown'}`,
                );
            }

            return result;
        } catch (error) {
            this.logger.error(error);
            return null;
        }
    }
}
