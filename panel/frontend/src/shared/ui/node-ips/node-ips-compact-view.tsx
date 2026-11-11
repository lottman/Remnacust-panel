import { Badge, Group, HoverCard, ScrollArea, Stack, Text } from '@mantine/core'
import { TNodeIps } from '@remnawave/backend-contract'
import { useTranslation } from 'react-i18next'

import { getAdditionalNodeIps } from '@shared/utils/node-addresses'

import { NodeIpStatusIcon } from './node-ip-status-icon'
import { resolveNodeIpStatusMeta } from './node-ip-status.constants'

interface IProps {
    address?: null | string
    ips: null | TNodeIps | undefined
    maxVisible?: number
}

export const NodeIpsCompactView = (props: IProps) => {
    const { ips, address, maxVisible = 4 } = props
    const additionalIps = getAdditionalNodeIps(ips, address)

    const { t } = useTranslation()

    if (!additionalIps.length) {
        return (
            <Text c="dimmed" size="sm">
                —
            </Text>
        )
    }

    const visibleIps = additionalIps.slice(0, maxVisible)
    const hiddenCount = additionalIps.length - visibleIps.length

    return (
        <HoverCard openDelay={150} position="bottom-start" shadow="md" width={280} withArrow>
            <HoverCard.Target>
                <Group gap={4} wrap="nowrap">
                    {visibleIps.map((entry, index) => (
                        <NodeIpStatusIcon
                            key={`${entry.ip}-${index}`}
                            size="sm"
                            status={entry.status}
                        />
                    ))}

                    {hiddenCount > 0 && (
                        <Badge color="gray" radius="sm" size="sm" variant="soft">
                            +{hiddenCount}
                        </Badge>
                    )}
                </Group>
            </HoverCard.Target>

            <HoverCard.Dropdown p="xs">
                <Stack gap={6}>
                    <Text c="dimmed" fw={600} size="xs" tt="uppercase">
                        {t('common.field.ip-addresses')} · {additionalIps.length}
                    </Text>

                    <ScrollArea.Autosize mah={260} type="auto">
                        <Stack gap={6}>
                            {additionalIps.map((entry, index) => (
                                <Group gap={8} key={`${entry.ip}-${index}`} wrap="nowrap">
                                    <NodeIpStatusIcon size="sm" status={entry.status} />
                                    <Text ff="monospace" size="xs" style={{ flex: 1 }} truncate>
                                        {entry.ip}
                                    </Text>
                                    <Text c="dimmed" size="xs">
                                        {t(resolveNodeIpStatusMeta(entry.status).labelKey)}
                                    </Text>
                                </Group>
                            ))}
                        </Stack>
                    </ScrollArea.Autosize>
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    )
}
