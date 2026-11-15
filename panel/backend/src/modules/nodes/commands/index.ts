import { DeleteNodeByUuidHandler } from './delete-node-by-uuid';
import { IncrementUsedTrafficHandler } from './increment-used-traffic';
import { ObserveNodeIpInventoryHandler } from './observe-node-ip-inventory/observe-node-ip-inventory.handler';
import { RecordPortPlanResultHandler } from './record-port-plan-result';
import { RemoveIntegrationFromNodesHandler } from './remove-integration-from-nodes';
import { SyncActiveProfileHandler } from './sync-active-profile';
import { UpdateNodeHandler } from './update-node';

export const COMMANDS = [
    ObserveNodeIpInventoryHandler,
    RecordPortPlanResultHandler,
    UpdateNodeHandler,
    IncrementUsedTrafficHandler,
    SyncActiveProfileHandler,
    DeleteNodeByUuidHandler,
    RemoveIntegrationFromNodesHandler,
];
