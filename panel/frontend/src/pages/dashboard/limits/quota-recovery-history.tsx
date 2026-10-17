import { Alert, Badge, Button, Card, Group, Loader, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useDownloadQuotaEvidence, useQuotaRecoveryHistory } from './quota-recovery.api'
import classes from './quota-recovery.module.css'

export function QuotaRecoveryHistory({
    uuid,
    dates
}: {
    uuid: string
    dates: Intl.DateTimeFormat
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [after, setAfter] = useState<string>()
    const history = useQuotaRecoveryHistory(uuid, open, after)
    const download = useDownloadQuotaEvidence(uuid)
    return (
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
            <summary className={classes.summary}>{t('quotaRecovery.historyTitle')}</summary>
            {open && (
                <Stack gap="sm" mt="sm" className={classes.findings}>
                    <Text size="sm" c="dimmed">
                        {t('quotaRecovery.historyDescription')}
                    </Text>
                    <Button
                        size="xs"
                        variant="subtle"
                        className={classes.action}
                        loading={history.isFetching}
                        onClick={() => void history.refetch()}
                    >
                        {t('quotaRecovery.refresh')}
                    </Button>
                    {history.isPending && <Loader size="xs" />}
                    {history.isError && (
                        <Alert color="red">{t('quotaRecovery.historyFailed')}</Alert>
                    )}
                    {download.isError && (
                        <Alert color="red">{t('quotaRecovery.historyDownloadFailed')}</Alert>
                    )}
                    {history.data?.entries.length === 0 && (
                        <Text size="sm">{t('quotaRecovery.historyEmpty')}</Text>
                    )}
                    {history.data?.entries.map((entry) => (
                        <Card key={entry.id} withBorder p="sm" radius="md">
                            <Stack gap="xs">
                                <Group justify="space-between" wrap="wrap">
                                    <Text size="sm" fw={600}>
                                        {t('quotaRecovery.historySaved', {
                                            time: dates.format(new Date(entry.createdAt))
                                        })}
                                    </Text>
                                    <Badge
                                        variant="light"
                                        color={entry.report.issues.length ? 'yellow' : 'gray'}
                                    >
                                        {t(
                                            entry.report.issues.length
                                                ? 'quotaRecovery.differences'
                                                : 'quotaRecovery.matched'
                                        )}
                                    </Badge>
                                </Group>
                                <Text size="xs" c="dimmed">
                                    {t('quotaRecovery.historyCounts', {
                                        node: entry.journalMetadata.entries,
                                        database: entry.sqlRows
                                    })}
                                </Text>
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
                                        <Text size="xs">SHA-256</Text>
                                        <Text size="xs" dir="ltr">
                                            {entry.journalDigest}
                                        </Text>
                                    </Stack>
                                </details>
                                <Button
                                    size="xs"
                                    variant="light"
                                    className={classes.action}
                                    disabled={download.isPending}
                                    aria-label={`${t('quotaRecovery.historyDownload')} ${dates.format(new Date(entry.createdAt))}`}
                                    loading={
                                        download.isPending && download.variables.id === entry.id
                                    }
                                    onClick={() =>
                                        download.mutate({
                                            id: entry.id,
                                            digest: entry.journalDigest
                                        })
                                    }
                                >
                                    {t('quotaRecovery.historyDownload')}
                                </Button>
                            </Stack>
                        </Card>
                    ))}
                    <Group
                        justify="space-between"
                        wrap="wrap"
                        role="group"
                        aria-label={t('quotaRecovery.historyTitle')}
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
