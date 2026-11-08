import {
    ActionIcon,
    Button,
    Group,
    Modal,
    Pagination,
    ScrollArea,
    Stack,
    Text
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowDown, TbArrowUp, TbListNumbers } from 'react-icons/tb'

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
    const [opened, setOpened] = useState(false)
    const [page, setPage] = useState(1)
    const mobile = useMediaQuery('(max-width: 48em)')
    const labels = new Map(options.map((option) => [option.value, option.label]))
    const pages = Math.max(1, Math.ceil(values.length / 20))
    const currentPage = Math.min(page, pages)
    const move = (index: number, direction: number) => {
        const next = [...values],
            target = index + direction
        if (target < 0 || target >= next.length) return
        ;[next[index], next[target]] = [next[target], next[index]]
        onChange(next)
        setPage(Math.floor(target / 20) + 1)
    }
    return (
        <Stack gap="xs" miw={0}>
            <Button
                variant="default"
                leftSection={<TbListNumbers size={18} />}
                onClick={() => {
                    setPage(1)
                    setOpened(true)
                }}
                disabled={values.length < 2}
            >
                {t('autoselect.server-order')}
            </Button>
            <Text size="xs" c="dimmed" lineClamp={2} style={{ overflowWrap: 'anywhere' }}>
                {values
                    .slice(0, 3)
                    .map((value, index) => `${index + 1}. ${labels.get(value) ?? value}`)
                    .join(' → ')}
            </Text>
            <Modal
                opened={opened}
                onClose={() => setOpened(false)}
                title={t('autoselect.server-order')}
                size="lg"
                fullScreen={mobile}
                scrollAreaComponent={ScrollArea.Autosize}
                closeButtonProps={{ 'aria-label': t('common.action.close') }}
            >
                <Stack gap="sm">
                    {values.slice((currentPage - 1) * 20, currentPage * 20).map((value, offset) => {
                        const index = (currentPage - 1) * 20 + offset
                        return (
                            <Group key={`${index}:${value}`} gap="xs" wrap="nowrap">
                                <Text size="xs" c="dimmed" miw={28}>
                                    {index + 1}.
                                </Text>
                                <Text
                                    size="sm"
                                    flex={1}
                                    miw={0}
                                    style={{ overflowWrap: 'anywhere' }}
                                >
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
                        )
                    })}
                    {pages > 1 && (
                        <Pagination
                            total={pages}
                            value={currentPage}
                            onChange={setPage}
                            siblings={0}
                        />
                    )}
                    <Button variant="default" onClick={() => setOpened(false)}>
                        {t('common.action.close')}
                    </Button>
                </Stack>
            </Modal>
        </Stack>
    )
}
