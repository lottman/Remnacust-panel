import { ActionIcon, HoverCard, px, Stack, Text } from '@mantine/core'
import { ExternalSquadHostOverridesSchema } from '@remnawave/backend-contract'
import { TFunction } from 'i18next'
import { HiQuestionMarkCircle } from 'react-icons/hi'
import { PiIdentificationBadge } from 'react-icons/pi'
import { TbFileDescription } from 'react-icons/tb'

import { translateUiText as uiText } from '@shared/i18n/interface-text'

const hoverCard = (text: string) => {
    return (
        <HoverCard shadow="md" width={280} withArrow>
            <HoverCard.Target>
                <ActionIcon color="gray" size="xs" variant="subtle">
                    <HiQuestionMarkCircle size={20} />
                </ActionIcon>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Stack gap="md">
                    <Stack gap="sm">
                        <Text c="dimmed" size="sm">
                            {text}
                        </Text>
                    </Stack>
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    )
}

export function resolveHostFormFields(
    field: keyof typeof ExternalSquadHostOverridesSchema.shape,
    t: TFunction
): {
    description?: string
    hoverCard?: React.ReactNode
    inputType?: 'boolean' | 'number' | 'string' | 'textarea'
    label: string
    leftSection?: React.ReactNode
    rightSection?: React.ReactNode
} {
    switch (field) {
        case 'serverDescription':
            return {
                label: t('base-host-form.server-description-header'),
                leftSection: <TbFileDescription size={20} />,
                inputType: 'string'
            }

        case 'vlessRouteId':
            return {
                description: t('base-host-form.vless-route-description'),
                get label() {
                    return uiText('vless-route-id-5e33c03')
                },
                inputType: 'number',
                hoverCard: hoverCard(t('base-host-form.vless-route-description')),
                leftSection: <PiIdentificationBadge size={px('1.2rem')} />
            }

        default:
            return {
                get label() {
                    return uiText('unknown-setting-d7117ae')
                }
            }
    }
}
