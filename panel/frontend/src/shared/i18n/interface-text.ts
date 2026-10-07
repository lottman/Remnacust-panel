import type messages from '../../../public/locales/en/remnawave.json'

import i18next from 'i18next'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export type InterfaceKey = keyof typeof messages.interface
type Values = Record<string, unknown>

// Non-React callers translate at the time of the action, never at module import.
export const translateUiText = (key: InterfaceKey, values: Values = {}): string =>
    i18next.t(`interface.${key}`, values)

// Subscribe each rendering component so labels also change without a page reload.
export function useUiText() {
    const { t } = useTranslation()
    return useCallback(
        (key: InterfaceKey, values: Values = {}): string => t(`interface.${key}`, values),
        [t]
    )
}
