import { TCustomRemarks } from '@libs/contracts/models/subscription-settings/custom-remarks.schema';

export type TCombinedRemarkStatus = 'EXPIRED' | 'DISABLED' | 'HWID_BLOCKED';

const DEFAULT_ORDER: TCombinedRemarkStatus[] = ['EXPIRED', 'DISABLED', 'HWID_BLOCKED'];

export function composeStatusAndHwidRemarks(
    status: 'EXPIRED' | 'DISABLED' | null,
    statusRemarks: string[],
    hwidRemarks: string[],
    settings: TCustomRemarks,
): string[] {
    if (!status || hwidRemarks.length === 0 || settings.combineSubscriptionAndHwidRemarks === false) {
        return statusRemarks.length ? statusRemarks : hwidRemarks;
    }

    const order = settings.subscriptionAndHwidRemarkOrder?.length
        ? settings.subscriptionAndHwidRemarkOrder
        : DEFAULT_ORDER;
    const groups: Record<TCombinedRemarkStatus, string[]> = {
        EXPIRED: status === 'EXPIRED' ? statusRemarks : [],
        DISABLED: status === 'DISABLED' ? statusRemarks : [],
        HWID_BLOCKED: hwidRemarks,
    };

    return [...new Set([...order, ...DEFAULT_ORDER])].flatMap((key) => key === 'HWID_REGISTRATION_BLOCKED' ? [] : groups[key]);
}
