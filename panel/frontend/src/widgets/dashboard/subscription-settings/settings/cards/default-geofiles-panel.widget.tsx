import type { Geofile } from '../../../templates/subscription-template-editor/geofile-types'

import { Accordion, Alert, Badge, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api'

import { geofilePresets } from '../../../templates/subscription-template-editor/geofile-presets'
import { GeofileRefreshSettings } from '../../../templates/subscription-template-editor/geofile-refresh-settings'

const defaults = geofilePresets.filter((source) => source.provider === 'Loyalsoldier')
const queryKey = ['template-geofiles']

function DefaultGeofilesContent() {
    const { t } = useTranslation()
    const client = useQueryClient()
    const [progress, setProgress] = useState(0)
    const [deferred, setDeferred] = useState(false)
    const files = useQuery({
        queryKey,
        queryFn: async ({ signal }) =>
            (await instance.get<{ response: Geofile[] }>('/api/geofiles', { signal })).data.response
    })
    const invalidate = async () => {
        await client.invalidateQueries({ queryKey })
    }
    const update = useMutation({
        mutationFn: async () => {
            setProgress(0)
            setDeferred(false)
            const current = (await instance.get<{ response: Geofile[] }>('/api/geofiles')).data
                .response
            let waiting = false
            for (const [index, source] of defaults.entries()) {
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
                disabled={!files.isSuccess || update.isPending}
                onClick={() => update.mutate()}
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
    return (
        <Accordion value={opened} onChange={setOpened} variant="contained">
            <Accordion.Item value="defaults">
                <Accordion.Control>{t('geofiles.defaults-title')}</Accordion.Control>
                <Accordion.Panel>
                    {opened === 'defaults' && <DefaultGeofilesContent />}
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    )
}
