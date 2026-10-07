import { Badge, Box, Button, Card, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core'
import { GetConfigProfilesCommand } from '@remnawave/backend-contract'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCirclesRelation, TbServer, TbUsers, TbWorld } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { useGetHosts, useGetInternalSquads, useGetNodes } from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { DisclosureCard } from '@shared/ui/disclosure-card/disclosure-card'
import { getNodeHealth } from '@shared/utils/node-health'

type Profile = GetConfigProfilesCommand.Response['response']['configProfiles'][number]

export function ProfileRelations({ profiles }: { profiles: Profile[] }) {
    const uiText = useUiText()

    const [opened, setOpened] = useState(false)
    if (profiles.length === 0) return null
    return (
        <DisclosureCard
            description={uiText('squads-inbounds-nodes-and-hosts-a83c761')}
            icon={<TbCirclesRelation size={20} />}
            mb="lg"
            onChange={setOpened}
            opened={opened}
            title={uiText('profile-relations-077ff52')}
        >
            {opened && <ProfileRelationsData profiles={profiles} />}
        </DisclosureCard>
    )
}

function ProfileRelationsData({ profiles }: { profiles: Profile[] }) {
    const uiText = useUiText()

    const { t } = useTranslation()
    const [selected, setSelected] = useState<string | null>(null)
    const { data: nodes, isError: nodesError, isLoading: nodesLoading } = useGetNodes()
    const { data: hosts, isError: hostsError, isLoading: hostsLoading } = useGetHosts()
    const { data: squads, isError: squadsError, isLoading: squadsLoading } = useGetInternalSquads()
    const profile = profiles.find((item) => item.uuid === selected) ?? profiles[0]
    if (!profile) return null

    const inboundIds = new Set(profile.inbounds.map((inbound) => inbound.uuid))
    const relatedNodes =
        nodes?.filter((node) => node.configProfile.activeConfigProfileUuid === profile.uuid) ?? []
    const relatedHosts =
        hosts?.filter((host) => host.inbound?.configProfileUuid === profile.uuid) ?? []
    const relatedSquads =
        squads?.internalSquads.filter((squad) =>
            squad.inbounds.some((inbound) => inboundIds.has(inbound.uuid))
        ) ?? []
    const loading = nodesLoading || hostsLoading || squadsLoading
    const failed = nodesError || hostsError || squadsError

    const group = (
        title: string,
        count: number,
        Icon: typeof TbServer,
        children: React.ReactNode
    ) => (
        <Card padding="md" radius="md" withBorder>
            <Group gap="xs" mb="sm">
                <Icon size={17} />
                <Text fw={700} size="sm">
                    {title}
                </Text>
                <Badge color="gray" size="sm" variant="light">
                    {count}
                </Badge>
            </Group>
            <Stack gap={4}>{children}</Stack>
        </Card>
    )

    return (
        <Stack gap="md">
            <Select
                aria-label={uiText('profile-d696a35')}
                data={profiles.map((item) => ({ label: item.name, value: item.uuid }))}
                onChange={setSelected}
                searchable
                value={profile.uuid}
                w="min(360px, 100%)"
            />
            {loading ? (
                <Text c="dimmed" size="sm">
                    {uiText('loading-relations-5a4c580')}
                </Text>
            ) : failed ? (
                <Text c="red" size="sm">
                    {uiText('unable-to-load-all-relations-refresh-the-page-f4738e4')}
                </Text>
            ) : (
                <>
                    <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="sm">
                        {group(
                            uiText('squads-258027a'),
                            relatedSquads.length,
                            TbUsers,
                            relatedSquads.length ? (
                                relatedSquads.map((squad) => (
                                    <Button
                                        key={squad.uuid}
                                        onClick={() =>
                                            showModal(
                                                'internalSquads_internalSquadsInboundsDrawer',
                                                { squadUuid: squad.uuid }
                                            )
                                        }
                                        size="compact-sm"
                                        variant="subtle"
                                        justify="flex-start"
                                    >
                                        {squad.name}
                                    </Button>
                                ))
                            ) : (
                                <Text c="dimmed" size="xs">
                                    {uiText('no-related-squads-8fe4caf')}
                                </Text>
                            )
                        )}
                        {group(
                            'Inbounds',
                            profile.inbounds.length,
                            TbCirclesRelation,
                            profile.inbounds.length ? (
                                profile.inbounds.map((inbound) => (
                                    <Text key={inbound.uuid} size="sm" truncate title={inbound.tag}>
                                        {inbound.tag}
                                    </Text>
                                ))
                            ) : (
                                <Text c="dimmed" size="xs">
                                    {uiText('profile-has-no-inbounds-e6811ad')}
                                </Text>
                            )
                        )}
                        {group(
                            uiText('nodes-7ac3620'),
                            relatedNodes.length,
                            TbServer,
                            relatedNodes.length ? (
                                relatedNodes.map((node) => (
                                    <Group gap="xs" key={node.uuid} wrap="nowrap">
                                        <Button
                                            onClick={() =>
                                                showModal('nodes_editNodeModal', {
                                                    nodeUuid: node.uuid
                                                })
                                            }
                                            size="compact-sm"
                                            variant="subtle"
                                            justify="flex-start"
                                            style={{ minWidth: 0 }}
                                        >
                                            {node.name}
                                        </Button>
                                        <Badge
                                            color={
                                                getNodeHealth(node).level === 'healthy'
                                                    ? 'teal'
                                                    : 'yellow'
                                            }
                                            size="xs"
                                            variant="light"
                                        >
                                            {t(`xera-node-health.${getNodeHealth(node).level}`)}
                                        </Badge>
                                    </Group>
                                ))
                            ) : (
                                <Text c="dimmed" size="xs">
                                    {uiText('no-nodes-use-this-profile-eac5087')}
                                </Text>
                            )
                        )}
                        {group(
                            uiText('hosts-bba9af1'),
                            relatedHosts.length,
                            TbWorld,
                            relatedHosts.length ? (
                                relatedHosts.map((host) => (
                                    <Button
                                        key={host.uuid}
                                        onClick={() =>
                                            showModal('hosts_editHostDrawer', {
                                                hostUuid: host.uuid
                                            })
                                        }
                                        size="compact-sm"
                                        variant="subtle"
                                        justify="flex-start"
                                    >
                                        {host.remark}
                                    </Button>
                                ))
                            ) : (
                                <Text c="dimmed" size="xs">
                                    {uiText('no-hosts-for-this-profile-221d046')}
                                </Text>
                            )
                        )}
                    </SimpleGrid>
                    <Box>
                        <Text c="dimmed" size="xs">
                            {uiText(
                                'these-are-saved-configuration-relations-they-do-not-verify-rea-2475ca8'
                            )}
                        </Text>
                    </Box>
                </>
            )}
        </Stack>
    )
}
