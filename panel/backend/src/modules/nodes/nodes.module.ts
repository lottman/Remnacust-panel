import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosModule } from '@common/axios/axios.module';

import { COMMANDS } from './commands';
import { EVENTS } from './events';
import { NodeHealthLogService } from './node-health-log.service';
import {
    NodeReconciliationController,
    NodeReconciliationGuard,
} from './node-reconciliation.controller';
import { NodeRuntimeService } from './node-runtime.service';
import { NodesSystemCacheService } from './nodes-system-cache.service';
import { NodesController } from './nodes.controller';
import { NodesConverter } from './nodes.converter';
import { NodesService } from './nodes.service';
import { QUERIES } from './queries';
import { NodesRepository } from './repositories/nodes.repository';

@Module({
    imports: [CqrsModule, AxiosModule],
    controllers: [NodesController, NodeReconciliationController],
    providers: [
        NodesRepository,
        NodesConverter,
        NodesService,
        NodeRuntimeService,
        NodesSystemCacheService,
        NodeHealthLogService,
        NodeReconciliationGuard,
        ...EVENTS,
        ...QUERIES,
        ...COMMANDS,
    ],
    exports: [NodesRepository],
})
export class NodesModule {}
