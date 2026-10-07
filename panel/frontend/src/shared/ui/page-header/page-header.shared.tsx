import {
    Box,
    Card,
    CardProps,
    Group,
    Stack,
    Text,
    ThemeIcon,
    Title,
    UnstyledButton
} from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import clsx from 'clsx'
import { forwardRef, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import classes from './page-header.module.css'

export interface PageHeaderSharedProps extends Omit<CardProps, 'c' | 'fw' | 'size' | 'tt'> {
    actions?: ReactNode
    customThemeIcon?: ReactNode
    description?: string
    icon?: ReactNode
    title: ReactNode
    wrapActions?: boolean
}

export const PageHeaderShared = forwardRef<HTMLDivElement, PageHeaderSharedProps>(
    (
        {
            icon,
            title,
            description,
            actions,
            customThemeIcon,
            wrapActions = true,
            className,
            ...props
        },
        ref
    ) => {
        const { copy } = useClipboard()
        const { t } = useTranslation()
        const handleCopy = () => {
            if (!description) return
            copy(description)
            notifications.show({
                message: description,
                title: t('common.message.copied'),
                color: 'teal'
            })
        }
        return (
            <Card
                data-panel-page-header
                mb="lg"
                padding={0}
                ref={ref}
                shadow="none"
                withBorder={false}
                {...props}
                className={clsx(classes.card, className)}
            >
                <Box className={classes.headerWrapper}>
                    <Group className={classes.contentSection} gap="sm" wrap="nowrap">
                        {(customThemeIcon || icon) && (
                            <Box className={classes.pageIcon}>
                                {customThemeIcon || (
                                    <ThemeIcon size={40} variant="light" radius="md">
                                        {icon}
                                    </ThemeIcon>
                                )}
                            </Box>
                        )}
                        <Stack gap={4} miw={0}>
                            <Title className={classes.title} order={2}>
                                {title}
                            </Title>
                            {description && (
                                <UnstyledButton
                                    className={classes.description}
                                    onClick={handleCopy}
                                    title={t('common.action.copy')}
                                >
                                    <Text c="dimmed" size="sm">
                                        {description}
                                    </Text>
                                </UnstyledButton>
                            )}
                        </Stack>
                    </Group>
                    {actions && (
                        <Box className={classes.actionsSection}>
                            <Group
                                gap="xs"
                                justify="flex-end"
                                wrap={wrapActions ? 'wrap' : 'nowrap'}
                            >
                                {actions}
                            </Group>
                        </Box>
                    )}
                </Box>
            </Card>
        )
    }
)
