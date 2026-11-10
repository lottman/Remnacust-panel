import { Alert, Button, Group, Loader, NumberInput, Stack, Text } from '@mantine/core'
import {
    GEOFILE_INLINE_RULE_LIMIT,
    GEOFILE_INLINE_RULE_LIMIT_MIN,
    GEOFILE_INLINE_RULE_LIMIT_MAX
} from '@remnawave/backend-contract'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUpdateSubscriptionSettings } from '@shared/api/hooks/subscription-settings/subscription-settings.mutation.hooks'
import {
    subscriptionSettingsQueryKeys,
    useGetSubscriptionSettings
} from '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks'

export function GeofileInlineSettings() {
    const { t } = useTranslation()
    const client = useQueryClient()
    const queryKey = subscriptionSettingsQueryKeys.getSubscriptionSettings.queryKey
    const settings = useGetSubscriptionSettings({
        rQueryParams: { refetchOnMount: 'always', refetchOnWindowFocus: 'always' }
    })
    const [draft, setDraft] = useState<number | string | null>(null)
    const saved = settings.data?.geofilesInlineRuleLimit ?? GEOFILE_INLINE_RULE_LIMIT
    const value = draft ?? saved
    const valid =
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= GEOFILE_INLINE_RULE_LIMIT_MIN &&
        value <= GEOFILE_INLINE_RULE_LIMIT_MAX
    const update = useUpdateSubscriptionSettings({
        mutationFns: {
            onSuccess: async (data) => {
                await client.cancelQueries({ queryKey })
                client.setQueryData(queryKey, data)
                setDraft(null)
                void client.invalidateQueries({ queryKey })
            }
        }
    })
    return (
        <Stack gap="sm">
            <Text fw={600}>{t('geofiles.inline-limit-title')}</Text>
            <NumberInput
                label={t('geofiles.inline-limit-label')}
                description={t('geofiles.inline-limit-help', {
                    min: GEOFILE_INLINE_RULE_LIMIT_MIN,
                    max: GEOFILE_INLINE_RULE_LIMIT_MAX
                })}
                min={GEOFILE_INLINE_RULE_LIMIT_MIN}
                max={GEOFILE_INLINE_RULE_LIMIT_MAX}
                allowDecimal={false}
                allowNegative={false}
                hideControls
                value={value}
                onChange={setDraft}
                disabled={!settings.isSuccess || update.isPending}
                error={
                    draft !== null && !valid
                        ? t('geofiles.inline-limit-invalid', {
                              min: GEOFILE_INLINE_RULE_LIMIT_MIN,
                              max: GEOFILE_INLINE_RULE_LIMIT_MAX
                          })
                        : undefined
                }
            />
            <Text size="xs" c="dimmed">
                {t('geofiles.inline-limit-safety')}
            </Text>
            <Group>
                <Button
                    loading={update.isPending}
                    disabled={!settings.isSuccess || update.isPending || !valid || value === saved}
                    onClick={() => {
                        if (!valid || !settings.data || update.isPending) return
                        update.mutate({
                            variables: { uuid: settings.data.uuid, geofilesInlineRuleLimit: value }
                        })
                    }}
                >
                    {t('common.action.save')}
                </Button>
                {settings.isPending && <Loader size="xs" />}
            </Group>
            {settings.isError && (
                <Alert color="red">
                    {t('geofiles.json-setting-load-failed')}{' '}
                    <Button
                        variant="subtle"
                        loading={settings.isFetching}
                        onClick={() => void settings.refetch()}
                    >
                        {t('common.action.refresh')}
                    </Button>
                </Alert>
            )}
            {update.isError && <Alert color="red">{t('geofiles.json-setting-save-failed')}</Alert>}
        </Stack>
    )
}
