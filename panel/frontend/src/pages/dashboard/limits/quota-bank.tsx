import { Alert, Badge, Button, Card, Group, Loader, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
    QuotaBank,
    quotaBankProblem,
    useCaptureQuotaBank,
    useCompareQuotaBank,
    useDownloadQuotaBank,
    useQuotaBankParts,
    useQuotaBanks
} from './quota-bank.api'
import classes from './quota-recovery.module.css'

function BankParts({ request }: { request: string }) {
    const { t } = useTranslation(),
        [open, setOpen] = useState(false),
        [after, setAfter] = useState<number>()
    const parts = useQuotaBankParts(request, open, after),
        download = useDownloadQuotaBank(request)
    return (
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
            <summary className={classes.summary}>{t('quotaRecovery.bank.files')}</summary>
            {open && (
                <Stack gap="xs" mt="xs">
                    {parts.isPending && <Loader size="xs" />}
                    {(parts.isError || download.isError) && (
                        <Alert color="red">{t('quotaRecovery.bank.failed')}</Alert>
                    )}
                    {parts.data?.entries.map((part) => (
                        <Group key={part.ordinal} justify="space-between" wrap="wrap">
                            <Text size="xs">
                                {t('quotaRecovery.bank.part', {
                                    value: part.ordinal + 1,
                                    rows: part.rows
                                })}
                            </Text>
                            <Button
                                size="xs"
                                variant="subtle"
                                disabled={download.isPending}
                                onClick={() => download.mutate(part.digest)}
                            >
                                {t('quotaRecovery.bank.download')}
                            </Button>
                        </Group>
                    ))}
                    <Group justify="space-between" wrap="wrap">
                        <Button
                            size="xs"
                            variant="subtle"
                            disabled={after === undefined || parts.isFetching}
                            onClick={() => setAfter(undefined)}
                        >
                            {t('quotaRecovery.first')}
                        </Button>
                        <Button
                            size="xs"
                            variant="subtle"
                            disabled={parts.data?.nextAfter == null || parts.isFetching}
                            onClick={() => setAfter(parts.data?.nextAfter ?? undefined)}
                        >
                            {t('quotaRecovery.next')}
                        </Button>
                    </Group>
                </Stack>
            )}
        </details>
    )
}
function BankEntry({
    bank,
    generation,
    dates
}: {
    bank: QuotaBank
    generation: string
    dates: Intl.DateTimeFormat
}) {
    const { t } = useTranslation(),
        compare = useCompareQuotaBank(bank.requestId)
    return (
        <Card withBorder p="sm" radius="md">
            <Stack gap="xs" className={classes.findings}>
                <Text size="sm" fw={600}>
                    {dates.format(new Date(bank.createdAt))}
                </Text>
                <Text size="xs">
                    {t('quotaRecovery.bank.counts', { rows: bank.rowCount, parts: bank.partCount })}
                </Text>
                {bank.generation !== generation && (
                    <Badge variant="light" color="gray">
                        {t('quotaRecovery.bank.previousGeneration')}
                    </Badge>
                )}
                <Button
                    size="xs"
                    variant="light"
                    disabled={bank.generation !== generation}
                    loading={compare.isPending}
                    onClick={() => compare.mutate(generation)}
                >
                    {t('quotaRecovery.bank.compare')}
                </Button>
                {compare.isError && (
                    <Alert color="red">
                        {t(`quotaRecovery.bank.${quotaBankProblem(compare.error)}`)}
                    </Alert>
                )}
                {compare.data && (
                    <Alert color={compare.data.matches ? 'teal' : 'yellow'}>
                        {t(
                            compare.data.matches
                                ? 'quotaRecovery.bank.matches'
                                : 'quotaRecovery.bank.changed'
                        )}
                    </Alert>
                )}
                <BankParts request={bank.requestId} />
                <details>
                    <summary className={classes.summary}>{t('quotaRecovery.bank.audit')}</summary>
                    <Stack gap={4} mt="xs">
                        <Text size="xs">{t('quotaRecovery.historyActor')}</Text>
                        <Text size="xs" dir="ltr">
                            {bank.actorUuid}
                        </Text>
                        <Text size="xs">{t('quotaRecovery.historyGeneration')}</Text>
                        <Text size="xs" dir="ltr">
                            {bank.generation}
                        </Text>
                        <Text size="xs" dir="ltr">
                            {bank.sourceDigest}
                        </Text>
                    </Stack>
                </details>
            </Stack>
        </Card>
    )
}
export function QuotaBanks({
    generation,
    dates
}: {
    generation: string
    dates: Intl.DateTimeFormat
}) {
    const { t } = useTranslation(),
        [open, setOpen] = useState(false),
        [after, setAfter] = useState<string>(),
        [request, setRequest] = useState(() => crypto.randomUUID())
    const banks = useQuotaBanks(generation, open, after),
        capture = useCaptureQuotaBank()
    return (
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
            <summary className={classes.summary}>{t('quotaRecovery.bank.title')}</summary>
            {open && (
                <Stack gap="sm" mt="sm" className={classes.findings}>
                    <Text size="sm" c="dimmed">
                        {t('quotaRecovery.bank.description')}
                    </Text>
                    <Group wrap="wrap">
                        <Button
                            size="xs"
                            variant="light"
                            loading={capture.isPending}
                            onClick={() =>
                                capture.mutate(
                                    { generation, requestId: request },
                                    {
                                        onSuccess: () => {
                                            setRequest(crypto.randomUUID())
                                            setAfter(undefined)
                                        }
                                    }
                                )
                            }
                        >
                            {t(
                                capture.isError
                                    ? 'quotaRecovery.bank.retry'
                                    : 'quotaRecovery.bank.capture'
                            )}
                        </Button>
                        <Button
                            size="xs"
                            variant="subtle"
                            loading={banks.isFetching}
                            onClick={() => void banks.refetch()}
                        >
                            {t('quotaRecovery.refresh')}
                        </Button>
                    </Group>
                    {capture.isError && (
                        <Alert color="red">
                            {t(`quotaRecovery.bank.${quotaBankProblem(capture.error)}`)}
                        </Alert>
                    )}
                    {banks.isPending && <Loader size="xs" />}
                    {banks.isError && <Alert color="red">{t('quotaRecovery.bank.failed')}</Alert>}
                    {banks.data?.entries.length === 0 && (
                        <Text size="sm">{t('quotaRecovery.bank.empty')}</Text>
                    )}
                    {banks.data?.entries.map((bank) => (
                        <BankEntry
                            key={bank.requestId}
                            bank={bank}
                            generation={generation}
                            dates={dates}
                        />
                    ))}
                    <Alert color="yellow">{t('quotaRecovery.bank.stillPaused')}</Alert>
                    <Group justify="space-between" wrap="wrap">
                        <Button
                            size="xs"
                            variant="subtle"
                            disabled={!after || banks.isFetching}
                            onClick={() => setAfter(undefined)}
                        >
                            {t('quotaRecovery.first')}
                        </Button>
                        <Button
                            size="xs"
                            variant="light"
                            disabled={!banks.data?.nextAfter || banks.isFetching}
                            onClick={() => setAfter(banks.data?.nextAfter ?? undefined)}
                        >
                            {t('quotaRecovery.next')}
                        </Button>
                    </Group>
                </Stack>
            )}
        </details>
    )
}
