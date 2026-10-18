import { Alert, Badge, Button, Group, NumberInput, Paper, Stack, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbDownload, TbPlayerRecord, TbPlayerStop, TbTrash } from 'react-icons/tb'

import { instance } from '@shared/api'

interface Recording {
    id: string
    startedAt: string
    endsAt: string
    intervalSeconds: number
    status: string
    observations: number
    polls: number
    failedNodePolls: number
    offlineNodePolls: number
    truncated: boolean
}
const endpoint = '/api/connections/recordings'

export function SessionRecordings() {
    const { t } = useTranslation()
    const [recordings, setRecordings] = useState<Recording[]>([])
    const [duration, setDuration] = useState<string | number>(60)
    const [interval, setIntervalSeconds] = useState<string | number>(30)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState(false)
    const [loaded, setLoaded] = useState(false)

    const refresh = async (signal?: AbortSignal) => {
        const { data } = await instance.get<{ response: Recording[] }>(endpoint, { signal })
        setRecordings(data.response)
        setLoaded(true)
    }

    useEffect(() => {
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout>
        const poll = async () => {
            try {
                await refresh(controller.signal)
                setError(false)
            } catch {
                if (!controller.signal.aborted) setError(true)
            }
            if (!controller.signal.aborted) timer = setTimeout(poll, 5000)
        }
        void poll()
        return () => {
            controller.abort()
            clearTimeout(timer)
        }
    }, [])

    const action = async (operation: () => Promise<unknown>) => {
        setBusy(true)
        setError(false)
        try {
            await operation()
            await refresh()
        } catch {
            setError(true)
        } finally {
            setBusy(false)
        }
    }

    const download = async (id: string) => {
        const { data } = await instance.get(`${endpoint}/${id}/export`)
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(data.response, null, 2)], {
                type: 'application/json;charset=utf-8'
            })
        )
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `sessions-${id}.json`
        anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    return (
        <Stack gap="md">
            <Alert>{t('session-recording.explanation')}</Alert>
            {error && <Alert color="red">{t('session-recording.error')}</Alert>}
            <Paper withBorder p="md" radius="md">
                <Stack>
                    <Group align="end">
                        <NumberInput
                            label={t('session-recording.duration')}
                            min={1}
                            max={10080}
                            allowDecimal={false}
                            value={duration}
                            onChange={setDuration}
                        />
                        <NumberInput
                            label={t('session-recording.interval')}
                            min={10}
                            max={300}
                            allowDecimal={false}
                            value={interval}
                            onChange={setIntervalSeconds}
                        />
                        <Button
                            leftSection={<TbPlayerRecord size={18} />}
                            loading={busy}
                            disabled={
                                !loaded || recordings.some((item) => item.status === 'running')
                            }
                            onClick={() =>
                                void action(() =>
                                    instance.post(endpoint, {
                                        durationMinutes: Number(duration),
                                        intervalSeconds: Number(interval)
                                    })
                                )
                            }
                        >
                            {t('session-recording.start')}
                        </Button>
                    </Group>
                    <Text c="dimmed" size="sm">
                        {t('session-recording.retention')}
                    </Text>
                </Stack>
            </Paper>
            {loaded && recordings.length === 0 && (
                <Text c="dimmed">{t('session-recording.empty')}</Text>
            )}
            {recordings.map((item) => (
                <Paper key={item.id} withBorder p="md" radius="md">
                    <Stack gap="sm">
                        <Group justify="space-between">
                            <Title order={5}>{new Date(item.startedAt).toLocaleString()}</Title>
                            <Badge color={item.status === 'running' ? 'teal' : 'gray'}>
                                {t(
                                    item.status === 'running'
                                        ? 'session-recording.running'
                                        : 'session-recording.completed'
                                )}
                            </Badge>
                        </Group>
                        <Text size="sm">
                            {t('session-recording.summary', {
                                count: item.observations,
                                polls: item.polls,
                                end: new Date(item.endsAt).toLocaleString(),
                                interval: item.intervalSeconds
                            })}
                        </Text>
                        {(item.failedNodePolls > 0 ||
                            item.offlineNodePolls > 0 ||
                            item.truncated) && (
                            <Alert color="yellow">
                                {t('session-recording.partial', {
                                    failed: item.failedNodePolls,
                                    offline: item.offlineNodePolls
                                })}
                                {item.truncated && ` ${t('session-recording.limit')}`}
                            </Alert>
                        )}
                        <Group>
                            <Button
                                variant="light"
                                leftSection={<TbDownload size={16} />}
                                disabled={busy}
                                onClick={() => void action(() => download(item.id))}
                            >
                                {t('session-recording.download')}
                            </Button>
                            {item.status === 'running' && (
                                <Button
                                    variant="light"
                                    color="orange"
                                    disabled={busy}
                                    leftSection={<TbPlayerStop size={16} />}
                                    onClick={() =>
                                        void action(() =>
                                            instance.post(`${endpoint}/${item.id}/stop`)
                                        )
                                    }
                                >
                                    {t('session-recording.stop')}
                                </Button>
                            )}
                            <Button
                                color="red"
                                variant="subtle"
                                disabled={busy}
                                leftSection={<TbTrash size={16} />}
                                onClick={() => {
                                    if (window.confirm(t('session-recording.delete-confirm'))) {
                                        void action(() => instance.delete(`${endpoint}/${item.id}`))
                                    }
                                }}
                            >
                                {t('session-recording.delete')}
                            </Button>
                        </Group>
                    </Stack>
                </Paper>
            ))}
        </Stack>
    )
}
