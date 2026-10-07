import {
    Accordion,
    Alert,
    Badge,
    Button,
    Checkbox,
    Code,
    Divider,
    Drawer,
    Group,
    Loader,
    MultiSelect,
    SegmentedControl,
    Progress,
    Select,
    Stack,
    Text
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCpu, TbRefresh } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { instance } from '@shared/api/axios'
import { useGetNodes } from '@shared/api/hooks/nodes/nodes.query.hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { usePanelReducedMotion } from '@shared/ui/appearance/appearance'
import { RefreshButton } from '@shared/ui/refresh-control'

import { selectNodeTargets, type SelectionMode } from './node-selection'

type Node = { uuid: string; name: string; tags?: string[] | null }
type CoreStatus = {
    mode: string
    paused: boolean
    online: boolean
    canRollback: boolean
    sshTunnelAvailable?: boolean
    arch: string
    running: { version: string; sha256: string } | null
    selected: { version: string; sha256: string } | null
    operation: { phase: string; status: string } | null
}
type Result = Node & { status: string; phase?: string; error?: string }
type CoreJob = {
    id: string
    action: string
    releaseId?: string
    nodes: Node[]
    createdAt: number
    state: string
    cancelRequested: boolean
    results: Result[]
    error?: string
}
type Release = { id: string; build: string; architectures: string[] }
const endpoint = '/api/nodes/core-management'
const read = async <T,>(path: string): Promise<T> =>
    (await instance.get(`${endpoint}/${path}`, { timeout: 25000 })).data.response
const errorMessage = (error: unknown) => {
    const value = error as {
        message?: unknown
        response?: { data?: { message?: unknown; error?: unknown } }
    }
    const message = value?.response?.data?.message ?? value?.response?.data?.error
    if (typeof message === 'string') return message
    if (Array.isArray(message)) return message.filter((item) => typeof item === 'string').join(', ')
    return typeof value?.message === 'string' ? value.message : ''
}

