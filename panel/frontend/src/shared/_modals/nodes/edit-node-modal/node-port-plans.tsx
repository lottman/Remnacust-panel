import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Code,
    Group,
    Loader,
    MultiSelect,
    NumberInput,
    Select,
    Stack,
    Switch,
    Text,
    TextInput
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbPlus, TbRefresh, TbTrash } from 'react-icons/tb'
import { z } from 'zod'

import { useGetConfigProfiles } from '@shared/api/hooks'

import {
    getPortPlanHistory,
    PortBinding,
    PortPlanHistory,
    PortPlanRequest,
    PortPlanView,
    portPlanKey,
    previewPortPlan,
    retryPortPlan,
    savePortPlan,
    useNodePortPlan
} from './node-port-plans.api'
import classes from './node-port-plans.module.css'

type Draft = {
    enabled: boolean
    bindings: PortBinding[]
    profileUuid: string
    activeInbounds: string[]
}
const bindingInput = (b: PortBinding): PortBinding => ({
    uuid: b.uuid,
    configProfileUuid: b.configProfileUuid,
    configProfileInboundUuid: b.configProfileInboundUuid,
    listenAddress: b.listenAddress,
    port: b.port
})
const fromView = (s: PortPlanView): Draft => ({
    enabled: s.enabled,
    bindings: s.bindings.map(bindingInput),
    profileUuid: s.profileUuid ?? '',
    activeInbounds: s.activeInbounds
})
const fromHistory = (s: PortPlanHistory['snapshot']): Draft =>
    s.enabled
        ? {
              enabled: true,
              bindings: s.bindings.map(bindingInput),
              profileUuid: '',
              activeInbounds: []
          }
        : {
              enabled: false,
              bindings: [],
              profileUuid: s.profileUuid,
              activeInbounds: s.activeInbounds
          }
const addressSchema = z.union([z.ipv4(), z.ipv6()])
function trafficBytes(value: string) {
    if (!/^(0|[1-9][0-9]{0,18})$/.test(value)) return '—'
    const bytes = BigInt(value)
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB']
    let scale = 1n
    let unit = 0
    while (unit < units.length - 1 && bytes >= scale * 1024n) {
        scale *= 1024n
        unit++
    }
    const fraction = unit ? `.${((bytes % scale) * 10n) / scale}` : ''
    return `${bytes / scale}${fraction} ${units[unit]}`
}

function BindingTraffic({
    snapshot,
    bindingUuid
}: {
    snapshot: PortPlanView['bindingTraffic']
    bindingUuid: string
}) {
    const { t } = useTranslation()
    const observed = snapshot?.bindings.find((entry) => entry.bindingUuid === bindingUuid)
    const age = snapshot ? Date.now() - Date.parse(snapshot.capturedAt) : NaN
    const available = observed?.available && age >= -30_000 && age <= 120_000
    return (
        <Text size="xs" c="dimmed" className={classes.traffic}>
            {t('nodePorts.traffic')}{' '}
            {available ? (
                <bdi dir="ltr">
                    ↑ {trafficBytes(observed.uplink)} · ↓ {trafficBytes(observed.downlink)}
                    {' · '}{new Date(snapshot!.capturedAt).toLocaleTimeString()}
                </bdi>
            ) : t('nodePorts.trafficUnavailable')}
        </Text>
    )
}
function errorKind(error: unknown) {
    const data = (error as { response?: { data?: { errorCode?: string } } })?.response?.data
    const code = data?.errorCode ?? ''
    if (code.includes('STALE_REVISION') || code.includes('REQUEST_REUSED')) return 'stale'
    if (code.includes('MISSING')) return 'missing'
    if (code.includes('CONFLICT') || code.includes('RESERVED') || code.includes('DUPLICATE'))
        return 'conflict'
    if (code.includes('ISOLATION') || code.includes('GLOBAL_SETTINGS')) return 'unsupported'
    return 'requestError'
}

type NodePortPlansProps = {
    nodeUuid: string
    active: boolean
    onSaved: (state: PortPlanView) => void
    onBusyChange: (busy: boolean) => void
}

