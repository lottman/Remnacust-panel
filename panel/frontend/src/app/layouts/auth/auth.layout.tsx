import { Box, Group } from '@mantine/core'
import { Outlet } from 'react-router'

import { AppearanceControl } from '@shared/ui/appearance/appearance'
import { LanguageControl } from '@shared/ui/header-buttons/LanguageControl'

import classes from './auth.module.css'

export function AuthLayout() {
    return (
        <Box className={classes.shell}>
            <div className={classes.ambient} aria-hidden="true" inert data-auth-ambient>
                <span className={classes.orb} />
                <span className={classes.orb} />
                <span className={classes.orb} />
            </div>
            <Group className={classes.controls} gap={6}>
                <LanguageControl />
                <AppearanceControl />
            </Group>
            <Box className={classes.content}>
                <Outlet />
            </Box>
        </Box>
    )
}
