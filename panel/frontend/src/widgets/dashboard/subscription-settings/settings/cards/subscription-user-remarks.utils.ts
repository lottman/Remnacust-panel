import { UpdateSubscriptionSettingsCommand } from '@remnawave/backend-contract'
import i18n from 'i18next'

export const processRemarks = (remarksData: string | string[] | undefined): string[] => {
    if (!remarksData) return ['']
    if (typeof remarksData === 'string') {
        const filtered = remarksData.split('\n').filter(Boolean)
        return filtered.length > 0 ? filtered : ['']
    }
    return Array.isArray(remarksData) && remarksData.length > 0 ? remarksData : ['']
}

export const computeRemarks = (
    settings: UpdateSubscriptionSettingsCommand.Response['response']
): Record<string, string[]> => {
    return {
        expired: processRemarks(settings.customRemarks.expiredUsers),
        limited: processRemarks(settings.customRemarks.limitedUsers),
        disabled: processRemarks(settings.customRemarks.disabledUsers),
        emptyHosts: processRemarks(settings.customRemarks.emptyHosts),
        HWIDMaxDevicesExceeded: processRemarks(settings.customRemarks.HWIDMaxDevicesExceeded),
        HWIDNotSupported: processRemarks(settings.customRemarks.HWIDNotSupported),
        HWIDRegistrationBlocked: processRemarks(
            settings.customRemarks.HWIDRegistrationBlocked ?? [
                i18n.t('subscription-user-remarks-card.widget.deny-new-devices')
            ]
        ),
        HWIDBlocked: processRemarks(settings.customRemarks.HWIDBlocked ?? []),
        hostTrafficPaused: processRemarks(
            settings.customRemarks.hostTrafficPaused ?? [
                i18n.t('subscription-user-remarks-card.widget.traffic-paused')
            ]
        ),
        hostTrafficLimit: processRemarks(settings.customRemarks.hostTrafficLimit ?? [])
    }
}
