import { Alert, Button, Group, NumberInput, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api'

export interface GeofileRefresh {
    sourceUrl: string
    enabled: boolean
    intervalSeconds: number
    lastSuccessAt?: string
    nextRefreshAt?: string
    lastError?: string
    current?: { sha256: string; size: number; updatedAt: string; categories?: string[] }
}

export function GeofileRefreshSettings({
    id,
    refresh,
    onUpdated
}: {
    id: string
    refresh?: GeofileRefresh
    onUpdated: () => void
}) {
    const { t, i18n } = useTranslation()
    const [source, setSource] = useState(refresh?.sourceUrl ?? '')
    const [enabled, setEnabled] = useState(refresh?.enabled ?? false)
    const [minutes, setMinutes] = useState<number | string>(
        (refresh?.intervalSeconds ?? 86400) / 60
    )
    const [deferred, setDeferred] = useState(false)
    const configure = useMutation({
        mutationFn: () =>
            instance.patch(`/api/geofiles/${id}/refresh`, {
                sourceUrl: source.trim(),
                enabled,
                intervalSeconds: Number(minutes) * 60
            }),
        onSuccess: onUpdated
    })
    const update = useMutation({
        mutationFn: async () =>
            (
                await instance.post<{ response: { updated: boolean } }>(
                    `/api/geofiles/${id}/refresh`,
                    undefined,
                    { timeout: 45000 }
                )
            ).data.response,
        onSuccess: (result) => {
            setDeferred(!result.updated)
            onUpdated()
        }
    })
    const busy = configure.isPending || update.isPending
    return (
        <Stack gap="sm">
            <Text fw={600}>{t('geofiles.server-refresh')}</Text>
            <Text size="xs" c="dimmed">
                {t('geofiles.server-refresh-help')}
            </Text>
            <TextInput
                label={t('geofiles.source-url')}
                value={source}
                onChange={(event) => setSource(event.currentTarget.value)}
                disabled={busy}
                dir="ltr"
            />
            <Switch
                label={t('geofiles.auto-refresh')}
                checked={enabled}
                onChange={(event) => setEnabled(event.currentTarget.checked)}
                disabled={busy}
            />
            <NumberInput
                hideControls
                label={t('geofiles.server-interval')}
                description={t('geofiles.server-interval-help')}
                min={15}
                max={43200}
                allowDecimal={false}
                value={minutes}
                onChange={setMinutes}
                disabled={busy}
            />
            {refresh?.lastSuccessAt && (
                <Text size="xs">
                    {t('geofiles.last-update')}:{' '}
                    {new Date(refresh.lastSuccessAt).toLocaleString(i18n.language)}
                </Text>
            )}
            {refresh?.nextRefreshAt && (
                <Text size="xs">
                    {t('geofiles.next-update')}:{' '}
                    {new Date(refresh.nextRefreshAt).toLocaleString(i18n.language)}
                </Text>
            )}
            {(refresh?.lastError || configure.isError || update.isError) && (
                <Alert color="red">{t('geofiles.refresh-failed')}</Alert>
            )}
            {deferred && <Alert color="yellow">{t('geofiles.refresh-deferred')}</Alert>}
            <Group grow>
                <Button
                    loading={configure.isPending}
                    disabled={!source.trim() || (busy && !configure.isPending)}
                    onClick={() => {
                        setDeferred(false)
                        configure.mutate()
                    }}
                >
                    {t('geofiles.save-refresh')}
                </Button>
                <Button
                    variant="soft"
                    loading={update.isPending}
                    disabled={!refresh?.sourceUrl || (busy && !update.isPending)}
                    onClick={() => update.mutate()}
                >
                    {t('common.action.refresh')}
                </Button>
            </Group>
        </Stack>
    )
}
