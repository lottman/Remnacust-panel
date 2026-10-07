import { useDirection } from '@mantine/core'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export function LocaleDirectionSync() {
    const { i18n } = useTranslation()
    const { setDirection } = useDirection()

    useEffect(() => {
        const language = i18n.resolvedLanguage ?? i18n.language
        const direction = /^fa(-|$)/i.test(language) ? 'rtl' : 'ltr'
        setDirection(direction)
        document.documentElement.lang = language
        document.documentElement.dir = direction
    }, [i18n.language, i18n.resolvedLanguage, setDirection])

    return null
}
