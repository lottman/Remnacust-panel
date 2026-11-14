import { SimpleGrid } from '@mantine/core'
import { GetNodesCommand } from '@remnawave/backend-contract'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PiArrowDownDuotone, PiArrowUpDuotone, PiPulse } from 'react-icons/pi'
import { TbUsers } from 'react-icons/tb'

import { IMetricCardProps, MetricCardShared } from '@shared/ui/metrics/metric-card'
import { prettySiRealtimeBytesUtil } from '@shared/utils/bytes'

import { getNodeStatus } from '../node-status'

interface IProps {
    isLoading: boolean
    nodes: GetNodesCommand.Response['response'] | undefined
}

export function NodesRealtimeUsageMetrics(props: IProps) {
    const { nodes, isLoading } = props

    const { t } = useTranslation()

    const activeNodes = useMemo(
        () =>
            nodes?.filter((node) => node.isConnected && !node.isDisabled && !node.isConnecting) ??
            [],
        [nodes]
    )

    const aggregated = useMemo(() => {
        if (!activeNodes.length) return null

        return activeNodes.reduce(
            (acc, curr) => ({
                rxSpeed: acc.rxSpeed + (curr.system?.stats.interface?.rxBytesPerSec ?? 0),
                txSpeed: acc.txSpeed + (curr.system?.stats.interface?.txBytesPerSec ?? 0)
            }),
            { rxSpeed: 0, txSpeed: 0 }
        )
    }, [activeNodes])

    const cards: IMetricCardProps[] = [
        {
            IconComponent: PiArrowDownDuotone,
            title: t('nodes-realtime-metrics.widget.download-speed'),
            value: prettySiRealtimeBytesUtil(aggregated?.rxSpeed, true, true) || '0 B/s',
            iconVariant: 'soft',
            iconColor: 'teal'
        },
        {
            IconComponent: PiArrowUpDuotone,
            title: t('nodes-realtime-metrics.widget.upload-speed'),
            value: prettySiRealtimeBytesUtil(aggregated?.txSpeed ?? 0, true, true) || '0 B/s',
            iconVariant: 'soft',
            iconColor: 'indigo'
        },

        {
            IconComponent: TbUsers,
            title: t('nodes-quick-stats.widget.users-online'),
            value: activeNodes.reduce((acc, curr) => acc + (curr.usersOnline ?? 0), 0),
            iconVariant: 'soft',
            iconColor: 'cyan'
        },
        {
            IconComponent: PiPulse,
            title: t('nodes-quick-stats.widget.online-nodes'),
            value: activeNodes.filter((node) => getNodeStatus(node) === 'connected').length,
            iconVariant: 'soft',
            iconColor: 'teal'
        }
    ]
    return (
        <SimpleGrid cols={{ base: 2, xl: 4 }} spacing="sm">
            {cards.map((card) => (
                <div key={card.title}>
                    <MetricCardShared
                        iconColor={card.iconColor}
                        IconComponent={card.IconComponent}
                        iconVariant={card.iconVariant}
                        isLoading={isLoading}
                        subtitle={card.subtitle}
                        title={card.title}
                        value={card.value}
                    />
                </div>
            ))}
        </SimpleGrid>
    )
}
