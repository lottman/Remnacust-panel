import type { Geofile } from '../../../templates/subscription-template-editor/geofile-types'

import { Accordion, Alert, Badge, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api'
import {
    getGeofilesSettingsState,
    SUBSCRIPTION_SETTINGS_MUTATION_KEY
} from '@shared/api/hooks/subscription-settings/subscription-settings-state'
import {
    subscriptionSettingsQueryKeys,
    useGetSubscriptionSettings
} from '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks'
import { usePanelReducedMotion } from '@shared/ui/appearance/appearance'

import { geofilePresets } from '../../../templates/subscription-template-editor/geofile-presets'
import { GeofileRefreshSettings } from '../../../templates/subscription-template-editor/geofile-refresh-settings'

const defaults = geofilePresets.filter((source) => source.provider === 'Loyalsoldier')
const queryKey = ['template-geofiles']
const updateKey = ['template-geofiles', 'defaults-update']

function DefaultGeofilesContent({ active }: { active: boolean }) {
    const { t } = useTranslation()
    const client = useQueryClient()
    const settings = useGetSubscriptionSettings()
    const settingsPending = useIsMutating({ mutationKey: SUBSCRIPTION_SETTINGS_MUTATION_KEY }) > 0
    const settingsKey = subscriptionSettingsQueryKeys.getSubscriptionSettings.queryKey
    const state = getGeofilesSettingsState(settings.data, settings.isSuccess)
    const canUpdate = () =>
        state.canUpdateFiles &&
        client.getQueryState(settingsKey)?.status === 'success' &&
        client.getQueryData<{ geofilesSystemEnabled?: boolean }>(settingsKey)
            ?.geofilesSystemEnabled === true &&
        client.isMutating({ mutationKey: SUBSCRIPTION_SETTINGS_MUTATION_KEY }) === 0
    const [progress, setProgress] = useState(0)
    const [deferred, setDeferred] = useState(false)
    const files = useQuery({
        queryKey,
        enabled: active,
        staleTime: 20_000,
        queryFn: async ({ signal }) =>
            (await instance.get<{ response: Geofile[] }>('/api/geofiles', { signal })).data.response
    })
    const invalidate = async () => {
        await client.invalidateQueries({ queryKey })
    }
    const update = useMutation({
        mutationKey: updateKey,
        mutationFn: async () => {
            if (!canUpdate()) throw new Error(t('geofiles.system-disabled'))
            setProgress(0)
            setDeferred(false)
            const current = (await instance.get<{ response: Geofile[] }>('/api/geofiles')).data
                .response
            let waiting = false
            for (const [index, source] of defaults.entries()) {
                if (!canUpdate()) throw new Error(t('geofiles.system-disabled'))
                const file = current.find(
                    (item) => item.kind === source.kind && item.refresh?.sourceUrl === source.url
                )
                if (file) {
                    const result = await instance.post<{ response: { updated: boolean } }>(
                        `/api/geofiles/${file.id}/refresh`,
                        undefined,
                        { timeout: 45000 }
                    )
                    waiting ||= !result.data.response.updated
                } else {
                    await instance.post(
                        '/api/geofiles/import',
                        {
                            name: source.name,
                            kind: source.kind,
                            url: source.url
                        },
                        { timeout: 45000 }
                    )
                }
                setProgress(index + 1)
            }
            setDeferred(waiting)
        },
        onSettled: invalidate
    })
    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">
                {t('geofiles.defaults-help')}
            </Text>
            {files.isPending && <Loader size="xs" />}
            {files.isError && <Alert color="red">{t('geofiles.operation-failed')}</Alert>}
            {settings.isPending && <Loader size="xs" />}
            {settings.isError && (
                <Alert color="red" role="alert">
                    {t('geofiles.json-setting-load-failed')}
                </Alert>
            )}
            {settings.isSuccess && !state.systemEnabled && (
                <Alert color="yellow" role="status">
                    {t('geofiles.system-disabled')}
                </Alert>
            )}
            {defaults.map((source) => {
                const file = files.data?.find(
                    (item) => item.kind === source.kind && item.refresh?.sourceUrl === source.url
                )
                return (
                    <Stack key={source.id} gap="xs">
                        <Group justify="space-between" wrap="wrap">
                            <Text fw={600}>{source.name}</Text>
                            <Badge variant="light">
                                {t(
                                    file
                                        ? 'geofiles.default-ready'
                                        : 'geofiles.default-not-downloaded'
                                )}
                            </Badge>
                        </Group>
                        {file && (
                            <GeofileRefreshSettings
                                disabled={
                                    !state.canUpdateFiles || settingsPending || update.isPending
                                }
                                canUpdate={canUpdate}
                                key={JSON.stringify([
                                    file.id,
                                    file.refresh?.sourceUrl,
                                    file.refresh?.enabled,
                                    file.refresh?.intervalSeconds
                                ])}
                                id={file.id}
                                refresh={file.refresh}
                                onUpdated={invalidate}
                            />
                        )}
                    </Stack>
                )
            })}
            {update.isError && <Alert color="red">{t('geofiles.refresh-failed')}</Alert>}
            {deferred && <Alert color="yellow">{t('geofiles.refresh-deferred')}</Alert>}
            <Button
                loading={update.isPending}
                disabled={
                    !files.isSuccess || !state.canUpdateFiles || settingsPending || update.isPending
                }
                onClick={() => {
                    if (
                        !files.isSuccess ||
                        !canUpdate() ||
                        update.isPending ||
                        client.isMutating({ mutationKey: updateKey }) > 0
                    )
                        return
                    update.mutate()
                }}
                type="button"
            >
                {t('geofiles.defaults-update')}
                {update.isPending ? ` · ${progress}/${defaults.length}` : ''}
            </Button>
        </Stack>
    )
}

export function DefaultGeofilesPanel() {
    const { t } = useTranslation()
    const [opened, setOpened] = useState<string | null>(null)
    const [activated, setActivated] = useState(false)
    const reducedMotion = usePanelReducedMotion()
    return (
        <Accordion
            value={opened}
            onChange={(value) => {
                setOpened(value)
                if (value === 'defaults') setActivated(true)
            }}
            variant="contained"
            keepMountedMode="display-none"
            transitionDuration={reducedMotion ? 0 : 200}
        >
            <Accordion.Item value="defaults">
                <Accordion.Control>{t('geofiles.defaults-title')}</Accordion.Control>
                <Accordion.Panel>
                    {activated && <DefaultGeofilesContent active={opened === 'defaults'} />}
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    )
}
