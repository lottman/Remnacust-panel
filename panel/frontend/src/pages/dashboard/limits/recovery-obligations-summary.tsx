import type { QuotaRecoveryStatus } from './quota-recovery.api'

import { Alert, Group, Stack, Text } from '@mantine/core'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import classes from './quota-recovery.module.css'

export function RecoveryObligationsSummary({ value }: { value: QuotaRecoveryStatus['financial'] }) {
    const { t, i18n } = useTranslation()
    const format = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])
    const labels = {
        unsettledReserves: t('quotaRecovery.obligations.unsettledReserves'),
        exposures: t('quotaRecovery.obligations.exposures'),
        nativeTickets: t('quotaRecovery.obligations.nativeTickets'),
        nativeEffects: t('quotaRecovery.obligations.nativeEffects'),
        legacyStreams: t('quotaRecovery.obligations.legacyStreams'),
        legacyJobs: t('quotaRecovery.obligations.legacyJobs'),
        recoveryDeliveries: t('quotaRecovery.obligations.recoveryDeliveries'),
        activeWorkers: t('quotaRecovery.obligations.activeWorkers')
    }
    const entries = Object.entries(labels) as [keyof typeof labels, string][]
    const known = value && entries.every(([key]) => /^(0|[1-9][0-9]{0,18})$/.test(value[key] ?? ''))
    return (
        <details>
            <summary className={classes.summary}>{t('quotaRecovery.obligations.title')}</summary>
            <Stack gap="xs" mt="sm">
                <Text size="sm" c="dimmed">
                    {t('quotaRecovery.obligations.description')}
                </Text>
                {!known ? (
                    <Alert color="yellow">{t('quotaRecovery.obligations.unknown')}</Alert>
                ) : (
                    entries.map(([key, label]) => (
                        <Group
                            key={key}
                            justify="space-between"
                            align="flex-start"
                            wrap="nowrap"
                            gap="sm"
                        >
                            <Text size="sm" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                                {label}
                            </Text>
                            <Text size="sm" fw={600} style={{ flexShrink: 0 }}>
                                {format.format(BigInt(value[key]))}
                            </Text>
                        </Group>
                    ))
                )}
            </Stack>
        </details>
    )
}