export function NodePortPlans(props: NodePortPlansProps) {
    const { t } = useTranslation()
    const state = useNodePortPlan(props.nodeUuid, props.active)
    const profiles = useGetConfigProfiles()
    if ((state.isError && !state.data) || (profiles.isError && !profiles.data)) {
        return (
            <Alert color="red" title={t('nodePorts.requestError')}>
                <Button
                    variant="subtle"
                    onClick={() => {
                        state.refetch()
                        profiles.refetch()
                    }}
                >
                    {t('nodePorts.reload')}
                </Button>
            </Alert>
        )
    }
    if (!state.data || !profiles.data) {
        return (
            <Group p="md">
                <Loader size="sm" />
                <Text>{t('nodePorts.loading')}</Text>
            </Group>
        )
    }
    return (
        <NodePortPlanEditor
            key={props.nodeUuid}
            {...props}
            current={state.data}
            catalog={profiles.data.configProfiles}
            refreshError={state.isError || profiles.isError}
            reloadSaved={async () => {
                const [refreshed, refreshedProfiles] = await Promise.all([
                    state.refetch(),
                    profiles.refetch()
                ])
                if (!refreshed.isSuccess || !refreshed.data || !refreshedProfiles.isSuccess)
                    throw (
                        refreshed.error ??
                        refreshedProfiles.error ??
                        new Error('Port-plan refresh failed')
                    )
                return refreshed.data
            }}
        />
    )
}

