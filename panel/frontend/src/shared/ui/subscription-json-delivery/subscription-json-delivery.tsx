import { Alert, Button, Loader, Stack, Switch, Text } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useUpdateSubscriptionSettings } from '@shared/api/hooks/subscription-settings/subscription-settings.mutation.hooks'
import {
    subscriptionSettingsQueryKeys,
    useGetSubscriptionSettings
} from '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks'

export function SubscriptionJsonDelivery() {
    const { t } = useTranslation()
    const client = useQueryClient()
    const queryKey = subscriptionSettingsQueryKeys.getSubscriptionSettings.queryKey
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
    return (
        <Stack gap="xs">
            {settings.data ? (
                <Stack gap="md">
                    <Switch
                        checked={settings.data.serveJsonAtBaseSubscription}
                        disabled={
                            !settings.isSuccess ||
                            update.isPending ||
                            settings.data.geofilesEnabled === true
                        }
                        label={t('subscription-settings.widget.serve-json-at-base-subscription')}
                        description={t('geofiles.json-setting-help')}
                        onChange={(event) => {
                            if (
                                !settings.isSuccess ||
                                update.isPending ||
                                !settings.data ||
                                settings.data.geofilesEnabled
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
                    {settings.data.geofilesEnabled && (
                        <Text size="sm" c="dimmed">
                            {t('geofiles.disable-before-json')}
                        </Text>
                    )}
                    {!settings.data.serveJsonAtBaseSubscription && (
                        <Text size="sm" c="dimmed">
                            {t('geofiles.requires-json')}
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
