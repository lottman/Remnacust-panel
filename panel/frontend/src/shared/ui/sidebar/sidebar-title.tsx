import { Text, useMantineColorScheme } from '@mantine/core'
import { useMemo } from 'react'

import { useGetAuthStatus } from '@shared/api/hooks/auth/auth.query.hooks'
import { parseColoredTextUtil } from '@shared/utils/misc'

import classes from './sidebar.module.css'

export const SidebarTitleShared = () => {
    const { data: authStatus } = useGetAuthStatus()
    const { colorScheme } = useMantineColorScheme()

    const titleParts = useMemo(() => {
        if (authStatus?.branding.title) {
            return parseColoredTextUtil(authStatus.branding.title)
        }

        return [{ text: 'Remnacust', color: 'var(--panel-text)' }]
    }, [authStatus])

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