export function CoreManagementFeature({
    nodes = [],
    historyOnly = false,
    allowSelection = false
}: {
    nodes?: Node[]
    historyOnly?: boolean
    allowSelection?: boolean
}) {
    const uiText = useUiText()
    const reducedMotion = usePanelReducedMotion()

    const [opened, { open, close }] = useDisclosure()
    const mobile = useMediaQuery('(max-width: 48em)')
    const { i18n } = useTranslation()
    const client = useQueryClient()
    const [action, setAction] = useState<string | null>('install')
    const [releaseId, setReleaseId] = useState<string | null>(null)
    const [stopOnFailure, setStopOnFailure] = useState(true)
    const [confirmation, setConfirmation] = useState<string | null>(null)
    const [currentJob, setCurrentJob] = useState<string | null>(null)
    const [retryNodes, setRetryNodes] = useState<Node[] | null>(null)
    const { data: allNodes = [] } = useGetNodes({ rQueryParams: { enabled: opened } })
    const [mode, setMode] = useState<SelectionMode>('all')
    const [tag, setTag] = useState<string | null>(null)
    const [ids, setIds] = useState<string[]>([])
    const [level, setLevel] = useState('safe')
    const [snapshot, setSnapshot] = useState<Node[]>([])
    const selected =
        retryNodes ?? (allowSelection ? selectNodeTargets(snapshot, mode, tag, ids) : nodes)
    const targetFingerprint = selected.map((node) => node.uuid).join(',')
    const openTasks = () => {
        setSnapshot(nodes.map((node) => ({ ...node, tags: [...(node.tags ?? [])] })))
        setRetryNodes(null)
        setAcknowledged(false)
        open()
    }
    const pendingRequest = useRef<{ fingerprint: string; id: string } | null>(null)
    const labels: Record<string, string> = {
        optimize: uiText('optimize-via-ssh-ea39a69'),
        install: uiText('install-release-1cef24f'),
        rollback: uiText('roll-back-core-5635594'),
        bundled: uiText('bundled-core-063f5f7'),
        profile: uiText('follow-configuration-c5da704'),
        start: uiText('start-e4bb9f1'),
        stop: uiText('stop-cae7d57'),
        restart: uiText('restart-6b983a8'),
        check: uiText('validate-configuration-7563534'),
        pending: uiText('queued-661ff40'),
        running: uiText('running-f4ccae2'),
        succeeded: uiText('done-11a6767'),
        failed: uiText('failed-031a8f0'),
        'rolled-back': uiText('rolled-back-7159223'),
        cancelled: uiText('cancelled-d353a99'),
        skipped: uiText('skipped-12698ce'),
        connecting: uiText('connecting-to-node-586f22e'),
        preparing: uiText('preparing-cf1aa6c'),
        downloading: uiText('downloading-37b3455'),
        verifying: uiText('verifying-binary-ffb60a2'),
        validating: uiText('validating-configuration-b84c66a'),
        switching: uiText('switching-core-72d199b'),
        starting: uiText('starting-aeed4d2'),
        stopping: uiText('stopping-a71ee1d'),
        'checking-health': uiText('checking-readiness-68978eb')
    }
    const catalog = useQuery({
        queryKey: ['core-management', 'catalog'],
        queryFn: () => read<Release[]>('catalog'),
        enabled: opened && !historyOnly,
        staleTime: 60000
    })
    const jobs = useQuery({
        queryKey: ['core-management', 'jobs'],
        queryFn: () => read<CoreJob[]>('jobs'),
        enabled: opened,
        refetchInterval: opened ? 3000 : false
    })
    const status = useQuery({
        queryKey: ['core-management', 'status', selected[0]?.uuid],
        queryFn: () => read<CoreStatus>(`status/${selected[0].uuid}`),
        enabled: opened && selected.length === 1 && action !== 'optimize',
        retry: false,
        refetchInterval: opened ? 5000 : false
    })
    const release = releaseId ?? catalog.data?.[0]?.id
    const confirmationKey = JSON.stringify([
        targetFingerprint,
        action,
        level,
        release,
        stopOnFailure
    ])
    const acknowledged = confirmation === confirmationKey
    const setAcknowledged = (value: boolean) => setConfirmation(value ? confirmationKey : null)
    const create = useMutation({
        mutationFn: async () => {
            const input = {
                nodeUuids: selected.map((node) => node.uuid),
                action,
                ...(action === 'install' ? { releaseId: release } : {}),
                stopOnFailure
            }
            const fingerprint = JSON.stringify(input)
            if (pendingRequest.current?.fingerprint !== fingerprint)
                pendingRequest.current = { fingerprint, id: crypto.randomUUID() }
            return (
                await instance.post(
                    `${endpoint}/jobs`,
                    { ...input, requestId: pendingRequest.current.id },
                    { timeout: 25000 }
                )
            ).data.response as CoreJob
        },
        onSuccess: (job) => {
            pendingRequest.current = null
            setCurrentJob(job.id)
            setAcknowledged(false)
            void client.invalidateQueries({ queryKey: ['core-management'] })
        }
    })
    const cancel = useMutation({
        mutationFn: (id: string) => instance.post(`${endpoint}/jobs/${id}/cancel`),
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ['core-management', 'jobs'] })
        }
    })
    const busy = jobs.data?.some(
        (job) =>
            ['waiting', 'active', 'delayed'].includes(job.state) &&
            job.nodes.some((node) => selected.some((item) => item.uuid === node.uuid))
    )
    const disruptive = action !== 'check'
    return (
        <>
            <Button h={44} leftSection={<TbCpu size={18} />} onClick={openTasks} variant="light">
                {historyOnly ? uiText('xray-jobs-72b1110') : uiText('node-tasks-7698fb5')}
            </Button>
            <Drawer
                closeButtonProps={{ 'aria-label': uiText('close-node-tasks-15138a8') }}
                opened={opened}
                onClose={close}
                position="right"
                size={mobile ? '100%' : 600}
                title={uiText('node-tasks-7698fb5')}
                padding="md"
            >
                <Stack gap="lg" pb="xl">
                    {!historyOnly && (
                        <>
                            {allowSelection && (
                                <Stack gap="sm">
                                    <SegmentedControl
                                        fullWidth
                                        value={mode}
                                        onChange={(value) => {
                                            setMode(value as SelectionMode)
                                            setRetryNodes(null)
                                        }}
                                        data={[
                                            { value: 'all', label: uiText('all-a52ace4') },
                                            { value: 'tag', label: uiText('by-tag-9effd8b') },
                                            {
                                                value: 'untagged',
                                                label: uiText('untagged-9a28cbf')
                                            },
                                            { value: 'selected', label: uiText('select-2a78025') }
                                        ]}
                                    />
                                    {mode === 'tag' && (
                                        <Select
                                            searchable
                                            label={uiText('node-tag-14efe71')}
                                            data={[
                                                ...new Set(
                                                    snapshot.flatMap((node) => node.tags ?? [])
                                                )
                                            ].sort((a, b) => a.localeCompare(b, i18n.language))}
                                            value={tag}
                                            onChange={(value) => {
                                                setTag(value)
                                                setRetryNodes(null)
                                            }}
                                        />
                                    )}
                                    {mode === 'selected' && (
                                        <MultiSelect
                                            searchable
                                            label={uiText('nodes-7ac3620')}
                                            data={snapshot.map((node) => ({
                                                value: node.uuid,
                                                label: node.name
                                            }))}
                                            value={ids}
                                            onChange={(value) => {
                                                setIds(value)
                                                setRetryNodes(null)
                                            }}
                                        />
                                    )}
                                </Stack>
                            )}
                            <div>
                                <Text fw={600}>
                                    {selected.length === 1
                                        ? selected[0].name
                                        : uiText('value-nodes-selected-5322c83', {
                                              value1: selected.length
                                          })}
                                </Text>
                                <Text size="sm" c="dimmed">
                                    {uiText(
                                        'xray-updates-process-controls-and-node-optimization-d75cdea'
                                    )}
                                </Text>
                            </div>
                            {selected.length === 1 && action !== 'optimize' && (
                                <>
                                    {status.isPending && <Loader size="sm" />}
                                    {status.isError && (
                                        <Alert
                                            color="yellow"
                                            title={uiText('core-manager-unavailable-68fb1d3')}
                                        >
                                            {errorMessage(status.error) ||
                                                uiText(
                                                    'the-panel-received-no-usable-response-check-node-connectivity--051d58f'
                                                )}{' '}
                                            <Button
                                                mt="xs"
                                                size="xs"
                                                variant="subtle"
                                                onClick={() => void status.refetch()}
                                            >
                                                {uiText('retry-942087c')}
                                            </Button>
                                        </Alert>
                                    )}
                                    {status.data && (
                                        <Stack gap="xs">
                                            <Group justify="space-between">
                                                <Badge color={status.data.online ? 'teal' : 'gray'}>
                                                    {status.data.paused
                                                        ? uiText('paused-by-administrator-f5d00fe')
                                                        : status.data.online
                                                          ? uiText('running-f4ccae2')
                                                          : uiText('stopped-1a4f630')}
                                                </Badge>
                                                <Group gap="xs">
                                                    {status.data.sshTunnelAvailable && (
                                                        <Badge color="blue" variant="light">
                                                            SSH
                                                        </Badge>
                                                    )}
                                                    <Text size="sm" c="dimmed">
                                                        {status.data.arch}
                                                    </Text>
                                                </Group>
                                            </Group>
                                            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                                                {status.data.running?.version ??
                                                    status.data.selected?.version ??
                                                    uiText('version-unavailable-c0a7f64')}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {uiText('source-1a5ac0b')}
                                                {status.data.mode === 'managed'
                                                    ? uiText('pinned-release-c741101')
                                                    : status.data.mode === 'bundled'
                                                      ? uiText('node-image-79c45a0')
                                                      : uiText('configuration-b332c34')}
                                            </Text>
                                            <Accordion variant="contained">
                                                <Accordion.Item value="checksum">
                                                    <Accordion.Control>
                                                        {uiText('build-verification-2a3ea42')}
                                                    </Accordion.Control>
                                                    <Accordion.Panel>
                                                        <Text size="xs" mb="xs">
                                                            {uiText('running-core-sha-256-b6b0ef2')}
                                                        </Text>
                                                        <Code
                                                            block
                                                            style={{
                                                                whiteSpace: 'pre-wrap',
                                                                overflowWrap: 'anywhere'
                                                            }}
                                                        >
                                                            {status.data.running?.sha256 ?? '—'}
                                                        </Code>
                                                        <Text size="xs" mt="sm" mb="xs">
                                                            {uiText(
                                                                'selected-binary-sha-256-9b8ea61'
                                                            )}
                                                        </Text>
                                                        <Code
                                                            block
                                                            style={{
                                                                whiteSpace: 'pre-wrap',
                                                                overflowWrap: 'anywhere'
                                                            }}
                                                        >
                                                            {status.data.selected?.sha256 ?? '—'}
                                                        </Code>
                                                    </Accordion.Panel>
                                                </Accordion.Item>
                                            </Accordion>
                                        </Stack>
                                    )}
                                </>
                            )}
                            <Select
                                label={uiText('action-64cff13')}
                                value={action}
                                onChange={(value) => {
                                    setAction(value)
                                    setAcknowledged(false)
                                }}
                                allowDeselect={false}
                                data={[
                                    'install',
                                    'optimize',
                                    'check',
                                    'restart',
                                    'stop',
                                    'start',
                                    'rollback',
                                    'bundled',
                                    'profile'
                                ].map((value) => ({
                                    value,
                                    label: labels[value],
                                    disabled:
                                        value === 'rollback' &&
                                        selected.length === 1 &&
                                        status.data?.canRollback === false
                                }))}
                            />
                            {action === 'optimize' && (
                                <Select
                                    label={uiText('optimization-profile-18535a9')}
                                    value={level}
                                    allowDeselect={false}
                                    onChange={(value) => setLevel(value ?? 'safe')}
                                    data={[
                                        {
                                            value: 'none',
                                            label: uiText('no-optimization-3d082b3')
                                        },
                                        { value: 'safe', label: uiText('safe-4f9f0da') },
                                        {
                                            value: 'balanced',
                                            label: uiText('balanced-5386ea5')
                                        },
                                        {
                                            value: 'performance',
                                            label: uiText('performance-442aded')
                                        }
                                    ]}
                                />
                            )}
                            {action === 'install' && (
                                <>
                                    <Select
                                        label={uiText('approved-release-15ae27c')}
                                        value={release ?? null}
                                        onChange={setReleaseId}
                                        allowDeselect={false}
                                        data={(catalog.data ?? []).map((item) => ({
                                            value: item.id,
                                            label: item.build
                                        }))}
                                        error={catalog.isError}
                                    />
                                    {catalog.isError && (
                                        <Alert
                                            color="red"
                                            mt="xs"
                                            title={uiText('release-catalog-unavailable-467e68d')}
                                        >
                                            {errorMessage(catalog.error) ||
                                                uiText(
                                                    'could-not-load-the-release-catalog-9b6fbd1'
                                                )}
                                        </Alert>
                                    )}
                                </>
                            )}
                            <Alert color={action === 'stop' ? 'orange' : 'blue'}>
                                {action === 'stop'
                                    ? uiText(
                                          'vpn-connections-will-stop-the-core-stays-paused-until-start-is-86557ef'
                                      )
                                    : action === 'optimize'
                                      ? uiText(
                                            'ssh-access-is-required-for-each-node-keep-the-terminal-window--1692ffc'
                                        )
                                      : action === 'check'
                                        ? uiText(
                                              'validates-configuration-without-restarting-vpn-35287d5'
                                          )
                                        : action === 'profile'
                                          ? uiText(
                                                'the-configuration-geodata-core-controls-the-version-again-with-46b0190'
                                            )
                                          : uiText(
                                                'connections-may-be-interrupted-binary-and-configuration-are-ch-aa90a8f'
                                            )}
                            </Alert>
                            {selected.length > 1 && (
                                <>
                                    <Accordion variant="contained">
                                        <Accordion.Item value="targets">
                                            <Accordion.Control>
                                                {uiText('affected-nodes-fbf8ff6')}
                                            </Accordion.Control>
                                            <Accordion.Panel>
                                                <Stack gap={4}>
                                                    {selected.map((node) => (
                                                        <Text
                                                            key={node.uuid}
                                                            size="sm"
                                                            style={{ overflowWrap: 'anywhere' }}
                                                        >
                                                            {node.name}
                                                        </Text>
                                                    ))}
                                                </Stack>
                                            </Accordion.Panel>
                                        </Accordion.Item>
                                    </Accordion>
                                    <Checkbox
                                        checked={stopOnFailure}
                                        onChange={(event) =>
                                            setStopOnFailure(event.currentTarget.checked)
                                        }
                                        label={uiText('stop-queue-after-the-first-failure-30937ae')}
                                    />
                                </>
                            )}
                            {disruptive && (
                                <Checkbox
                                    checked={acknowledged}
                                    onChange={(event) =>
                                        setAcknowledged(event.currentTarget.checked)
                                    }
                                    label={uiText('apply-to-selected-nodes-value-24b8f51', {
                                        value1: selected.length
                                    })}
                                />
                            )}
                            {busy && (
                                <Text c="dimmed" size="sm">
                                    {uiText(
                                        'a-selected-node-already-has-a-job-follow-its-progress-below-a887e9f'
                                    )}
                                </Text>
                            )}
                            {create.isError && (
                                <Alert color="red">
                                    {uiText(
                                        'could-not-confirm-job-creation-check-history-below-before-retr-591a3be'
                                    )}
                                </Alert>
                            )}
                            <Button
                                fullWidth
                                loading={create.isPending}
                                disabled={
                                    !action ||
                                    (action === 'optimize' &&
                                        selected.some(
                                            (node) =>
                                                !allNodes.some((item) => item.uuid === node.uuid)
                                        )) ||
                                    !selected.length ||
                                    selected.length > 1000 ||
                                    !!busy ||
                                    (action !== 'optimize' &&
                                        selected.length === 1 &&
                                        !status.data) ||
                                    (disruptive && !acknowledged) ||
                                    (action === 'install' && !release)
                                }
                                onClick={() => {
                                    if (action !== 'optimize') {
                                        create.mutate()
                                        return
                                    }
                                    const targets = selected.map((node) =>
                                        allNodes.find((item) => item.uuid === node.uuid)
                                    )
                                    if (targets.some((node) => !node)) return
                                    void showModal('nodes_nodeSshTerminal', {
                                        optimizationBatch: {
                                            id: crypto.randomUUID(),
                                            nodes: targets.filter((node) => node !== undefined),
                                            level: level as
                                                | 'none'
                                                | 'safe'
                                                | 'balanced'
                                                | 'performance',
                                            stopOnFailure
                                        }
                                    })
                                    close()
                                }}
                            >
                                {uiText('run-00d60e3')}
                            </Button>
                            {selected.length > 1000 && (
                                <Text size="sm" c="dimmed">
                                    {uiText(
                                        'up-to-1000-nodes-per-job-select-a-tag-or-a-subset-of-nodes-d06dbf1'
                                    )}
                                </Text>
                            )}
                            <Divider />
                        </>
                    )}
                    <Group justify="space-between">
                        <Text fw={600}>{uiText('xray-jobs-72b1110')}</Text>
                        <RefreshButton
                            variant="subtle"
                            size="xs"
                            leftSection={<TbRefresh />}
                            onClick={() => jobs.refetch()}
                        >
                            {uiText('refresh-0e91610')}
                        </RefreshButton>
                    </Group>
                    <Text size="xs" c="dimmed">
                        {uiText(
                            'xray-jobs-continue-on-the-server-after-closing-this-window-can-2b1fc09'
                        )}
                    </Text>
                    {jobs.isPending && <Loader size="sm" />}
                    {(jobs.isError || cancel.isError) && (
                        <Alert color="red">
                            {errorMessage(jobs.error ?? cancel.error) ||
                                uiText('could-not-load-job-status-c549b8b')}
                        </Alert>
                    )}
                    {jobs.data?.length === 0 && (
                        <Text size="sm" c="dimmed">
                            {uiText('no-jobs-yet-38b840c')}
                        </Text>
                    )}
                    <Accordion variant="separated" value={currentJob} onChange={setCurrentJob}>
                        {jobs.data?.map((job) => {
                            const complete = job.results.filter(
                                (item) => !['pending', 'running'].includes(item.status)
                            ).length
                            const active = ['waiting', 'active', 'delayed'].includes(job.state)
                            const failures = job.results.filter((item) =>
                                ['failed', 'rolled-back'].includes(item.status)
                            )
                            return (
                                <Accordion.Item key={job.id} value={job.id}>
                                    <Accordion.Control>
                                        <Text size="sm" fw={600}>
                                            {labels[job.action]} · {complete}/{job.nodes.length}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            {new Date(job.createdAt).toLocaleString(i18n.language)}{' '}
                                            ·{' '}
                                            {active
                                                ? uiText('in-progress-c1f88e9')
                                                : failures.length
                                                  ? uiText('has-failures-ee2613c')
                                                  : uiText('finished-7804f7a')}
                                        </Text>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap="sm">
                                            <Progress
                                                value={
                                                    job.nodes.length
                                                        ? (complete / job.nodes.length) * 100
                                                        : 0
                                                }
                                                animated={active}
                                                aria-label={uiText('job-progress-6d04c76')}
                                            />
                                            {job.results.map((result) => (
                                                <div key={result.uuid}>
                                                    <Group justify="space-between" align="start">
                                                        <Text
                                                            size="sm"
                                                            fw={500}
                                                            style={{
                                                                overflowWrap: 'anywhere',
                                                                minWidth: 0,
                                                                flex: 1
                                                            }}
                                                        >
                                                            {result.name}
                                                        </Text>
                                                        <Badge
                                                            color={
                                                                result.status === 'succeeded'
                                                                    ? 'teal'
                                                                    : [
                                                                            'failed',
                                                                            'rolled-back'
                                                                        ].includes(result.status)
                                                                      ? 'red'
                                                                      : 'gray'
                                                            }
                                                        >
                                                            {labels[result.status] ?? result.status}
                                                        </Badge>
                                                    </Group>
                                                    {result.status === 'running' && (
                                                        <Text size="xs" c="dimmed">
                                                            {labels[result.phase ?? ''] ??
                                                                result.phase}
                                                        </Text>
                                                    )}
                                                    {result.error && (
                                                        <Text
                                                            size="sm"
                                                            c="red"
                                                            style={{ overflowWrap: 'anywhere' }}
                                                        >
                                                            {result.error}
                                                        </Text>
                                                    )}
                                                </div>
                                            ))}
                                            {job.error && <Alert color="red">{job.error}</Alert>}
                                            {active && (
                                                <Button
                                                    color="orange"
                                                    variant="light"
                                                    disabled={job.cancelRequested}
                                                    loading={cancel.isPending}
                                                    onClick={() => cancel.mutate(job.id)}
                                                >
                                                    {job.cancelRequested
                                                        ? uiText('cancellation-requested-c07f337')
                                                        : uiText('cancel-remaining-56c2a17')}
                                                </Button>
                                            )}
                                            {!active && failures.length > 0 && !historyOnly && (
                                                <Button
                                                    variant="light"
                                                    onClick={() => {
                                                        setRetryNodes(failures)
                                                        setAction(job.action)
                                                        setReleaseId(job.releaseId ?? null)
                                                        setAcknowledged(false)
                                                        document
                                                            .querySelector('.mantine-Drawer-body')
                                                            ?.scrollIntoView({
                                                                behavior: reducedMotion
                                                                    ? 'instant'
                                                                    : 'smooth',
                                                                block: 'start'
                                                            })
                                                    }}
                                                >
                                                    {uiText(
                                                        'prepare-retry-for-failed-nodes-928faa5'
                                                    )}
                                                </Button>
                                            )}
                                        </Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            )
                        })}
                    </Accordion>
                </Stack>
            </Drawer>
        </>
    )
}
