import { Alert, Button, Checkbox, Code, Group, Loader, Stack, Text } from '@mantine/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { FlagTextarea } from '@shared/ui/flag-picker/flag-picker'

import {
    ExposureApproval,
    ExposureDecision,
    exposureClosureProblem,
    exposureClosureRejected,
    useExposureDecision,
    useExposureHistory,
    useExposurePreview,
    useExposureResolve
} from './exposure-quota-closure.api'
import { useCheckQuotaRecovery } from './quota-recovery.api'
import classes from './quota-recovery.module.css'
const intentSchema = z.strictObject({
    version: z.literal(1),
    body: z.strictObject({
        generation: z.uuid(),
        bankRequest: z.uuid(),
        note: z.string().trim().min(10).max(2000),
        requestId: z.uuid(),
        planDigest: z.string().regex(/^[a-f0-9]{64}$/)
    })
})
const keyFor = (uuid: string, generation: string) =>
    `quota-exposure-closure:v1:${uuid}:${generation}`
function stored(key: string, generation: string) {
    try {
        const parsed = intentSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'))
        return parsed.success && parsed.data.body.generation === generation
            ? parsed.data.body
            : undefined
    } catch {
        return undefined
    }
}
function same(left: ExposureApproval, right: ExposureApproval) {
    return (
        left.requestId === right.requestId &&
        left.generation === right.generation &&
        left.bankRequest === right.bankRequest &&
        left.planDigest === right.planDigest &&
        left.note === right.note
    )
}
function matches(body: ExposureApproval, value: ExposureDecision) {
    return (
        value.requestId === body.requestId &&
        value.generation === body.generation &&
        value.planDigest === body.planDigest &&
        value.plan.bankRequest === body.bankRequest &&
        value.plan.note === body.note
    )
}
export function ExposureQuotaClosure({ uuid, generation }: { uuid: string; generation: string }) {
    const { t, i18n } = useTranslation(),
        key = keyFor(uuid, generation)
    const [intent, setPending] = useState(() => stored(key, generation))
    const [note, setNote] = useState(() => intent?.note ?? t('quotaRecovery.exposure.defaultNote'))
    const [open, setOpen] = useState(false),
        [confirmed, setConfirmed] = useState(false),
        [storageError, setStorageError] = useState(false)
    const [completed, setCompleted] = useState<ExposureDecision>(),
        [after, setAfter] = useState<string>()
    const preview = useExposurePreview(uuid),
        resolve = useExposureResolve(uuid, generation),
        check = useCheckQuotaRecovery()
    const detail = useExposureDecision(uuid, generation, intent?.requestId, open)
    const recovered =
        intent && detail.data && matches(intent, detail.data) ? detail.data : undefined
    const pending = recovered ? undefined : intent
    const history = useExposureHistory(uuid, generation, open, after)
    const busy = preview.isPending || resolve.isPending || check.isPending
    const clear = useCallback(
        (body: ExposureApproval) => {
            try {
                const current = stored(key, generation)
                if (current && same(current, body)) localStorage.removeItem(key)
            } catch {
                /* A saved id remains safe to read after reload. */
            }
            setPending(undefined)
            setConfirmed(false)
        },
        [key, generation]
    )
    useEffect(() => {
        if (!recovered || !intent) return
        try {
            const current = stored(key, generation)
            if (current && same(current, intent)) localStorage.removeItem(key)
        } catch {
            /* Keep the confirmed result readable when storage is unavailable. */
        }
    }, [recovered, intent, key, generation])
    const mismatch = !!pending && !!detail.data && !matches(pending, detail.data)
    const result = completed ?? resolve.data ?? recovered
    const proposal = preview.data
    const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])
    const dateFormat = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
        [i18n.language]
    )
    const number = (value: string) => numberFormat.format(BigInt(value))
    const message = (error: unknown) => t(`quotaRecovery.exposure.${exposureClosureProblem(error)}`)
    function send() {
        const body =
            pending ??
            (proposal && preview.variables
                ? {
                      ...preview.variables,
                      requestId: crypto.randomUUID(),
                      planDigest: proposal.planDigest
                  }
                : undefined)
        if (!body || !confirmed) return
        try {
            const current = stored(key, generation)
            if (current && !same(current, body)) {
                setPending(current)
                setStorageError(true)
                return
            }
            localStorage.setItem(key, JSON.stringify({ version: 1, body }))
            const written = stored(key, generation)
            if (!written || !same(written, body)) throw Error('Intent changed')
        } catch {
            setStorageError(true)
            return
        }
        setStorageError(false)
        setPending(body)
        resolve.mutate(body, {
            onSuccess: (value) => {
                setCompleted(value)
                clear(body)
            }
        })
    }
    function prepare() {
        setPending(undefined)
        setCompleted(undefined)
        resolve.reset()
        setConfirmed(false)
        setStorageError(false)
        preview.mutate({ generation, bankRequest: crypto.randomUUID(), note: note.trim() })
    }
    return (
        <details
            className={classes.mobileControls}
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <summary className={classes.summary}>{t('quotaRecovery.exposure.title')}</summary>
            {open && (
                <Stack gap="sm" mt="xs" className={classes.findings}>
                    <Text size="sm">{t('quotaRecovery.exposure.description')}</Text>
                    <Alert color="yellow">{t('quotaRecovery.exposure.paused')}</Alert>
                    {result ? (
                        <Alert color="teal" role="status">
                            <Text>
                                {t('quotaRecovery.exposure.done', {
                                    value: number(result.plan.scope.eligible)
                                })}
                            </Text>
                            <Text size="sm">
                                {t('quotaRecovery.exposure.remaining', {
                                    value: number(result.plan.scope.remaining)
                                })}
                            </Text>
                        </Alert>
                    ) : (
                        <>
                            <FlagTextarea
                                dir="auto"
                                label={t('quotaRecovery.exposure.reason')}
                                value={pending?.note ?? note}
                                minRows={2}
                                autosize
                                maxLength={2000}
                                disabled={busy || !!pending}
                                onChange={(event) => {
                                    setNote(event.currentTarget.value)
                                    preview.reset()
                                    resolve.reset()
                                    setConfirmed(false)
                                }}
                            />
                            {!pending && (
                                <Button
                                    variant="light"
                                    disabled={busy || note.trim().length < 10}
                                    loading={preview.isPending}
                                    onClick={prepare}
                                >
                                    {t('quotaRecovery.exposure.review')}
                                </Button>
                            )}
                            {preview.isError && !pending && (
                                <Alert color="red" role="alert">
                                    {message(preview.error)}
                                </Alert>
                            )}
                            {pending && (
                                <Alert color="yellow" role="status">
                                    {t(
                                        `quotaRecovery.exposure.${resolve.isError && exposureClosureRejected(resolve.error) ? 'rejected' : 'unknown'}`
                                    )}
                                </Alert>
                            )}
                            {proposal && !pending && (
                                <Stack gap={4}>
                                    <Text>
                                        {t('quotaRecovery.exposure.eligible', {
                                            value: number(proposal.plan.scope.eligible)
                                        })}
                                    </Text>
                                    <Text>
                                        {t('quotaRecovery.exposure.remaining', {
                                            value: number(proposal.plan.scope.remaining)
                                        })}
                                    </Text>
                                    {proposal.plan.scope.eligible === '0' && (
                                        <Alert color="blue">
                                            {t('quotaRecovery.exposure.none')}
                                        </Alert>
                                    )}
                                </Stack>
                            )}
                            {storageError && (
                                <Alert color="red" role="alert">
                                    {t('quotaRecovery.exposure.storage')}
                                </Alert>
                            )}
                            {mismatch && (
                                <Alert color="red" role="alert">
                                    {t('quotaRecovery.exposure.savedMismatch')}
                                    <Button
                                        variant="subtle"
                                        disabled={busy}
                                        onClick={() => {
                                            if (pending && detail.data) {
                                                setCompleted(detail.data)
                                                clear(pending)
                                            }
                                        }}
                                    >
                                        {t('quotaRecovery.exposure.useSaved')}
                                    </Button>
                                </Alert>
                            )}
                            {(pending || (proposal?.plan.scope.eligible !== '0' && proposal)) && (
                                <>
                                    <Checkbox
                                        label={t('quotaRecovery.exposure.confirm')}
                                        checked={confirmed}
                                        disabled={busy || mismatch}
                                        onChange={(event) =>
                                            setConfirmed(event.currentTarget.checked)
                                        }
                                    />
                                    <Button
                                        disabled={busy || mismatch || !confirmed}
                                        loading={resolve.isPending}
                                        onClick={send}
                                    >
                                        {t(
                                            `quotaRecovery.exposure.${pending ? 'retry' : 'submit'}`
                                        )}
                                    </Button>
                                </>
                            )}
                            {resolve.isError && !mismatch && (
                                <Alert color="red" role="alert">
                                    {message(resolve.error)}
                                </Alert>
                            )}
                            {pending &&
                                resolve.isError &&
                                exposureClosureRejected(resolve.error) && (
                                    <Button
                                        variant="subtle"
                                        disabled={busy}
                                        onClick={() => {
                                            clear(pending)
                                            resolve.reset()
                                            preview.reset()
                                        }}
                                    >
                                        {t('quotaRecovery.exposure.prepareAgain')}
                                    </Button>
                                )}
                        </>
                    )}
                    {result && (
                        <Button
                            variant="light"
                            disabled={busy}
                            loading={check.isPending}
                            onClick={() => check.mutate({ uuid, generation })}
                        >
                            {t('quotaRecovery.check')}
                        </Button>
                    )}
                    {check.isError && (
                        <Alert color="red" role="alert">
                            {t('quotaRecovery.exposure.failed')}
                        </Alert>
                    )}
                    <Group wrap="wrap">
                        <Button
                            variant="subtle"
                            disabled={busy || detail.isFetching || history.isFetching}
                            onClick={() => {
                                if (pending) void detail.refetch()
                                void history.refetch()
                            }}
                        >
                            {t('quotaRecovery.exposure.refresh')}
                        </Button>
                        {(detail.isFetching || history.isFetching) && <Loader size="xs" />}
                        {result && (
                            <Button
                                variant="subtle"
                                disabled={busy}
                                onClick={() => {
                                    setCompleted(undefined)
                                    resolve.reset()
                                    preview.reset()
                                }}
                            >
                                {t('quotaRecovery.exposure.reviewAgain')}
                            </Button>
                        )}
                    </Group>
                    {(proposal || pending || result) && (
                        <details>
                            <summary className={classes.summary}>
                                {t('quotaRecovery.details')}
                            </summary>
                            <Code block dir="ltr">
                                {JSON.stringify(result ?? pending ?? proposal, null, 2)}
                            </Code>
                        </details>
                    )}
                    <details>
                        <summary className={classes.summary}>
                            {t('quotaRecovery.exposure.history')}
                        </summary>
                        <Stack gap="xs" mt="xs">
                            {history.isError && (
                                <Alert color="red" role="alert">
                                    {message(history.error)}
                                </Alert>
                            )}
                            {history.data?.entries.map((entry) => (
                                <Stack key={entry.requestId} gap={4}>
                                    <Text size="sm">
                                        {t('quotaRecovery.exposure.done', {
                                            value: number(entry.plan.scope.eligible)
                                        })}{' '}
                                        · {dateFormat.format(new Date(entry.createdAt))}
                                    </Text>
                                    <Code
                                        dir="ltr"
                                        style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}
                                    >
                                        {entry.requestId}
                                    </Code>
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
                    </details>
                </Stack>
            )}
        </details>
    )
}
