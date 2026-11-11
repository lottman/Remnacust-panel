import dayjs from 'dayjs'
import { i18n, TFunction } from 'i18next'

import { formatRemainingDurationUtil } from '../format-remaining-duration.util'

const relativeFormats = new Map<string, Intl.RelativeTimeFormat>()

export function getExpirationTextUtil(
    expireAt: Date | null | string,
    t: TFunction,
    i18nProps: i18n,
    nowMs = Date.now()
): string {
    if (!expireAt) {
        return t('get-expiration-text.util.unknown')
    }

    const expiration = dayjs(expireAt).locale(i18nProps.language)
    const now = dayjs(nowMs)
    if (!expiration.isValid()) return t('get-expiration-text.util.unknown')

    if (expiration.year() === 2099) {
        return '∞'
    }

    if (!expiration.isAfter(now)) {
        let format = relativeFormats.get(i18nProps.language)
        if (!format) {
            format = new Intl.RelativeTimeFormat(i18nProps.language, { numeric: 'always' })
            if (relativeFormats.size >= 8) relativeFormats.clear()
            relativeFormats.set(i18nProps.language, format)
        }
        const elapsed = Math.floor((nowMs - expiration.valueOf()) / 86_400_000)
        return t('get-expiration-text.util.expired', {
            expiration: elapsed > 0 ? format.format(-elapsed, 'day') : expiration.from(now, false)
        })
    }

    return t('get-expiration-text.util.expires-in', {
        expiration: formatRemainingDurationUtil(expiration.valueOf() - nowMs, i18nProps.language)
    })
}
