import { useTranslation } from 'react-i18next'

import { FlagTextInput } from '@shared/ui/flag-picker/flag-picker'
import { useSettingsRowControl } from '@shared/ui/settings-row'

import { useHostFormData } from '../host-form-data.context'

export function ServerDescriptionOption() {
    const { form } = useHostFormData()
    const { t } = useTranslation()
    const rowControl = useSettingsRowControl()

    return (
        <FlagTextInput
            key={form.key('serverDescription')}
            placeholder={t('base-host-form.server-description-placeholder')}
            w="100%"
            {...rowControl}
            {...form.getInputProps('serverDescription')}
        />
    )
}
