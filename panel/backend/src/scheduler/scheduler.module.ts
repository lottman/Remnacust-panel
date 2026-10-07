import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PrometheusReporterModule } from '@integration-modules/prometheus-reporter/prometheus-reporter.module';
import { BackupsModule } from '@modules/backups/backups.module';
import { NodeHealthLogService } from '@modules/nodes/node-health-log.service';
import { HostsModule } from '@modules/hosts/hosts.module';

import { ENQUEUE_SERVICES } from './enqueue';
import { EVENT_LISTENERS } from './events';
import { METRIC_PROVIDERS } from './metrics-providers';
import { JOBS_SERVICES } from './tasks';
import { NodeMetricsSubscriber } from './tasks/export-metrics/node-metrics.subscriber';
import { NodeHealthLogCleanupTask } from './tasks/node-health-log-cleanup.task';
import { HostPolicyTask } from './tasks/host-policy.task';

@Module({
    imports: [CqrsModule, PrometheusReporterModule, BackupsModule, HostsModule],
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
    ],
})
export class SchedulerModule {}
