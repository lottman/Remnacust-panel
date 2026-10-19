import { Alert, Button, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { TbClock, TbInfoCircle, TbRadar2, TbRefresh } from 'react-icons/tb'

import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { RefreshButton } from '@shared/ui/refresh-control'
import { SectionCard } from '@shared/ui/section-card'

interface IProps {
    onlineNodesCount: number
    totalNodesCount: number
    isLoading: boolean
    isError: boolean
    isRefreshing: boolean
    onRefresh: () => unknown
    onStart: () => void
}

export function SessionsExplorerIdle({
    onlineNodesCount,
    totalNodesCount,
    isLoading,
    isError,
    isRefreshing,
    onRefresh,
    onStart
}: IProps) {
    const { t } = useTranslation()
    const blocked = isLoading || isError || onlineNodesCount === 0
    const statusKey = isLoading
        ? 'session-recording.nodes-loading'
        : isError
          ? 'session-recording.nodes-load-error'
          : totalNodesCount === 0
            ? 'session-recording.nodes-empty'
            : onlineNodesCount === 0
              ? 'session-recording.nodes-offline'
              : 'session-recording.nodes-ready'

    return (
        <Stack gap="md">
            <SectionCard.Root gap="md">
                <SectionCard.Section>
                    <BaseOverlayHeader
                        iconColor="blue"
                        IconComponent={TbInfoCircle}
                        iconVariant="soft"
                        title={t('session-recording.scan-help-title')}
                    />
                </SectionCard.Section>
                <Text c="dimmed" size="sm">
                    {t('session-recording.scan-help')}
                </Text>
                <Group gap="sm" wrap="nowrap">
                    <ThemeIcon color="cyan" size="md" variant="soft">
                        <TbClock size={16} />
                    </ThemeIcon>
                    <Text c="dimmed" size="sm">
                        {t('sessions-explorer-idle.description-1')}
                    </Text>
                </Group>
            </SectionCard.Root>
            <Alert color={isError ? 'red' : blocked ? 'yellow' : 'blue'}>
                {t(statusKey, { online: onlineNodesCount, total: totalNodesCount })}
            </Alert>
            <Group grow>
                <RefreshButton
                    leftSection={<TbRefresh size={18} />}
                    loading={isRefreshing}
                    onClick={onRefresh}
                    variant="default"
                >
                    {t('session-recording.refresh-nodes')}
                </RefreshButton>
                <Button
                    color="teal"
                    disabled={blocked}
                    leftSection={<TbRadar2 size={20} />}
                    onClick={onStart}
                    size="md"
                    variant="light"
                >
                    {t('sessions-explorer-idle.start-exploring')}
                </Button>
            </Group>
        </Stack>
    )
}
