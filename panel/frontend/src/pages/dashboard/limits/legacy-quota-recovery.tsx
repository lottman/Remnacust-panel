import {
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Textarea
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
    LegacyAllocation,
    LegacyDraft,
    LegacyPlan,
    LegacySource,
    LegacyTarget,
    useLegacyJob,
    useLegacyJobs,
    useLegacyPreview,
    useLegacyTargets,
    useCaptureLegacyQueue,
    useResolveLegacyJob,
    legacyRecoveryProblem
} from './legacy-quota-recovery.api'
import classes from './quota-recovery.module.css'

type Choice = {
    action: 'CHARGE' | 'LOSS' | null
    target: LegacyTarget | null
    period: 'CURRENT' | 'LIFETIME' | null
}
const blank: Choice = { action: null, target: null, period: null }

export function TargetPicker({
    generation,
    value,
    disabled,
    change
}: {
    generation: string
    value: LegacyTarget | null
    disabled: boolean
    change: (target: LegacyTarget | null) => void
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [debounced] = useDebouncedValue(search, 200)
    const targets = useLegacyTargets(generation, debounced, open)
    const options = useMemo(
        () => [
            ...new Map(
                [...(targets.data ?? []), ...(value ? [value] : [])].map((row) => [
                    row.subject,
                    row
                ])
            ).values()
        ],
        [targets.data, value]
    )
    return (
        <Stack gap={4}>
            <Select
                label={t('quotaRecovery.legacy.target')}
                maxLength={100}
                placeholder={t('quotaRecovery.legacy.findUser')}
                searchable
                clearable
                disabled={disabled}
                value={value?.subject ?? null}
                searchValue={search}
                onSearchChange={setSearch}
                limit={20}
                onDropdownOpen={() => setOpen(true)}
                onDropdownClose={() => setOpen(false)}
                data={options.map((row) => ({
                    value: row.subject,
                    label: `${row.username} · #${row.userId}`
                }))}
                onChange={(subject) =>
                    change(options.find((row) => row.subject === subject) ?? null)
                }
                nothingFoundMessage={
                    targets.isFetching
                        ? t('quotaRecovery.legacy.loading')
                        : t('quotaRecovery.legacy.noUsers')
                }
                rightSection={targets.isFetching ? <Loader size={12} /> : undefined}
            />
            {targets.isError && (
                <Text c="red" size="xs">
                    {t('quotaRecovery.legacy.loadFailed')}
                </Text>
            )}
        </Stack>
    )
}

export function PlanSummary({
    plan,
    events = true,
    pauseMessage
}: {
    plan: LegacyPlan
    events?: boolean
    pauseMessage?: string
}) {
    const { t, i18n } = useTranslation()
    const numbers = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])
    const [page, setPage] = useState(0)
    const format = (value: string) => numbers.format(BigInt(value))
    return (
        <Stack gap="sm" className={classes.findings}>
            <Text fw={600}>{t('quotaRecovery.legacy.totals')}</Text>
            <Text size="sm">
                {t('quotaRecovery.legacy.totalCharged', { value: format(plan.totals.charged) })}
            </Text>
            <Text size="sm">
                {t('quotaRecovery.legacy.totalCurrent', { value: format(plan.totals.current) })}
            </Text>
            <Text size="sm" c={plan.totals.lost === '0' ? undefined : 'yellow'}>
                {t('quotaRecovery.legacy.totalLost', { value: format(plan.totals.lost) })}
            </Text>
            {events && plan.source.applied && (
                <Alert color="yellow">
                    {t('quotaRecovery.legacy.eventsOnly', { value: plan.discardedEvents.length })}
                </Alert>
            )}
            {plan.charges.slice(page * 20, page * 20 + 20).map((row) => (
                <Card key={row.subject} withBorder p="xs">
                    <Text fw={600} size="sm">
                        {row.username} · #{row.userId}
                    </Text>
                    <Text size="xs">
                        {t('quotaRecovery.legacy.currentChange', {
                            before: format(row.before.used),
                            after: format(row.after.used)
                        })}
                    </Text>
                    <Text size="xs">
                        {t('quotaRecovery.legacy.lifetimeChange', {
                            before: format(row.before.lifetime),
                            after: format(row.after.lifetime)
                        })}
                    </Text>
                </Card>
            ))}
            {plan.charges.length > 20 && (
                <PageControls
                    page={page}
                    total={Math.ceil(plan.charges.length / 20)}
                    change={setPage}
                />
            )}
            <Text size="sm">
                {t('quotaRecovery.legacy.reason')}: {plan.note}
            </Text>
            <OriginalAssignments plan={plan} />
            <Alert color="yellow">{pauseMessage ?? t('quotaRecovery.legacy.stillPaused')}</Alert>
        </Stack>
    )
}

