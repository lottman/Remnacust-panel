import { SimpleGrid } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import {
    PiClockCountdownDuotone,
    PiClockUserDuotone,
    PiProhibitDuotone,
    PiPulseDuotone,
    PiUsersDuotone
} from 'react-icons/pi'

import { useGetSystemStats } from '@shared/api/hooks'
import { IMetricCardProps, MetricCardShared } from '@shared/ui/metrics/metric-card'

export function UsersMetrics() {
    const { t } = useTranslation()

    const { data: systemInfo, isLoading } = useGetSystemStats()

    const users = systemInfo?.users

    const cards: IMetricCardProps[] = [
        {
            IconComponent: PiUsersDuotone,
            iconColor: 'blue',
            title: t('common.field.total'),
            value: users?.totalUsers ?? 0,
            iconVariant: 'soft'
        },
        {
            IconComponent: PiPulseDuotone,
            iconColor: 'teal',
            title: t('dashboard-ui.active'),
            value: users?.statusCounts.ACTIVE ?? 0,
            iconVariant: 'soft'
        },
        {
            IconComponent: PiClockUserDuotone,
            iconColor: 'red',
            title: t('dashboard-ui.expired'),
            value: users?.statusCounts.EXPIRED ?? 0,
            iconVariant: 'soft'
        },
        {
            IconComponent: PiClockCountdownDuotone,
            iconColor: 'orange',
            title: t('dashboard-ui.limited'),
            value: users?.statusCounts.LIMITED ?? 0,
            iconVariant: 'soft'
        },
        {
            IconComponent: PiProhibitDuotone,
            iconColor: 'gray',
            title: t('dashboard-ui.disabled'),
            value: users?.statusCounts.DISABLED ?? 0,
            iconVariant: 'soft'
        }
    ]
    return (
        <SimpleGrid cols={{ base: 2, xl: 5 }} spacing="sm">
            {cards.map((card) => (
                <div key={card.title}>
                    <MetricCardShared
                        iconColor={card.iconColor}
                        isLoading={isLoading}
                        key={card.title}
                        {...card}
                    />
                </div>
            ))}
        </SimpleGrid>
    )
}
