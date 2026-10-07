import dayjs from 'dayjs'
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpApi from 'i18next-http-backend'
import { initReactI18next } from 'react-i18next'
import 'dayjs/locale/ru'
import 'dayjs/locale/fa'
import 'dayjs/locale/zh'

import englishMessages from '../../../public/locales/en/remnawave.json'

i18n.on('languageChanged', (language) => {
    const locale = language.split('-')[0]
    dayjs.locale(['ru', 'fa', 'zh'].includes(locale) ? locale : 'en')
})

i18n.use(initReactI18next)
    .use(LanguageDetector)
    .use(HttpApi)
    .init({
        fallbackLng: 'en',
        supportedLngs: ['en', 'ru', 'fa', 'zh'],
        debug: process.env.NODE_ENV === 'development',
        defaultNS: 'remnawave',
        ns: ['remnawave'],
        resources: { en: { remnawave: englishMessages } },
        partialBundledLanguages: true,
        detection: {
            order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
            convertDetectedLanguage: (lng) => (lng.includes('-') ? lng.split('-')[0] : lng)
        },
        load: 'languageOnly',
        backend: {
            loadPath: `/locales/{{lng}}/{{ns}}.json?v=${__LOCALE_VERSION__}`
        },
        interpolation: {
            escapeValue: false
        },
        react: {
            useSuspense: true
        }
    })

export default i18n
