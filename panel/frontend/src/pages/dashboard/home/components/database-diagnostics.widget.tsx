import {
    ActionIcon,
    Alert,
    Badge,
    Group,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
    Title
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
    PiDatabaseDuotone,
    PiLightningDuotone,
    PiLockSimpleDuotone,
    PiPauseCircleDuotone,
    PiPlugsConnectedDuotone
} from 'react-icons/pi'
import { TbRefresh } from 'react-icons/tb'

import { instance } from '@shared/api/axios'
import { IMetricCardProps, MetricCardShared } from '@shared/ui/metrics/metric-card'

import { databaseDiagnosticValues, diagnosticsResponseSchema } from './database-diagnostics'

export const DATABASE_DIAGNOSTICS_QUERY_OPTIONS = {
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false
} as const

export function DatabaseDiagnosticsWidget() {
    const { t, i18n } = useTranslation()
    const query = useQuery({
        queryKey: ['system', 'diagnostics'],
        queryFn: async ({ signal }) => {
            const result = await instance.get('/api/system/diagnostics', { signal, timeout: 4000 })
            return diagnosticsResponseSchema.parse(result.data).response
        },
        ...DATABASE_DIAGNOSTICS_QUERY_OPTIONS
    })
    const snapshot = !query.isError ? query.data : undefined
    const database = snapshot?.status === 'ok' ? snapshot.database : null
    const values = databaseDiagnosticValues(database)
    const unavailable = !query.isPending && !database
    const partial = database && database.visibility !== 'complete'
    const warning = 'var(--mantine-color-yellow-text)'
    const metrics: IMetricCardProps[] = [
        {
            title: t('home-diagnostics.connections'),
            value: values.connections,
            IconComponent: PiPlugsConnectedDuotone,
            iconVariant: 'soft'
        },
        {
            title: t('home-diagnostics.active-queries'),
            value: values.activeQueries,
            IconComponent: PiLightningDuotone,
            iconVariant: 'soft',
            subtitle:
                database?.visibility === 'complete'
                    ? t('home-diagnostics.longest-query', { seconds: values.longestQuerySeconds })
                    : undefined,
            statusColor:
                database?.visibility === 'complete' && database.longestQuerySeconds >= 30
                    ? warning
                    : undefined
        },
        {
            title: t('home-diagnostics.lock-waits'),
            value: values.lockWaits,
            IconComponent: PiLockSimpleDuotone,
            iconVariant: 'soft',
            statusColor:
                database?.visibility === 'complete' && database.lockWaits > 0 ? warning : undefined
        },
        {
            title: t('home-diagnostics.idle-transactions'),
            value: values.idleInTransaction,
            IconComponent: PiPauseCircleDuotone,
            iconVariant: 'soft',
            statusColor:
                database?.visibility === 'complete' && database.idleInTransaction > 0
                    ? warning
                    : undefined
        }
    ]
    return (
        <Stack gap="xs" aria-busy={query.isPending}>
            <Group justify="space-between" gap="xs">
                <Group gap="xs">
                    <ThemeIcon aria-hidden="true" variant="light" size="md">
                        <PiDatabaseDuotone size={20} />
                    </ThemeIcon>
                    <Title order={4}>{t('home-diagnostics.title')}</Title>
                    {database && <Badge variant="light">PostgreSQL {database.version}</Badge>}
                </Group>
                <ActionIcon
                    aria-label={t('common.action.refresh')}
                    title={t('common.action.refresh')}
                    variant="light"
                    size={44}
                    loading={query.isFetching}
                    onClick={() => {
                        void query.refetch()
                    }}
                >
                    <TbRefresh size={20} />
                </ActionIcon>
            </Group>
            <Text size="xs" c="dimmed">
                {snapshot?.sampledAt
                    ? t('home-diagnostics.sampled', {
                          time: new Date(snapshot.sampledAt).toLocaleTimeString(
                              i18n.resolvedLanguage || 'en'
                          )
                      })
                    : t('home-diagnostics.scope')}
            </Text>
            {unavailable && (
                <Alert color="yellow" variant="light">
                    {t('home-diagnostics.unavailable')}
                </Alert>
            )}
            {partial && (
                <Alert color="yellow" variant="light">
                    {t('home-diagnostics.partial')}
                </Alert>
            )}
            <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="xs">
                {metrics.map((metric) => (
                    <MetricCardShared {...metric} isLoading={query.isPending} key={metric.title} />
                ))}
            </SimpleGrid>
        </Stack>
    )
}
