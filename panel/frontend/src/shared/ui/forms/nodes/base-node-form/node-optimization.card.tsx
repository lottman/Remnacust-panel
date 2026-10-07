import { Badge, Box, Button, Group, Stack, Text } from '@mantine/core'
import { GetNodeCommand } from '@remnawave/backend-contract'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TbActivityHeartbeat, TbGauge, TbTerminal2 } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { instance } from '@shared/api'
import { useUiText } from '@shared/i18n/interface-text'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'

import { nodeOptimizationQuery } from './node-optimization-query'
import classes from './node-optimization.module.css'
import optimizerScript from './node-optimizer.sh?raw'

type Level = 'none' | 'safe' | 'balanced' | 'performance'

const levels: Level[] = ['none', 'safe', 'balanced', 'performance']
const encodedScript = btoa(optimizerScript)
const encodedLines = encodedScript.match(/.{1,76}/g)?.join('\n') ?? ''

function commandFor(level: Level) {
    const run = `{ if [ "$(id -u)" -eq 0 ]; then bash -s -- apply ${level}; else sudo bash -s -- apply ${level}; fi; }`
    return `base64 -d <<'XERA_NODE_OPTIMIZER' | ${run}\n${encodedLines}\nXERA_NODE_OPTIMIZER\n`
}

export function NodeOptimizationCard({ node }: { node: GetNodeCommand.Response['response'] }) {
    const uiText = useUiText()

    const { t } = useTranslation()
    const { data, isError } = useQuery(
        nodeOptimizationQuery(
            node.uuid,
            async (url, signal) =>
                (await instance.get<{ response: unknown }>(url, { signal })).data.response
        )
    )
    const status = data?.nodeUuid === node.uuid ? data : undefined
    const current = status?.level ?? null

    const recommendation = useMemo(() => {
        if (!node.system) return null
        const total = node.system.info.memoryTotal
        const used = total - node.system.stats.memoryFree
        if (total < 2 * 1024 ** 3 || used / total >= 0.85) return 'safe'
        return 'balanced'
    }, [node.system])

    return (
        <SectionCard.Root>
            <SectionCard.Section>
                <Group className={classes.header} justify="space-between" wrap="wrap">
                    <BaseOverlayHeader
                        iconColor="cyan"
                        IconComponent={TbGauge}
                        iconVariant="soft"
                        title={t('xera-node-optimization.title')}
                        titleOrder={5}
                    />
                    {recommendation && (
                        <Badge color="cyan" size="sm" variant="light">
                            {t('xera-node-optimization.recommended')}:{' '}
                            {t(`xera-node-optimization.${recommendation}`)}
                        </Badge>
                    )}
                </Group>
            </SectionCard.Section>
            <SectionCard.Section>
                <Stack gap="sm">
                    <Text c="dimmed" size="sm">
                        {t('xera-node-optimization.intro')}
                    </Text>
                    <Group justify="space-between">
                        <Text size="sm" fw={600}>
                            {uiText('last-verified-0f68266')}
                            {current
                                ? t(`xera-node-optimization.${current}`)
                                : uiText('unknown-b764cdc')}
                        </Text>
                    </Group>
                    {status?.verifiedAt && (
                        <Text c="dimmed" size="xs">
                            {uiText('verified-77cae63')}
                            {new Date(status.verifiedAt).toLocaleString(uiText('en-us-5c49f88'))}
                        </Text>
                    )}
                    {(isError || (status?.checkedAt && !status.verified)) && (
                        <Text c="yellow" size="xs">
                            {uiText(
                                'the-latest-check-could-not-confirm-the-state-check-again-via-s-3e2b35f'
                            )}
                        </Text>
                    )}
                    <Box
                        className={classes.levels}
                        role="group"
                        aria-label={t('xera-node-optimization.title')}
                    >
                        {levels.map((level) => (
                            <Button
                                className={classes.level}
                                color={current === level ? 'gray' : 'cyan'}
                                key={level}
                                onClick={() =>
                                    void showModal('nodes_nodeSshTerminal', {
                                        node,
                                        runCommand: commandFor(level),
                                        runId: crypto.randomUUID()
                                    })
                                }
                                size="sm"
                                title={t(`xera-node-optimization.${level}-description`)}
                                aria-pressed={current === level}
                                variant="light"
                            >
                                {t(`xera-node-optimization.${level}`)}
                            </Button>
                        ))}
                    </Box>
                    <Group justify="flex-end">
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={<TbTerminal2 size={16} />}
                            onClick={() => void showModal('nodes_nodeSshTerminal', { node })}
                        >
                            {uiText('check-via-ssh-1101731')}
                        </Button>
                    </Group>
                    <Group align="flex-start" className={classes.safety} gap="xs" wrap="nowrap">
                        <TbActivityHeartbeat aria-hidden size={16} />
                        <Text c="dimmed" size="xs">
                            {t('xera-node-optimization.safety')}
                        </Text>
                    </Group>
                </Stack>
            </SectionCard.Section>
        </SectionCard.Root>
    )
}
