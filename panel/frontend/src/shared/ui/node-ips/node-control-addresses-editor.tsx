import {
    ActionIcon,
    Alert,
    Button,
    CopyButton,
    Group,
    Paper,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip
} from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { CreateNodeCommand, UpdateNodeCommand } from '@remnawave/backend-contract'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowDown, TbArrowUp, TbCheck, TbCopy, TbNetwork, TbPlus, TbX } from 'react-icons/tb'

import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'
import { normalizeNodeAddress } from '@shared/utils/node-addresses'
import {
    MAX_NODE_CONTROL_ADDRESSES,
    NodeControlAddress
} from '@shared/utils/node-control-addresses'

interface EditableAddress extends NodeControlAddress {
    id: string
    saved: boolean
}

interface IProps<T extends CreateNodeCommand.RequestBody | UpdateNodeCommand.RequestBody> {
    disabled?: boolean
    form: UseFormReturnType<T>
    hasProxy?: boolean
    savedAddresses?: readonly NodeControlAddress[]
}

let nextId = 0
const withId = (entry: NodeControlAddress): EditableAddress => ({
    ...entry,
    id: `control-address-${++nextId}`,
    saved: false
})

export function NodeControlAddressesEditor<
    T extends CreateNodeCommand.RequestBody | UpdateNodeCommand.RequestBody
