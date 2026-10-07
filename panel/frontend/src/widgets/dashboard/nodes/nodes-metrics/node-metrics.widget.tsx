import {
    Box,
    Button,
    Card,
    Center,
    Group,
    HoverCard,
    Indicator,
    Loader,
    Paper,
    px,
    Select,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
    TextInput
} from '@mantine/core'
import { GetNodesMetricsCommand } from '@remnawave/backend-contract'
import { VirtuosoMasonry } from '@virtuoso.dev/masonry'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    PiGlobeSimple,
    PiInfo,
    PiProhibitDuotone,
    PiPulseDuotone,
    PiUsersDuotone
} from 'react-icons/pi'
import { TbServer } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { useGetNodes, useGetNodesMetrics } from '@shared/api/hooks'
import { useIsMobile } from '@shared/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { MetricCardShared } from '@shared/ui/metrics/metric-card'
import { getNodeHealth } from '@shared/utils/node-health'

import { NodeDetailsCard } from './node-details-card'
import styles from './NodeDetails.module.css'

export const NodeMetricsWidget = () => {
    const uiText = useUiText()

    const { data: nodeMetrics, isLoading, isError, refetch, dataUpdatedAt } = useGetNodesMetrics()
    const { data: nodes } = useGetNodes()
    const isMobile = useIsMobile()
    const { i18n } = useTranslation()
    const [query, setQuery] = useState('')
    const [filter, setFilter] = useState('all')

    const handleNodeClick = useCallback((nodeUuid: string) => {
        showModal('nodes_editNodeModal', { nodeUuid })
    }, [])

    const overallStats = useMemo(() => {
        if (!nodeMetrics?.nodes) return null

        const totalNodes = nodeMetrics.nodes.length
        const totalUsersOnline = nodeMetrics.nodes.reduce((acc, node) => acc + node.usersOnline, 0)
        const activeNodes = nodes?.filter((node) => node.isConnected && !node.isDisabled).length
        const totalInbounds = nodeMetrics.nodes.reduce(
            (acc, node) => acc + node.inboundsStats.length,
            0
        )

        return {
            totalNodes,
            totalUsersOnline,
            activeNodes,
            totalInbounds
        }
    }, [nodeMetrics, nodes])

    const visibleMetrics = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase()
        return (nodeMetrics?.nodes ?? []).filter((metric) => {
            if (
                needle &&
                !`${metric.nodeName} ${metric.providerName}`.toLocaleLowerCase().includes(needle)
            )
                return false
            if (filter === 'users' && metric.usersOnline === 0) return false
            if (filter === 'idle' && metric.usersOnline > 0) return false
            if (filter === 'issues') {
                const node = nodes?.find((item) => item.uuid === metric.nodeUuid)
                if (!node || !['attention', 'critical'].includes(getNodeHealth(node).level))
                    return false
            }
            return true
        })
    }, [nodeMetrics, nodes, query, filter])

    if (isLoading) {
        return (
            <Center h={200}>
                <Loader size="lg" />
            </Center>
        )
    }

    if (isError || !nodeMetrics?.nodes?.length) {
        return (
            <Card p="xl">
                <Center>
                    <Stack align="center" gap="md">
                        <ThemeIcon color="gray" size="xl" variant="light">
                            <PiProhibitDuotone size="32px" />
                        </ThemeIcon>
                        <Text c="dimmed" size="lg">
                            {isError
                                ? uiText('unable-to-load-metrics-06e0911')
                                : uiText('node-metrics-are-not-available-yet-7dc9df5')}
                        </Text>
                        <Button onClick={() => void refetch()} variant="light">
                            {uiText('retry-942087c')}
                        </Button>
                    </Stack>
                </Center>
            </Card>
        )
    }

    const Item: React.FC<{
        context: unknown
        data: GetNodesMetricsCommand.Response['response']['nodes'][number]
        index: number
    }> = ({ data }) => {
        return (
            <div
                className={styles.itemFadeIn}
                key={data.nodeUuid}
                style={{
                    padding: 5,
                    margin: '0'
                }}
            >
                <NodeDetailsCard handleNodeClick={handleNodeClick} node={data} />
            </div>
        )
    }

    return (
        <Stack gap="md">
            <SimpleGrid cols={{ sm: 1, md: 2, lg: 4 }} spacing="xs">
                <MetricCardShared
                    iconColor="indigo"
                    IconComponent={TbServer}
                    iconVariant="soft"
                    isLoading={isLoading}
                    title={uiText('nodes-with-metrics-d37b888')}
                    value={overallStats?.totalNodes || 0}
                />
                <MetricCardShared
                    iconColor="teal"
                    IconComponent={PiPulseDuotone}
                    iconVariant="soft"
                    isLoading={isLoading}
                    title={uiText('connected-nodes-2ed1e6f')}
                    value={overallStats?.activeNodes ?? '—'}
                />
                <MetricCardShared
                    iconColor="blue"
                    IconComponent={PiUsersDuotone}
                    iconVariant="soft"
                    isLoading={isLoading}
                    title={uiText('users-online-85517c0')}
                    value={overallStats?.totalUsersOnline || 0}
                />
                <MetricCardShared
                    iconColor="violet"
                    IconComponent={PiGlobeSimple}
                    iconVariant="soft"
                    isLoading={isLoading}
                    title={uiText('inbounds-with-metrics-1e40621')}
                    value={overallStats?.totalInbounds || 0}
                />
            </SimpleGrid>

            <Paper
                p="md"
                style={{
                    background: 'rgba(59, 130, 246, 0.05)',
                    border: '1px solid rgba(59, 130, 246, 0.2)'
                }}
            >
                <Group align="center" gap="sm" wrap="wrap">
                    <Group align="center" gap="sm">
                        <HoverCard position="bottom" shadow="lg" width={320} withArrow>
                            <HoverCard.Target>
                                <ThemeIcon color="teal" size="md" variant="light">
                                    <PiInfo size={px('1.2rem')} />
                                </ThemeIcon>
                            </HoverCard.Target>
                            <HoverCard.Dropdown>
                                <Stack gap="sm">
                                    <Group gap="xs">
                                        <ThemeIcon color="blue" size="xs" variant="light">
                                            <PiInfo size="0.6rem" />
                                        </ThemeIcon>
                                        <Text fw={600} size="sm">
                                            {uiText('additional-information-9276bb4')}
                                        </Text>
                                    </Group>
                                    <Stack gap="xs">
                                        <Text c="dimmed" size="xs">
                                            •{' '}
                                            {uiText(
                                                'data-from-metrics-last-fetch-time-appears-on-the-right-bc1b674'
                                            )}
                                        </Text>
                                        <Text c="dimmed" size="xs">
                                            •{' '}
                                            {uiText(
                                                'health-comes-from-node-status-user-count-comes-from-metrics-41e9f4f'
                                            )}
                                        </Text>
                                        <Text c="dimmed" size="xs">
                                            •{' '}
                                            {uiText(
                                                'traffic-counters-accumulate-since-panel-or-node-startup-7925c82'
                                            )}
                                        </Text>
                                    </Stack>
                                </Stack>
                            </HoverCard.Dropdown>
                        </HoverCard>

                        <Text c="blue.4" fw={500} size="sm">
                            {uiText('node-metrics-d510954')}
                        </Text>
                    </Group>
                    <Group align="center" gap="xs">
                        <Indicator
                            color="teal.5"
                            processing
                            size={8}
                            style={{
                                zIndex: 5
                            }}
                            visibleFrom="xs"
                        />
                        <Text c="gray.4" size="xs">
                            {dataUpdatedAt
                                ? `${uiText('fetched-0013b4c')} ${new Date(dataUpdatedAt).toLocaleTimeString(i18n.language)}`
                                : uiText('time-unknown-6f803fc')}
                        </Text>
                    </Group>
                </Group>
            </Paper>

            <Group align="end" gap="sm" wrap="wrap">
                <TextInput
                    aria-label={uiText('search-node-785c488')}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder={uiText('search-node-or-provider-121e5e5')}
                    style={{ flex: '1 1 240px' }}
                    value={query}
                />
                <Select
                    aria-label={uiText('metrics-filter-a6438ac')}
                    data={[
                        { label: uiText('all-a52ace4'), value: 'all' },
                        { label: uiText('users-online-85517c0'), value: 'users' },
                        { label: uiText('no-users-online-928c5dd'), value: 'idle' },
                        { label: uiText('needs-attention-c1ebc78'), value: 'issues' }
                    ]}
                    onChange={(value) => setFilter(value ?? 'all')}
                    value={filter}
                    w={220}
                />
                <Text c="dimmed" size="sm">
                    {visibleMetrics.length} / {nodeMetrics.nodes.length}
                </Text>
            </Group>

            <Box>
                {visibleMetrics.length === 0 && (
                    <Text c="dimmed" py="xl" ta="center">
                        {uiText('no-nodes-match-this-filter-5d5555a')}
                    </Text>
                )}
                <VirtuosoMasonry
                    columnCount={isMobile ? 1 : 2}
                    data={visibleMetrics}
                    ItemContent={Item}
                    style={{
                        height: '100%'
                    }}
                    useWindowScroll={true}
                />
            </Box>
        </Stack>
    )
}
