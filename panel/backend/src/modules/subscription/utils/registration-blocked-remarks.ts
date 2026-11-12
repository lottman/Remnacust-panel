import { isTextRemark } from '@common/utils/templates/is-text-remark';
import { TCustomRemarks } from '@libs/contracts/models/subscription-settings/custom-remarks.schema';

export function registrationBlockedRemarks(
    user: { status: string; expireAt: Date },
    settings: { customRemarks: TCustomRemarks },
): string[] {
    const remarks = settings.customRemarks;
    const status =
        user.status === 'FROZEN'
            ? 'FROZEN'
            : user.status === 'DISABLED'
            ? 'DISABLED'
            : user.status === 'EXPIRED' || user.expireAt <= new Date()
              ? 'EXPIRED'
              : null;
    const order = [
        ...(remarks.subscriptionAndHwidRemarkOrder ?? ['EXPIRED', 'HWID_REGISTRATION_BLOCKED', 'HWID_BLOCKED', 'DISABLED', 'FROZEN']),
    ];
    if (!order.includes('HWID_REGISTRATION_BLOCKED'))
        order.splice(2, 0, 'HWID_REGISTRATION_BLOCKED');
    if (!order.includes('FROZEN')) order.splice(Math.max(0, order.indexOf('HWID_REGISTRATION_BLOCKED')), 0, 'FROZEN');
    const showStatus = status && order.indexOf(status) < order.indexOf('HWID_REGISTRATION_BLOCKED');
    const selected = showStatus
        ? status === 'FROZEN'
            ? remarks.frozenUsers ?? ['Subscription frozen']
            : status === 'DISABLED'
            ? remarks.disabledUsers
            : remarks.expiredUsers
        : remarks.HWIDRegistrationBlocked;
    const safe = (selected ?? []).filter(isTextRemark);
    return safe.length
        ? safe
        : [
              showStatus
                  ? status === 'FROZEN'
                      ? 'Subscription frozen'
                      : status === 'DISABLED'
                      ? 'User is disabled'
                      : 'Subscription expired'
                  : 'New device registration is disabled',
          ];
}
