import { Group, Stack, Text, ThemeIcon, ThemeIconProps, Title, TitleProps } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { ReactNode } from 'react'
import ReactCountryFlag from 'react-country-flag'

import { TOpenEntity } from '@shared/constants'
import { CopyEntityLinkButton } from '@shared/ui/copy-entity-link-button'

type IProps = {
    countryCode?: string
    hideIcon?: boolean
    icon?: ReactNode
    iconColor?: ThemeIconProps['color']
    IconComponent: React.ComponentType<{ size: number }>
    iconSize?: number
    iconVariant: ThemeIconProps['variant']
    openEntity?: { entity: TOpenEntity; id: number | string }
    subtitle?: ReactNode | string
    themeIconProps?: ThemeIconProps
    title: string
    titleOrder?: TitleProps['order']
    truncateTitle?: boolean
    withCopy?: boolean
}

export const BaseOverlayHeader = (props: IProps) => {
    const {
        themeIconProps,
        IconComponent,
        countryCode,
        iconSize = 20,
        iconVariant,
        iconColor,
        openEntity,
        subtitle,
        title,
        titleOrder = 4,
        withCopy = false,
        hideIcon = false,
        icon,
        truncateTitle = false
    } = props

    const { copy } = useClipboard()

    return (
        <Group gap="sm" style={{ minWidth: 0, maxWidth: '100%' }} wrap="nowrap">
            {!hideIcon && (
                <ThemeIcon
                    color={iconColor}
                    size="lg"
                    style={{ flexShrink: 0 }}
                    variant={iconVariant}
                    {...themeIconProps}
                >
                    <IconComponent size={iconSize} />
                </ThemeIcon>
            )}

            {icon}

            {countryCode && countryCode !== 'XX' && (
                <ReactCountryFlag
                    countryCode={countryCode}
                    style={{ fontSize: '1.5em', flexShrink: 0 }}
                />
            )}

            <Stack gap="0" style={{ minWidth: 0, ...(truncateTitle && { overflow: 'hidden' }) }}>
                <Title
                    c="var(--mantine-color-text)"
                    onClick={() => withCopy && copy(title)}
                    order={titleOrder}
                    style={{
                        cursor: withCopy ? 'copy' : 'default',
                        overflowWrap: 'anywhere',
                        ...(truncateTitle && {
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        })
                    }}
                >
                    {title}
                </Title>
                <Text
                    c="dimmed"
                    onClick={() => withCopy && copy(subtitle)}
                    size="xs"
                    style={{ cursor: withCopy ? 'copy' : 'default', overflowWrap: 'anywhere' }}
                >
                    {subtitle}
                </Text>
            </Stack>

            {openEntity && <CopyEntityLinkButton entity={openEntity.entity} id={openEntity.id} />}
        </Group>
    )
}
