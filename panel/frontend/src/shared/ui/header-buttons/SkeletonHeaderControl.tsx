import { Box } from '@mantine/core'

import { useUiText } from '@shared/i18n/interface-text'

import classes from './SkeletonHeaderControl.module.css'

interface SkeletonHeaderControlProps {
    width?: number | string
}

export function SkeletonHeaderControl({ width = 44 }: SkeletonHeaderControlProps) {
    const uiText = useUiText()

    return (
        <Box
            aria-label={uiText('loading-dc38088')}
            className={classes.skeleton}
            h={44}
            role="status"
            w={width}
        >
            <span aria-hidden="true">···</span>
        </Box>
    )
}
