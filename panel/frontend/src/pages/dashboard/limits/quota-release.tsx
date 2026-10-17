import { Alert, Badge, Button, Checkbox, Code, Group, Loader, Stack, Text } from '@mantine/core'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { FlagTextarea } from '@shared/ui/flag-picker/flag-picker'

import classes from './quota-recovery.module.css'
import {
    ReleaseApproval,
    FinalizationInput,
    releaseProblem,
    releaseCodeProblem,
    useReleaseStatus,
    useReleasePreview,
    useApproveRelease,
    useReleaseJobs,
    useReleaseJob,
    useDeliverRelease,
    useFinalizeRelease,
    useFinalization
} from './quota-release.api'

const uuid = z
    .uuid()
    .refine((v) => v === v.toLowerCase() && v !== '00000000-0000-0000-0000-000000000000')
const noteSchema = z.string().trim().min(10).max(2000)
const approveSchema = z.strictObject({
    requestId: uuid,
    generation: uuid,
    bankRequest: uuid,
    note: noteSchema,
    planDigest: z.string().regex(/^[a-f0-9]{64}$/)
})
const finalSchema = z.strictObject({ requestId: uuid, approvalRequest: uuid, note: noteSchema })
function stored<T>(key: string, schema: z.ZodType<T>): T | undefined {
    try {
        const parsed = schema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'))
        return parsed.success ? parsed.data : undefined
    } catch {
        return undefined
    }
}
function persist<T>(key: string, schema: z.ZodType<T>, body: T) {
    const current = stored(key, schema)
    if (current && JSON.stringify(current) !== JSON.stringify(body))
        throw Error('Different saved operation')
    localStorage.setItem(key, JSON.stringify(body))
    if (JSON.stringify(stored(key, schema)) !== JSON.stringify(body))
        throw Error('Operation was not saved')
}
function ReleaseJob({
    approval,
    job
}: {
    approval: string
    job: {
        request: string
        node: string
        name?: string | null
        acknowledged: boolean
        busy: boolean
    }
}) {
    const { t } = useTranslation(),
        [open, setOpen] = useState(false),
        [after, setAfter] = useState<string>()
    const delivery = useDeliverRelease(approval),
        history = useReleaseJob(approval, job.request, open, after)
    return (
        <Stack gap="xs" py="xs">
            <Group justify="space-between" wrap="wrap">
                <Text size="xs" dir="ltr" className={classes.node}>
                    {job.name ?? job.node}
                </Text>
                <Badge color={job.acknowledged ? 'teal' : 'yellow'}>
                    {t(`quotaRecovery.release.${job.acknowledged ? 'acknowledged' : 'waiting'}`)}
                </Badge>
                <Button
                    variant="light"
                    size="xs"
                    mih={44}
                    loading={delivery.isPending}
                    disabled={job.busy || job.acknowledged}
                    onClick={() => delivery.mutate(job.request)}
                >
                    {t('quotaRecovery.release.deliver')}
                </Button>
            </Group>
            {delivery.isError && (
                <Alert color="yellow">
                    {t(`quotaRecovery.release.${releaseProblem(delivery.error)}`)}
                </Alert>
            )}
            <details onToggle={(e) => setOpen(e.currentTarget.open)}>
                <summary className={classes.summary}>{t('quotaRecovery.release.attempts')}</summary>
                {open && (
                    <Stack gap="xs">
                        {history.isPending && <Loader size="xs" />}
                        {history.isError && (
                            <Alert color="red">{t('quotaRecovery.release.loadFailed')}</Alert>
                        )}
                        {history.data?.attempts.map((a) => (
                            <Text key={a.attempt} size="xs">
                                {a.requestedAt} —{' '}
                                {t(
                                    `quotaRecovery.release.${a.outcome?.confirmed ? 'acknowledged' : a.outcome ? 'retry' : 'waiting'}`
                                )}
                            </Text>
                        ))}
                        <Group wrap="wrap">
                            <Button
                                variant="subtle"
                                disabled={!after}
                                onClick={() => setAfter(undefined)}
                            >
                                {t('quotaRecovery.first')}
                            </Button>
                            <Button
                                variant="subtle"
                                disabled={!history.data?.nextAfter}
                                onClick={() => setAfter(history.data?.nextAfter ?? undefined)}
                            >
                                {t('quotaRecovery.next')}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </details>
        </Stack>
    )
}
function FinalizationHistory({ approval, request }: { approval: string; request: string }) {
    const { t, i18n } = useTranslation(),
        [open, setOpen] = useState(false),
        [after, setAfter] = useState<string>()
    const history = useFinalization(approval, request, open, after)
    const dates = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
        [i18n.language]
    )
    return (
        <details onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary className={classes.summary}>{t('quotaRecovery.release.history')}</summary>
            {open && (
                <Stack gap="xs" mt="sm">
                    {history.isPending && <Loader size="xs" />}
                    {history.isError && (
                        <Alert color="yellow">{t('quotaRecovery.release.loadFailed')}</Alert>
                    )}
                    {history.data?.attempts.map((a) => (
                        <Stack key={a.attempt} gap={2}>
                            <Text size="sm">{dates.format(new Date(a.requestedAt))}</Text>
                            <Text size="xs" dir="ltr">
                                {a.attempt}
                            </Text>
                            <Text size="sm">
                                {t(
                                    `quotaRecovery.release.${a.outcome?.confirmed ? 'done' : a.outcome ? 'retry' : 'waiting'}`
                                )}
                            </Text>
                        </Stack>
                    ))}
                    <Group wrap="wrap">
                        <Button
                            variant="subtle"
                            disabled={!after || history.isFetching}
                            onClick={() => setAfter(undefined)}
                        >
                            {t('quotaRecovery.first')}
                        </Button>
                        <Button
                            variant="subtle"
                            disabled={!history.data?.nextAfter || history.isFetching}
                            onClick={() => setAfter(history.data?.nextAfter ?? undefined)}
                        >
                            {t('quotaRecovery.next')}
                        </Button>
                    </Group>
                </Stack>
            )}
        </details>
    )
}
export function QuotaRelease({ generation }: { generation: string }) {
    const { t, i18n } = useTranslation(),
        [open, setOpen] = useState(false),
        [nodesOpen, setNodesOpen] = useState(false),
        [after, setAfter] = useState<string>()
    const approvalKey = `quota-release:v1:${generation}`,
        finalKey = `quota-finalization:v1:${generation}`
    const [intent, setIntent] = useState<ReleaseApproval | undefined>(() =>
        stored(approvalKey, approveSchema)
    )
    const [finalIntent, setFinalIntent] = useState<FinalizationInput | undefined>(() =>
        stored(finalKey, finalSchema)
    )
    const [note, setNote] = useState(() => intent?.note ?? t('quotaRecovery.release.defaultNote'))
    const [confirmedFor, setConfirmedFor] = useState<string>(),
        [storageError, setStorageError] = useState(false)
    const status = useReleaseStatus(generation, open, !!intent || !!finalIntent),
        preview = useReleasePreview(),
        approve = useApproveRelease(),
        finalize = useFinalizeRelease()
    const saved = status.data,
        jobs = useReleaseJobs(saved?.request, open && nodesOpen, after)
    const finalId =
        saved?.finalization ??
        (finalIntent?.approvalRequest === saved?.request ? finalIntent?.requestId : undefined)
    const finalization = useFinalization(saved?.request, finalId, open)
    const dispatch = finalization.data?.dispatch
    const queued = dispatch?.state === 'QUEUED'
    const running = !!finalization.data?.busy || queued || dispatch?.state === 'RUNNING'
    const currentAttempt =
        dispatch?.state === 'RUNNING'
            ? finalization.data?.attempts.find((a) => a.dispatchOwner === dispatch.owner)
            : finalization.data?.attempts[0]
    const finalKnown = !!finalization.data?.result || !!dispatch
    const consentScope = saved?.request ?? 'approval'
    const confirmed = confirmedFor === consentScope
    const number = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])
    const busy = preview.isPending || approve.isPending || finalize.isPending
    const mismatch =
        !!intent &&
        !!saved &&
        (intent.requestId !== saved.request ||
            intent.planDigest !== saved.planDigest ||
            intent.bankRequest !== saved.bankRequest ||
            intent.note !== saved.note ||
            intent.generation !== saved.generation)
    const finalMismatch =
        !!finalIntent &&
        !!saved &&
        (finalIntent.approvalRequest !== saved.request ||
            (!!saved.finalization && finalIntent.requestId !== saved.finalization))
    function prepare() {
        setConfirmedFor(undefined)
        preview.mutate({
            requestId: crypto.randomUUID(),
            generation,
            bankRequest: crypto.randomUUID(),
            note: note.trim()
        })
    }
    function sendApproval() {
        const body =
            intent ??
            (preview.data && preview.variables
                ? { ...preview.variables, planDigest: preview.data.planDigest }
                : undefined)
        if (!body || !confirmed) return
        try {
            persist(approvalKey, approveSchema, body)
        } catch {
            setStorageError(true)
            return
        }
        setStorageError(false)
        setIntent(body)
        approve.mutate(body)
    }
    function finish() {
        if (!saved || !confirmed) return
        const recovered = finalization.data
        const body =
            finalIntent ??
            (recovered
                ? {
                      requestId: recovered.requestId,
                      approvalRequest: recovered.approvalRequest,
                      note: recovered.note
                  }
                : {
                      requestId: crypto.randomUUID(),
                      approvalRequest: saved.request,
                      note: saved.note
                  })
        try {
            persist(finalKey, finalSchema, body)
        } catch {
            setStorageError(true)
            return
        }
        setStorageError(false)
        setFinalIntent(body)
        finalize.mutate(body)
    }
    return (
        <details className={classes.mobileControls} onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary className={classes.summary}>{t('quotaRecovery.release.title')}</summary>
            {open && (
                <Stack gap="sm" mt="sm" className={classes.findings}>
                    <Text size="sm">{t('quotaRecovery.release.description')}</Text>
                    {status.isPending ? (
                        <Loader size="sm" />
                    ) : status.isError ? (
                        <Alert color="red">{t('quotaRecovery.release.loadFailed')}</Alert>
                    ) : saved ? (
                        <>
                            <Text size="sm">
                                {t('quotaRecovery.release.saved', {
                                    done: number.format(BigInt(saved.acknowledged)),
                                    total: number.format(BigInt(saved.total))
                                })}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {t('quotaRecovery.release.historical')}
                            </Text>
                            <Code className={classes.findings} dir="ltr">
                                {saved.request}
                            </Code>
                            <Text size="sm" dir="auto">
                                {saved.note}
                            </Text>
                            <details onToggle={(e) => setNodesOpen(e.currentTarget.open)}>
                                <summary className={classes.summary}>
                                    {t('quotaRecovery.release.nodes')}
                                </summary>
                                <Stack gap="xs" mt="sm">
                                    {jobs.isPending && <Loader size="xs" />}
                                    {jobs.isError && (
                                        <Alert color="red">
                                            {t('quotaRecovery.release.loadFailed')}
                                        </Alert>
                                    )}
                                    {jobs.data?.entries.map((job) => (
                                        <ReleaseJob
                                            key={job.request}
                                            approval={saved.request}
                                            job={job}
                                        />
                                    ))}
                                    <Group wrap="wrap">
                                        <Button
                                            variant="subtle"
                                            disabled={!after || jobs.isFetching}
                                            onClick={() => setAfter(undefined)}
                                        >
                                            {t('quotaRecovery.first')}
                                        </Button>
                                        <Button
                                            variant="subtle"
                                            disabled={!jobs.data?.nextAfter || jobs.isFetching}
                                            onClick={() =>
                                                setAfter(jobs.data?.nextAfter ?? undefined)
                                            }
                                        >
                                            {t('quotaRecovery.next')}
                                        </Button>
                                    </Group>
                                </Stack>
                            </details>
                            {finalization.data && (
                                <Alert
                                    color={finalization.data.result ? 'teal' : 'blue'}
                                    role="status"
                                >
                                    {t(
                                        `quotaRecovery.release.${finalization.data.result ? 'done' : queued ? 'queued' : dispatch?.state === 'FAILED' ? 'queueFailed' : 'progress'}`,
                                        {
                                            done: number.format(
                                                BigInt(currentAttempt?.checked ?? '0')
                                            ),
                                            total: number.format(BigInt(finalization.data.total))
                                        }
                                    )}
                                    {dispatch?.state === 'FAILED' && dispatch.error && (
                                        <Text size="sm">
                                            {t(
                                                `quotaRecovery.release.${releaseCodeProblem(dispatch.error)}`
                                            )}
                                        </Text>
                                    )}
                                    {!dispatch &&
                                        !running &&
                                        !finalization.data.result &&
                                        finalization.data.attempts[0]?.outcome && (
                                            <Text size="sm">
                                                {t('quotaRecovery.release.retry')}
                                            </Text>
                                        )}
                                </Alert>
                            )}
                            {finalization.isError && (
                                <Alert color="yellow">{t('quotaRecovery.release.unknown')}</Alert>
                            )}
                            {finalId && (
                                <FinalizationHistory approval={saved.request} request={finalId} />
                            )}
                            {!finalization.data?.result && (
                                <>
                                    <Checkbox
                                        label={t('quotaRecovery.release.confirmResume')}
                                        checked={confirmed}
                                        onChange={(e) =>
                                            setConfirmedFor(
                                                e.currentTarget.checked ? consentScope : undefined
                                            )
                                        }
                                        disabled={busy || running}
                                    />
                                    <Button
                                        loading={finalize.isPending}
                                        disabled={
                                            !confirmed ||
                                            mismatch ||
                                            finalMismatch ||
                                            running ||
                                            (!!saved.finalization && !finalization.data)
                                        }
                                        onClick={finish}
                                    >
                                        {t('quotaRecovery.release.resume')}
                                    </Button>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <FlagTextarea
                                label={t('quotaRecovery.release.reason')}
                                value={intent?.note ?? note}
                                dir="auto"
                                minRows={2}
                                autosize
                                maxLength={2000}
                                disabled={busy || !!intent}
                                onChange={(e) => {
                                    setNote(e.currentTarget.value)
                                    preview.reset()
                                    setConfirmedFor(undefined)
                                }}
                            />
                            {!intent && (
                                <Button
                                    variant="light"
                                    loading={preview.isPending}
                                    disabled={busy || note.trim().length < 10}
                                    onClick={prepare}
                                >
                                    {t('quotaRecovery.release.review')}
                                </Button>
                            )}
                            {preview.data && (
                                <Text>
                                    {t('quotaRecovery.release.plan', {
                                        total: number.format(preview.data.plan.nodes.length)
                                    })}
                                </Text>
                            )}
                            {preview.isError && (
                                <Alert color="yellow">
                                    {t(`quotaRecovery.release.${releaseProblem(preview.error)}`)}
                                </Alert>
                            )}
                            {intent && (
                                <Alert color="yellow">{t('quotaRecovery.release.unknown')}</Alert>
                            )}
                            {(intent || preview.data) && (
                                <>
                                    <Checkbox
                                        label={t('quotaRecovery.release.confirm')}
                                        checked={confirmed}
                                        onChange={(e) =>
                                            setConfirmedFor(
                                                e.currentTarget.checked ? consentScope : undefined
                                            )
                                        }
                                        disabled={busy}
                                    />
                                    <Button
                                        disabled={!confirmed || busy || !!status.isError}
                                        loading={approve.isPending}
                                        onClick={sendApproval}
                                    >
                                        {t(
                                            `quotaRecovery.release.${intent ? 'retryApproval' : 'approve'}`
                                        )}
                                    </Button>
                                </>
                            )}
                        </>
                    )}
                    {(mismatch || finalMismatch) && (
                        <Alert color="red">{t('quotaRecovery.release.conflict')}</Alert>
                    )}
                    {storageError && (
                        <Alert color="red">{t('quotaRecovery.release.storageFailed')}</Alert>
                    )}
                    {((approve.isError && !saved) || (finalize.isError && !finalKnown)) && (
                        <Alert color="yellow">
                            {t(
                                `quotaRecovery.release.${releaseProblem(finalize.isError ? finalize.error : approve.error)}`
                            )}
                        </Alert>
                    )}
                    <Button
                        variant="subtle"
                        loading={status.isFetching}
                        onClick={() => {
                            void status.refetch()
                            void jobs.refetch()
                            if (finalId) void finalization.refetch()
                        }}
                    >
                        {t('quotaRecovery.refresh')}
                    </Button>
                </Stack>
            )}
        </details>
    )
}
