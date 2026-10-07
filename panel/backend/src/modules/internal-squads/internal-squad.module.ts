import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { COMMANDS } from './commands';
import { InternalSquadStatsController } from './internal-squad-stats.controller';
import { InternalSquadController } from './internal-squad.controller';
import { InternalSquadConverter } from './internal-squad.converter';
import { InternalSquadService } from './internal-squad.service';
import { QUERIES } from './queries';
import { InternalSquadRepository } from './repositories/internal-squad.repository';

@Module({
    imports: [CqrsModule],
    controllers: [InternalSquadController, InternalSquadStatsController],
    providers: [
        InternalSquadRepository,
        InternalSquadService,
        InternalSquadConverter,
        ...COMMANDS,
        ...QUERIES,
    ],
})
export class InternalSquadModule {}
