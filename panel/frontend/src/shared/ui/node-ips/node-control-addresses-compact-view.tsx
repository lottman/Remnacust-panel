import { Badge, Group, HoverCard, ScrollArea, Stack, Text } from '@mantine/core'
import { GetNodesCommand } from '@remnawave/backend-contract'
import { useTranslation } from 'react-i18next'

import { getNodeControlAddresses } from '@shared/utils/node-control-addresses'

export function NodeControlAddressesCompactView({
    node
}: {
    node: GetNodesCommand.Response['response'][number]
}) {
    const { t } = useTranslation()
    const addresses = getNodeControlAddresses(node)
    const enabled = addresses.filter((entry) => entry.enabled).length
    if (!addresses.length)
        return (
            <Text c="dimmed" size="sm">
                —
            </Text>
        )
    return (
        <HoverCard openDelay={150} shadow="md" width={300} withArrow>
            <HoverCard.Target>
                <Badge color={enabled > 0 ? 'cyan' : 'gray'} variant="light">
                    {enabled}/{addresses.length}
                </Badge>
            </HoverCard.Target>
            <HoverCard.Dropdown p="xs">
                <ScrollArea.Autosize mah={260}>
                    <Stack component="ol" gap="xs" m={0} pl="md">
                        {addresses.map((entry) => (
                            <Group
                                component="li"
                                gap="xs"
                                justify="space-between"
                                key={entry.address}
                            >
                                <Text
                                    ff="monospace"
                                    size="xs"
                                    style={{ overflowWrap: 'anywhere', minWidth: 0 }}
                                >
                                    <bdi>{entry.address}</bdi>
                                </Text>
                                <Badge color={entry.enabled ? 'cyan' : 'gray'} size="xs">
                                    {t(
                                        entry.enabled
                                            ? 'use-nodes-table-widget.proxy-enabled'
                                            : 'use-nodes-table-widget.proxy-disabled'
                                    )}
                                </Badge>
                            </Group>
                        ))}
                    </Stack>
                </ScrollArea.Autosize>
            </HoverCard.Dropdown>
        </HoverCard>
    )
}
