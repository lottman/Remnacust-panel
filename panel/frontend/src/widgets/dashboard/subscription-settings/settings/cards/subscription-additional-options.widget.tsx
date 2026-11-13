import { Button, Group, Stack, Switch } from '@mantine/core'
import { useForm, schemaResolver } from '@mantine/form'
import { UpdateSubscriptionSettingsCommand } from '@remnawave/backend-contract'
import { useTranslation } from 'react-i18next'
import { PiGear } from 'react-icons/pi'

import { queryClient } from '@shared/api'
import { QueryKeys, useUpdateSubscriptionSettings } from '@shared/api/hooks'
import { SettingsCardShared } from '@shared/ui/settings-card'
import { SubscriptionJsonDelivery } from '@shared/ui/subscription-json-delivery'
import { handleFormErrors } from '@shared/utils/misc'

import { DefaultGeofilesPanel } from './default-geofiles-panel.widget'

interface IProps {
    subscriptionSettings: UpdateSubscriptionSettingsCommand.Response['response']
}

export const SubscriptionAdditionalOptionsWidget = (props: IProps) => {
    const { subscriptionSettings } = props
    const { t } = useTranslation()

    const form = useForm<UpdateSubscriptionSettingsCommand.RequestBody>({
        name: 'subscription-additional-options-form',
        mode: 'uncontrolled',
        validate: schemaResolver(UpdateSubscriptionSettingsCommand.RequestBodySchema),
        initialValues: {
            uuid: subscriptionSettings.uuid,
            randomizeHosts: subscriptionSettings.randomizeHosts,
            isShowCustomRemarks: subscriptionSettings.isShowCustomRemarks
        }
    })

    const { mutate, isPending } = useUpdateSubscriptionSettings({
        mutationFns: {
            onSuccess() {
                return queryClient.invalidateQueries({
                    queryKey: QueryKeys.subscriptionSettings.getSubscriptionSettings.queryKey
                })
            },

            onError(error) {
                handleFormErrors(form, error)
            }
        }
    })

    const handleSubmit = form.onSubmit((values) => {
        mutate({
            variables: {
                uuid: values.uuid,
                randomizeHosts: values.randomizeHosts,
                isShowCustomRemarks: values.isShowCustomRemarks
            }
        })
    })

    return (
        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
            <SettingsCardShared.Container>
                <SettingsCardShared.Header
                    description={t(
                        'subscription-tabs.widget.configure-additional-subscription-options'
                    )}
                    icon={<PiGear size={24} />}
                    title={t('subscription-tabs.widget.additional-options')}
                />

                <SettingsCardShared.Content>
                    <Stack gap="md">
                        <SubscriptionJsonDelivery />
                        <DefaultGeofilesPanel />

                        <Switch
                            description={t('subscription-tabs.widget.randomize-hosts-description')}
                            key={form.key('randomizeHosts')}
                            label={t('subscription-tabs.widget.randomize-hosts')}
                            size="sm"
                            {...form.getInputProps('randomizeHosts', {
                                type: 'checkbox'
                            })}
                        />

                        <Switch
                            description={t(
                                'subscription-tabs.widget.show-custom-remark-description-line-2'
                            )}
                            key={form.key('isShowCustomRemarks')}
                            label={t('subscription-tabs.widget.show-custom-remarks')}
                            size="sm"
                            {...form.getInputProps('isShowCustomRemarks', {
                                type: 'checkbox'
                            })}
                        />
                    </Stack>
                </SettingsCardShared.Content>

                <SettingsCardShared.Bottom>
                    <Group justify="flex-end">
                        <Button
                            color="teal"
                            loading={isPending}
                            size="md"
                            type="submit"
                            variant="soft"
                        >
                            {t('common.action.save')}
                        </Button>
                    </Group>
                </SettingsCardShared.Bottom>
            </SettingsCardShared.Container>
        </form>
    )
}
