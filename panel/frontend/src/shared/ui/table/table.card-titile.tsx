import {
    ActionIcon,
    ActionIconProps,
    Box,
    CardSection,
    CardSectionProps,
    Group,
    Stack,
    Text,
    Title
} from '@mantine/core'
import clsx from 'clsx'
import { forwardRef, ReactNode } from 'react'

import classes from './table.module.css'

export interface CardTitleProps extends Omit<CardSectionProps, 'c' | 'fw' | 'size' | 'tt'> {
    actions?: ReactNode
    description?: string
    icon: ReactNode
    iconProps?: ActionIconProps
    title: ReactNode
}

export const CardTitle = forwardRef<HTMLDivElement, CardTitleProps>(
    (
        { title, description, actions, withBorder = true, icon, iconProps, className, ...props },
        ref
    ) => (
        <CardSection
            px="lg"
            py="md"
            ref={ref}
            withBorder={withBorder}
            {...props}
            className={clsx(classes.card, className)}
        >
            <Box className={classes.headerWrapper}>
                <Group className={classes.contentSection} gap="sm" wrap="nowrap">
                    <ActionIcon
                        component="span"
                        size={36}
                        variant="light"
                        {...iconProps}
                        aria-hidden
                        tabIndex={-1}
                    >
                        {icon}
                    </ActionIcon>
                    <Stack gap={4} miw={0}>
                        <Title order={4}>{title}</Title>
                        {description && (
                            <Text c="dimmed" size="sm">
                                {description}
                            </Text>
                        )}
                    </Stack>
                </Group>
                {actions && (
                    <Group className={classes.actionsSection} gap="xs" wrap="wrap">
                        {actions}
                    </Group>
                )}
            </Box>
        </CardSection>
    )
)
