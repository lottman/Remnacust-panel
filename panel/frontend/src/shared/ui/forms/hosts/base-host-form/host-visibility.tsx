import { Checkbox, Group, Stack, Switch, Text, ThemeIcon } from '@mantine/core'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiProhibit, PiPulse } from 'react-icons/pi'

import { useUiText } from '@shared/i18n/interface-text'

import { useHostFormData } from './options'

export function HostVisibility() {
    const uiText = useUiText()

    const { form } = useHostFormData()
    const { t } = useTranslation()

    const switchId = useId()
    const [isEnabled, setIsEnabled] = useState(form.getValues().isDisabled === false)
    form.watch('isDisabled', ({ value }) => setIsEnabled(value === false))
    const [afterEnd, setAfterEnd] = useState(form.getValues().alwaysAvailable === true)
    form.watch('alwaysAvailable', ({ value }) => {
        setAfterEnd(value === true)
        if (!value) form.setFieldValue('onlyWhenInactive', false)
    })

    return (
        <Stack gap="md">
            <Group gap="sm" justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                    <ThemeIcon color={isEnabled ? 'teal' : 'gray'} size="lg" variant="soft">
                        {isEnabled ? <PiPulse size={22} /> : <PiProhibit size={22} />}
                    </ThemeIcon>

                    <Stack gap={0}>
                        <Text
                            component="label"
                            fw={600}
                            htmlFor={switchId}
                            size="sm"
                            style={{ cursor: 'pointer' }}
                        >
                            {t('base-host-form.host-visibility')}
                        </Text>
                        <Text c={isEnabled ? 'teal.4' : 'dimmed'} fw={600} size="xs">
                            {isEnabled
                                ? t('use-hosts-table-widget.enabled')
                                : t('use-hosts-table-widget.disabled')}
                        </Text>
                    </Stack>
                </Group>

                <Switch
                    checked={isEnabled}
                    color="teal.8"
                    id={switchId}
                    onChange={(event) => {
                        setIsEnabled(event.currentTarget.checked)
                        form.setFieldValue('isDisabled', !event.currentTarget.checked)
                    }}
                    size="lg"
                />
            </Group>
            <Switch
                label={uiText('available-after-subscription-expires-or-is-disabled-61afc39')}
                description={uiText(
                    'can-share-an-inbound-with-ordinary-hosts-access-uses-separate--1881b29'
                )}
                key={form.key('alwaysAvailable')}
                {...form.getInputProps('alwaysAvailable', { type: 'checkbox' })}
            />
            <Checkbox
                disabled={!afterEnd}
                label={uiText('unavailable-during-an-active-subscription-43ed8ab')}
                description={uiText(
                    'only-for-expired-or-disabled-subscriptions-squad-access-restri-c5bbce7'
                )}
                key={form.key('onlyWhenInactive')}
                {...form.getInputProps('onlyWhenInactive', { type: 'checkbox' })}
            />
        </Stack>
    )
}