function OriginalAssignments({ plan }: { plan: LegacyPlan }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [page, setPage] = useState(0)
    const allocations = useMemo(
        () => new Map(plan.allocations.map((row) => [row.owner, row])),
        [plan.allocations]
    )
    const targets = useMemo(
        () => new Map(plan.charges.map((row) => [row.subject, row])),
        [plan.charges]
    )
    return (
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
            <summary className={classes.summary}>{t('quotaRecovery.legacy.assignments')}</summary>
            {open && (
                <Stack gap="xs" mt="xs">
                    {plan.source.payload.slice(page * 20, page * 20 + 20).map((row) => {
                        const allocation = allocations.get(row.u)
                        const target =
                            allocation?.action === 'CHARGE' ? targets.get(allocation.subject) : null
                        return (
                            <Card key={row.u} withBorder p="xs">
                                <Text size="xs">
                                    {t('quotaRecovery.legacy.originalOwner', { id: row.u })} ·{' '}
                                    {row.b} {t('quotaRecovery.legacy.bytes')}
                                </Text>
                                <Text size="xs">
                                    {plan.source.applied
                                        ? t('quotaRecovery.legacy.alreadyApplied')
                                        : target
                                          ? `${target.username} · #${target.userId}`
                                          : t('quotaRecovery.legacy.loss')}
                                </Text>
                                {allocation?.action === 'CHARGE' && (
                                    <Text size="xs">
                                        {allocation.period === 'CURRENT'
                                            ? t('quotaRecovery.legacy.currentPeriod')
                                            : t('quotaRecovery.legacy.lifetimeOnly')}
                                    </Text>
                                )}
                            </Card>
                        )
                    })}
                    {plan.source.payload.length > 20 && (
                        <PageControls
                            page={page}
                            total={Math.ceil(plan.source.payload.length / 20)}
                            change={setPage}
                        />
                    )}
                </Stack>
            )}
        </details>
    )
}

