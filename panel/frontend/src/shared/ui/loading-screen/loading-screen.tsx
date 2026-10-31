import { Center, Progress, Stack, Text } from '@mantine/core'
import { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { usePanelReducedMotion } from '@shared/ui/appearance/appearance'

import classes from './loading-screen.module.css'

export function LoadingScreen({
    height = '100dvh',
    text = undefined,
    value = 100
}: {
    height?: string
    text?: string
    value?: number
}) {
    const { t } = useTranslation()
    const reducedMotion = usePanelReducedMotion()
    const label = text ?? t('common.message.loading')
    return (
        <Center
            className={classes.screen}
            style={{ '--loading-height': height } as CSSProperties}
            role="status"
            aria-label={label}
            aria-live="polite"
        >
            <Stack align="stretch" gap="sm" className={classes.content}>
                <Text size="sm" className={classes.label}>
                    {label}
                </Text>
                <Progress
                    animated={!reducedMotion}
                    color="brand"
                    radius="xl"
                    striped={!reducedMotion}
                    value={value}
                    w="100%"
                    aria-hidden
                />
            </Stack>
        </Center>
    )
}
