import { Grid } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { FaServer } from 'react-icons/fa'
import { MdPayment, MdTrendingUp } from 'react-icons/md'
import { TbAlertTriangle } from 'react-icons/tb'

import { useGetInfraBillingNodes } from '@shared/api/hooks'
import { IMetricCardProps, MetricCardShared } from '@shared/ui/metrics/metric-card'
import { formatCurrency } from '@shared/utils/misc'

import { getBillingDateStatus } from '../billing-date-status'
import classes from '../billing-date-status.module.css'
import { useBillingToday } from '../use-billing-today'

export function StatsWidget() {
    const { data: nodes, isLoading } = useGetInfraBillingNodes()
    const { t, i18n } = useTranslation()

    const today = useBillingToday()
    const currentMonthOnly = new Intl.DateTimeFormat(i18n.language, {
        month: 'long',
        calendar: 'gregory',
        timeZone: 'UTC'
    }).format(today)
    const billingNodes = nodes?.billingNodes ?? []

    const overdueCount = billingNodes.filter(
        (node) => getBillingDateStatus(node.nextBillingAt, today).state === 'overdue'
    ).length

    const stats: IMetricCardProps[] = [
        {
            title: t('common.message.overdue'),
            statusColor: overdueCount > 0 ? 'var(--billing-overdue-ink)' : undefined,
            value: overdueCount,
            subtitle:
                overdueCount > 0
                    ? t('stats.widget.payment-overdue')
                    : t('stats.widget.all-up-to-date'),
            IconComponent: TbAlertTriangle,
            iconColor: overdueCount > 0 ? 'red' : 'teal',
            iconVariant: 'soft'
        },
        {
            title: t('stats.widget.upcoming-in', { month: currentMonthOnly }),
            value: nodes?.stats.upcomingNodesCount ?? 0,
            subtitle: t('stats.widget.nodes-pending-payment'),
            IconComponent: FaServer,
            iconColor: 'orange',
            iconVariant: 'soft'
        },
        {
            title: t('stats.widget.payments-in', { month: currentMonthOnly }),
            value: formatCurrency(nodes?.stats.currentMonthPayments ?? 0),
            subtitle: t('stats.widget.total-payments-made'),
            IconComponent: MdPayment,
            iconColor: 'green',
            iconVariant: 'soft'
        },
        {
            title: t('stats.widget.total-spent'),
            value: formatCurrency(nodes?.stats.totalSpent ?? 0),
            subtitle: t('stats.widget.lifetime-spending'),
            IconComponent: MdTrendingUp,
            iconColor: 'violet',
            iconVariant: 'soft'
        }
    ]

    return (
        <Grid className={classes.statusColors} mb="md">
            {stats.map((stat, index) => (
                <Grid.Col key={index} span={{ base: 12, xs: 6, md: 6, sm: 6, lg: 3 }}>
                    <MetricCardShared isLoading={isLoading} key={index} {...stat} />
                </Grid.Col>
            ))}
        </Grid>
    )
}
