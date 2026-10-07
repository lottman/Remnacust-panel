import type { GetNodeCommand } from '@remnawave/backend-contract'

import { Accordion, Badge, Button, Group, Progress, Stack, Text } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api/axios'
import { useUiText } from '@shared/i18n/interface-text'
import { nodeOptimizationQuery } from '@shared/ui/forms/nodes/base-node-form/node-optimization-query'
import type { OptimizationLevel } from '@shared/ui/forms/nodes/base-node-form/optimization-runner'

import { useSshTabsActions, useSshStatuses } from './tabs/ssh-tabs.store'

export type OptimizationBatch = {
    id: string
    nodes: GetNodeCommand.Response['response'][]
    level: OptimizationLevel
    stopOnFailure: boolean
}
type State = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'
type Result = { uuid: string; name: string; state: State; error?: string }
const initial = (batch: OptimizationBatch): Result[] => [
    ...new Map(
        batch.nodes.map((node) => [
            node.uuid,
            { uuid: node.uuid, name: node.name, state: 'pending' as const }
        ])
    ).values()
]

export function OptimizationBatchPanel({
    request,
    enabled
}: {
    request: OptimizationBatch
    enabled: boolean
}) {
    const uiText = useUiText()

    const { t } = useTranslation()
    const [batch, setBatch] = useState(request)
    const [results, setResults] = useState(() => initial(request))
    const actions = useSshTabsActions()
    const statuses = useSshStatuses()
    const client = useQueryClient()
    const started = useRef(new Set<string>())
    const opened = useRef(new Set<string>())
    const [received, setReceived] = useState(request.id)
    const [rejected, setRejected] = useState(false)
    const mounted = useRef(true)
    const active = results.find((item) => item.state === 'pending' || item.state === 'running')
    const finished = results.filter((item) => !['pending', 'running'].includes(item.state)).length
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])
    if (received !== request.id) {
        setReceived(request.id)
        if (active) {
            setRejected(true)
        } else {
            setRejected(false)
            setBatch(request)
            setResults(initial(request))
        }
    }
    useEffect(() => {
        started.current.clear()
        opened.current.clear()
    }, [batch.id])

    useEffect(() => {
        if (!enabled || !active || started.current.has(active.uuid)) return
        const node = batch.nodes.find((node) => node.uuid === active.uuid)!
        const update = (state: State, error?: string) => {
            if (!mounted.current) return
            setResults((current) =>
                current.map((item) =>
                    item.uuid === node.uuid
                        ? { ...item, state, error }
                        : state === 'failed' && batch.stopOnFailure && item.state === 'pending'
                          ? { ...item, state: 'skipped' }
                          : item
                )
            )
        }
        const status = statuses[node.uuid]
        if (!status) {
            const result = actions.openTab(node)
            if (result === 'opened') opened.current.add(node.uuid)
            if (result === 'rejected')
                update('failed', uiText('close-unused-ssh-tabs-and-retry-4a49f17'))
            return
        }
        if (status.stage === 'failed' || status.statusText) {
            update('failed', status.statusText ?? uiText('ssh-connection-failed-4dd3696'))
            return
        }
        if (!status.isConnected) return
        const handle = actions.getHandle(node.uuid)
        if (!handle) return
        started.current.add(node.uuid)
        update('running')
        const verifyQuery = {
            ...nodeOptimizationQuery(
                node.uuid,
                async (url, signal) =>
                    (await instance.get(url, { signal, timeout: 5000 })).data.response
            ),
            retry: false
        }
        const runAndVerify = async () => {
            const before = await client.fetchQuery(verifyQuery)
            // Opening another queue or locking the vault must not dispatch a delayed command.
            if (!mounted.current || !actions.getStatuses()[node.uuid]?.isConnected)
                throw new Error(uiText('ssh-connection-closed-before-operation'))
            await handle.optimize(batch.level, crypto.randomUUID())
            for (let attempt = 0; attempt < 12; attempt++) {
                if (!mounted.current) return
                await new Promise((resolve) => setTimeout(resolve, 1000))
                const verified = await client.fetchQuery(verifyQuery)
                if (
                    verified.verified &&
                    verified.level === batch.level &&
                    verified.checkedAt !== before.checkedAt
                )
                    return
            }
            throw new Error(
                uiText('command-finished-but-database-verification-is-missing-check-th-f160173')
            )
        }
        void runAndVerify()
            .then(() => {
                update('succeeded')
                void client.invalidateQueries({ queryKey: ['node-optimization', node.uuid] })
                if (mounted.current && opened.current.has(node.uuid)) actions.closeTab(node.uuid)
            })
            .catch((error: unknown) => {
                update(
                    'failed',
                    error instanceof Error ? error.message : uiText('optimization-failed')
                )
                if (mounted.current && !batch.stopOnFailure && opened.current.has(node.uuid))
                    actions.closeTab(node.uuid)
            })
    }, [active, actions, batch, client, enabled, statuses, uiText])

    const labels: Record<State, string> = {
        pending: uiText('waiting-for-ssh-4456975'),
        running: uiText('running-f4ccae2'),
        succeeded: uiText('done-11a6767'),
        failed: uiText('failed-031a8f0'),
        cancelled: uiText('cancelled-d353a99'),
        skipped: uiText('skipped-12698ce')
    }
    return (
        <Stack gap={6} p="xs" style={{ flexShrink: 0 }}>
            {rejected && (
                <Text size="xs" c="yellow">
                    {uiText(
                        'new-job-was-not-accepted-wait-for-the-current-queue-to-finish-9d71dc7'
                    )}
                </Text>
            )}
            <Group justify="space-between">
                <Text size="sm" fw={600}>
                    {t(`xera-node-optimization.${batch.level}`)} · {finished}/{results.length}
                </Text>
                {active && (
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="orange"
                        onClick={() => {
                            setResults((current) =>
                                current.map((item) =>
                                    item.state === 'pending'
                                        ? { ...item, state: 'cancelled' }
                                        : item
                                )
                            )
                        }}
                    >
                        {uiText('cancel-remaining-56c2a17')}
                    </Button>
                )}
            </Group>
            <Progress
                value={results.length ? (finished / results.length) * 100 : 0}
                animated={active?.state === 'running'}
            />
            {active && (
                <Text size="xs" c="dimmed">
                    {active.name} · {labels[active.state]} · {uiText('keep-ssh-open-ebe7e58')}
                </Text>
            )}
            <Accordion variant="contained">
                <Accordion.Item value="results">
                    <Accordion.Control>{uiText('node-results-9a3d72c')}</Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="xs" mah={160} style={{ overflowY: 'auto' }}>
                            {results.map((item) => (
                                <div key={item.uuid}>
                                    <Group justify="space-between" wrap="nowrap">
                                        <Text size="xs" truncate>
                                            {item.name}
                                        </Text>
                                        <Badge
                                            style={{ flexShrink: 0 }}
                                            color={
                                                item.state === 'failed'
                                                    ? 'red'
                                                    : item.state === 'succeeded'
                                                      ? 'teal'
                                                      : 'gray'
                                            }
                                        >
                                            {labels[item.state]}
                                        </Badge>
                                    </Group>
                                    {item.error && (
                                        <Text
                                            size="xs"
                                            c="red"
                                            style={{ overflowWrap: 'anywhere' }}
                                        >
                                            {item.error}
                                        </Text>
                                    )}
                                </div>
                            ))}
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
            {!active &&
                results.some((item) => ['failed', 'skipped', 'cancelled'].includes(item.state)) && (
                    <Button
                        size="xs"
                        variant="light"
                        onClick={() => {
                            for (const result of results)
                                if (result.state !== 'succeeded') actions.closeTab(result.uuid)
                            started.current.clear()
                            setResults((current) =>
                                current.map((item) =>
                                    item.state === 'succeeded'
                                        ? item
                                        : { ...item, state: 'pending', error: undefined }
                                )
                            )
                        }}
                    >
                        {uiText('retry-unfinished-d1a0447')}
                    </Button>
                )}
        </Stack>
    )
}
