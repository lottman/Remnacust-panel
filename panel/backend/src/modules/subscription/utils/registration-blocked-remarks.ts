import { isTextRemark } from '@common/utils/templates/is-text-remark';
import { TCustomRemarks } from '@libs/contracts/models/subscription-settings/custom-remarks.schema';

export function registrationBlockedRemarks(user: { status: string; expireAt: Date }, settings: { customRemarks: TCustomRemarks }): string[] {
    const remarks = settings.customRemarks;
    const status = user.status === 'DISABLED' ? 'DISABLED' :
        user.status === 'EXPIRED' || user.expireAt <= new Date() ? 'EXPIRED' : null;
    const order = [...(remarks.subscriptionAndHwidRemarkOrder ?? ['EXPIRED','DISABLED','HWID_BLOCKED'])];
    if (!order.includes('HWID_REGISTRATION_BLOCKED')) order.splice(2,0,'HWID_REGISTRATION_BLOCKED');
    const showStatus = status && order.indexOf(status) < order.indexOf('HWID_REGISTRATION_BLOCKED');
    const selected = showStatus ? status === 'DISABLED' ? remarks.disabledUsers : remarks.expiredUsers : remarks.HWIDRegistrationBlocked;
    const safe = (selected ?? []).filter(isTextRemark);
    return safe.length ? safe : [showStatus ? status === 'DISABLED' ? 'User is disabled' : 'Subscription expired' : 'Добавление новых устройств запрещено'];
}
