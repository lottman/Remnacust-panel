import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosModule } from '@common/axios/axios.module';

import { NodesModule } from '@modules/nodes/nodes.module';

import { HostsBulkActionsController, HostsController } from './controllers';
import { HostsConverter } from './hosts.converter';
import { HostsService } from './hosts.service';
import { LimitsController } from './limits.controller';
import { LimitsService } from './limits.service';
import { QUERIES } from './queries';
import { HostTagLimitsRepository } from './repositories/host-tag-limits.repository';
import { HostsRepository } from './repositories/hosts.repository';

@Module({
    imports: [CqrsModule, NodesModule, AxiosModule],
    controllers: [LimitsController, HostsController, HostsBulkActionsController],
    providers: [
        LimitsService,
        HostsRepository,
        HostTagLimitsRepository,
        HostsConverter,
        HostsService,
        ...QUERIES,
    ],
    exports: [HostsService, HostsRepository, HostTagLimitsRepository],
})
export class HostsModule {}
