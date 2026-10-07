import { BatchResetLimitedUsersTrafficHandler } from './batch-reset-limited-users-traffic';
import { BatchResetUserTrafficHandler } from './batch-reset-user-traffic';
import { BulkAllExtendExpirationDateHandler } from './bulk-all-extend-expiration-date';
import { BulkDeleteByStatusHandler } from './bulk-delete-by-status';
import { BulkIncrementUsedTrafficHandler } from './bulk-increment-used-traffic';
import { BulkSyncUsersHandler } from './bulk-sync-users';
import { BulkUpdateAllUsersHandler } from './bulk-update-all-users';
import { ResetUserTrafficHandler } from './reset-user-traffic';
import { RevokeUserSubscriptionHandler } from './revoke-user-subscription';
import { TriggerThresholdNotificationHandler } from './trigger-threshold-notification';
import { UpdateExceededTrafficUsersHandler } from './update-exceeded-users';
import { UpdateExpiredUsersHandler } from './update-expired-users';
import { UpdateUserWithServiceHandler } from './update-user-with-service';

export const COMMANDS = [
    BatchResetUserTrafficHandler,
    UpdateExpiredUsersHandler,
    UpdateExceededTrafficUsersHandler,
    BatchResetLimitedUsersTrafficHandler,
    BulkIncrementUsedTrafficHandler,
    RevokeUserSubscriptionHandler,
    ResetUserTrafficHandler,
    UpdateUserWithServiceHandler,
    TriggerThresholdNotificationHandler,
    BulkDeleteByStatusHandler,
    BulkUpdateAllUsersHandler,
    BulkSyncUsersHandler,
    BulkAllExtendExpirationDateHandler,
];
