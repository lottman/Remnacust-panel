import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HeldQuotaPolicy } from './held-quota-policy'
import { LegacyQuotaRecovery } from './legacy-quota-recovery'
import { QuotaBanks } from './quota-bank'
import { QuotaReceipts } from './quota-receipts'
import { useCaptureQuotaReceipt } from './quota-receipts.api'
import { QuotaRecoveryHistory } from './quota-recovery-history'
import {
    useCheckQuotaRecovery,
    usePauseQuotaRecovery,
    useQuotaRecovery
} from './quota-recovery.api'
import classes from './quota-recovery.module.css'
import { QuotaRelease } from './quota-release'
import { RecoveryObligationsSummary } from './recovery-obligations-summary'

export function QuotaRecoveryPanel() {
    const { t, i18n } = useTranslation()
    const dateFormat = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
        [i18n.language]
    )
    const [after, setAfter] = useState<string>()
    const query = useQuotaRecovery(after)
    const check = useCheckQuotaRecovery()
    const capture = useCaptureQuotaReceipt()
    const pause = usePauseQuotaRecovery()
    const generation = query.data?.restore?.generation
    const previousGeneration = useRef<string | undefined>(undefined)
    useEffect(() => {
        if (!generation) return
        if (previousGeneration.current && previousGeneration.current !== generation)
            setAfter(undefined)
        previousGeneration.current = generation
    }, [generation])
    if (query.isError)
        return (
            <Alert color="yellow" title={t('quotaRecovery.loadFailed')} mb="md">
                <Button
                    variant="subtle"
                    loading={query.isFetching}
                    onClick={() => void query.refetch()}
                >
                    {t('quotaRecovery.refresh')}
                </Button>
            </Alert>
        )
    if (!query.data?.restore || query.data.restore.reconciledAt) return null
    const data = query.data
    const checkingNode = pause.isPending
        ? pause.variables.uuid
        : check.isPending
          ? check.variables.uuid
          : (data.checkingNode ?? data.nodes.find((node) => node.checking)?.uuid)
    return (
        <Card
            withBorder
            radius="lg"
            mb="lg"
            component="section"
            aria-labelledby="quota-recovery-title"
        >
            <Stack gap="md">
                <Group justify="space-between" align="flex-start" wrap="wrap">
                    <div className={classes.heading}>
                        <Title order={3} id="quota-recovery-title">
                            {t('quotaRecovery.title')}
                        </Title>
                        <Text size="sm" c="dimmed">
                            {t('quotaRecovery.description')}
                        </Text>
                    </div>
                    <Button
                        variant="light"
                        className={classes.action}
                        loading={query.isFetching}
                        onClick={() => void query.refetch()}
                    >
                        {t('quotaRecovery.refresh')}
                    </Button>
                </Group>
                <Alert color="yellow">{t('quotaRecovery.paused')}</Alert>
                <RecoveryObligationsSummary value={data.financial} />
                <QuotaBanks
                    key={`bank-${generation}`}
                    generation={data.restore!.generation}
                    dates={dateFormat}
                />
                <QuotaRelease key={`release-${generation}`} generation={data.restore!.generation} />
                <LegacyQuotaRecovery
                    key={data.restore!.generation}
                    generation={data.restore!.generation}
                    dates={dateFormat}
                />
                {checkingNode && !data.nodes.some((node) => node.uuid === checkingNode) && (
                    <Group gap="xs" role="status">
                        <Loader size="xs" aria-hidden="true" />
                        <Text size="sm">{t('quotaRecovery.checking')}</Text>
                    </Group>
                )}
                {(check.isError || pause.isError) && (
                    <Alert color="red" role="alert">
                        {t('quotaRecovery.checkFailed')}
                    </Alert>
                )}
                <details>
                    <summary className={classes.summary}>{t('quotaRecovery.nodes')}</summary>
                    <Stack gap="sm" mt="sm">
                        {data.nodes.length === 0 && (
                            <Text size="sm">{t('quotaRecovery.empty')}</Text>
                        )}
                        {data.nodes.map((node) => {
                            const active = checkingNode === node.uuid || node.checking
                            const report = node.report
                            const state = active
                                ? 'checking'
                                : !report
                                  ? 'unchecked'
                                  : report.issues.length
                                    ? 'differences'
                                    : 'matched'
                            return (
                                <Card key={node.uuid} withBorder radius="md" p="sm">
                                    <Stack gap="xs">
                                        <Group
                                            justify="space-between"
                                            align="flex-start"
                                            wrap="wrap"
                                        >
                                            <div className={classes.node}>
                                                <Text fw={600}>
                                                    {node.name ?? t('quotaRecovery.removedNode')}
                                                </Text>
                                                <Text size="xs" c="dimmed" dir="ltr">
                                                    {node.uuid}
                                                </Text>
                                            </div>
                                            <Group
                                                gap="xs"
                                                className={`${classes.action} ${classes.mobileControls}`}
                                                wrap="wrap"
                                            >
                                                <Button
                                                    size="xs"
                                                    variant="light"
                                                    color="yellow"
                                                    disabled={
                                                        !!checkingNode ||
                                                        query.isPlaceholderData ||
                                                        node.name === null ||
                                                        node.disabled === true ||
                                                        (report?.recoveryFence?.state ===
                                                            'FENCED' &&
                                                            report.recoveryFence.generation ===
                                                                data.restore!.generation)
                                                    }
                                                    loading={
                                                        pause.isPending &&
                                                        pause.variables.uuid === node.uuid
                                                    }
                                                    onClick={() =>
                                                        modals.openConfirmModal({
                                                            title: t(
                                                                'quotaRecovery.held.pauseTitle',
                                                                { name: node.name ?? node.uuid }
                                                            ),
                                                            children: (
                                                                <Text size="sm">
                                                                    {t(
                                                                        'quotaRecovery.held.pauseDescription'
                                                                    )}
                                                                </Text>
                                                            ),
                                                            labels: {
                                                                confirm: t(
                                                                    'quotaRecovery.held.pause'
                                                                ),
                                                                cancel: t(
                                                                    'quotaRecovery.held.cancel'
                                                                )
                                                            },
                                                            confirmProps: {
                                                                color: 'yellow',
                                                                mih: 44
                                                            },
                                                            cancelProps: {
                                                                mih: 44,
                                                                variant: 'subtle'
                                                            },
                                                            onConfirm: () =>
                                                                pause.mutate({
                                                                    uuid: node.uuid,
                                                                    generation:
                                                                        data.restore!.generation
                                                                })
                                                        })
                                                    }
                                                >
                                                    {t('quotaRecovery.held.pause')}
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    variant="light"
                                                    loading={
                                                        (check.isPending &&
                                                            check.variables.uuid === node.uuid) ||
                                                        node.checking
                                                    }
                                                    disabled={
                                                        !!checkingNode ||
                                                        active ||
                                                        query.isPlaceholderData
                                                    }
                                                    onClick={() =>
                                                        check.mutate({
                                                            uuid: node.uuid,
                                                            generation: data.restore!.generation
                                                        })
                                                    }
                                                    aria-label={t('quotaRecovery.checkNode', {
                                                        name: node.name ?? node.uuid
                                                    })}
                                                >
                                                    {t('quotaRecovery.check')}
                                                </Button>
                                            </Group>
                                        </Group>
                                        <Group gap="xs" aria-live="polite" aria-atomic="true">
                                            {active && <Loader size="xs" aria-hidden="true" />}
                                            <Badge
                                                color={
                                                    state === 'matched'
                                                        ? 'teal'
                                                        : state === 'differences'
                                                          ? 'yellow'
                                                          : 'gray'
                                                }
                                                variant="light"
                                            >
                                                {t(`quotaRecovery.${state}`)}
                                            </Badge>
                                            {report?.recoveryFence?.state === 'FENCED' && (
                                                <Text
                                                    size="xs"
                                                    c="yellow"
                                                    maw="100%"
                                                    className={classes.findings}
                                                >
                                                    {t('quotaRecovery.nodePaused')}
                                                </Text>
                                            )}
                                        </Group>
                                        {node.finishedAt && !active && (
                                            <Text size="xs" c="dimmed">
                                                {t('quotaRecovery.checkedAt', {
                                                    time: dateFormat.format(
                                                        new Date(node.finishedAt)
                                                    )
                                                })}
                                            </Text>
                                        )}
                                        {report && !active && (
                                            <details>
                                                <summary className={classes.summary}>
                                                    {t('quotaRecovery.details')}
                                                </summary>
                                                <Stack
                                                    gap="xs"
                                                    mt="xs"
                                                    className={classes.findings}
                                                >
                                                    <Text size="xs" c="dimmed">
                                                        {t('quotaRecovery.counts', {
                                                            database: report.databaseGrants,
                                                            node: report.nodeGrants ?? '—'
                                                        })}
                                                    </Text>
                                                    {report.issues.length > 0 ? (
                                                        <ul className={classes.issues}>
                                                            {report.issues.map((issue) => (
                                                                <li key={issue}>
                                                                    <Text size="sm">
                                                                        {t(
                                                                            `quotaRecovery.issues.${issue}`
                                                                        )}
                                                                    </Text>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <Text size="sm">
                                                            {t('quotaRecovery.matchedDescription')}
                                                        </Text>
                                                    )}
                                                </Stack>
                                            </details>
                                        )}
                                        <HeldQuotaPolicy
                                            key={`${node.uuid}-${data.restore!.generation}`}
                                            uuid={node.uuid}
                                            generation={data.restore!.generation}
                                            dates={dateFormat}
                                            canPrepare={
                                                !query.isPlaceholderData &&
                                                node.disabled === false &&
                                                report?.recoveryFence?.state === 'FENCED' &&
                                                report.recoveryFence.generation ===
                                                    data.restore!.generation
                                            }
                                        />
                                        <QuotaRecoveryHistory uuid={node.uuid} dates={dateFormat} />
                                        <QuotaReceipts
                                            uuid={node.uuid}
                                            generation={data.restore!.generation}
                                            dates={dateFormat}
                                            canCapture={
                                                node.name !== null && !query.isPlaceholderData
                                            }
                                            active={
                                                capture.isPending &&
                                                capture.variables.uuid === node.uuid
                                            }
                                            busy={capture.isPending}
                                            failed={
                                                capture.isError &&
                                                capture.variables.uuid === node.uuid
                                            }
                                            capture={() =>
                                                capture.mutate({
                                                    uuid: node.uuid,
                                                    generation: data.restore!.generation
                                                })
                                            }
                                        />
                                    </Stack>
                                </Card>
                            )
                        })}
                        <Group justify="space-between" wrap="wrap">
                            <Button
                                variant="subtle"
                                disabled={!after || query.isFetching}
                                onClick={() => setAfter(undefined)}
                            >
                                {t('quotaRecovery.first')}
                            </Button>
                            <Button
                                variant="light"
                                disabled={!data.nextAfter || query.isFetching}
                                onClick={() => setAfter(data.nextAfter ?? undefined)}
                            >
                                {t('quotaRecovery.next')}
                            </Button>
                        </Group>
                    </Stack>
                </details>
            </Stack>
        </Card>
    )
}
