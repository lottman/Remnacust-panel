import { Alert, Badge, Button, Card, Checkbox, Group, Loader, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
    heldPolicyCanReplace,
    heldPolicyCodeProblem,
    heldPolicyMissing,
    heldPolicyProblem,
    useHeldPolicies,
    useHeldPolicy,
    useStageHeldPolicy
} from './held-quota-policy.api'
import classes from './quota-recovery.module.css'

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const storageKey = (uuid: string, generation: string) =>
    `quota-held-policy:v1:${uuid}:${generation}`
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
export function HeldQuotaPolicy({
    uuid,
    generation,
    dates,
    canPrepare
}: {
    uuid: string
    generation: string
    dates: Intl.DateTimeFormat
    canPrepare: boolean
}) {
    const { t } = useTranslation()
    const [opened, setOpened] = useState(false)
    const [listAfter, setListAfter] = useState<string>()
    const [attemptAfter, setAttemptAfter] = useState<string>()
    const [intent, setIntent] = useState(() => storedIntent(storageKey(uuid, generation)))
    const [selection, setSelection] = useState<string>()
    const [confirmed, setConfirmed] = useState(false)
    const [storageFailed, setStorageFailed] = useState(false)
    const jobs = useHeldPolicies(uuid, generation, opened, listAfter)
    const selected =
        selection !== undefined
            ? selection || undefined
            : (intent ?? jobs.data?.entries[0]?.requestId)
    const firstSavedRequest = jobs.data?.entries[0]?.requestId
    if (selection === undefined && !intent && firstSavedRequest) setSelection(firstSavedRequest)
    const details = useHeldPolicy(uuid, selected, opened, attemptAfter)
    const intentDetails = useHeldPolicy(uuid, intent, opened)
    const stage = useStageHeldPolicy(uuid)
    const currentMutation = stage.variables?.requestId === selected
    const acknowledgement =
        details.data?.acknowledgement ?? (currentMutation ? stage.data?.acknowledgement : null)
    const failed = currentMutation && stage.isError
    const busy = stage.isPending || !!details.data?.busy
    const unresolvedIntent =
        !!intent &&
        !intentDetails.data?.acknowledgement &&
        !(intent === selected && acknowledgement) &&
        !(
            stage.variables?.requestId === intent &&
            (stage.data || (stage.isError && heldPolicyCanReplace(stage.error)))
        )
    const mayReplace =
        !unresolvedIntent && (!!acknowledgement || (failed && heldPolicyCanReplace(stage.error)))
    const date = (value: string) => dates.format(new Date(value))
    const choose = (request: string) => {
        setSelection(request)
        setAttemptAfter(undefined)
        setConfirmed(false)
    }
    const submit = () => {
        const requestId = selected ?? crypto.randomUUID()
        // Persist before POST; a lost reply must never silently mint a new ID.
        try {
            localStorage.setItem(
                storageKey(uuid, generation),
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
        stage.mutate({ generation, requestId })
    }
    return (
        <details
            onToggle={(event) => {
                if (event.currentTarget.open) setOpened(true)
            }}
        >
            <summary className={classes.summary}>{t('quotaRecovery.held.title')}</summary>
            {opened && (
                <Stack gap="sm" mt="sm" className={`${classes.findings} ${classes.mobileControls}`}>
                    <Text size="sm" c="dimmed">
                        {t('quotaRecovery.held.description')}
                    </Text>
                    <Alert color="yellow">{t('quotaRecovery.held.stillPaused')}</Alert>
                    <Button
                        size="xs"
                        variant="subtle"
                        loading={jobs.isFetching || details.isFetching}
                        onClick={() => {
                            void jobs.refetch()
                            if (selected) void details.refetch()
                        }}
                    >
                        {t('quotaRecovery.refresh')}
                    </Button>
                    {jobs.isPending && <Loader size="xs" />}
                    {jobs.isError && (
                        <Alert color="red">{t('quotaRecovery.held.loadFailed')}</Alert>
                    )}
                    {jobs.data?.entries.map((job) => (
                        <Button
                            key={job.requestId}
                            variant={selected === job.requestId ? 'light' : 'subtle'}
                            size="xs"
                            h="auto"
                            py="xs"
                            styles={{ label: { whiteSpace: 'normal', overflowWrap: 'anywhere' } }}
                            disabled={stage.isPending}
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
                                disabled={!listAfter || jobs.isFetching || stage.isPending}
                                onClick={() => setListAfter(undefined)}
                            >
                                {t('quotaRecovery.first')}
                            </Button>
                            <Button
                                size="xs"
                                variant="subtle"
                                disabled={
                                    !jobs.data.nextAfter || jobs.isFetching || stage.isPending
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
                                heldPolicyMissing(details.error)
                                    ? 'quotaRecovery.held.notRecorded'
                                    : 'quotaRecovery.held.loadFailed'
                            )}
                        </Alert>
                    )}
                    {acknowledgement && (
                        <Alert color="teal" role="status">
                            {t('quotaRecovery.held.delivered', {
                                revision: acknowledgement.policyRevision
                            })}
                        </Alert>
                    )}
                    {failed && (
                        <Alert color="yellow" role="alert">
                            {t(`quotaRecovery.held.errors.${heldPolicyProblem(stage.error)}`)}
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
                                <Text size="xs">{t('quotaRecovery.held.revision')}</Text>
                                <Text size="xs" dir="ltr">
                                    {details.data.payload.policyRevision}
                                </Text>
                                <Text size="xs">{t('quotaRecovery.held.core')}</Text>
                                <Text size="xs" dir="ltr">
                                    {details.data.payload.coreProcessId}
                                </Text>
                            </Stack>
                        </details>
                    )}
                    {unresolvedIntent && intent !== selected && (
                        <Button size="xs" variant="light" onClick={() => choose(intent!)}>
                            {t('quotaRecovery.held.returnPending')}
                        </Button>
                    )}
                    {!acknowledgement && (
                        <>
                            {!canPrepare && !selected && (
                                <Text size="sm" c="dimmed">
                                    {t('quotaRecovery.held.pauseFirst')}
                                </Text>
                            )}
                            <Checkbox
                                label={t('quotaRecovery.held.confirm')}
                                checked={confirmed}
                                disabled={busy}
                                onChange={(event) => setConfirmed(event.currentTarget.checked)}
                            />
                            <Button
                                size="xs"
                                variant="light"
                                loading={stage.isPending}
                                disabled={
                                    !confirmed ||
                                    busy ||
                                    (unresolvedIntent && intent !== selected) ||
                                    (selected
                                        ? details.isFetching ||
                                          (details.isError && !heldPolicyMissing(details.error))
                                        : !canPrepare || !jobs.data || jobs.isFetching)
                                }
                                onClick={submit}
                            >
                                {t(
                                    selected
                                        ? 'quotaRecovery.held.retry'
                                        : 'quotaRecovery.held.prepare'
                                )}
                            </Button>
                        </>
                    )}
                    {mayReplace && (
                        <Button
                            size="xs"
                            variant="subtle"
                            disabled={!canPrepare || busy}
                            onClick={() => {
                                setSelection('')
                                setIntent(undefined)
                                setAttemptAfter(undefined)
                                setConfirmed(false)
                                stage.reset()
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
                                        {attempt.details?.error && (
                                            <Text size="xs">
                                                {t(
                                                    `quotaRecovery.held.errors.${heldPolicyCodeProblem(attempt.details.error)}`
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
                                        disabled={!attemptAfter || details.isFetching}
                                        onClick={() => setAttemptAfter(undefined)}
                                    >
                                        {t('quotaRecovery.first')}
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="subtle"
                                        disabled={!details.data.nextAfter || details.isFetching}
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
