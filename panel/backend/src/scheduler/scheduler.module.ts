import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PrometheusReporterModule } from '@integration-modules/prometheus-reporter/prometheus-reporter.module';

import { BackupsModule } from '@modules/backups/backups.module';
import { HostsModule } from '@modules/hosts/hosts.module';
import { HwidUserDevicesModule } from '@modules/hwid-user-devices/hwid-user-devices.module';
import { NodeHealthLogService } from '@modules/nodes/node-health-log.service';
import { NodesModule } from '@modules/nodes/nodes.module';

import { ENQUEUE_SERVICES } from './enqueue';
import { EVENT_LISTENERS } from './events';
import { METRIC_PROVIDERS } from './metrics-providers';
import { JOBS_SERVICES } from './tasks';
import { DeviceReconciliationTask } from './tasks/device-reconciliation.task';
import { NodeMetricsSubscriber } from './tasks/export-metrics/node-metrics.subscriber';
import { HostPolicyTask } from './tasks/host-policy.task';
import { NodeHealthLogCleanupTask } from './tasks/node-health-log-cleanup.task';
import { PortPlanDispatchTask } from './tasks/port-plan-dispatch.task';
import { QuotaCoordinatorTask } from './tasks/quota-coordinator.task';
import { QuotaFinalizationDispatchTask } from './tasks/quota-finalization-dispatch.task';

@Module({
    imports: [
        CqrsModule,
        NodesModule,
        PrometheusReporterModule,
        BackupsModule,
        HostsModule,
        HwidUserDevicesModule,
    ],
    controllers: [],
    providers: [
        ...ENQUEUE_SERVICES,
        ...JOBS_SERVICES,
        ...METRIC_PROVIDERS,
        ...EVENT_LISTENERS,
        NodeMetricsSubscriber,
        NodeHealthLogService,
        NodeHealthLogCleanupTask,
        HostPolicyTask,
        DeviceReconciliationTask,
        PortPlanDispatchTask,
        QuotaCoordinatorTask,
        QuotaFinalizationDispatchTask,
    ],
})
export class SchedulerModule {}
