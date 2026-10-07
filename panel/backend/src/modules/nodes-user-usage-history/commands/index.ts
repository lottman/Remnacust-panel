import { BulkUpsertUserHistoryEntryHandler } from './bulk-upsert-user-history-entry';
import { TruncateNodesUserUsageHistoryHandler } from './truncate-nodes-user-usage-history';
import { VacuumNodesUserUsageHistoryHandler } from './vacuum-nodes-user-usage-history';

export const COMMANDS = [
    BulkUpsertUserHistoryEntryHandler,
    VacuumNodesUserUsageHistoryHandler,
    TruncateNodesUserUsageHistoryHandler,
];
