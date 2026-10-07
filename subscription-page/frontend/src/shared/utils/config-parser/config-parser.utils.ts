import {
    TSubscriptionPageLanguageCode,
    TSubscriptionPageLocalizedText,
    TSubscriptionPageRawConfig
} from '@remnawave/subscription-page-types'
import dayjs from 'dayjs'
import { safeHtml, safeSvg } from '../safe-markup'

export function getIconFromLibrary(iconKey: string, svgLibrary: Record<string, string>) {
    return safeSvg(svgLibrary[iconKey])
}

export function getLocalizedText(
    textObj: TSubscriptionPageLocalizedText,
    lang: TSubscriptionPageLanguageCode
): string {
    if (!textObj) return ''
    return textObj[lang]
}

export function getLocalizedHtml(textObj: TSubscriptionPageLocalizedText, lang: TSubscriptionPageLanguageCode): string {
    return safeHtml(getLocalizedText(textObj, lang))
}

export function getExpirationTextUtil(
    expireAt: Date | null | string,
    currentLang: TSubscriptionPageLanguageCode,
    baseTranslations: TSubscriptionPageRawConfig['baseTranslations']
): string {
    if (!expireAt) {
        return getLocalizedText(baseTranslations.unknown, currentLang)
    }

    const expiration = dayjs(expireAt).locale(currentLang)
    const now = dayjs()

    if (expiration.isBefore(now)) {
        return `${getLocalizedText(baseTranslations.expired, currentLang)} ${expiration.fromNow(false)}`
    }

    if (expiration.year() === 2099) {
        return getLocalizedText(baseTranslations.indefinitely, currentLang)
    }

    return `${getLocalizedText(baseTranslations.expiresIn, currentLang)} ${expiration.fromNow(false)}`
}

export const formatDate = (
    dateStr: Date | string,
    currentLang: TSubscriptionPageLanguageCode,
    baseTranslations: TSubscriptionPageRawConfig['baseTranslations']
) => {
    if (dayjs(dateStr).year() === 2099) {
        return getLocalizedText(baseTranslations.indefinitely, currentLang)
    }
    if (currentLang === 'fa') {
        return Intl.DateTimeFormat('fa-IR', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: undefined,
            minute: undefined
        }).format(new Date(dateStr))
    }
    return dayjs(dateStr).locale(currentLang).format('DD MMMM, YYYY')
}
