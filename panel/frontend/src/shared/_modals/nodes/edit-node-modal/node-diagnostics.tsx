import { Alert, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api/axios'

import {
    ConnectionRoute,
    isRouteAuthenticated,
    parseConnectionRoute,
    ROUTE_OBSERVATION_MS,
    routeEndpoint
} from './node-connection-route'

type Report = {
    checkedAt: string
    durationMs: number
    alertMutedUntil: number | null
    connectionRoute?: unknown
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
            | 'busy'
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
const routeResultKeys = {
    authenticated: 'operations.result_authenticated',
    dns: 'operations.result_dns',
    refused: 'operations.result_refused',
    timeout: 'operations.result_timeout',
    certificate: 'operations.result_certificate',
    authorization: 'operations.result_authorization',
    proxy: 'operations.result_proxy',
    'identity-mismatch': 'operations.result_identity_mismatch',
    'identity-unavailable': 'operations.result_identity_unavailable',
    'invalid-response': 'operations.result_invalid_response',
    cooldown: 'operations.result_cooldown',
    busy: 'operations.result_busy',
    transport: 'operations.result_transport'
} as const

export function NodeConnectionRoute({ route, now }: { route: ConnectionRoute; now: number }) {
    const { t } = useTranslation()
    const authenticated = isRouteAuthenticated(route, now)
    const capacityBusy =
        route.status === 'unavailable' &&
        route.attempts.length > 0 &&
        route.attempts.every((attempt) => attempt.status === 'skipped' && attempt.code === 'busy')
    const status =
        capacityBusy || (route.status === 'authenticated' && !authenticated)
            ? 'unverified'
            : route.status
    return (
        <Paper withBorder p="sm">
            <Stack gap="xs">
                <Group justify="space-between" wrap="wrap">
                    <Text size="sm" fw={600}>
                        {t('operations.routeTitle')}
                    </Text>
                    <Badge
                        color={authenticated ? 'teal' : status === 'unavailable' ? 'red' : 'gray'}
                    >
                        {t(`operations.routeStatus_${status}`)}
                    </Badge>
                </Group>
                <Text size="sm">
                    {t(route.viaProxy ? 'operations.routeProxy' : 'operations.routeDirect')}
                </Text>
                {authenticated && (
                    <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                        <bdi>{routeEndpoint(route.activeAddress!, route.port)}</bdi>
                    </Text>
                )}
                {route.checkedAt && (
                    <Text size="xs" c="dimmed">
                        {t('operations.routeCheckedAt', {
                            time: new Date(route.checkedAt).toLocaleString()
                        })}
                    </Text>
                )}
                {route.status === 'authenticated' && !authenticated && (
                    <Text size="sm" c="dimmed">
                        {t('operations.routeStale')}
                    </Text>
                )}
                <Text size="xs" c="dimmed">
                    {t('operations.routeTrust')}
                </Text>
                {route.viaProxy && (
                    <Text size="xs" c="dimmed">
                        {t('operations.routeProxyFailure')}
                    </Text>
                )}
                {route.attempts.length > 0 && (
                    <Text size="xs" fw={600}>
                        {t('operations.routeAttempts')}
                    </Text>
                )}
                {route.attempts.map((attempt, index) => (
                    <Stack key={`${index}:${attempt.address}`} gap={2}>
                        <Group justify="space-between" wrap="wrap">
                            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                                <bdi>{routeEndpoint(attempt.address, route.port)}</bdi>
                            </Text>
                            <Badge
                                color={
                                    attempt.status === 'authenticated'
                                        ? 'gray'
                                        : attempt.status === 'failed'
                                          ? 'red'
                                          : 'gray'
                                }
                            >
                                {t(`operations.routeAttempt_${attempt.status}`)}
                            </Badge>
                        </Group>
                        <Text size="xs">{t(routeResultKeys[attempt.code])}</Text>
                    </Stack>
                ))}
            </Stack>
        </Paper>
    )
}

export function NodeDiagnostics({ nodeUuid }: { nodeUuid: string }) {
    const { t } = useTranslation()
    const [now, setNow] = useState(() => Date.now())
    const checkRequest = useRef<AbortController | null>(null)
    const check = useMutation({
        mutationFn: async (requestedUuid: string) => {
            checkRequest.current?.abort()
            const controller = new AbortController()
            checkRequest.current = controller
            try {
                const response = await instance.post<{ response: Report }>(
                    `/api/nodes/${requestedUuid}/diagnostics`,
                    {},
                    { timeout: 25000, signal: controller.signal }
                )
                if (!controller.signal.aborted) setNow(Date.now())
                return response.data.response
            } finally {
                if (checkRequest.current === controller) checkRequest.current = null
            }
        }
    })
    const mute = useMutation({
        mutationFn: async ({
            requestedUuid,
            minutes
        }: {
            requestedUuid: string
            minutes: number
        }) =>
            (
                await instance.post<{ response: { alertMutedUntil: number | null } }>(
                    `/api/nodes/${requestedUuid}/diagnostics/notifications`,
                    { minutes }
                )
            ).data.response
    })
    const resetCheck = check.reset
    const resetMute = mute.reset
    useEffect(() => {
        resetCheck()
        resetMute()
        return () => checkRequest.current?.abort()
    }, [nodeUuid, resetCheck, resetMute])
    const report =
        check.variables === nodeUuid && !check.isPending && !check.isError ? check.data : undefined
    const muteResult = mute.variables?.requestedUuid === nodeUuid ? mute.data : undefined
    const until = muteResult ? muteResult.alertMutedUntil : report?.alertMutedUntil
    const route = parseConnectionRoute(report?.connectionRoute)
    const checkedAt = route?.checkedAt
    useEffect(() => {
        const observed = Date.parse(checkedAt ?? '')
        const remaining = observed + ROUTE_OBSERVATION_MS - Date.now()
        if (!Number.isFinite(observed) || observed > Date.now() || remaining <= 0) return
        const timer = setTimeout(() => setNow(Date.now()), remaining + 1)
        return () => clearTimeout(timer)
    }, [checkedAt])
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
                        loading={check.isPending && check.variables === nodeUuid}
                        onClick={() => check.mutate(nodeUuid)}
                    >
                        {t('operations.checkConnection')}
                    </Button>
                </Group>
                <Text size="sm" c="dimmed">
                    {t('operations.diagnosticsScope')}
                </Text>
                {((check.isError && check.variables === nodeUuid) ||
                    (mute.isError && mute.variables?.requestedUuid === nodeUuid)) && (
                    <Alert color="red" role="alert">
                        {t('operations.requestError')}
                    </Alert>
                )}
                {report && (
                    <Stack gap="xs" aria-live="polite">
                        <Text size="xs" c="dimmed">
                            {new Date(report.checkedAt).toLocaleString()} · {report.durationMs} ms
                        </Text>
                        {route && <NodeConnectionRoute route={route} now={now} />}
                        {report.connectionRoute != null && !route && (
                            <Alert color="yellow">{t('operations.routeInvalid')}</Alert>
                        )}
                        {report.checks.map((step) => (
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
                        loading={mute.isPending && mute.variables?.requestedUuid === nodeUuid}
                        onClick={() =>
                            mute.mutate({ requestedUuid: nodeUuid, minutes: muted ? 0 : 30 })
                        }
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
