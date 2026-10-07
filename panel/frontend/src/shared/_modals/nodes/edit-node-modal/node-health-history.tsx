import {
    Alert,
    Badge,
    Button,
    Group,
    NumberInput,
    Paper,
    ScrollArea,
    Select,
    Stack,
    Table,
    Text
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { GetNodeCommand, ROOT } from '@remnawave/backend-contract'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbRefresh, TbTrash } from 'react-icons/tb'

import { instance } from '@shared/api/axios'
import { useUiText } from '@shared/i18n/interface-text'
import { NodeHealthDetails } from '@shared/ui/node-health/node-health'
import { RefreshActionIcon } from '@shared/ui/refresh-control'

interface HealthEntry {
    id: string
    checkedAt: string
    status: 'ok' | 'retry' | 'unreachable' | 'xray_missing' | 'error'
    attempt: number
    message: string | null
    metrics: Record<string, number | null>
}

const statusColors: Record<HealthEntry['status'], string> = {
    ok: 'teal',
    retry: 'yellow',
    unreachable: 'red',
    xray_missing: 'orange',
    error: 'red'
}

const statusLabels = {
    ok: 'nodeHealthHistory.ok',
    retry: 'nodeHealthHistory.retry',
    unreachable: 'nodeHealthHistory.unreachable',
    xray_missing: 'nodeHealthHistory.xrayMissing',
    error: 'nodeHealthHistory.error'
} as const

const healthStatuses = new Set<HealthEntry['status']>([
    'ok',
    'retry',
    'unreachable',
    'xray_missing',
    'error'
])

function isHealthEntry(value: unknown): value is HealthEntry {
    if (!value || typeof value !== 'object') return false
    const entry = value as Partial<HealthEntry>
    if (
        typeof entry.id !== 'string' ||
        !/^\d+$/.test(entry.id) ||
        typeof entry.checkedAt !== 'string' ||
        !Number.isFinite(Date.parse(entry.checkedAt)) ||
        !healthStatuses.has(entry.status as HealthEntry['status']) ||
        typeof entry.attempt !== 'number' ||
        !Number.isFinite(entry.attempt) ||
        (entry.message !== null && typeof entry.message !== 'string') ||
        !entry.metrics ||
        typeof entry.metrics !== 'object'
    )
        return false

    return Object.values(entry.metrics).every(
        (metric) => metric === null || typeof metric === 'number'
    )
}

function getNextHealthPageCursor(lastPage: unknown): string | undefined {
    if (!Array.isArray(lastPage) || lastPage.length !== 100) return undefined

    const lastEntry: unknown = lastPage.at(-1)
    return isHealthEntry(lastEntry) ? lastEntry.id : undefined
}

