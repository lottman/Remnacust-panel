import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AxiosModule } from '@common/axios/axios.module';

import { COMMANDS } from './commands';
import { EVENTS } from './events';
import { NodesSystemCacheService } from './nodes-system-cache.service';
import { NodeHealthLogService } from './node-health-log.service';
import { NodesController } from './nodes.controller';
import { NodesConverter } from './nodes.converter';
import { NodeRuntimeService } from './node-runtime.service';
import { NodesService } from './nodes.service';
import { QUERIES } from './queries';
import { NodesRepository } from './repositories/nodes.repository';

@Module({
    imports: [CqrsModule, AxiosModule],
    controllers: [NodesController],
    providers: [
        NodesRepository,
        NodesConverter,
        NodesService,
        NodeRuntimeService,
        NodesSystemCacheService,
        NodeHealthLogService,
        ...EVENTS,
        ...QUERIES,
        ...COMMANDS,
    ],
    exports: [NodesRepository],
})
export class NodesModule {}
