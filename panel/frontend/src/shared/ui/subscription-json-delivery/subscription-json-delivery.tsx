import { Alert, Button, Loader, Stack, Switch, Text } from '@mantine/core'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import {
    getGeofilesSettingsState,
    SUBSCRIPTION_SETTINGS_MUTATION_KEY
} from '@shared/api/hooks/subscription-settings/subscription-settings-state'
import { useUpdateSubscriptionSettings } from '@shared/api/hooks/subscription-settings/subscription-settings.mutation.hooks'
import {
    subscriptionSettingsQueryKeys,
    useGetSubscriptionSettings
} from '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks'

export function SubscriptionJsonDelivery() {
    const { t } = useTranslation()
    const client = useQueryClient()
    const queryKey = subscriptionSettingsQueryKeys.getSubscriptionSettings.queryKey
    const settingsPending = useIsMutating({ mutationKey: SUBSCRIPTION_SETTINGS_MUTATION_KEY }) > 0
    const settings = useGetSubscriptionSettings({
        rQueryParams: {
            refetchOnMount: 'always',
            refetchOnWindowFocus: 'always'
        }
    })
    const update = useUpdateSubscriptionSettings({
        mutationFns: {
            onSuccess: async (data) => {
                await client.cancelQueries({ queryKey })
                client.setQueryData(queryKey, data)
                void client.invalidateQueries({ queryKey })
            },
            onError: () => {
                void client.invalidateQueries({ queryKey })
            }
        }
    })
    const state = getGeofilesSettingsState(settings.data, settings.isSuccess)
    const busy = update.isPending || settingsPending
    return (
        <Stack gap="xs">
            {settings.data ? (
                <Stack gap="md">
                    <Switch
                        checked={settings.data.serveJsonAtBaseSubscription}
                        disabled={
                            !settings.isSuccess ||
                            busy ||
                            (state.systemEnabled && state.jsonEnabled)
                        }
                        label={t('subscription-settings.widget.serve-json-at-base-subscription')}
                        description={[
                            t('geofiles.json-setting-help'),
                            state.systemEnabled && state.jsonEnabled
                                ? t('geofiles.disable-before-json')
                                : ''
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        onChange={(event) => {
                            if (
                                !settings.isSuccess ||
                                busy ||
                                client.isMutating({
                                    mutationKey: SUBSCRIPTION_SETTINGS_MUTATION_KEY
                                }) > 0 ||
                                !settings.data ||
                                (state.systemEnabled && !event.currentTarget.checked)
                            )
                                return
                            update.mutate({
                                variables: {
                                    uuid: settings.data.uuid,
                                    serveJsonAtBaseSubscription: event.currentTarget.checked
                                }
                            })
                        }}
                    />
                    <Switch
                        checked={settings.data.geofilesSystemEnabled === true}
                        disabled={
                            !settings.isSuccess ||
                            busy ||
                            (!state.systemEnabled && !state.canEnableSystem)
                        }
                        label={t('geofiles.system-enabled')}
                        description={t('geofiles.system-help')}
                        onChange={(event) => {
                            if (
                                !settings.isSuccess ||
                                busy ||
                                client.isMutating({
                                    mutationKey: SUBSCRIPTION_SETTINGS_MUTATION_KEY
                                }) > 0 ||
                                !settings.data ||
                                (event.currentTarget.checked &&
                                    !settings.data.serveJsonAtBaseSubscription)
                            )
                                return
                            update.mutate({
                                variables: {
                                    uuid: settings.data.uuid,
                                    geofilesSystemEnabled: event.currentTarget.checked
                                }
                            })
                        }}
                    />
                    {!settings.data.serveJsonAtBaseSubscription && (
                        <Text size="sm" c="dimmed">
                            {t('geofiles.generated-requires-json')}
                        </Text>
                    )}
                </Stack>
            ) : settings.isPending ? (
                <Text role="status" size="sm">
                    <Loader size="xs" mr="xs" />
                    {t('common.message.loading')}
                </Text>
            ) : null}
            {update.isPending && <Loader size="xs" />}
            {settings.isError && (
                <Alert color="red" role="alert">
                    <Stack gap="xs">
                        <Text size="sm">{t('geofiles.json-setting-load-failed')}</Text>
                        <Button
                            variant="subtle"
                            loading={settings.isFetching}
                            onClick={() => void settings.refetch()}
                        >
                            {t('common.action.refresh')}
                        </Button>
                    </Stack>
                </Alert>
            )}
            {update.isError && (
                <Text c="red" size="sm" role="alert">
                    {t('geofiles.json-setting-save-failed')}
                </Text>
            )}
        </Stack>
    )
}
