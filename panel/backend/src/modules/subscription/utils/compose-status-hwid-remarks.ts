import { TCustomRemarks } from '@libs/contracts/models/subscription-settings/custom-remarks.schema';

export type TCombinedRemarkStatus = 'EXPIRED' | 'DISABLED' | 'FROZEN' | 'HWID_BLOCKED';

const DEFAULT_ORDER: TCombinedRemarkStatus[] = ['EXPIRED', 'HWID_BLOCKED', 'DISABLED', 'FROZEN'];

export function composeStatusAndHwidRemarks(
    status: 'EXPIRED' | 'DISABLED' | 'FROZEN' | null,
    statusRemarks: string[],
    hwidRemarks: string[],
    settings: TCustomRemarks,
): string[] {
    if (!status || hwidRemarks.length === 0 || settings.combineSubscriptionAndHwidRemarks === false) {
        return statusRemarks.length ? statusRemarks : hwidRemarks;
    }

    const order = settings.subscriptionAndHwidRemarkOrder?.length
        ? [...settings.subscriptionAndHwidRemarkOrder]
        : [...DEFAULT_ORDER];
    if (!order.includes('FROZEN')) order.splice(Math.max(0, order.indexOf('HWID_BLOCKED')), 0, 'FROZEN');
    const groups: Record<TCombinedRemarkStatus, string[]> = {
        EXPIRED: status === 'EXPIRED' ? statusRemarks : [],
        DISABLED: status === 'DISABLED' ? statusRemarks : [],
        FROZEN: status === 'FROZEN' ? statusRemarks : [],
        HWID_BLOCKED: hwidRemarks,
    };

    return [...new Set([...order, ...DEFAULT_ORDER])].flatMap((key) => key === 'HWID_REGISTRATION_BLOCKED' ? [] : groups[key]);
}
