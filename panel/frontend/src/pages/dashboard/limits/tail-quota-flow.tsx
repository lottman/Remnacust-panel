import { Alert, Button, Checkbox, Loader, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import classes from './quota-recovery.module.css'
import {
    tailProblem,
    useExecuteTail,
    usePrepareTail,
    useTail,
    type TailBody
} from './tail-quota-flow.api'

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const storageKey = (node: string, generation: string, ack: string) =>
    `quota-tail:v1:${node}:${generation}:${ack}`
export function tailFactorToNano(value: string) {
    const text = value
        .trim()
        .replace(/[۰-۹٠-٩]/g, (character) =>
            String(
                '۰۱۲۳۴۵۶۷۸۹'.includes(character)
                    ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(character)
                    : '٠١٢٣٤٥٦٧٨٩'.indexOf(character)
            )
        )
        .replace(/[،٫,]/g, '.')
    if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,9})?$/.test(text) || text.length > 30) return null
    const [whole, fraction = ''] = text.split('.')
    const nano = BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, '0'))
    return nano <= 9223372036854775807n ? String(nano) : null
}
const factor = (nano: string) => {
    if (!/^(0|[1-9][0-9]{0,18})$/.test(nano)) return '1'
    const value = BigInt(nano),
        fraction = String(value % 1000000000n)
            .padStart(9, '0')
            .replace(/0+$/, '')
    return String(value / 1000000000n) + (fraction ? '.' + fraction : '')
}
function stored(key: string, generation: string): TailBody | undefined {
    try {
        const value = JSON.parse(localStorage.getItem(key) ?? 'null'),
            body = value?.body
        return value?.version === 1 &&
            body?.generation === generation &&
            typeof body.requestId === 'string' &&
            uuidPattern.test(body.requestId) &&
            typeof body.note === 'string' &&
            body.note.trim().length >= 10 &&
            body.note.length <= 2000 &&
            typeof body.consumptionMultiplier === 'string' &&
            /^(0|[1-9][0-9]{0,18})$/.test(body.consumptionMultiplier) &&
            BigInt(body.consumptionMultiplier) <= 9223372036854775807n
            ? {
                  generation: body.generation,
                  requestId: body.requestId,
                  consumptionMultiplier: body.consumptionMultiplier,
                  note: body.note
              }
            : undefined
    } catch {
        return undefined
    }
}
export function TailQuotaFlow({
    uuid,
    generation,
    acknowledgementRequest,
    multiplier,
    onNextSource
}: {
    uuid: string
    generation: string
    acknowledgementRequest: string
    multiplier: string
    onNextSource?: (request: string) => void
}) {
    const { t } = useTranslation()
    const key = storageKey(uuid, generation, acknowledgementRequest)
    const [opened, setOpened] = useState(false)
    const [intent, setIntent] = useState(() => stored(key, generation))
    const [price, setPrice] = useState(() => factor(intent?.consumptionMultiplier ?? multiplier))
    const [note, setNote] = useState(() => intent?.note ?? t('quotaRecovery.tail.defaultNote'))
    const [confirmed, setConfirmed] = useState(false)
    const [storageFailed, setStorageFailed] = useState(false)
    const details = useTail(uuid, acknowledgementRequest, generation, opened)
    const prepare = usePrepareTail(uuid, acknowledgementRequest),
        execute = useExecuteTail(uuid, acknowledgementRequest)
    const saved = details.data?.preparation ?? prepare.data
    const conflict =
        !!intent &&
        !!saved &&
        (intent.requestId !== saved.request ||
            intent.consumptionMultiplier !== saved.intent.consumptionMultiplier ||
            intent.note.trim() !== saved.intent.note)
    const sourceConflict = !!details.data?.sourceConflict
    const source = !sourceConflict
        ? (execute.data?.sourceRequest ?? details.data?.sourceRequest)
        : null
    const busy = prepare.isPending || execute.isPending || details.isFetching
    const locked = busy || !!intent || !!saved
    const error = source ? null : (execute.error ?? (saved ? null : prepare.error))
    const obtain = async () => {
        let operation = saved
        try {
            if (!operation) {
                const consumptionMultiplier = tailFactorToNano(price)
                if (consumptionMultiplier === null) return
                const body = intent ?? {
                    generation,
                    requestId: crypto.randomUUID(),
                    consumptionMultiplier,
                    note: note.trim()
                }
                try {
                    localStorage.setItem(key, JSON.stringify({ version: 1, body }))
                    setStorageFailed(false)
                } catch {
                    setStorageFailed(true)
                    return
                }
                setIntent(body)
                operation = await prepare.mutateAsync(body)
            }
            // Once SQL confirms the immutable intent it can be rediscovered by
            // ACK; local storage is no longer needed to preserve its identity.
            try {
                localStorage.removeItem(key)
            } catch {
                /* SQL owns this intent. */
            }
            setIntent(undefined)
            await execute.mutateAsync({ generation, request: operation.request })
        } catch {
            /* Keep the original intent or server preparation for retry. */
        }
    }
    return (
        <details
            onToggle={(event) => {
                if (event.currentTarget.open) setOpened(true)
            }}
        >
            <summary className={classes.summary}>{t('quotaRecovery.tail.title')}</summary>
            {opened && (
                <Stack gap="sm" mt="sm" className={`${classes.findings} ${classes.mobileControls}`}>
                    <Text size="sm" c="dimmed">
                        {t('quotaRecovery.tail.description')}
                    </Text>
                    <Alert color="yellow">{t('quotaRecovery.tail.paused')}</Alert>
                    <Button
                        size="xs"
                        variant="subtle"
                        loading={details.isFetching}
                        disabled={prepare.isPending || execute.isPending}
                        onClick={() => void details.refetch()}
                    >
                        {t('quotaRecovery.refresh')}
                    </Button>
                    {details.isPending && <Loader size="xs" />}
                    {details.isError && (
                        <Alert color="red">{t('quotaRecovery.tail.loadFailed')}</Alert>
                    )}
                    {sourceConflict && (
                        <Alert color="red">{t('quotaRecovery.tail.sourceConflict')}</Alert>
                    )}
                    {conflict && (
                        <>
                            <Alert color="yellow">{t('quotaRecovery.tail.savedConflict')}</Alert>
                            <Button
                                size="xs"
                                variant="subtle"
                                disabled={busy}
                                onClick={() => {
                                    try {
                                        localStorage.removeItem(key)
                                    } catch {
                                        setStorageFailed(true)
                                        return
                                    }
                                    setIntent(undefined)
                                    setConfirmed(false)
                                }}
                            >
                                {t('quotaRecovery.tail.useSaved')}
                            </Button>
                        </>
                    )}
                    {saved ? (
                        <Stack gap={4}>
                            <Text size="sm">
                                {t('quotaRecovery.tail.saved', {
                                    sequence: saved.plan.sample.sequence
                                })}
                            </Text>
                            <Text size="sm">
                                {t('quotaRecovery.tail.factor')}:{' '}
                                {factor(saved.intent.consumptionMultiplier)}×
                            </Text>
                            <Text size="sm">{saved.intent.note}</Text>
                            <details>
                                <summary className={classes.summary}>
                                    {t('quotaRecovery.details')}
                                </summary>
                                <Text size="xs" dir="ltr">
                                    {saved.request}
                                </Text>
                                <Text size="xs" dir="ltr">
                                    {saved.plan.sample.coreProcessId}
                                </Text>
                            </details>
                        </Stack>
                    ) : (
                        <>
                            <TextInput
                                label={t('quotaRecovery.tail.factor')}
                                description={t('quotaRecovery.tail.factorHelp')}
                                inputMode="decimal"
                                value={price}
                                maxLength={30}
                                disabled={locked}
                                onChange={(event) => setPrice(event.currentTarget.value)}
                                error={
                                    tailFactorToNano(price) === null
                                        ? t('quotaRecovery.tail.invalidFactor')
                                        : undefined
                                }
                            />
                            <Textarea
                                label={t('quotaRecovery.legacy.reason')}
                                description={t('quotaRecovery.tail.noteHelp')}
                                value={note}
                                maxLength={2000}
                                minRows={2}
                                autosize
                                disabled={locked}
                                onChange={(event) => setNote(event.currentTarget.value)}
                            />
                        </>
                    )}
                    {source ? (
                        <>
                            <Alert color="teal" role="status">
                                {t('quotaRecovery.tail.captured')}
                            </Alert>
                            <Button
                                size="xs"
                                variant="light"
                                disabled={!onNextSource || conflict}
                                onClick={() => onNextSource?.(source)}
                            >
                                {t('quotaRecovery.tail.open')}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Checkbox
                                label={t('quotaRecovery.tail.confirm')}
                                checked={confirmed}
                                disabled={busy || conflict || sourceConflict}
                                onChange={(event) => setConfirmed(event.currentTarget.checked)}
                            />
                            <Button
                                size="xs"
                                variant="light"
                                loading={prepare.isPending || execute.isPending}
                                disabled={
                                    !confirmed ||
                                    busy ||
                                    conflict ||
                                    sourceConflict ||
                                    details.isError ||
                                    !details.data ||
                                    (!saved &&
                                        !intent &&
                                        (tailFactorToNano(price) === null ||
                                            note.trim().length < 10))
                                }
                                onClick={() => void obtain()}
                            >
                                {t(
                                    saved || intent
                                        ? 'quotaRecovery.tail.retry'
                                        : 'quotaRecovery.tail.obtain'
                                )}
                            </Button>
                        </>
                    )}
                    {error && (
                        <Alert color="yellow" role="alert">
                            {t(`quotaRecovery.tail.errors.${tailProblem(error)}`)}
                        </Alert>
                    )}
                    {storageFailed && (
                        <Alert color="red" role="alert">
                            {t('quotaRecovery.held.storageFailed')}
                        </Alert>
                    )}
                </Stack>
            )}
        </details>
    )
}
