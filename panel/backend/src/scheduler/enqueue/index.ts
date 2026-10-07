import { ExportNodeConnectionsTask } from './export-node-connections/export-node-connections.task';
import { NodeHealthCheckTask } from './node-health-check/node-health-check.task';
import { RecordNodesUsageTask } from './record-nodes-usage/record-nodes-usage.task';
import { RecordUserUsageTask } from './record-user-usage/record-user-usage.task';
import { RESET_USER_TRAFFIC_TASKS } from './reset-user-traffic-jobs';
import { SERVICE_JOBS_TASKS } from './service';
import { USERS_JOBS_TASKS } from './users-jobs';

export const ENQUEUE_SERVICES = [
    RecordUserUsageTask,
    RecordNodesUsageTask,
    NodeHealthCheckTask,
    ExportNodeConnectionsTask,
    ...RESET_USER_TRAFFIC_TASKS,
    ...USERS_JOBS_TASKS,
    ...SERVICE_JOBS_TASKS,
];
