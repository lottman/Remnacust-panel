import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers'
import { move } from '@dnd-kit/helpers'
import { DragDropProvider, DragEndEvent } from '@dnd-kit/react'
import {
    ActionIcon,
    Alert,
    Center,
    Group,
    MantineSize,
    ScrollArea,
    Stack,
    Text,
    ThemeIcon,
    Tooltip
} from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import {
    CreateNodeCommand,
    TNodeIps,
    TNodeIpStatus,
    UpdateNodeCommand
} from '@remnawave/backend-contract'
import { ReactNode, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbNetwork, TbPlus } from 'react-icons/tb'

import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'
import { normalizeNodeAddress } from '@shared/utils/node-addresses'

import { NodeIpRow } from './node-ip-row'
import { isValidNodeIp, MAX_NODE_IPS } from './validate-node-ips'

interface IEditableNodeIp {
    id: string
    ip: string
    isDraft?: boolean
    status: TNodeIpStatus
}

interface IProps<T extends CreateNodeCommand.RequestBody | UpdateNodeCommand.RequestBody> {
    form: UseFormReturnType<T>
    size?: MantineSize
}

const VISIBLE_ROWS = 3
const ROW_GAP = 10
const ROW_HEIGHT: Record<string, number> = { xs: 30, sm: 36, md: 42 }
const DEFAULT_ROW_HEIGHT = 36

let rowIdCounter = 0
const nextRowId = () => {
    rowIdCounter += 1
    return `node-ip-${rowIdCounter}`
}

const toEditableIps = (ips: null | TNodeIps | undefined): IEditableNodeIp[] =>
    (ips ?? []).map((entry) => ({ id: nextRowId(), ip: entry.ip, status: entry.status }))

export const NodeIpsEditor = <
    T extends CreateNodeCommand.RequestBody | UpdateNodeCommand.RequestBody
>(
    props: IProps<T>
) => {
    const { form, size = 'sm' } = props

    const { t } = useTranslation()

    const [items, setItems] = useState<IEditableNodeIp[]>(() => toEditableIps(form.getValues().ips))
    const [addedRowId, setAddedRowId] = useState<null | string>(null)
    const address = form.useWatchValue('address')
    const primaryAddress = normalizeNodeAddress(address ?? '')
    const visibleItems = items.filter(
        (item) =>
            item.isDraft || !primaryAddress || normalizeNodeAddress(item.ip) !== primaryAddress
    )

    const commit = useCallback(
        (nextItems: IEditableNodeIp[]) => {
            setItems(nextItems)

            const nextIps: TNodeIps = nextItems.map((item) => ({
                ip: item.ip.trim(),
                status: item.status
            }))

            form.setFieldValue('ips', nextIps as never, { forceUpdate: false })
        },
        [form]
    )

    const handleAdd = () => {
        if (items.length >= MAX_NODE_IPS) return

        const id = nextRowId()
        setAddedRowId(id)
        commit([...items, { id, ip: '', isDraft: true, status: 'UNKNOWN' }])
    }

    const handleRemove = (id: string) => {
        commit(items.filter((item) => item.id !== id))
    }

    const handleChangeIp = (id: string, ip: string) => {
        commit(items.map((item) => (item.id === id ? { ...item, ip, isDraft: true } : item)))
    }

    const handleChangeStatus = (id: string, status: TNodeIpStatus) => {
        commit(items.map((item) => (item.id === id ? { ...item, status } : item)))
    }

    const handleDragEnd = (event: DragEndEvent) => {
        if (event.canceled) return

        const reordered = move(visibleItems, event)
        const visibleIds = new Set(visibleItems.map((item) => item.id))
        let index = 0
        commit(items.map((item) => (visibleIds.has(item.id) ? reordered[index++] : item)))
    }

    const resolveRowError = (item: IEditableNodeIp, index: number): ReactNode => {
        if (!form.errors[`ips.${index}.ip`]) {
            return undefined
        }

        const ip = item.ip.trim()

        if (!ip) return t('node-ips.ip-is-required')
        if (!isValidNodeIp(ip)) return t('node-ips.invalid-ip')

        return undefined
    }

    const resolveRowDescription = (item: IEditableNodeIp): ReactNode => {
        const ip = normalizeNodeAddress(item.ip)
        if (!ip || !isValidNodeIp(item.ip.trim())) return undefined
        if (ip === primaryAddress) return t('node-ips.primary-ip-description')
        if (items.some((other) => other.id !== item.id && normalizeNodeAddress(other.ip) === ip)) {
            return t('node-ips.duplicate-ip-description')
        }
        return undefined
    }

    const isFull = items.length >= MAX_NODE_IPS

    return (
        <SectionCard.Root>
            <SectionCard.Section>
                <Group gap="sm" justify="space-between" wrap="nowrap">
                    <BaseOverlayHeader
                        iconColor="cyan"
                        IconComponent={TbNetwork}
                        iconVariant="soft"
                        title={t('common.field.ip-addresses')}
                        titleOrder={5}
                    />

                    <Tooltip
                        label={
                            isFull
                                ? t('node-ips.max-ips-reached', { max: MAX_NODE_IPS })
                                : t('node-ips.add-ip')
                        }
                    >
                        <ActionIcon
                            aria-label={t('node-ips.add-ip')}
                            color="cyan"
                            disabled={isFull}
                            onClick={handleAdd}
                            size="lg"
                            variant="soft"
                        >
                            <TbPlus size={18} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </SectionCard.Section>

            <SectionCard.Section>
                <Stack gap="sm">
                    {visibleItems.length === 0 ? (
                        <Center py="xs">
                            <Stack align="center" gap="xs">
                                <ThemeIcon color="gray" radius="xl" size={48} variant="soft">
                                    <TbNetwork size={24} />
                                </ThemeIcon>
                                <Text c="dimmed" fw={600} size="sm" ta="center">
                                    {t('node-ips.no-ips-yet')}
                                </Text>
                            </Stack>
                        </Center>
                    ) : (
                        <DragDropProvider
                            modifiers={[RestrictToVerticalAxis]}
                            onDragEnd={handleDragEnd}
                        >
                            <ScrollArea.Autosize
                                mah={
                                    VISIBLE_ROWS * (ROW_HEIGHT[size] ?? DEFAULT_ROW_HEIGHT) +
                                    (VISIBLE_ROWS - 1) * ROW_GAP
                                }
                                scrollbarSize={6}
                                type="auto"
                            >
                                <Stack gap="xs" px={4}>
                                    {visibleItems.map((item, index) => (
                                        <NodeIpRow
                                            autoFocus={item.id === addedRowId}
                                            description={resolveRowDescription(item)}
                                            error={resolveRowError(item, items.indexOf(item))}
                                            id={item.id}
                                            index={index}
                                            ip={item.ip}
                                            key={item.id}
                                            onChangeIp={(ip) => handleChangeIp(item.id, ip)}
                                            onChangeStatus={(status) =>
                                                handleChangeStatus(item.id, status)
                                            }
                                            onRemove={() => handleRemove(item.id)}
                                            size={size}
                                            status={item.status}
                                        />
                                    ))}
                                </Stack>
                            </ScrollArea.Autosize>
                        </DragDropProvider>
                    )}

                    {typeof form.errors.ips === 'string' && (
                        <Alert color="red" p="xs" radius="md">
                            {form.errors.ips}
                        </Alert>
                    )}
                </Stack>
            </SectionCard.Section>
        </SectionCard.Root>
    )
}
