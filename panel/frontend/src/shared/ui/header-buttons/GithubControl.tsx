import { Group, Loader, rem, Text } from '@mantine/core'
import { TbBrandGithub, TbStar } from 'react-icons/tb'

import { HeaderControl } from './HeaderControl'

interface GithubControlProps {
    label?: string
    isLoading?: boolean
    link: string
    stars?: number
}

export function GithubControl({
    link,
    stars,
    isLoading,
    label = 'GitHub',
    ...others
}: GithubControlProps) {
    return (
        <HeaderControl
            aria-label="GitHub"
            component="a"
            href={link}
            rel="noopener noreferrer"
            target="_blank"
            label={undefined}
            w="100%"
            px={12}
            {...others}
        >
            <Group gap={12} wrap="nowrap" w="100%">
                <TbBrandGithub style={{ width: rem(22), height: rem(22) }} />
                <Text fw={500} size="sm">
                    {label}
                </Text>
                {isLoading ? (
                    <Group gap={6} wrap="nowrap" ml="auto">
                        <TbStar style={{ width: rem(16), height: rem(16), color: 'gold' }} />
                        <Loader size="xs" />
                    </Group>
                ) : (
                    stars !== undefined && (
                        <Group gap={6} wrap="nowrap" ml="auto">
                            <TbStar style={{ width: rem(16), height: rem(16), color: 'gold' }} />
                            <Text fw={600} size="sm">
                                {stars}
                            </Text>
                        </Group>
                    )
                )}
            </Group>
        </HeaderControl>
    )
}
