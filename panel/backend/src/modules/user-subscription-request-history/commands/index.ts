import { CountAndDeleteSubscriptionRequestHistoryHandler } from './count-and-delete-subscription-request-history';
import { CreateSubscriptionRequestHistoryHandler } from './create-subscription-request-history';

export const COMMANDS = [
    CreateSubscriptionRequestHistoryHandler,
    CountAndDeleteSubscriptionRequestHistoryHandler,
];
