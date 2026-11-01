import { ThemeIcon, type ThemeIconProps } from '@mantine/core'

import classes from './heading-icon.module.css'

export function HeadingIcon({ children, size = 40 }: Pick<ThemeIconProps, 'children' | 'size'>) {
    return (
        <ThemeIcon
            aria-hidden="true"
            className={classes.icon}
            color="brand"
            data-panel-heading-icon
            radius="md"
            size={size}
            variant="light"
        >
            {children}
        </ThemeIcon>
    )
}
