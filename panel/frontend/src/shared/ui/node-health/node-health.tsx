import { Badge, Box, Button, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core'
import { GetNodeCommand, GetNodesCommand } from '@remnawave/backend-contract'
import { IconActivityHeartbeat } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { showModal } from '@shared/_modals/show-modal'
import { getNodeHealth, NodeHealthLevel, NodeHealthSignal } from '@shared/utils/node-health'

import classes from './node-health.module.css'

const healthColors: Record<NodeHealthLevel, string> = {
    attention: 'yellow',
    critical: 'red',
    disabled: 'gray',
    healthy: 'teal',
    limited: 'blue'
}

export function NodeHealthBadge({ node }: { node: GetNodesCommand.Response['response'][number] }) {
    const { t } = useTranslation()
    const health = getNodeHealth(node)

    return (
        <Tooltip
            label={t('xera-node-health.signal-coverage', {
                checked: health.checkedSignals,
                total: health.totalSignals
            })}
        >
            <Badge color={healthColors[health.level]} size="sm" variant="light">
                {t(`xera-node-health.${health.level}`)}
            </Badge>
        </Tooltip>
    )
}

export function NodeHealthOverview({
    nodes
}: {
    nodes: GetNodesCommand.Response['response'] | undefined
}) {
    const { t } = useTranslation()
    if (!nodes?.length) return null

    const counts: Record<NodeHealthLevel, number> = {
        attention: 0,
        critical: 0,
        disabled: 0,
        healthy: 0,
        limited: 0
    }
    const problemNodes: typeof nodes = []
    for (const node of nodes) {
        const health = getNodeHealth(node)
        counts[health.level] += 1
        if (health.level === 'critical' || health.level === 'attention') problemNodes.push(node)
    }

    return (
        <Box aria-label={t('xera-node-health.title')} className={classes.overview} role="region">
            <Group align="center" className={classes.summary} justify="space-between" wrap="wrap">
                <Group gap="xs" wrap="nowrap">
                    <IconActivityHeartbeat aria-hidden size={18} />
                    <Text fw={600} size="sm">
                        {t('xera-node-health.title')}
                    </Text>
                </Group>
                <Box className={classes.statusList} role="list">
                    {(['healthy', 'limited', 'attention', 'critical', 'disabled'] as const).map(
                        (level) => (
                            <Box
                                className={classes.status}
                                data-empty={counts[level] === 0}
                                key={level}
                                role="listitem"
                            >
                                <Box
                                    aria-hidden
                                    className={classes.dot}
                                    component="span"
                                    style={{
                                        backgroundColor: `var(--mantine-color-${healthColors[level]}-6)`
                                    }}
                                />
                                <Text c="dimmed" size="xs" span>
                                    {t(`xera-node-health.${level}`)}
                                </Text>
                                <Text className={classes.count} size="sm" span>
                                    {counts[level]}
                                </Text>
                            </Box>
                        )
                    )}
                </Box>
            </Group>
            {problemNodes.length > 0 && (
                <Group className={classes.problemRow} gap="xs">
                    <Text c="dimmed" size="xs">
                        {t('xera-node-health.problem-nodes')}:
                    </Text>
                    {problemNodes.slice(0, 8).map((node) => (
                        <Button
                            color={healthColors[getNodeHealth(node).level]}
                            key={node.uuid}
                            onClick={() =>
                                showModal('nodes_editNodeModal', { nodeUuid: node.uuid })
                            }
                            size="compact-xs"
                            variant="light"
                        >
                            {node.name}
                        </Button>
                    ))}
                    {problemNodes.length > 8 && (
                        <Text c="dimmed" size="xs">
                            +{problemNodes.length - 8}
                        </Text>
                    )}
                </Group>
            )}
        </Box>
    )
}

export function NodeHealthDetails({ node }: { node: GetNodeCommand.Response['response'] }) {
    const { i18n, t } = useTranslation()
    const health = getNodeHealth(node)
    const signalLabel = (signal: NodeHealthSignal) => t(`xera-node-health.${signal}`)

    return (
        <Paper p="md" radius="md" withBorder>
            <Stack gap="sm">
                <Group justify="space-between">
                    <Text fw={600}>{t('xera-node-health.title')}</Text>
                    <Badge color={healthColors[health.level]} variant="light">
                        {t(`xera-node-health.${health.level}`)}
                    </Badge>
                </Group>
                {health.level !== 'disabled' && (
                    <>
                        <Group gap="xs">
                            <Text fw={700} size="lg">
                                {health.score}/100
                            </Text>
                            <Text c="dimmed" size="xs">
                                {t('xera-node-health.signal-coverage', {
                                    checked: health.checkedSignals,
                                    total: health.totalSignals
                                })}
                            </Text>
                        </Group>
                        <Progress color={healthColors[health.level]} value={health.score} />
                    </>
                )}
                {health.issues.map((signal) => (
                    <Text
                        c={signal === 'connection' || signal === 'configuration' ? 'red' : 'yellow'}
                        key={signal}
                        size="sm"
                    >
                        • {signalLabel(signal)}
                    </Text>
                ))}
                {health.unavailableSignals.map((signal) => (
                    <Text c="dimmed" key={signal} size="sm">
                        • {signalLabel(signal)} — {t('xera-node-health.not-measured')}
                    </Text>
                ))}
                {node.lastStatusChange && (
                    <Text c="dimmed" size="xs">
                        {t('xera-node-health.last-change')}:{' '}
                        {new Date(node.lastStatusChange).toLocaleString(i18n.language)}
                    </Text>
                )}
                {!node.isConnected && node.lastStatusMessage && (
                    <Text c="dimmed" size="xs" style={{ overflowWrap: 'anywhere' }}>
                        {t('xera-node-health.last-status')}: {node.lastStatusMessage}
                    </Text>
                )}
            </Stack>
        </Paper>
    )
}
