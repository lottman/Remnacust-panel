import { Badge, Group } from '@mantine/core'
import { GetNodesCommand } from '@remnawave/backend-contract'
import ReactCountryFlag from 'react-country-flag'
import { PiUsersDuotone } from 'react-icons/pi'
import { TbServer, TbServer2 } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { UniversalSpotlightContentShared } from '@shared/ui/universal-spotlight'
import { getAdditionalNodeIps } from '@shared/utils/node-addresses'

import { NodeStatusBadgeWidget } from '../node-status-badge'

interface IProps {
    nodes: GetNodesCommand.Response['response']
}

export const NodesSpotlightSearchWidget = ({ nodes }: IProps) => {
    const handleViewNode = (value: null | string) => {
        if (!value) {
            return
        }

        const node = nodes.find((node) => node.uuid === value)
        if (node) {
            showModal('nodes_editNodeModal', { nodeUuid: node.uuid })
        }
    }

    return (
        <UniversalSpotlightContentShared
            actions={nodes.map((node) => ({
                label: node.name,
                description: [
                    node.address,
                    ...getAdditionalNodeIps(node.ips, node.address).map((entry) => entry.ip),
                    node.provider?.name
                ]
                    .filter(Boolean)
                    .join(' · '),
                keywords: [
                    node.uuid,
                    node.address,
                    ...(node.ips ?? []).map((entry) => entry.ip),
                    node.provider?.name ?? ''
                ],
                id: node.uuid,
                leftSection:
                    node.countryCode && node.countryCode !== 'XX' ? (
                        <ReactCountryFlag
                            countryCode={node.countryCode}
                            style={{
                                fontSize: '1.1em',
                                borderRadius: '2px'
                            }}
                        />
                    ) : (
                        <TbServer color="var(--mantine-color-gray-5)" size={16} />
                    ),
                rightSection: (
                    <Group gap={8} wrap="nowrap">
                        <NodeStatusBadgeWidget node={node} withText={false} />
                        <Badge
                            color={(node.usersOnline ?? 0) > 0 ? 'teal' : 'gray'}
                            leftSection={<PiUsersDuotone size={14} />}
                            miw="7ch"
                            size="sm"
                            variant="light"
                        >
                            {node.usersOnline ?? '—'}
                        </Badge>
                    </Group>
                ),
                onClick: () => handleViewNode(node.uuid)
            }))}
            searchIcon={<TbServer2 size={20} />}
        />
    )
}
