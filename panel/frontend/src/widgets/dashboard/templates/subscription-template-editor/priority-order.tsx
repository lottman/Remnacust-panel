import { ActionIcon, Group, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { TbArrowDown, TbArrowUp } from 'react-icons/tb'

export function PriorityOrder({
    values,
    options,
    onChange
}: {
    values: string[]
    options: Array<{ value: string; label: string }>
    onChange: (values: string[]) => void
}) {
    const { t } = useTranslation()
    const labels = new Map(options.map((option) => [option.value, option.label]))
    const move = (index: number, direction: number) => {
        const next = [...values],
            target = index + direction
        if (target < 0 || target >= next.length) return
        ;[next[index], next[target]] = [next[target], next[index]]
        onChange(next)
    }
    return (
        <Stack gap="xs">
            <Text size="sm" fw={600}>
                {t('autoselect.priority-order')}
            </Text>
            {values.map((value, index) => (
                <Group key={`${index}:${value}`} gap="xs" wrap="nowrap">
                    <Text size="xs" c="dimmed" miw={22}>
                        {index + 1}.
                    </Text>
                    <Text size="sm" flex={1} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                        {labels.get(value) ?? value}
                    </Text>
                    <ActionIcon
                        variant="default"
                        size={44}
                        disabled={index === 0}
                        aria-label={t('autoselect.priority-up', {
                            name: labels.get(value) ?? value
                        })}
                        onClick={() => move(index, -1)}
                    >
                        <TbArrowUp size={16} />
                    </ActionIcon>
                    <ActionIcon
                        variant="default"
                        size={44}
                        disabled={index === values.length - 1}
                        aria-label={t('autoselect.priority-down', {
                            name: labels.get(value) ?? value
                        })}
                        onClick={() => move(index, 1)}
                    >
                        <TbArrowDown size={16} />
                    </ActionIcon>
                </Group>
            ))}
        </Stack>
    )
}
