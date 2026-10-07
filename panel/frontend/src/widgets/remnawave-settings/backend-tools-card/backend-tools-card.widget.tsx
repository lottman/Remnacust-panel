import { Button, Card, Code, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { useOs } from '@mantine/hooks'
import { BULLBOARD_ROOT, ROOT, SCALAR_ROOT, SWAGGER_ROOT } from '@remnawave/backend-contract'
import { TFunction } from 'i18next'
import { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbApi, TbBook2, TbExternalLink, TbServer, TbStack2 } from 'react-icons/tb'

import { getBackendDomain } from '@shared/api'
import { useIssueOtt } from '@shared/api/hooks/api-tokens/api-tokens.mutation.hooks'
import { SettingsCardShared } from '@shared/ui/settings-card'

interface BackendTool {
    color: string
    description: string
    icon: ReactNode
    key: string
    path: string
    title: string
}

const getBackendTools = (t: TFunction): BackendTool[] => [
    {
        key: 'queues',
        title: t('backend-tools-card.widget.queue-viewer'),
        description: t('backend-tools-card.widget.queue-viewer-description'),
        icon: <TbStack2 size={20} />,
        color: 'red',
        path: `${ROOT}${BULLBOARD_ROOT}`
    },
    {
        key: 'scalar',
        title: 'Scalar',
        description: t('backend-tools-card.widget.scalar-description'),
        icon: <TbBook2 size={20} />,
        color: 'violet',
        path: `${ROOT}${SCALAR_ROOT}`
    },
    {
        key: 'swagger',
        title: 'Swagger',
        description: t('backend-tools-card.widget.swagger-description'),
        icon: <TbApi size={20} />,
        color: 'green',
        path: `${ROOT}${SWAGGER_ROOT}`
    }
]

export const BackendToolsCardWidget = () => {
    const { t } = useTranslation()

    const os = useOs()

    const backendTools = getBackendTools(t)

    const { mutateAsync: issueOtt } = useIssueOtt()

    const [pendingTool, setPendingTool] = useState<null | string>(null)

    const handleLogin = async (tool: BackendTool) => {
        setPendingTool(tool.key)
        try {
            const { ott } = await issueOtt({})
            const url = `${getBackendDomain()}${tool.path}?ott=${encodeURIComponent(ott)}`

            if (os === 'ios') {
                window.location.assign(url)
            } else {
                window.open(url, '_blank', 'noopener,noreferrer')
            }
        } finally {
            setPendingTool(null)
        }
    }

    return (
        <SettingsCardShared.Container>
            <SettingsCardShared.Header
                description={t('backend-tools-card.widget.backend-tools-description')}
                icon={<TbServer size={24} />}
                iconColor="blue"
                iconVariant="soft"
                title={t('backend-tools-card.widget.backend-tools')}
            />

            <SettingsCardShared.Content>
                {backendTools.map((tool) => (
                    <Card key={tool.key} radius="md" withBorder>
                        <Group justify="space-between" wrap="wrap">
                            <Group gap="md" style={{ minWidth: 0, flex: '1 1 280px' }} wrap="nowrap">
                                <ThemeIcon color={tool.color} size="lg" variant="soft">
                                    {tool.icon}
                                </ThemeIcon>

                                <Stack gap={2} style={{ minWidth: 0 }}>
                                    <Group gap="xs" wrap="wrap">
                                        <Text fw={600} size="sm">
                                            {tool.title}
                                        </Text>
                                        <Code c="dimmed" fz="xs" style={{ maxWidth: '100%', overflowWrap: 'anywhere' }}>
                                            {tool.path}
                                        </Code>
                                    </Group>
                                    <Text c="dimmed" size="xs">
                                        {tool.description}
                                    </Text>
                                </Stack>
                            </Group>

                            <Button
                                loading={pendingTool === tool.key}
                                onClick={() => handleLogin(tool)}
                                rightSection={<TbExternalLink size={16} />}
                                size="xs"
                                variant="soft"
                            >
                                {t('backend-tools-card.widget.login')}
                            </Button>
                        </Group>
                    </Card>
                ))}
            </SettingsCardShared.Content>
        </SettingsCardShared.Container>
    )
}
