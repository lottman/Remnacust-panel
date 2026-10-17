import { Alert, Badge, Button, Card, Checkbox, Group, Loader, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ExposureQuotaClosure } from './exposure-quota-closure'
import classes from './quota-recovery.module.css'
import {
    receiptAckCodeProblem,
    receiptAckMissing,
    receiptAckProblem,
    useDeliverReceiptAck,
    useReceiptAck,
    useReceiptAcks
} from './receipt-quota-ack.api'
import { TailQuotaFlow } from './tail-quota-flow'

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const storageKey = (uuid: string, generation: string, decision: string) =>
    `quota-receipt-ack:v1:${uuid}:${generation}:${decision}`
function storedIntent(key: string) {
    try {
        const value = JSON.parse(localStorage.getItem(key) ?? 'null')
        return value?.version === 1 &&
            typeof value.requestId === 'string' &&
            uuidPattern.test(value.requestId)
            ? (value.requestId as string)
            : undefined
    } catch {
        return undefined
    }
}
export function ReceiptQuotaAck({
    uuid,
    generation,
    decisionRequest,
    multiplier = '1000000000',
    emptyCore,
    onNextSource
}: {
    uuid: string
    generation: string
    decisionRequest: string
    emptyCore?: string
    multiplier?: string
    onNextSource?: (request: string) => void
}) {
    const { t, i18n } = useTranslation()
    const [opened, setOpened] = useState(false)
    const [listAfter, setListAfter] = useState<string>()
    const [attemptAfter, setAttemptAfter] = useState<string>()
    const [intent, setIntent] = useState(() =>
        storedIntent(storageKey(uuid, generation, decisionRequest))
    )
    const [selection, setSelection] = useState<string>()
    const [confirmed, setConfirmed] = useState(false)
    const [storageFailed, setStorageFailed] = useState(false)
    const jobs = useReceiptAcks(uuid, generation, decisionRequest, opened, listAfter)
    const selected =
        selection !== undefined
            ? selection || undefined
            : (intent ?? jobs.data?.entries[0]?.requestId)
    const first = jobs.data?.entries[0]?.requestId
    if (selection === undefined && !intent && first) setSelection(first)
    const details = useReceiptAck(uuid, selected, opened, attemptAfter)
    const intentDetails = useReceiptAck(uuid, intent, opened)
    const deliver = useDeliverReceiptAck(uuid)
    const currentMutation = deliver.variables?.requestId === selected
    const acknowledgement =
        details.data?.acknowledgement ?? (currentMutation ? deliver.data?.acknowledgement : null)
    const failed = currentMutation && deliver.isError
    const busy = deliver.isPending || !!details.data?.busy
    // Only an explicit request conflict permits another intent. An uncertain
    // transport result must retain the original ID even while viewing history.
    const replaceable = deliver.isError && receiptAckProblem(deliver.error) === 'conflict'
    const unresolved =
        !!intent &&
        !intentDetails.data?.acknowledgement &&
        !(intent === selected && acknowledgement) &&
        !(deliver.variables?.requestId === intent && (deliver.data || replaceable))
    const date = (value: string) =>
        new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(value)
        )
    const choose = (request: string) => {
        setSelection(request)
        setAttemptAfter(undefined)
        setConfirmed(false)
    }
    const submit = () => {
        const requestId = selected ?? crypto.randomUUID()
        try {
            localStorage.setItem(
                storageKey(uuid, generation, decisionRequest),
                JSON.stringify({ version: 1, requestId })
            )
            setStorageFailed(false)
        } catch {
            setStorageFailed(true)
            return
        }
        setIntent(requestId)
        setSelection(requestId)
        setAttemptAfter(undefined)
        deliver.mutate({ generation, requestId, decisionRequest })
    }
    return (
        <details
            onToggle={(event) => {
                if (event.currentTarget.open) setOpened(true)
            }}
        >
            <summary className={classes.summary}>{t('quotaRecovery.receiptAck.title')}</summary>
            {opened && (
                <Stack gap="sm" mt="sm" className={`${classes.findings} ${classes.mobileControls}`}>
                    <Text size="sm" c="dimmed">
                        {t('quotaRecovery.receiptAck.description')}
                    </Text>
                    <Alert color="yellow">{t('quotaRecovery.receiptAck.stillPaused')}</Alert>
                    <Button
                        size="xs"
                        variant="subtle"
                        loading={jobs.isFetching || details.isFetching}
                        onClick={() => {
                            void jobs.refetch()
                            if (selected) void details.refetch()
                            if (intent && intent !== selected) void intentDetails.refetch()
                        }}
                    >
                        {t('quotaRecovery.refresh')}
                    </Button>
                    {jobs.isPending && <Loader size="xs" />}
                    {jobs.isError && (
                        <Alert color="red">{t('quotaRecovery.receiptAck.loadFailed')}</Alert>
                    )}
                    {jobs.data?.entries.map((job) => (
                        <Button
                            key={job.requestId}
                            variant={selected === job.requestId ? 'light' : 'subtle'}
                            size="xs"
                            h="auto"
                            py="xs"
                            styles={{ label: { whiteSpace: 'normal', overflowWrap: 'anywhere' } }}
                            disabled={deliver.isPending}
                            onClick={() => choose(job.requestId)}
                        >
                            {t(
                                job.acknowledged
                                    ? 'quotaRecovery.held.saved'
                                    : 'quotaRecovery.held.pending',
                                { time: date(job.createdAt) }
                            )}
                        </Button>
                    ))}
                    {jobs.data && (listAfter || jobs.data.nextAfter) && (
                        <Group justify="space-between" wrap="wrap">
                            <Button
                                size="xs"
                                variant="subtle"
                                disabled={!listAfter || jobs.isFetching || deliver.isPending}
                                onClick={() => setListAfter(undefined)}
                            >
                                {t('quotaRecovery.first')}
                            </Button>
                            <Button
                                size="xs"
                                variant="subtle"
                                disabled={
                                    !jobs.data.nextAfter || jobs.isFetching || deliver.isPending
                                }
                                onClick={() => setListAfter(jobs.data?.nextAfter ?? undefined)}
                            >
                                {t('quotaRecovery.next')}
                            </Button>
                        </Group>
                    )}
                    {details.isFetching && <Loader size="xs" />}
                    {details.isError && (
                        <Alert color="yellow">
                            {t(
                                receiptAckMissing(details.error)
                                    ? 'quotaRecovery.receiptAck.notRecorded'
                                    : 'quotaRecovery.receiptAck.loadFailed'
                            )}
                        </Alert>
                    )}
                    {acknowledgement && (
                        <>
                            {emptyCore &&
                                emptyCore === acknowledgement.coreProcessId &&
                                !acknowledgement.journal.pending && (
                                    <ExposureQuotaClosure
                                        key={`${uuid}:${generation}`}
                                        uuid={uuid}
                                        generation={generation}
                                    />
                                )}
                            {selected && (
                                <TailQuotaFlow
                                    key={`${uuid}:${generation}:${selected}`}
                                    uuid={uuid}
                                    generation={generation}
                                    acknowledgementRequest={selected}
                                    multiplier={multiplier}
                                    onNextSource={onNextSource}
                                />
                            )}
                            <Alert color="teal" role="status">
                                {t('quotaRecovery.receiptAck.delivered', {
                                    sequence: acknowledgement.journal.acked
                                })}
                            </Alert>
                            {acknowledgement.journal.pending && (
                                <Alert color="yellow">
                                    {t('quotaRecovery.receiptAck.nextPacket', {
                                        sequence: acknowledgement.journal.pending.sequence
                                    })}
                                </Alert>
                            )}
                        </>
                    )}
                    {failed && (
                        <Alert color="yellow" role="alert">
                            {t(
                                `quotaRecovery.receiptAck.errors.${receiptAckProblem(deliver.error)}`
                            )}
                        </Alert>
                    )}
                    {storageFailed && (
                        <Alert color="red" role="alert">
                            {t('quotaRecovery.held.storageFailed')}
                        </Alert>
                    )}
                    {details.data && (
                        <details>
                            <summary className={classes.summary}>
                                {t('quotaRecovery.details')}
                            </summary>
                            <Stack gap="xs" mt="xs">
                                <Text size="xs" dir="ltr">
                                    {selected}
                                </Text>
                                <Text size="xs">{t('quotaRecovery.historyActor')}</Text>
                                <Text size="xs" dir="ltr">
                                    {details.data.actor}
                                </Text>
                                <Text size="xs">
                                    {t('quotaRecovery.receiptAck.originalPacket')}
                                </Text>
                                <Text size="xs" dir="ltr">
                                    {details.data.source.receipt.sequence} ·{' '}
                                    {details.data.source.receipt.coreProcessId}
                                </Text>
                                <Text size="xs" dir="ltr">
                                    SHA-256: {details.data.source.receipt.digest}
                                </Text>
                                <Text size="xs">{t('quotaRecovery.receiptAck.decision')}</Text>
                                <Text size="xs" dir="ltr">
                                    {details.data.decisionRequest}
                                </Text>
                            </Stack>
                        </details>
                    )}
                    {unresolved && intent !== selected && (
                        <Button size="xs" variant="light" onClick={() => choose(intent!)}>
                            {t('quotaRecovery.held.returnPending')}
                        </Button>
                    )}
                    {!acknowledgement && (
                        <>
                            <Checkbox
                                checked={confirmed}
                                disabled={busy}
                                label={t('quotaRecovery.receiptAck.confirm')}
                                onChange={(event) => setConfirmed(event.currentTarget.checked)}
                            />
                            <Button
                                size="xs"
                                variant="light"
                                loading={deliver.isPending}
                                disabled={
                                    !confirmed ||
                                    busy ||
                                    (unresolved && intent !== selected) ||
                                    (selected
                                        ? details.isFetching ||
                                          (details.isError && !receiptAckMissing(details.error))
                                        : !jobs.data || jobs.isFetching)
                                }
                                onClick={submit}
                            >
                                {t(
                                    selected
                                        ? 'quotaRecovery.receiptAck.retry'
                                        : 'quotaRecovery.receiptAck.deliver'
                                )}
                            </Button>
                        </>
                    )}
                    {failed && replaceable && !unresolved && (
                        <Button
                            size="xs"
                            variant="subtle"
                            disabled={busy}
                            onClick={() => {
                                setSelection('')
                                setIntent(undefined)
                                setAttemptAfter(undefined)
                                setConfirmed(false)
                                deliver.reset()
                            }}
                        >
                            {t('quotaRecovery.held.newOperation')}
                        </Button>
                    )}
                    {details.data && (
                        <Stack gap="xs">
                            <Text size="sm" fw={600}>
                                {t('quotaRecovery.held.attempts')}
                            </Text>
                            {details.data.attempts.map((attempt) => (
                                <Card key={attempt.id} withBorder p="xs" radius="sm">
                                    <Stack gap="xs">
                                        <Group justify="space-between" wrap="wrap">
                                            <Text size="xs">{date(attempt.requestedAt)}</Text>
                                            <Badge
                                                color={
                                                    attempt.details?.confirmed ? 'teal' : 'yellow'
                                                }
                                            >
                                                {t(
                                                    attempt.details?.confirmed
                                                        ? 'quotaRecovery.held.accepted'
                                                        : attempt.observedAt
                                                          ? 'quotaRecovery.held.failed'
                                                          : 'quotaRecovery.held.inProgress'
                                                )}
                                            </Badge>
                                        </Group>
                                        {attempt.payload?.coreProcessId && (
                                            <Text size="xs" dir="ltr">
                                                {attempt.payload.coreProcessId}
                                            </Text>
                                        )}
                                        {attempt.details?.error && (
                                            <Text size="xs">
                                                {t(
                                                    `quotaRecovery.receiptAck.errors.${receiptAckCodeProblem(attempt.details.error)}`
                                                )}
                                            </Text>
                                        )}
                                    </Stack>
                                </Card>
                            ))}
                            {(attemptAfter || details.data.nextAfter) && (
                                <Group justify="space-between" wrap="wrap">
                                    <Button
                                        size="xs"
                                        variant="subtle"
                                        disabled={!attemptAfter || details.isFetching || busy}
                                        onClick={() => setAttemptAfter(undefined)}
                                    >
                                        {t('quotaRecovery.first')}
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="subtle"
                                        disabled={
                                            !details.data.nextAfter || details.isFetching || busy
                                        }
                                        onClick={() =>
                                            setAttemptAfter(details.data?.nextAfter ?? undefined)
                                        }
                                    >
                                        {t('quotaRecovery.next')}
                                    </Button>
                                </Group>
                            )}
                        </Stack>
                    )}
                </Stack>
            )}
        </details>
    )
}
