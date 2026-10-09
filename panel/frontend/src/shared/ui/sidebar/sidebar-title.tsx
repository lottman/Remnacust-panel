import { Text, useMantineColorScheme } from '@mantine/core'
import { useMemo } from 'react'

import { useGetAuthStatus } from '@shared/api/hooks/auth/auth.query.hooks'
import { parseColoredTextUtil } from '@shared/utils/misc'

import classes from './sidebar.module.css'

export const SidebarTitleShared = () => {
    const { data: authStatus } = useGetAuthStatus()
    const { colorScheme } = useMantineColorScheme()
    const title = authStatus?.branding.title

    const titleParts = useMemo(() => {
        if (title) {
            return parseColoredTextUtil(title)
        }

        return [{ text: 'Remnacust', color: 'var(--panel-text)' }]
    }, [title])

    return (
        <Text className={classes.logoTitle}>
            {titleParts.map((part, index) => (
                <Text
                    c={
                        colorScheme === 'light' && (!part.color || part.color === 'white')
                            ? 'var(--panel-text)'
                            : part.color || 'var(--panel-text)'
                    }
                    component="span"
                    inherit
                    key={index}
                >
                    {part.text}
                </Text>
            ))}
        </Text>
    )
}
