import { Alert, Stack } from '@mantine/core'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TbRadar } from 'react-icons/tb'

import { EmptyPageLayout } from '@shared/ui/layouts/empty-page'

import { IpStatsWidget } from './ip-stats.widget'
import { NodeSessionsCardWidget } from './node-sessions-card.widget'
import { SummaryCardWidget } from './summary-card.widget'
import { ActiveSessionNode } from './use-user-active-sessions'

interface IProps {
    failedNodes?: { nodeUuid: string; nodeName: string }[]
    nodes: ActiveSessionNode[]
    onDropAll: () => void
    onDropIp: (ip: string, nodeUuid: string) => void
    onDropNode: (nodeUuid: string) => void
    onRefresh: () => void
}

export const ResultsWidget = ({
    nodes,
    failedNodes = [],
    onDropAll,
    onDropIp,
    onDropNode,
    onRefresh
}: IProps) => {
    const { t } = useTranslation()
    const { distinctIps, totalIps } = useMemo(() => {
        const allIps = nodes.flatMap((node) => node.ips.map((item) => item.ip))
        return { distinctIps: new Set(allIps).size, totalIps: allIps.length }
    }, [nodes])

    const hasNodes = nodes.length > 0

    return (
        <Stack gap="md">
            {failedNodes.length > 0 && (
                <Alert color="yellow">
                    {t('active-sessions-drawer.widget.partial-results', {
                        nodes: failedNodes.map((node) => node.nodeName).join(', ')
                    })}
                </Alert>
            )}
            <SummaryCardWidget
                distinctIps={distinctIps}
                ipStats={hasNodes && <IpStatsWidget nodes={nodes} />}
                onDropAll={onDropAll}
                onRefresh={onRefresh}
                totalIps={totalIps}
            />

            {!hasNodes && <EmptyPageLayout icon={<TbRadar size="3rem" />} />}

            {nodes.map((node) => (
                <NodeSessionsCardWidget
                    key={node.nodeUuid}
                    node={node}
                    onDropIp={(ip) => onDropIp(ip, node.nodeUuid)}
                    onDropNode={() => onDropNode(node.nodeUuid)}
                />
            ))}
        </Stack>
    )
}