export function NodeHealthHistory({ node }: { node: GetNodeCommand.Response['response'] }) {
    const uiText = useUiText()

    const { i18n, t } = useTranslation()
    const client = useQueryClient()
    const [status, setStatus] = useState('all')
    const [daysOverride, setDaysOverride] = useState<number | null>(null)
    const logsKey = ['node-health-log', node.uuid, status]
    const logs = useInfiniteQuery({
        queryKey: logsKey,
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }) => {
            const result = await instance.get<{ response?: unknown }>(
                `${ROOT}/nodes/health/${node.uuid}`,
                {
                    params: { status, limit: 100, ...(pageParam ? { before: pageParam } : {}) }
                }
            )
            const response = result.data?.response
            if (!Array.isArray(response) || !response.every(isHealthEntry)) {
                throw new Error('Invalid node health log response')
            }
            return response
        },
        getNextPageParam: getNextHealthPageCursor
    })
    const entries = logs.data?.pages.flat() ?? []
    const retention = useQuery({
        queryKey: ['node-health-retention'],
        queryFn: async () => {
            const result = await instance.get<{ response: { days: number } }>(
                `${ROOT}/nodes/health/retention`
            )
            return result.data.response.days
        }
    })
    const days = daysOverride ?? retention.data ?? 30
    const xrayLogs = useQuery({
        queryKey: ['node-xray-logs', node.uuid],
        queryFn: async () => {
            const result = await instance.get<{ response: { lines: string[] } }>(
                `${ROOT}/nodes/health/${node.uuid}/xray-logs`
            )
            return result.data.response.lines
        },
        enabled: false,
        retry: false
    })
    const saveRetention = useMutation({
        mutationFn: async () => instance.post(`${ROOT}/nodes/health/retention`, { days }),
        onSuccess: async () => {
            await Promise.all([
                client.invalidateQueries({ queryKey: ['node-health-retention'] }),
                client.invalidateQueries({ queryKey: ['node-health-log'] })
            ])
        }
    })
    const clearLog = useMutation({
        mutationFn: async () => instance.delete(`${ROOT}/nodes/health/${node.uuid}`),
        onSuccess: async () =>
            client.invalidateQueries({ queryKey: ['node-health-log', node.uuid] })
    })
    const runCheck = useMutation({
        mutationFn: async () => instance.post(`${ROOT}/nodes/health/${node.uuid}/check`),
        onSuccess: () => {
            window.setTimeout(() => {
                void client.invalidateQueries({ queryKey: ['node-health-log', node.uuid] })
            }, 5000)
        }
    })
    const confirmClear = () =>
        modals.openConfirmModal({
            title: uiText('clear-this-node-health-log-5ff36f0'),
            children: (
                <Text size="sm">
                    {uiText('the-check-history-will-be-deleted-permanently-096cdeb')}
                </Text>
            ),
            labels: { confirm: uiText('clear-83b12c2'), cancel: uiText('cancel-19766ed') },
            confirmProps: { color: 'red' },
            onConfirm: () => clearLog.mutate()
        })

    return (
        <Stack gap="md" py="md">
            <NodeHealthDetails node={node} />
            <Paper p="md" radius="md" withBorder>
                <Stack gap="sm">
                    <Group align="end" justify="space-between">
                        <Stack gap={2}>
                            <Text fw={600}>{uiText('node-health-checks-f44b4af')}</Text>
                            <Text c="dimmed" size="xs">
                                {uiText(
                                    'connection-attempts-node-responses-and-measured-resources-syst-77a7903'
                                )}
                            </Text>
                        </Stack>
                        <Group gap="xs">
                            <Button
                                loading={runCheck.isPending}
                                onClick={() => runCheck.mutate()}
                                size="xs"
                                variant="light"
                            >
                                {uiText('check-now-2937cff')}
                            </Button>
                            <Select
                                aria-label={uiText('filter-entries-9080dc7')}
                                data={[
                                    { value: 'all', label: uiText('all-a52ace4') },
                                    { value: 'ok', label: 'OK' },
                                    { value: 'retry', label: uiText('retries-ef21130') },
                                    { value: 'unreachable', label: uiText('unreachable-abaa46a') },
                                    { value: 'xray_missing', label: 'Xray' },
                                    { value: 'error', label: uiText('errors-cb70237') }
                                ]}
                                onChange={(value) => setStatus(value ?? 'all')}
                                value={status}
                                w={150}
                            />
                            <RefreshActionIcon
                                aria-label={uiText('refresh-0e91610')}
                                loading={logs.isFetching}
                                onClick={() => logs.refetch()}
                                size="lg"
                                variant="light"
                            >
                                <TbRefresh size={18} />
                            </RefreshActionIcon>
                        </Group>
                    </Group>
                    {logs.isError && (
                        <Alert color="red">{uiText('could-not-load-health-checks-6e02827')}</Alert>
                    )}
                    {!logs.isLoading && entries.length === 0 && (
                        <Text c="dimmed" size="sm">
                            {uiText(
                                'no-entries-yet-they-will-appear-after-the-next-node-check-bade00e'
                            )}
                        </Text>
                    )}
                    {entries.length > 0 && (
                        <ScrollArea.Autosize mah={440} type="auto">
                            <Table highlightOnHover striped verticalSpacing="xs">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>{uiText('time-33b9347')}</Table.Th>
                                        <Table.Th>{uiText('result-6e7d50e')}</Table.Th>
                                        <Table.Th>{uiText('attempt-c934cc7')}</Table.Th>
                                        <Table.Th>{uiText('load-memory-xray-955d5f3')}</Table.Th>
                                        <Table.Th>{uiText('message-2f77668')}</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {entries.map((entry) => (
                                        <Table.Tr key={entry.id}>
                                            <Table.Td style={{ whiteSpace: 'nowrap' }}>
                                                {new Date(entry.checkedAt).toLocaleString(
                                                    i18n.language
                                                )}
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge
                                                    color={statusColors[entry.status]}
                                                    variant="light"
                                                >
                                                    {t(statusLabels[entry.status])}
                                                </Badge>
                                            </Table.Td>
                                            <Table.Td>{entry.attempt}</Table.Td>
                                            <Table.Td style={{ whiteSpace: 'nowrap' }}>
                                                {entry.metrics.load1 == null
                                                    ? '—'
                                                    : `${entry.metrics.load1.toFixed(2)} / ${entry.metrics.load5?.toFixed(2) ?? '—'}`}
                                                {' · '}
                                                {entry.metrics.memoryUsed == null ||
                                                entry.metrics.memoryTotal == null ||
                                                entry.metrics.memoryTotal === 0
                                                    ? '—'
                                                    : `${Math.round((entry.metrics.memoryUsed / entry.metrics.memoryTotal) * 100)}%`}
                                                {' · '}
                                                {entry.metrics.xrayUptime == null
                                                    ? '—'
                                                    : `${Math.round(entry.metrics.xrayUptime)}s`}
                                            </Table.Td>
                                            <Table.Td
                                                style={{ overflowWrap: 'anywhere', maxWidth: 260 }}
                                            >
                                                {entry.message ?? '—'}
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea.Autosize>
                    )}
                    <Group justify="space-between">
                        <Text c="dimmed" size="xs">
                            {uiText('entries-shown-value-use-refresh-for-new-data-d452203', {
                                value1: entries.length
                            })}
                        </Text>
                        {logs.hasNextPage && (
                            <Button
                                loading={logs.isFetchingNextPage}
                                onClick={() => logs.fetchNextPage()}
                                size="xs"
                                variant="subtle"
                            >
                                {uiText('load-more-ac8991e')}
                            </Button>
                        )}
                    </Group>
                </Stack>
            </Paper>
            <Paper p="md" radius="md" withBorder>
                <Stack gap="sm">
                    <Group justify="space-between">
                        <Stack gap={2}>
                            <Text fw={600}>{uiText('xray-log-from-node-0af029d')}</Text>
                            <Text c="dimmed" size="xs">
                                {uiText(
                                    'latest-200-lines-fetched-on-demand-and-not-stored-in-the-panel-f82c8f7'
                                )}
                            </Text>
                        </Stack>
                        <Button
                            loading={xrayLogs.isFetching}
                            onClick={() => xrayLogs.refetch()}
                            size="xs"
                            variant="light"
                        >
                            {uiText('load-log-5646a79')}
                        </Button>
                    </Group>
                    {xrayLogs.isError && (
                        <Alert color="yellow">
                            {uiText(
                                'xray-log-unavailable-check-the-node-connection-and-version-8c26f1a'
                            )}
                        </Alert>
                    )}
                    {xrayLogs.data?.length === 0 && (
                        <Text c="dimmed" size="sm">
                            {uiText('no-lines-yet-4c1ac25')}
                        </Text>
                    )}
                    {!!xrayLogs.data?.length && (
                        <ScrollArea.Autosize mah={320} type="auto">
                            <Text
                                component="pre"
                                ff="monospace"
                                fz="xs"
                                m={0}
                                style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                            >
                                {xrayLogs.data.join('\n')}
                            </Text>
                        </ScrollArea.Autosize>
                    )}
                </Stack>
            </Paper>
            <Paper p="md" radius="md" withBorder>
                <Stack gap="sm">
                    <Text fw={600}>{uiText('log-retention-46c385a')}</Text>
                    <Text c="dimmed" size="sm">
                        {uiText(
                            'old-entries-for-all-nodes-are-removed-automatically-this-setti-55fabec'
                        )}
                    </Text>
                    <Group align="end" gap="xs">
                        <NumberInput
                            allowDecimal={false}
                            allowNegative={false}
                            label={uiText('days-e08c0aa')}
                            max={365}
                            min={1}
                            onChange={(value) => setDaysOverride(Number(value) || 30)}
                            value={days}
                            w={120}
                        />
                        <Button
                            disabled={days === retention.data || days < 1 || days > 365}
                            loading={saveRetention.isPending}
                            onClick={() => saveRetention.mutate()}
                            variant="light"
                        >
                            {uiText('save-1509f56')}
                        </Button>
                        <Button
                            color="red"
                            leftSection={<TbTrash size={16} />}
                            loading={clearLog.isPending}
                            onClick={confirmClear}
                            variant="subtle"
                        >
                            {uiText('clear-this-node-ccdf4bb')}
                        </Button>
                    </Group>
                    {(saveRetention.isError || clearLog.isError || runCheck.isError) && (
                        <Alert color="red">{uiText('operation-failed-4e1af7c')}</Alert>
                    )}
                </Stack>
            </Paper>
        </Stack>
    )
}
