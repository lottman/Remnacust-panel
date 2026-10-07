import { MRT_Localization_EN } from '@kastov/mantine-react-table-open/locales/en/index.esm.mjs'
import { MRT_Localization_FA } from '@kastov/mantine-react-table-open/locales/fa/index.esm.mjs'
import { MRT_Localization_RU } from '@kastov/mantine-react-table-open/locales/ru/index.esm.mjs'
import { MRT_Localization_ZH_HANS } from '@kastov/mantine-react-table-open/locales/zh-Hans/index.esm.mjs'
import { useTranslation } from 'react-i18next'

export function useMrtLocalization() {
    const { i18n } = useTranslation()
    switch (i18n.resolvedLanguage?.split('-')[0] ?? i18n.language.split('-')[0]) {
        case 'ru':
            return MRT_Localization_RU
        case 'fa':
            return MRT_Localization_FA
        case 'zh':
            return MRT_Localization_ZH_HANS
        default:
            return MRT_Localization_EN
    }
}
