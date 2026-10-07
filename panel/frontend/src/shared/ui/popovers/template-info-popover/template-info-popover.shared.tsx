import { ActionIcon, Box, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { TEMPLATE_KEYS, TemplateKeys } from '@remnawave/backend-contract'
import { TSubscriptionPageTemplateKey } from '@remnawave/subscription-page-types'
import { useTranslation } from 'react-i18next'
import { TbInfoSquare } from 'react-icons/tb'

import { useIsMobile } from '@shared/hooks'
import { CopyableCodeBlock } from '@shared/ui/copyable-code-block'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'

interface IProps {
    compact?: boolean
    templateKeys?:
        | readonly (TemplateKeys | 'HOST_SPEED')[]
        | readonly TSubscriptionPageTemplateKey[]
}

const HOST_TEMPLATE_KEYS = [
    ...new Set<TemplateKeys | 'HOST_SPEED'>([
        ...TEMPLATE_KEYS,
        'HOST_SPEED'
    ])
]

export const TemplateInfoPopoverShared = (props: IProps) => {
    const { templateKeys = HOST_TEMPLATE_KEYS, compact = false } = props

    const isMobile = useIsMobile()

    const { t } = useTranslation()

    const handleClick = () => {
        modals.open({
            children: (
                <Stack>
                    <Text size="sm">
                        {t(
                            'template-info-popover.shared.you-can-use-template-variables-in-this-field'
                        )}
                        <br />
                        {t('template-info-popover.shared.available-variables-are-listed-below')}
                    </Text>

                    <SimpleGrid cols={{ base: 1, xs: 2 }} key="template-keys" spacing="xs">
                        {templateKeys.map((key) => (
                            <Tooltip
                                events={{ hover: true, focus: true, touch: true }}
                                key={key}
                                label={t(`template-info-popover.shared.descriptions.${key}`)}
                                maw="calc(100vw - 32px)"
                                openDelay={200}
                                w={320}
                                multiline
                                withArrow
                            >
                                <Box>
                                    <CopyableCodeBlock size="small" value={`{{${key}}}`} />
                                </Box>
                            </Tooltip>
                        ))}
                    </SimpleGrid>
                </Stack>
            ),
            size: 'auto',
            fullScreen: isMobile,
            title: (
                <BaseOverlayHeader
                    iconColor="lime"
                    IconComponent={TbInfoSquare}
                    iconVariant="soft"
                    title={t('template-info-popover.shared.template-variables')}
                />
            )
        })
    }

    return (
        <Tooltip label={t('template-info-popover.shared.template-variables')} withArrow>
            <ActionIcon
                aria-label={t('template-info-popover.shared.template-variables')}
                color="lime"
                onClick={handleClick}
                radius="md"
                size={compact ? 'sm' : 'input-md'}
                variant="soft"
            >
                <TbInfoSquare size={compact ? 18 : 24} />
            </ActionIcon>
        </Tooltip>
    )
}