export function PageControls({
    page,
    total,
    change,
    disabled = false
}: {
    page: number
    total: number
    change: (page: number) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    return (
        <Group
            justify="space-between"
            wrap="wrap"
            role="group"
            aria-label={t('quotaRecovery.legacy.rows')}
        >
            <Button
                size="xs"
                variant="subtle"
                disabled={disabled || page === 0}
                onClick={() => change(page - 1)}
            >
                {t('quotaRecovery.legacy.previous')}
            </Button>
            <Text size="xs">
                {page + 1} / {Math.max(1, total)}
            </Text>
            <Button
                size="xs"
                variant="subtle"
                disabled={disabled || page + 1 >= total}
                onClick={() => change(page + 1)}
            >
                {t('quotaRecovery.next')}
            </Button>
        </Group>
    )
}

function RecoveryForm({
    generation,
    receipt,
    source,
    candidates
}: {
    generation: string
    receipt: string
    source: LegacySource
    candidates: { owner: string; subject: string; username: string }[]
}) {
    const { t } = useTranslation()
    const [choices, setChoices] = useState<Record<string, Choice>>({})
    const [note, setNote] = useState('')
    const [period, setPeriod] = useState<'CURRENT' | 'LIFETIME' | null>(null)
    const [page, setPage] = useState(0)
    const [confirmed, setConfirmed] = useState(false)
    const [requestId, setRequestId] = useState<string>()
    const preview = useLegacyPreview(receipt)
    const resolution = useResolveLegacyJob(receipt)
    const busy = preview.isPending || resolution.isPending
    const invalidate = () => {
        preview.reset()
        resolution.reset()
        setConfirmed(false)
        setRequestId(undefined)
    }
    const change = (owner: string, choice: Choice) => {
        invalidate()
        setChoices((previous) => ({ ...previous, [owner]: choice }))
    }
    const allocations = useMemo<LegacyAllocation[]>(
        () =>
            source.applied
                ? []
                : source.payload.flatMap<LegacyAllocation>((row) => {
                      const choice = choices[row.u]
                      if (choice?.action === 'LOSS')
                          return [{ owner: row.u, action: 'LOSS' } satisfies LegacyAllocation]
                      if (choice?.action === 'CHARGE' && choice.target && choice.period)
                          return [
                              {
                                  owner: row.u,
                                  action: 'CHARGE',
                                  subject: choice.target.subject,
                                  period: choice.period
                              } satisfies LegacyAllocation
                          ]
                      return []
                  }),
        [source, choices]
    )
    const ready =
        (source.applied || allocations.length === source.payload.length) && note.trim().length >= 10
    const draft: LegacyDraft = { generation, allocations, note: note.trim() }
    const periods = [
        { value: 'CURRENT', label: t('quotaRecovery.legacy.currentPeriod') },
        { value: 'LIFETIME', label: t('quotaRecovery.legacy.lifetimeOnly') }
    ]
    return (
        <Stack gap="sm">
            <Alert color="yellow">{t('quotaRecovery.legacy.ownerWarning')}</Alert>
            {!source.applied && (
                <>
                    <Select
                        label={t('quotaRecovery.legacy.bulkPeriod')}
                        data={periods}
                        value={period}
                        disabled={busy}
                        onChange={(value) => setPeriod(value as typeof period)}
                        placeholder={t('quotaRecovery.legacy.choose')}
                    />
                    <Group wrap="wrap">
                        <Button
                            size="xs"
                            variant="light"
                            disabled={busy || !period || !candidates.length}
                            onClick={() => {
                                if (!period) return
                                invalidate()
                                setChoices((previous) => ({
                                    ...previous,
                                    ...Object.fromEntries(
                                        candidates.map((row) => [
                                            row.owner,
                                            {
                                                action: 'CHARGE',
                                                target: {
                                                    subject: row.subject,
                                                    userId: row.owner,
                                                    username: row.username
                                                },
                                                period
                                            } satisfies Choice
                                        ])
                                    )
                                }))
                            }}
                        >
                            {t('quotaRecovery.legacy.assignMatches')}
                        </Button>
                        <Button
                            size="xs"
                            variant="subtle"
                            disabled={busy}
                            onClick={() => {
                                invalidate()
                                setChoices(
                                    Object.fromEntries(
                                        source.payload.map((row) => [
                                            row.u,
                                            {
                                                action: 'LOSS',
                                                target: null,
                                                period: null
                                            } satisfies Choice
                                        ])
                                    )
                                )
                            }}
                        >
                            {t('quotaRecovery.legacy.markLoss')}
                        </Button>
                    </Group>
                    <Text size="sm">
                        {t('quotaRecovery.legacy.selected', {
                            value: allocations.length,
                            total: source.payload.length
                        })}
                    </Text>
                    {source.payload.slice(page * 20, page * 20 + 20).map((row) => {
                        const choice = choices[row.u] ?? blank
                        return (
                            <Card key={row.u} withBorder p="sm">
                                <Stack gap="xs">
                                    <Text size="sm" fw={600}>
                                        {t('quotaRecovery.legacy.originalOwner', { id: row.u })}
                                    </Text>
                                    <Text size="xs" dir="ltr">
                                        {row.b} {t('quotaRecovery.legacy.bytes')}
                                    </Text>
                                    <Select
                                        label={t('quotaRecovery.legacy.action')}
                                        value={choice.action}
                                        disabled={busy}
                                        placeholder={t('quotaRecovery.legacy.choose')}
                                        data={[
                                            {
                                                value: 'CHARGE',
                                                label: t('quotaRecovery.legacy.charge')
                                            },
                                            { value: 'LOSS', label: t('quotaRecovery.legacy.loss') }
                                        ]}
                                        onChange={(value) =>
                                            change(row.u, {
                                                ...choice,
                                                action: value as Choice['action']
                                            })
                                        }
                                    />
                                    {choice.action === 'CHARGE' && (
                                        <>
                                            <TargetPicker
                                                generation={generation}
                                                value={choice.target}
                                                disabled={busy}
                                                change={(target) =>
                                                    change(row.u, { ...choice, target })
                                                }
                                            />
                                            <Select
                                                label={t('quotaRecovery.legacy.period')}
                                                value={choice.period}
                                                data={periods}
                                                disabled={busy}
                                                placeholder={t('quotaRecovery.legacy.choose')}
                                                onChange={(value) =>
                                                    change(row.u, {
                                                        ...choice,
                                                        period: value as Choice['period']
                                                    })
                                                }
                                            />
                                        </>
                                    )}
                                </Stack>
                            </Card>
                        )
                    })}
                    {source.payload.length > 20 && (
                        <PageControls
                            page={page}
                            total={Math.ceil(source.payload.length / 20)}
                            change={setPage}
                            disabled={busy}
                        />
                    )}
                </>
            )}
            {source.applied && (
                <Alert color="yellow">
                    {t('quotaRecovery.legacy.eventsOnly', {
                        value: source.pendingUsers?.length ?? 0
                    })}
                </Alert>
            )}
            <Textarea
                label={t('quotaRecovery.legacy.reason')}
                description={t('quotaRecovery.legacy.reasonHelp')}
                value={note}
                disabled={busy}
                maxLength={1000}
                minRows={2}
                autosize
                onChange={(event) => {
                    invalidate()
                    setNote(event.currentTarget.value)
                }}
            />
            <Button
                variant="light"
                loading={preview.isPending}
                disabled={busy || !ready}
                onClick={() => {
                    setConfirmed(false)
                    preview.mutate(draft, { onSuccess: () => setRequestId(crypto.randomUUID()) })
                }}
            >
                {t('quotaRecovery.legacy.preview')}
            </Button>
            {preview.isError && (
                <Alert color="red">
                    {t(
                        `quotaRecovery.legacy.${legacyRecoveryProblem(preview.error) ?? 'previewFailed'}`
                    )}
                </Alert>
            )}
            {preview.data && (
                <>
                    <PlanSummary key={preview.data.planDigest} plan={preview.data.plan} />
                    <Checkbox
                        checked={confirmed}
                        disabled={busy}
                        label={t('quotaRecovery.legacy.confirmReview')}
                        onChange={(event) => setConfirmed(event.currentTarget.checked)}
                    />
                    <Button
                        loading={resolution.isPending}
                        disabled={busy || !confirmed || !requestId}
                        onClick={() => {
                            if (preview.data && requestId)
                                resolution.mutate({
                                    ...draft,
                                    requestId,
                                    planDigest: preview.data.planDigest
                                })
                        }}
                    >
                        {resolution.isError
                            ? t('quotaRecovery.legacy.retrySame')
                            : t('quotaRecovery.legacy.resolve')}
                    </Button>
                </>
            )}
            {resolution.isError && (
                <Alert color="red">
                    {t(
                        `quotaRecovery.legacy.${legacyRecoveryProblem(resolution.error) ?? 'resolveFailed'}`
                    )}
                </Alert>
            )}
        </Stack>
    )
}

function LegacyJob({
    generation,
    receipt,
    title,
    state
}: {
    generation: string
    receipt: string
    title: string
    state: string
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const details = useLegacyJob(generation, receipt, open)
    const decision = details.data?.decision
    return (
        <Card withBorder p="sm" radius="md">
            <details onToggle={(event) => setOpen(event.currentTarget.open)}>
                <summary className={classes.summary}>
                    {title} · {state}
                </summary>
                {open && (
                    <Stack gap="sm" mt="sm" className={classes.findings}>
                        <Button
                            size="xs"
                            variant="subtle"
                            loading={details.isFetching}
                            onClick={() => void details.refetch()}
                        >
                            {t('quotaRecovery.refresh')}
                        </Button>
                        {details.isPending && <Loader size="xs" />}
                        {details.isError && (
                            <Alert color="red">{t('quotaRecovery.legacy.loadFailed')}</Alert>
                        )}
                        {decision && (
                            <>
                                <Badge color="teal">{t('quotaRecovery.legacy.resolved')}</Badge>
                                <PlanSummary plan={decision.plan} />
                                <details>
                                    <summary className={classes.summary}>
                                        {t('quotaRecovery.legacy.audit')}
                                    </summary>
                                    <Stack gap={4} mt="xs">
                                        <Text size="xs">{t('quotaRecovery.historyActor')}</Text>
                                        <Text size="xs" dir="ltr">
                                            {decision.actorUuid}
                                        </Text>
                                        <Text size="xs">
                                            {t('quotaRecovery.historyGeneration')}
                                        </Text>
                                        <Text size="xs" dir="ltr">
                                            {decision.generation}
                                        </Text>
                                        <Text size="xs" dir="ltr">
                                            {decision.planDigest}
                                        </Text>
                                    </Stack>
                                </details>
                            </>
                        )}
                        {details.data?.source && (
                            <RecoveryForm
                                key={details.data.source.digest}
                                generation={generation}
                                receipt={receipt}
                                source={details.data.source}
                                candidates={details.data.candidates}
                            />
                        )}
                    </Stack>
                )}
            </details>
        </Card>
    )
}

function QueueRecovery({ generation }: { generation: string }) {
    const { t } = useTranslation()
    const capture = useCaptureLegacyQueue()
    return (
        <Stack gap="xs">
            <Text size="sm" c="dimmed">
                {t('quotaRecovery.legacy.queueHelp')}
            </Text>
            <Group wrap="wrap">
                <Button
                    size="xs"
                    variant="light"
                    loading={capture.isPending}
                    onClick={() => capture.mutate({ generation, offset: 0 })}
                >
                    {t('quotaRecovery.legacy.queueRead')}
                </Button>
                {capture.data?.nextOffset !== null && capture.data?.nextOffset !== undefined && (
                    <Button
                        size="xs"
                        variant="subtle"
                        disabled={capture.isPending}
                        onClick={() => {
                            if (
                                capture.data?.nextOffset !== null &&
                                capture.data?.nextOffset !== undefined
                            )
                                capture.mutate({ generation, offset: capture.data.nextOffset })
                        }}
                    >
                        {t('quotaRecovery.legacy.queueNext')}
                    </Button>
                )}
            </Group>
            {capture.isError && (
                <Alert color="red">
                    {t(
                        `quotaRecovery.legacy.${legacyRecoveryProblem(capture.error) ?? 'queueUnavailable'}`
                    )}
                </Alert>
            )}
            {capture.data && (
                <Text size="sm">
                    {t('quotaRecovery.legacy.queueResult', {
                        value: capture.data.entries.length,
                        retained: capture.data.entries.filter((row) => row.receipt !== null).length,
                        retried: capture.data.entries.filter(
                            (row) => row.state === 'RETRY_SCHEDULED'
                        ).length
                    })}
                </Text>
            )}
            {capture.data?.entries.some(
                (row) => row.state === 'INVALID_SOURCE' || row.state === 'RETRY_REQUIRED'
            ) && <Alert color="yellow">{t('quotaRecovery.legacy.queueNeedsReview')}</Alert>}
        </Stack>
    )
}

export function LegacyQuotaRecovery({
    generation,
    dates
}: {
    generation: string
    dates: Intl.DateTimeFormat
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [after, setAfter] = useState<string>()
    const jobs = useLegacyJobs(generation, open, after)
    return (
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
            <summary className={classes.summary}>{t('quotaRecovery.legacy.title')}</summary>
            {open && (
                <Stack gap="sm" mt="sm" className={classes.findings}>
                    <Text size="sm" c="dimmed">
                        {t('quotaRecovery.legacy.description')}
                    </Text>
                    <QueueRecovery generation={generation} />
                    <Button
                        variant="subtle"
                        loading={jobs.isFetching}
                        onClick={() => void jobs.refetch()}
                    >
                        {t('quotaRecovery.refresh')}
                    </Button>
                    {jobs.isPending && <Loader size="xs" />}
                    {jobs.isError && (
                        <Alert color="red">{t('quotaRecovery.legacy.loadFailed')}</Alert>
                    )}
                    {jobs.data?.entries.length === 0 && (
                        <Text size="sm">{t('quotaRecovery.legacy.empty')}</Text>
                    )}
                    {jobs.data?.entries.map((job) => (
                        <LegacyJob
                            key={job.receipt}
                            generation={generation}
                            receipt={job.receipt}
                            title={dates.format(new Date(job.committedAt))}
                            state={
                                job.requestId
                                    ? t('quotaRecovery.legacy.resolved')
                                    : job.applied
                                      ? t('quotaRecovery.legacy.notifications')
                                      : t('quotaRecovery.legacy.pending')
                            }
                        />
                    ))}
                    <Group justify="space-between" wrap="wrap">
                        <Button
                            size="xs"
                            variant="subtle"
                            disabled={!after || jobs.isFetching}
                            onClick={() => setAfter(undefined)}
                        >
                            {t('quotaRecovery.first')}
                        </Button>
                        <Button
                            size="xs"
                            variant="light"
                            disabled={!jobs.data?.nextAfter || jobs.isFetching}
                            onClick={() => setAfter(jobs.data?.nextAfter ?? undefined)}
                        >
                            {t('quotaRecovery.next')}
                        </Button>
                    </Group>
                </Stack>
            )}
        </details>
    )
}