>({ disabled = false, form, hasProxy, savedAddresses = [] }: IProps<T>) {
    const { t } = useTranslation()
    const [items, setItems] = useState(() =>
        (form.getValues().controlAddresses ?? []).map((entry) => ({
            ...withId(entry),
            saved: savedAddresses.some(
                (saved) =>
                    normalizeNodeAddress(saved.address) === normalizeNodeAddress(entry.address)
            )
        }))
    )
    const [addedId, setAddedId] = useState<string | null>(null)
    const saved = new Set(savedAddresses.map((entry) => normalizeNodeAddress(entry.address)))
    const addressesDirty = form.isDirty('controlAddresses')
    const proxyUrl = form.useWatchValue('proxyUrl')
    const viaProxy = form.isDirty('proxyUrl') ? Boolean(proxyUrl) : (hasProxy ?? Boolean(proxyUrl))
    const full = items.length >= MAX_NODE_CONTROL_ADDRESSES
    const commit = (next: EditableAddress[]) => {
        setItems(next)
        form.clearFieldError('controlAddresses')
        items.forEach((_, index) => form.clearFieldError(`controlAddresses.${index}.address`))
        form.setFieldValue(
            'controlAddresses',
            next.map(({ address, enabled }) => ({ address, enabled })) as never,
            { forceUpdate: false }
        )
    }
    const move = (index: number, direction: -1 | 1) => {
        const next = [...items]
        ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
        commit(next)
    }
    return (
        <SectionCard.Root>
            <SectionCard.Section>
                <Group justify="space-between" gap="sm">
                    <BaseOverlayHeader
                        iconColor="cyan"
                        IconComponent={TbNetwork}
                        iconVariant="soft"
                        title={t('common.field.ip-addresses')}
                        titleOrder={5}
                    />
                    <Tooltip
                        label={t('node-control-addresses.max', { max: MAX_NODE_CONTROL_ADDRESSES })}
                        disabled={!full}
                    >
                        <Button
                            disabled={disabled || full}
                            leftSection={<TbPlus size={16} />}
                            onClick={() => {
                                if (full) return
                                const item = withId({ address: '', enabled: true })
                                setAddedId(item.id)
                                commit([...items, item])
                            }}
                            size="compact-sm"
                            variant="light"
                        >
                            {t('node-control-addresses.add')}
                        </Button>
                    </Tooltip>
                </Group>
            </SectionCard.Section>
            <SectionCard.Section>
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        {t('node-control-addresses.help')}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {t(
                            viaProxy
                                ? 'node-control-addresses.proxy'
                                : 'node-control-addresses.direct'
                        )}
                    </Text>
                    {!items.some((entry) => entry.enabled) && (
                        <Alert color="yellow">{t('node-control-addresses.all-off')}</Alert>
                    )}
                    <Stack component="ol" gap="sm" m={0} p={0} style={{ listStyle: 'none' }}>
                        {items.map((item, index) => {
                            const isSaved =
                                item.saved ||
                                (!addressesDirty && saved.has(normalizeNodeAddress(item.address)))
                            const label = item.address || t('node-control-addresses.new')
                            return (
                                <Paper component="li" key={item.id} p="xs" withBorder>
                                    <Stack gap="xs">
                                        <Group justify="space-between" gap="xs">
                                            <Text size="xs" fw={600}>
                                                {t('node-control-addresses.priority', {
                                                    index: index + 1
                                                })}
                                            </Text>
                                            <Switch
                                                aria-label={t('node-control-addresses.toggle', {
                                                    address: label
                                                })}
                                                checked={item.enabled}
                                                disabled={disabled}
                                                label={t('node-control-addresses.for-panel')}
                                                onChange={(event) =>
                                                    commit(
                                                        items.map((entry) =>
                                                            entry.id === item.id
                                                                ? {
                                                                      ...entry,
                                                                      enabled:
                                                                          event.currentTarget
                                                                              .checked
                                                                  }
                                                                : entry
                                                        )
                                                    )
                                                }
                                            />
                                        </Group>
                                        <TextInput
                                            aria-label={t('node-control-addresses.address', {
                                                index: index + 1
                                            })}
                                            autoFocus={item.id === addedId}
                                            dir="ltr"
                                            disabled={disabled}
                                            error={form.errors[`controlAddresses.${index}.address`]}
                                            onChange={(event) => {
                                                const address = event.currentTarget.value
                                                commit(
                                                    items.map((entry) =>
                                                        entry.id === item.id
                                                            ? { ...entry, address }
                                                            : entry
                                                    )
                                                )
                                            }}
                                            placeholder={t('node-control-addresses.placeholder')}
                                            readOnly={isSaved}
                                            rightSection={
                                                <CopyButton value={item.address.trim()}>
                                                    {({ copied, copy }) => (
                                                        <ActionIcon
                                                            aria-label={t('common.action.copy')}
                                                            disabled={!item.address.trim()}
                                                            onClick={copy}
                                                            size="sm"
                                                            variant="subtle"
                                                        >
                                                            {copied ? (
                                                                <TbCheck size={16} />
                                                            ) : (
                                                                <TbCopy size={16} />
                                                            )}
                                                        </ActionIcon>
                                                    )}
                                                </CopyButton>
                                            }
                                            rightSectionPointerEvents="all"
                                            styles={{
                                                input: {
                                                    fontFamily:
                                                        'var(--mantine-font-family-monospace)'
                                                }
                                            }}
                                            value={item.address}
                                        />
                                        <Group gap="xs" justify="flex-end">
                                            {!isSaved && (
                                                <ActionIcon
                                                    aria-label={t(
                                                        'node-control-addresses.discard',
                                                        { address: label }
                                                    )}
                                                    disabled={disabled}
                                                    onClick={() =>
                                                        commit(
                                                            items.filter(
                                                                (entry) => entry.id !== item.id
                                                            )
                                                        )
                                                    }
                                                    variant="subtle"
                                                    size="lg"
                                                    color="gray"
                                                >
                                                    <TbX size={18} />
                                                </ActionIcon>
                                            )}
                                            <ActionIcon
                                                aria-label={t('node-control-addresses.up', {
                                                    address: label
                                                })}
                                                disabled={disabled || index === 0}
                                                onClick={() => move(index, -1)}
                                                variant="subtle"
                                                size="lg"
                                            >
                                                <TbArrowUp size={18} />
                                            </ActionIcon>
                                            <ActionIcon
                                                aria-label={t('node-control-addresses.down', {
                                                    address: label
                                                })}
                                                disabled={disabled || index === items.length - 1}
                                                onClick={() => move(index, 1)}
                                                variant="subtle"
                                                size="lg"
                                            >
                                                <TbArrowDown size={18} />
                                            </ActionIcon>
                                        </Group>
                                    </Stack>
                                </Paper>
                            )
                        })}
                    </Stack>
                    {typeof form.errors.controlAddresses === 'string' && (
                        <Alert color="red" role="alert">
                            {form.errors.controlAddresses}
                        </Alert>
                    )}
                </Stack>
            </SectionCard.Section>
        </SectionCard.Root>
    )
}
