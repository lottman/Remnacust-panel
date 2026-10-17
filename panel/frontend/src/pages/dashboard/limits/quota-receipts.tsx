import { Alert, Badge, Button, Card, Group, Loader, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NativeQuotaImport } from './native-quota-recovery'
import { useDownloadQuotaReceipt, useQuotaReceipts } from './quota-receipts.api'
import classes from './quota-recovery.module.css'

export function QuotaReceipts({
    uuid,
    generation,
    dates,
    canCapture,
    active,
    busy,
    failed,
    capture
}: {
    uuid: string
    generation: string
    dates: Intl.DateTimeFormat
    canCapture: boolean
    active: boolean
    busy: boolean
    failed: boolean
    capture: () => void
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [visited, setVisited] = useState(false)
    const [after, setAfter] = useState<string>()
    const history = useQuotaReceipts(uuid, open, active, after)
    const download = useDownloadQuotaReceipt(uuid)
    return (
        <details
            onToggle={(event) => {
                setOpen(event.currentTarget.open)
                if (event.currentTarget.open) setVisited(true)
            }}
        >
            <summary className={classes.summary}>{t('quotaRecovery.receipts.title')}</summary>
            {visited && (
                <Stack gap="sm" mt="sm" className={classes.findings}>
                    <Text size="sm" c="dimmed">
                        {t('quotaRecovery.receipts.description')}
                    </Text>
                    <Group wrap="wrap">
                        <Button
                            size="xs"
                            variant="light"
                            className={classes.action}
                            disabled={busy || !canCapture}
                            loading={active}
                            onClick={capture}
                        >
                            {t('quotaRecovery.receipts.capture')}
                        </Button>
                        <Button
                            size="xs"
                            variant="subtle"
                            className={classes.action}
                            loading={history.isFetching}
                            onClick={() => void history.refetch()}
                        >
                            {t('quotaRecovery.refresh')}
                        </Button>
                    </Group>
                    {failed && (
                        <Alert color="red">{t('quotaRecovery.receipts.captureFailed')}</Alert>
                    )}
                    {history.isPending && <Loader size="xs" />}
                    {history.isError && (
                        <Alert color="red">{t('quotaRecovery.historyFailed')}</Alert>
                    )}
                    {download.isError && (
                        <Alert color="red">{t('quotaRecovery.historyDownloadFailed')}</Alert>
                    )}
                    {history.data?.entries.length === 0 && (
                        <Text size="sm">{t('quotaRecovery.receipts.empty')}</Text>
                    )}
                    {history.data?.entries.map((entry) => {
                        const pending = entry.metadata?.pending
                        const state =
                            entry.state === 'PRESENT' && !pending
                                ? 'NO_PENDING'
                                : entry.state === 'UNAVAILABLE' &&
                                    entry.reason === 'INVALID_RESPONSE'
                                  ? 'UNVERIFIED'
                                  : entry.state
                        return (
                            <Card key={entry.requestId} withBorder p="sm" radius="md">
                                <Stack gap="xs">
                                    <Text size="sm" fw={600}>
                                        {t('quotaRecovery.receipts.requested', {
                                            time: dates.format(new Date(entry.createdAt))
                                        })}
                                    </Text>
                                    <Badge
                                        variant="light"
                                        color={
                                            state === 'PRESENT'
                                                ? 'teal'
                                                : state === 'INVALID' ||
                                                    state === 'UNAVAILABLE' ||
                                                    state === 'UNVERIFIED'
                                                  ? 'red'
                                                  : 'gray'
                                        }
                                    >
                                        {t(`quotaRecovery.receipts.states.${state}`)}
                                    </Badge>
                                    {entry.sourceBytes !== null && (
                                        <Text size="xs">
                                            {t('quotaRecovery.receipts.bytes', {
                                                count: entry.sourceBytes
                                            })}
                                        </Text>
                                    )}
                                    {pending && (
                                        <Text size="xs">
                                            {t('quotaRecovery.receipts.counters', {
                                                count: pending.counters
                                            })}
                                        </Text>
                                    )}
                                    <details>
                                        <summary className={classes.summary}>
                                            {t('quotaRecovery.details')}
                                        </summary>
                                        <Stack gap="xs" mt="xs">
                                            <Text size="xs">
                                                {t('quotaRecovery.historyGeneration')}
                                            </Text>
                                            <Text size="xs" dir="ltr">
                                                {entry.generation}
                                            </Text>
                                            <Text size="xs">{t('quotaRecovery.historyActor')}</Text>
                                            <Text size="xs" dir="ltr">
                                                {entry.actorUuid}
                                            </Text>
                                            {entry.metadata && (
                                                <>
                                                    <Text size="xs">
                                                        {t('quotaRecovery.receipts.stream')}
                                                    </Text>
                                                    <Text size="xs" dir="ltr">
                                                        {entry.metadata.stream}
                                                    </Text>
                                                    <Text size="xs">
                                                        {t('quotaRecovery.receipts.acked', {
                                                            sequence: entry.metadata.acked
                                                        })}
                                                    </Text>
                                                </>
                                            )}
                                            {pending && (
                                                <>
                                                    <Text size="xs">
                                                        {t('quotaRecovery.receipts.sequence', {
                                                            sequence: pending.sequence
                                                        })}
                                                    </Text>
                                                    <Text size="xs">
                                                        {t('quotaRecovery.receipts.core')}
                                                    </Text>
                                                    <Text size="xs" dir="ltr">
                                                        {pending.coreProcessId}
                                                    </Text>
                                                </>
                                            )}
                                            {entry.digest && (
                                                <>
                                                    <Text size="xs">SHA-256</Text>
                                                    <Text size="xs" dir="ltr">
                                                        {entry.digest}
                                                    </Text>
                                                </>
                                            )}
                                        </Stack>
                                    </details>
                                    {state === 'PRESENT' && pending && (
                                        <NativeQuotaImport
                                            key={`${generation}:${entry.requestId}`}
                                            uuid={uuid}
                                            generation={generation}
                                            request={entry.requestId}
                                        />
                                    )}
                                    <Button
                                        size="xs"
                                        variant="light"
                                        className={classes.action}
                                        disabled={!entry.digest || download.isPending}
                                        loading={
                                            download.isPending &&
                                            download.variables.requestId === entry.requestId
                                        }
                                        onClick={() =>
                                            entry.digest &&
                                            download.mutate({
                                                requestId: entry.requestId,
                                                digest: entry.digest
                                            })
                                        }
                                    >
                                        {t('quotaRecovery.receipts.download')}
                                    </Button>
                                </Stack>
                            </Card>
                        )
                    })}
                    <Group
                        justify="space-between"
                        wrap="wrap"
                        role="group"
                        aria-label={t('quotaRecovery.receipts.title')}
                    >
                        <Button
                            size="xs"
                            variant="subtle"
                            disabled={!after || history.isFetching}
                            onClick={() => setAfter(undefined)}
                        >
                            {t('quotaRecovery.first')}
                        </Button>
                        <Button
                            size="xs"
                            variant="light"
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
