import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosModule } from '@common/axios/axios.module';

import { COMMANDS } from './commands';
import { EVENTS } from './events';
import { NodeHealthLogService } from './node-health-log.service';
import { NodePortPlansController } from './node-port-plans.controller';
import { NodePortPlansService } from './node-port-plans.service';
import {
    NodeReconciliationController,
    NodeReconciliationGuard,
} from './node-reconciliation.controller';
import { NodeRuntimeService } from './node-runtime.service';
import { NodesSystemCacheService } from './nodes-system-cache.service';
import { NodesController } from './nodes.controller';
import { NodesConverter } from './nodes.converter';
import { NodesService } from './nodes.service';
import { PortPlanDispatchService } from './port-plan-dispatch.service';
import { QUERIES } from './queries';
import { NodesRepository } from './repositories/nodes.repository';

@Module({
    imports: [CqrsModule, AxiosModule],
    controllers: [NodesController, NodeReconciliationController, NodePortPlansController],
    providers: [
        NodesRepository,
        NodePortPlansService,
        PortPlanDispatchService,
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
    exports: [NodesRepository, PortPlanDispatchService],
})
export class NodesModule {}
