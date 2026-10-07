import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { ExternalSquadRepository } from '@modules/external-squads/repositories/external-squad.repository';

import { GetExternalSquadSettingsQuery } from './get-external-squad-settings.query';

@QueryHandler(GetExternalSquadSettingsQuery)
export class GetExternalSquadSettingsHandler implements IQueryHandler<GetExternalSquadSettingsQuery> {
    private readonly logger = new Logger(GetExternalSquadSettingsHandler.name);
    constructor(private readonly externalSquadRepository: ExternalSquadRepository) {}

    async execute(query: GetExternalSquadSettingsQuery) {
        try {
            const result = await this.externalSquadRepository.getExternalSquadSettings(
                query.externalSquadUuid,
            );

            return ok(result);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}
