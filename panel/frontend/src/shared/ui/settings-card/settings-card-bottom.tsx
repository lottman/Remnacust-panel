import { Box, Divider } from '@mantine/core'
import { ReactNode } from 'react'

import classes from './settings-card.module.css'

interface SettingsCardBottomProps {
    children: ReactNode
    sticky?: boolean
}

export function SettingsCardBottom({ children, sticky = false }: SettingsCardBottomProps) {
    if (sticky) return <Box className={classes.footer}>{children}</Box>
    return (
        <>
            <Divider
                mt="lg"
                style={{
                    opacity: 0.3
                }}
            />
            {children}
        </>
    )
}