function NodePortPlanEditor({
    nodeUuid,
    active,
    onSaved,
    onBusyChange,
    current,
    catalog,
    refreshError,
    reloadSaved
}: NodePortPlansProps & {
    current: PortPlanView
    catalog: NonNullable<ReturnType<typeof useGetConfigProfiles>['data']>['configProfiles']
    refreshError: boolean
    reloadSaved: () => Promise<PortPlanView>
}) {
    const { t } = useTranslation(),
        client = useQueryClient()
    const [draft, setDraft] = useState<Draft>(() => fromView(current)),
        [baseRevision, setBaseRevision] = useState(current.revision),
        [historyOpen, setHistoryOpen] = useState(false)
    const [requestError, setRequestError] = useState<ReturnType<typeof errorKind> | null>(null)
    const submit = useRef<{ signature: string; id: string } | null>(null)
    const history = useQuery({
        queryKey: [...portPlanKey(nodeUuid), 'history'],
        enabled: active && historyOpen,
        queryFn: ({ signal }) => getPortPlanHistory(nodeUuid, signal),
        retry: false
    })
    const profileOptions = useMemo(
        () => catalog.map((p) => ({ value: p.uuid, label: p.name })),
        [catalog]
    )
    const stale = baseRevision !== current.revision || requestError === 'stale'
    const valid =
        !!draft &&
        (draft.enabled
            ? draft.bindings.length > 0 &&
              draft.bindings.every(
                  (b) =>
                      b.configProfileUuid &&
                      b.configProfileInboundUuid &&
                      addressSchema.safeParse(b.listenAddress).success &&
                      Number.isInteger(b.port) &&
                      b.port >= 1 &&
                      b.port <= 65535
              )
            : !!draft.profileUuid && draft.activeInbounds.length > 0)
    const request = (): PortPlanRequest =>
        draft!.enabled
            ? {
                  enabled: true,
                  expectedRevision: baseRevision,
                  bindings: draft!.bindings.map(bindingInput)
              }
            : {
                  enabled: false,
                  expectedRevision: baseRevision,
                  profileUuid: draft!.profileUuid,
                  activeInbounds: draft!.activeInbounds
              }
    const saved = (value: PortPlanView) => {
        client.setQueryData(portPlanKey(nodeUuid), value)
        setDraft(fromView(value))
        setBaseRevision(value.revision)
        submit.current = null
        setRequestError(null)
        preview.reset()
        client.invalidateQueries({ queryKey: [...portPlanKey(nodeUuid), 'history'] })
        onSaved(value)
    }
    const mutation = useMutation({
        mutationFn: (value: PortPlanRequest) => savePortPlan(nodeUuid, value),
        onSuccess: saved,
        onError: (error) => setRequestError(errorKind(error))
    })
    const preview = useMutation({
        mutationFn: (value: PortPlanRequest) => previewPortPlan(nodeUuid, value),
        onError: (error) => setRequestError(errorKind(error))
    })
    const retry = useMutation({
        mutationFn: () => retryPortPlan(nodeUuid, current.revision),
        onSuccess: (value) => client.setQueryData(portPlanKey(nodeUuid), value),
        onError: (error) => setRequestError(errorKind(error))
    })
    const reload = useMutation({
        mutationFn: reloadSaved,
        onSuccess: (value) => {
            change(fromView(value))
            setBaseRevision(value.revision)
            submit.current = null
        },
        onError: (error) => setRequestError(errorKind(error))
    })
    const busy = mutation.isPending || preview.isPending || retry.isPending || reload.isPending
    useEffect(() => {
        onBusyChange(busy)
        return () => onBusyChange(false)
    }, [busy, onBusyChange])
    const change = (value: Draft) => {
        setDraft(value)
        preview.reset()
        setRequestError(null)
    }
    const reset = () => {
        reload.mutate()
    }
    const save = () => {
        const value = request(),
            signature = JSON.stringify(value)
        if (submit.current?.signature !== signature)
            submit.current = { signature, id: crypto.randomUUID() }
        mutation.mutate({ ...value, requestId: submit.current.id })
    }
    const add = () => {
        if (!draft) return
        const used = new Set(draft.bindings.map((b) => b.configProfileInboundUuid))
        for (const p of catalog) {
            const inbound = p.inbounds.find((i) => !used.has(i.uuid)) ?? p.inbounds[0]
            if (inbound) {
                const occupied = new Set(draft.bindings.map((binding) => binding.port))
                let port = inbound.port ?? 443
                for (let attempt = 0; attempt < 65535 && occupied.has(port); attempt++)
                    port = port === 65535 ? 1 : port + 1
                change({
                    ...draft,
                    enabled: true,
                    bindings: [
                        ...draft.bindings,
                        {
                            uuid: crypto.randomUUID(),
                            configProfileUuid: p.uuid,
                            configProfileInboundUuid: inbound.uuid,
                            listenAddress: '0.0.0.0',
                            port
                        }
                    ]
                })
                return
            }
        }
    }
    const remote = current
    return (
        <Stack gap="md" className={classes.root}>
            <Group justify="space-between" gap="xs">
                <Text fw={600}>{t('nodePorts.title')}</Text>
                <Badge
                    color={
                        remote.status === 'APPLIED'
                            ? 'teal'
                            : remote.status === 'ERROR'
                              ? 'red'
                              : 'blue'
                    }
                >
                    {t(`nodePorts.status_${remote.status}`)}
                </Badge>
            </Group>
            <Text size="sm" c="dimmed">
                {t('nodePorts.description')}
            </Text>
            {remote.disabled && <Alert color="blue">{t('nodePorts.disabled')}</Alert>}
            {remote.status === 'PENDING' && (
                <Text size="sm" aria-live="polite">
                    {t('nodePorts.waiting')}
                </Text>
            )}
            {remote.errorCode && (
                <Alert color="red" title={t('nodePorts.applyError')}>
                    <Stack gap="xs">
                        <Text size="sm">
                            {t(
                                remote.errorCode === 'QUEUE_UNAVAILABLE'
                                    ? 'nodePorts.queuePending'
                                    : 'nodePorts.applyErrorHint'
                            )}
                        </Text>
                        <Button
                            size="xs"
                            variant="light"
                            loading={retry.isPending}
                            disabled={busy || stale}
                            onClick={() => retry.mutate()}
                        >
                            {t('nodePorts.retry')}
                        </Button>
                    </Stack>
                </Alert>
            )}
            {(stale || requestError || refreshError) && (
                <Alert
                    color="red"
                    title={t(`nodePorts.${requestError ?? (stale ? 'stale' : 'requestError')}`)}
                >
                    <Button size="xs" variant="subtle" disabled={busy} onClick={reset}>
                        {t('nodePorts.reload')}
                    </Button>
                </Alert>
            )}
            <Switch
                label={t('nodePorts.enabled')}
                checked={draft.enabled}
                disabled={busy}
                onChange={(event) => change({ ...draft, enabled: event.currentTarget.checked })}
            />
            <div className={classes.layout}>
                <Stack gap="sm" className={classes.editor}>
                    {draft.enabled ? (
                        <>
                            {draft.bindings.map((binding, index) => {
                                const profile = catalog.find(
                                    (p) => p.uuid === binding.configProfileUuid
                                )
                                const inboundOptions = (profile?.inbounds ?? []).map((i) => ({
                                    value: i.uuid,
                                    label: `${i.tag} · ${i.type}`
                                }))
                                const update = (patch: Partial<PortBinding>) =>
                                    change({
                                        ...draft,
                                        bindings: draft.bindings.map((b) =>
                                            b.uuid === binding.uuid ? { ...b, ...patch } : b
                                        )
                                    })
                                return (
                                    <div className={classes.binding} key={binding.uuid}>
                                        <Group justify="space-between">
                                            <Text size="sm" fw={600}>
                                                {t('nodePorts.listener', { number: index + 1 })}
                                            </Text>
                                            <ActionIcon
                                                size={44}
                                                variant="subtle"
                                                color="red"
                                                aria-label={t('nodePorts.remove')}
                                                disabled={busy}
                                                onClick={() =>
                                                    change({
                                                        ...draft,
                                                        bindings: draft.bindings.filter(
                                                            (b) => b.uuid !== binding.uuid
                                                        )
                                                    })
                                                }
                                            >
                                                <TbTrash />
                                            </ActionIcon>
                                        </Group>
                                        <div className={classes.fields}>
                                            <Select
                                                searchable
                                                label={t('nodePorts.profile')}
                                                data={profileOptions}
                                                value={binding.configProfileUuid}
                                                disabled={busy}
                                                onChange={(uuid) => {
                                                    if (uuid)
                                                        update({
                                                            configProfileUuid: uuid,
                                                            configProfileInboundUuid:
                                                                catalog
                                                                    .find((p) => p.uuid === uuid)
                                                                    ?.inbounds[0]?.uuid ?? ''
                                                        })
                                                }}
                                            />
                                            <Select
                                                searchable
                                                label={t('nodePorts.inbound')}
                                                data={inboundOptions}
                                                value={binding.configProfileInboundUuid || null}
                                                disabled={busy}
                                                onChange={(uuid) =>
                                                    update({ configProfileInboundUuid: uuid ?? '' })
                                                }
                                            />
                                            <TextInput
                                                label={t('nodePorts.address')}
                                                value={binding.listenAddress}
                                                disabled={busy}
                                                error={
                                                    !addressSchema.safeParse(binding.listenAddress)
                                                        .success
                                                        ? t('nodePorts.addressError')
                                                        : undefined
                                                }
                                                onChange={(event) =>
                                                    update({
                                                        listenAddress: event.currentTarget.value
                                                    })
                                                }
                                            />
                                            <NumberInput
                                                label={t('nodePorts.port')}
                                                value={binding.port || ''}
                                                min={1}
                                                max={65535}
                                                allowDecimal={false}
                                                allowNegative={false}
                                                disabled={busy}
                                                onChange={(value) =>
                                                    update({
                                                        port: typeof value === 'number' ? value : 0
                                                    })
                                                }
                                            />
                                        </div>
                                        <BindingTraffic
                                            snapshot={current.bindingTraffic}
                                            bindingUuid={binding.uuid}
                                        />
                                    </div>
                                )
                            })}
                            {!draft.bindings.length && (
                                <Text c="dimmed">{t('nodePorts.empty')}</Text>
                            )}
                            {current.bindingTraffic?.bindings.filter((entry) => entry.retired).map((entry) => (
                                <div className={classes.binding} key={`retired-${entry.bindingUuid}`}>
                                    <Text size="sm">{t('nodePorts.draining')}</Text>
                                    <Text size="xs" className={classes.traffic}>{entry.bindingUuid}</Text>
                                    <BindingTraffic snapshot={current.bindingTraffic} bindingUuid={entry.bindingUuid} />
                                </div>
                            ))}
                            <Button
                                variant="light"
                                leftSection={<TbPlus />}
                                disabled={
                                    busy ||
                                    draft.bindings.length >= 512 ||
                                    !catalog.some((p) => p.inbounds.length > 0)
                                }
                                onClick={add}
                            >
                                {t('nodePorts.add')}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Select
                                searchable
                                label={t('nodePorts.profile')}
                                data={profileOptions}
                                value={draft.profileUuid || null}
                                disabled={busy}
                                onChange={(uuid) =>
                                    change({
                                        ...draft,
                                        profileUuid: uuid ?? '',
                                        activeInbounds:
                                            catalog
                                                .find((p) => p.uuid === uuid)
                                                ?.inbounds.slice(0, 1)
                                                .map((i) => i.uuid) ?? []
                                    })
                                }
                            />
                            <MultiSelect
                                searchable
                                label={t('nodePorts.inbound')}
                                data={
                                    catalog
                                        .find((p) => p.uuid === draft.profileUuid)
                                        ?.inbounds.map((i) => ({ value: i.uuid, label: i.tag })) ??
                                    []
                                }
                                value={draft.activeInbounds}
                                disabled={busy}
                                onChange={(values) => change({ ...draft, activeInbounds: values })}
                            />
                        </>
                    )}
                </Stack>
                <Stack className={classes.preview} gap="xs">
                    <Text fw={600} size="sm">
                        {t('nodePorts.preview')}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {t('nodePorts.previewHint')}
                    </Text>
                    {preview.data ? (
                        <Code block className={classes.code}>
                            {JSON.stringify(preview.data, null, 2)}
                        </Code>
                    ) : (
                        <Text size="sm" c="dimmed">
                            {t('nodePorts.previewEmpty')}
                        </Text>
                    )}
                </Stack>
            </div>
            <Group className={classes.actions} wrap="wrap">
                <Button
                    variant="light"
                    disabled={busy || !valid || stale}
                    loading={preview.isPending}
                    onClick={() => {
                        setRequestError(null)
                        preview.mutate(request())
                    }}
                >
                    {t('nodePorts.preview')}
                </Button>
                <Button
                    disabled={busy || !valid || stale}
                    loading={mutation.isPending}
                    onClick={save}
                >
                    {t('nodePorts.save')}
                </Button>
                <Button
                    variant="subtle"
                    leftSection={<TbRefresh />}
                    disabled={busy}
                    onClick={reset}
                >
                    {t('nodePorts.reload')}
                </Button>
                <Button
                    variant="subtle"
                    disabled={busy}
                    onClick={() => setHistoryOpen((open) => !open)}
                >
                    {t('nodePorts.history')}
                </Button>
            </Group>
            {historyOpen && (
                <Stack gap="xs">
                    {history.isLoading && <Loader size="sm" />}
                    {history.isError && <Text c="red">{t('nodePorts.requestError')}</Text>}
                    {history.data?.length === 0 && (
                        <Text c="dimmed">{t('nodePorts.noHistory')}</Text>
                    )}
                    {history.data?.map((entry) => (
                        <Group
                            key={entry.uuid}
                            justify="space-between"
                            className={classes.historyRow}
                        >
                            <Text size="sm">
                                {t('nodePorts.revision', { revision: entry.revision })} ·{' '}
                                {new Date(entry.createdAt).toLocaleString()}
                            </Text>
                            <Button
                                size="xs"
                                variant="light"
                                disabled={busy}
                                onClick={() => {
                                    change(fromHistory(entry.snapshot))
                                    setBaseRevision(remote.revision)
                                }}
                            >
                                {t('nodePorts.loadHistory')}
                            </Button>
                        </Group>
                    ))}
                </Stack>
            )}
        </Stack>
    )
}
