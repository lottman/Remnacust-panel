import { Badge, Box, Group, Progress, Text, Tooltip } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import { useUiText } from '@shared/i18n/interface-text'

import { LimitUser } from './limits.api'

export function LimitsUsageCell({
    user,
    display
}: {
    user: LimitUser
    display: (bytes: string) => string
}) {
    const { t } = useTranslation()
    const uiText = useUiText()
    const unlimited = user.limitBytes === '0'
    const percentage = unlimited
        ? 0
        : Number(
              (BigInt(user.usedBytes) * 10000n + BigInt(user.limitBytes) / 2n) /
                  BigInt(user.limitBytes)
          ) / 100
    const color = unlimited || percentage <= 80 ? 'teal' : percentage > 95 ? 'red' : 'yellow.4'

    return (
        <Box w="100%" miw={300}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
                <Group gap={4} wrap="nowrap">
                    <Tooltip
                        label={
                            user.unlimited
                                ? t('limitsUnlimited.active')
                                : uiText('quota-usage-a0b5917')
                        }
                    >
                        <Text c={color} fw={700} size="xs">
                            <bdi dir="ltr">{unlimited ? '∞' : `${percentage.toFixed(2)}%`}</bdi>
                        </Text>
                    </Tooltip>
                    {user.unlimited && (
                        <Badge size="xs" variant="soft">
                            {t('limitsUnlimited.active')}
                        </Badge>
                    )}
                </Group>
                <Text c={color} fw={700} size="xs">
                    <bdi dir="ltr">
                        {unlimited ? '∞' : `${Math.max(0, 100 - percentage).toFixed(2)}%`}
                    </bdi>
                </Text>
            </Group>
            <Progress
                color={color}
                radius="xs"
                size="md"
                value={unlimited ? 100 : Math.min(100, percentage)}
                aria-label={uiText('quota-usage-a0b5917')}
            />
            <Group justify="space-between" gap="xs" mt={2} wrap="nowrap">
                <Text c="dimmed" fw={550} size="xs">
                    <bdi dir="ltr">{display(user.usedBytes)}</bdi>
                </Text>
                <Text c="dimmed" fw={550} size="xs">
                    <bdi dir="ltr">{unlimited ? '∞' : display(user.limitBytes)}</bdi>
                </Text>
            </Group>
        </Box>
    )
}
