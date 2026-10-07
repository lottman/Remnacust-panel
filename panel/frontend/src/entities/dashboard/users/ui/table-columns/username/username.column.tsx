import { Box, Group, Indicator, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import { getConnectionStatusColorUtil, getTimeAgoUtil } from '@shared/utils/time-utils'

import { IProps } from '@entities/dashboard/users/ui/table-columns/username/interface'

export function UsernameColumnEntity(props: IProps) {
    return (
        <UsernameCell username={props.user.username} onlineAt={props.user.userTraffic.onlineAt} />
    )
}

export function UsernameCell({
    username,
    onlineAt
}: {
    username: string
    onlineAt: Date | string | null
}) {
    const { t, i18n } = useTranslation()
    const color = getConnectionStatusColorUtil(onlineAt)
    const timeAgo = getTimeAgoUtil(onlineAt, t, i18n.language)

    return (
        <Group align="center" gap="md" pl={10} wrap="nowrap">
            <Indicator color={color} inline size={12} zIndex={0} />
            <Box w="100%">
                <Text fw={500} size="sm" truncate="end">
                    {username}
                </Text>
                <Text c="dimmed" fw={600} size="xs">
                    {timeAgo}
                </Text>
            </Box>
        </Group>
    )
}
