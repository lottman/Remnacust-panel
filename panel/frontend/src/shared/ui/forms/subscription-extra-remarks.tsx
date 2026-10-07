import { ActionIcon, Group, Select, Stack, Switch, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { PiArrowDown, PiArrowUp } from 'react-icons/pi'

import { useUiText } from '@shared/i18n/interface-text'

export interface ExtraRemarks {
    hostTrafficPaused?: string[]
    HWIDRegistrationBlocked?: string[]
    alwaysAvailableHostsPosition?: 'before' | 'after'
    combineSubscriptionAndHwidRemarks?: boolean
    subscriptionAndHwidRemarkOrder?: Array<
        'EXPIRED' | 'DISABLED' | 'HWID_BLOCKED' | 'HWID_REGISTRATION_BLOCKED'
    >
    action?: { text: string; buttonText: string; url: string } | null
}

export function SubscriptionExtraRemarks({
    value,
    onChange
}: {
    value: ExtraRemarks
    onChange: (value: ExtraRemarks) => void
}) {
    const uiText = useUiText()

    const { t } = useTranslation()
    const defaultOrder: NonNullable<ExtraRemarks['subscriptionAndHwidRemarkOrder']> = [
        'EXPIRED',
        'DISABLED',
        'HWID_REGISTRATION_BLOCKED',
        'HWID_BLOCKED'
    ]
    const order = value.subscriptionAndHwidRemarkOrder?.length
        ? [...value.subscriptionAndHwidRemarkOrder]
        : defaultOrder
    if (!order.includes('HWID_REGISTRATION_BLOCKED'))
        order.splice(2, 0, 'HWID_REGISTRATION_BLOCKED')
    const statusLabels = {
        HWID_REGISTRATION_BLOCKED: uiText('new-devices-denied-standalone-dcc8096'),
        EXPIRED: t('subscription-user-remarks-card.widget.subscription-expired'),
        DISABLED: t('subscription-user-remarks-card.widget.subscription-disabled'),
        HWID_BLOCKED: t('subscription-user-remarks-card.widget.hwid-blocked')
    } as const

    const moveStatus = (index: number, direction: -1 | 1) => {
        const nextIndex = index + direction
        if (nextIndex < 0 || nextIndex >= order.length) return
        ;[order[index], order[nextIndex]] = [order[nextIndex], order[index]]
        onChange({ ...value, subscriptionAndHwidRemarkOrder: order })
    }

    return (
        <Stack gap="md">
            <Select
                label={uiText('available-host-placement-c6e58c8')}
                data={[
                    { value: 'before', label: uiText('before-remarks-1cae831') },
                    { value: 'after', label: uiText('after-remarks-878b925') }
                ]}
                value={value.alwaysAvailableHostsPosition ?? 'after'}
                allowDeselect={false}
                onChange={(position) =>
                    onChange({
                        ...value,
                        alwaysAvailableHostsPosition: position === 'before' ? 'before' : 'after'
                    })
                }
            />
            <Switch
                checked={value.combineSubscriptionAndHwidRemarks !== false}
                label={t('subscription-user-remarks-card.widget.combine-status-hwid')}
                description={t(
                    'subscription-user-remarks-card.widget.combine-status-hwid-description'
                )}
                onChange={(event) =>
                    onChange({
                        ...value,
                        combineSubscriptionAndHwidRemarks: event.currentTarget.checked
                    })
                }
            />
            {
                <Stack gap="xs">
                    <Text fw={600} size="sm">
                        {t('subscription-user-remarks-card.widget.remark-order')}
                    </Text>
                    {order.map((status, index) => (
                        <Group key={status} justify="space-between" wrap="nowrap">
                            <Text size="sm">
                                {index + 1}. {statusLabels[status]}
                            </Text>
                            <Group gap={4}>
                                <ActionIcon
                                    aria-label={uiText('move-up-c66feb5')}
                                    disabled={index === 0}
                                    onClick={() => moveStatus(index, -1)}
                                    variant="subtle"
                                >
                                    <PiArrowUp />
                                </ActionIcon>
                                <ActionIcon
                                    aria-label={uiText('move-down-40bb50d')}
                                    disabled={index === order.length - 1}
                                    onClick={() => moveStatus(index, 1)}
                                    variant="subtle"
                                >
                                    <PiArrowDown />
                                </ActionIcon>
                            </Group>
                        </Group>
                    ))}
                </Stack>
            }
        </Stack>
    )
}
