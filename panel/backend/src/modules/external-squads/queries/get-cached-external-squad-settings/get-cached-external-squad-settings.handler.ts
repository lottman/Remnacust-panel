import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS } from '@libs/contracts/constants';

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
        const key = CACHE_KEYS.EXTERNAL_SQUAD_SETTINGS(query.externalSquadUuid);
        let generation: string | undefined;
        try {
            const snapshot =
                await this.rawCacheService.templateSnapshot<
                    Pick<
                        ExternalSquadEntity,
                        | 'subscriptionSettings'
                        | 'hostOverrides'
                        | 'responseHeadersAdd'
                        | 'responseHeadersRemove'
                        | 'hwidSettings'
                        | 'customRemarks'
                    >
                >(key);
            generation = snapshot.generation;
            const cached = snapshot.value;

            if (cached) {
                return structuredClone(cached);
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
                if (result && generation)
                    await this.rawCacheService.setTemplateSnapshot(key, generation, result);
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
