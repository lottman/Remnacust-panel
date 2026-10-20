import { Card, Grid, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { FaServer } from 'react-icons/fa'
import { MdPayment, MdTrendingUp } from 'react-icons/md'
import { TbAlertTriangle } from 'react-icons/tb'

import { useGetInfraBillingNodes } from '@shared/api/hooks'
import { formatCurrency } from '@shared/utils/misc'

import { getBillingDateStatus } from '../billing-date-status'
import classes from '../billing-date-status.module.css'
import { useBillingToday } from '../use-billing-today'

export function MobileStatsWidget() {
    const { data: nodes } = useGetInfraBillingNodes()
    const { t } = useTranslation()

    const today = useBillingToday()
    const billingNodes = nodes?.billingNodes ?? []

    const overdueCount = billingNodes.filter(
        (node) => getBillingDateStatus(node.nextBillingAt, today).state === 'overdue'
    ).length

    const stats = [
        {
            icon: TbAlertTriangle,
            color: overdueCount > 0 ? 'red' : 'teal',
            textColor: overdueCount > 0 ? 'var(--billing-overdue-ink)' : undefined,
            value: overdueCount,
            label: t('common.message.overdue')
        },
        {
            icon: FaServer,
            color: 'orange',
            value: nodes?.stats.upcomingNodesCount ?? 0,
            label: t('mobile-stats.widget.upcoming')
        },
        {
            icon: MdPayment,
            color: 'green',
            value: formatCurrency(nodes?.stats.currentMonthPayments ?? 0),
            label: t('mobile-stats.widget.per-month')
        },
        {
            icon: MdTrendingUp,
            color: 'violet',
            value: formatCurrency(nodes?.stats.totalSpent ?? 0),
            label: t('mobile-stats.widget.total-spent')
        }
    ]

    return (
        <Grid className={classes.statusColors} gap="xs" mb="md">
            {stats.map((stat, index) => (
                <Grid.Col key={index} span={6}>
                    <Card
                        h="100%"
                        padding="sm"
                        style={stat.textColor ? { transitionProperty: 'border-color' } : undefined}
                    >
                        <Group gap="xs" wrap="nowrap">
                            <ThemeIcon color={stat.color} radius="md" size="lg" variant="soft">
                                <stat.icon size={18} />
                            </ThemeIcon>
                            <Stack gap={0} miw={0}>
                                <Text
                                    fw={700}
                                    size="md"
                                    style={{ color: stat.textColor, overflowWrap: 'anywhere' }}
                                >
                                    {stat.value}
                                </Text>
                                <Text
                                    c="dimmed"
                                    size="xs"
                                    style={{ color: stat.textColor }}
                                    lh={1.35}
                                >
                                    {stat.label}
                                </Text>
                            </Stack>
                        </Group>
                    </Card>
                </Grid.Col>
            ))}
        </Grid>
    )
}
