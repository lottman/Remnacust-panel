import { Box, Card, Text, ThemeIcon, ThemeIconProps } from '@mantine/core'
import { ReactNode } from 'react'

import { ShimmerSkeleton } from '@shared/ui/shimmer-skeleton'
import { formatInt } from '@shared/utils/misc'

import classes from './metric-card.module.css'

export interface IMetricCardProps {
    iconColor?: ThemeIconProps['color']
    IconComponent: React.ComponentType<{ size: number }>
    iconSize?: number
    iconVariant: ThemeIconProps['variant']
    isLoading?: boolean
    subtitle?: string
    themeIconProps?: ThemeIconProps
    title: string
    value: number | string
    rollingNumberComponent?: ReactNode
}

export function MetricCardShared(props: IMetricCardProps) {
    const {
        iconColor,
        themeIconProps,
        IconComponent,
        iconSize = 24,
        iconVariant,
        isLoading,
        title,
        value,
        subtitle,
        rollingNumberComponent
    } = props

    return (
        <Card className={classes.card} data-panel-motion="metric" radius="md">
            <Box className={`${classes.content}${subtitle ? ` ${classes.withFooter}` : ''}`}>
                <ThemeIcon
                    aria-hidden="true"
                    className={classes.icon}
                    color={iconColor}
                    radius="lg"
                    size="xl"
                    variant={iconVariant}
                    {...themeIconProps}
                >
                    <IconComponent size={iconSize} />
                </ThemeIcon>

                <Text className={classes.title}>{title}</Text>
                {isLoading ? (
                    <Box className={classes.value}>
                        <ShimmerSkeleton height={28} width="min(80px, 100%)" />
                    </Box>
                ) : rollingNumberComponent != null ? (
                    <Box className={classes.value}>{rollingNumberComponent}</Box>
                ) : (
                    <Text className={classes.value} data-panel-value key={String(value)}>
                        <bdi dir="ltr">{typeof value === 'number' ? formatInt(value) : value}</bdi>
                    </Text>
                )}
                {subtitle && <Text className={classes.subtitle}>{subtitle}</Text>}
            </Box>
        </Card>
    )
}
