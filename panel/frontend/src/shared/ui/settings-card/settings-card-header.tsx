import { Box, Divider, Group, Stack, Text, Title } from '@mantine/core'
import { ReactNode } from 'react'

import { HeadingIcon } from '@shared/ui/heading-icon'

interface SettingsCardHeaderProps {
    actions?: ReactNode
    description?: ReactNode
    icon: ReactNode
    title: string
}

export function SettingsCardHeader({ description, icon, actions, title }: SettingsCardHeaderProps) {
    return (
        <Box>
            <Group align="flex-start" justify="space-between" wrap="wrap">
                <Group
                    align="flex-start"
                    gap="md"
                    miw={0}
                    style={{ flex: '1 1 220px' }}
                    wrap="nowrap"
                >
                    <HeadingIcon size={44}>{icon}</HeadingIcon>

                    <Stack gap={0} miw={0}>
                        <Title order={4} style={{ overflowWrap: 'anywhere' }}>
                            {title}
                        </Title>
                        {description && (
                            <Text c="dimmed" size="sm" style={{ overflowWrap: 'anywhere' }}>
                                {description}
                            </Text>
                        )}
                    </Stack>
                </Group>
                {actions}
            </Group>

            <Divider
                my="md"
                style={{
                    opacity: 0.3
                }}
            />
        </Box>
    )
}
