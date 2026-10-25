import { Alert, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api/axios'

type Report = {
    checkedAt: string
    durationMs: number
    alertMutedUntil: number | null
    checks: {
        id: 'connection' | 'xray' | 'users' | 'configuration'
        status: 'passed' | 'warning' | 'failed' | 'skipped'
        code:
            | 'authenticated'
            | 'disabled'
            | 'dns'
            | 'certificate'
            | 'refused'
            | 'timeout'
            | 'authorization'
            | 'transport'
            | 'xrayMissing'
            | 'xrayRunning'
            | 'syncPending'
            | 'synchronized'
            | 'unsupported'
            | 'applied'
            | 'applyFailed'
            | 'applyPending'
            | 'unmanaged'
            | 'configurationUnavailable'
    }[]
}
const colors = { passed: 'teal', warning: 'yellow', failed: 'red', skipped: 'gray' }
export function NodeDiagnostics({ nodeUuid }: { nodeUuid: string }) {
    const { t } = useTranslation()
    const check = useMutation({
        mutationFn: async () =>
            (
                await instance.post<{ response: Report }>(
                    `/api/nodes/${nodeUuid}/diagnostics`,
                    {},
                    { timeout: 25000 }
                )
            ).data.response
    })
    const mute = useMutation({
        mutationFn: async (minutes: number) =>
            (
                await instance.post<{ response: { alertMutedUntil: number | null } }>(
                    `/api/nodes/${nodeUuid}/diagnostics/notifications`,
                    { minutes }
                )
            ).data.response
    })
    const until = mute.data ? mute.data.alertMutedUntil : check.data?.alertMutedUntil
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (typeof until !== 'number') return
        const timer = setTimeout(() => setNow(Date.now()), Math.max(0, until - Date.now() + 10))
        return () => clearTimeout(timer)
    }, [until])
    const muted = typeof until === 'number' && until > now
    return (
        <Paper withBorder p="md">
            <Stack gap="sm">
                <Group justify="space-between" wrap="wrap">
                    <Text fw={600}>{t('operations.diagnostics')}</Text>
                    <Button
                        variant="light"
                        loading={check.isPending}
                        onClick={() => check.mutate()}
                    >
                        {t('operations.checkConnection')}
                    </Button>
                </Group>
                <Text size="sm" c="dimmed">
                    {t('operations.diagnosticsScope')}
                </Text>
                {(check.isError || mute.isError) && (
                    <Alert color="red" role="alert">
                        {t('operations.requestError')}
                    </Alert>
                )}
                {check.data && (
                    <Stack gap="xs" aria-live="polite">
                        <Text size="xs" c="dimmed">
                            {new Date(check.data.checkedAt).toLocaleString()} ·{' '}
                            {check.data.durationMs} ms
                        </Text>
                        {check.data.checks.map((step) => (
                            <Paper withBorder p="sm" key={step.id}>
                                <Group justify="space-between" wrap="wrap">
                                    <Text size="sm" fw={500}>
                                        {t(`operations.check_${step.id}`)}
                                    </Text>
                                    <Badge color={colors[step.status]}>
                                        {t(`operations.status_${step.status}`)}
                                    </Badge>
                                </Group>
                                <Text size="sm" mt={4}>
                                    {t(`operations.result_${step.code}`)}
                                </Text>
                            </Paper>
                        ))}
                    </Stack>
                )}
                <Text size="sm" c="dimmed">
                    {t('operations.incidentHelp')}
                </Text>
                <Group wrap="wrap">
                    <Button
                        size="xs"
                        variant="subtle"
                        loading={mute.isPending}
                        onClick={() => mute.mutate(muted ? 0 : 30)}
                    >
                        {t(muted ? 'operations.resumeAlerts' : 'operations.pauseAlerts')}
                    </Button>
                    {muted && (
                        <Text size="xs">
                            {t('operations.alertsUntil', {
                                time: new Date(until!).toLocaleTimeString()
                            })}
                        </Text>
                    )}
                </Group>
            </Stack>
        </Paper>
    )
}
