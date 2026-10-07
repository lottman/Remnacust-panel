import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { COMMANDS } from './commands';
import { ExternalSquadController } from './external-squads.controller';
import { ExternalSquadConverter } from './external-squads.converter';
import { ExternalSquadService } from './external-squads.service';
import { QUERIES } from './queries';
import { ExternalSquadRepository } from './repositories/external-squad.repository';

@Module({
    imports: [CqrsModule],
    controllers: [ExternalSquadController],
    providers: [
        ExternalSquadRepository,
        ExternalSquadService,
        ExternalSquadConverter,
        ...COMMANDS,
        ...QUERIES,
    ],
})
export class ExternalSquadModule {}
