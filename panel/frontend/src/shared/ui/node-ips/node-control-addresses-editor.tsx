import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    CopyButton,
    Group,
    ScrollArea,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip
} from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { CreateNodeCommand, UpdateNodeCommand } from '@remnawave/backend-contract'
import { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowDown, TbArrowUp, TbCheck, TbCopy, TbNetwork, TbPlus } from 'react-icons/tb'

import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'
import { normalizeNodeAddress } from '@shared/utils/node-addresses'
import {
    MAX_NODE_CONTROL_ADDRESSES,
    NodeControlAddress
} from '@shared/utils/node-control-addresses'

import { NodeIpStatusIcon } from './node-ip-status-icon'
import { resolveNodeIpStatusMeta } from './node-ip-status.constants'

interface EditableAddress extends NodeControlAddress {
    id: string
    saved: boolean
}

interface IProps<T extends CreateNodeCommand.RequestBody | UpdateNodeCommand.RequestBody> {
    disabled?: boolean
    form: UseFormReturnType<T>
    hasProxy?: boolean
    ips?: readonly { ip: string; status: string }[]
    rescanAction?: ReactNode
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
>({ disabled = false, form, hasProxy, ips = [], rescanAction, savedAddresses = [] }: IProps<T>) {
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
    const panelId = items.find((entry) => entry.enabled && entry.address.trim())?.id
    const enabledAddresses = items.filter((entry) => entry.enabled && entry.address.trim()).length
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
                    <Group gap="xs">
                        {rescanAction}
                        <Tooltip
                            label={t('node-control-addresses.max', {
                                max: MAX_NODE_CONTROL_ADDRESSES
                            })}
                            disabled={!full}
                        >
                            <Button
                                data-path={
                                    (
                                        form.getInputProps('controlAddresses') as {
                                            'data-path'?: string
                                        }
                                    )['data-path']
                                }
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
                    <ScrollArea.Autosize mah={128} scrollbarSize={6} type="auto">
                        <Stack
                            component="ol"
                            gap="xs"
                            m={0}
                            px={4}
                            py={0}
                            style={{ listStyle: 'none' }}
                        >
                            {items.map((item, index) => {
                                const isSaved =
                                    item.saved ||
                                    (!addressesDirty &&
                                        saved.has(normalizeNodeAddress(item.address)))
                                const label = item.address || t('node-control-addresses.new')
                                const normalized = normalizeNodeAddress(item.address)
                                const isPanelAddress = item.id === panelId
                                const isLastEnabled = Boolean(
                                    item.enabled && item.address.trim() && enabledAddresses === 1
                                )
                                const status =
                                    ips.find(
                                        (entry) => normalizeNodeAddress(entry.ip) === normalized
                                    )?.status ?? (isPanelAddress ? 'MANAGEMENT' : 'UNKNOWN')
                                return (
                                    <Group
                                        component="li"
                                        key={item.id}
                                        align="flex-start"
                                        gap={6}
                                        wrap="nowrap"
                                    >
                                        <Tooltip
                                            label={t(resolveNodeIpStatusMeta(status).labelKey)}
                                        >
                                            <span
                                                aria-label={t(
                                                    resolveNodeIpStatusMeta(status).labelKey
                                                )}
                                            >
                                                <NodeIpStatusIcon
                                                    status={status}
                                                    size={36}
                                                    iconSize={20}
                                                />
                                            </span>
                                        </Tooltip>
                                        <TextInput
                                            aria-label={t('node-control-addresses.address', {
                                                index: index + 1
                                            })}
                                            autoFocus={item.id === addedId}
                                            dir="ltr"
                                            data-path={
                                                (
                                                    form.getInputProps(
                                                        `controlAddresses.${index}.address`
                                                    ) as {
                                                        'data-path'?: string
                                                    }
                                                )['data-path']
                                            }
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
                                            leftSection={
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
                                            leftSectionPointerEvents="all"
                                            rightSection={
                                                isPanelAddress ? (
                                                    <Badge
                                                        color="violet"
                                                        size="xs"
                                                        variant="soft"
                                                        radius="sm"
                                                    >
                                                        {t('node-control-addresses.panel')}
                                                    </Badge>
                                                ) : undefined
                                            }
                                            rightSectionWidth={isPanelAddress ? 82 : undefined}
                                            size="sm"
                                            style={{ flex: 1, minWidth: 0 }}
                                            styles={{
                                                input: {
                                                    fontFamily:
                                                        'var(--mantine-font-family-monospace)'
                                                }
                                            }}
                                            value={item.address}
                                        />
                                        <Tooltip
                                            events={{ hover: true, focus: true, touch: true }}
                                            label={
                                                isLastEnabled
                                                    ? t('node-control-addresses.last-enabled')
                                                    : t('node-control-addresses.toggle', {
                                                          address: label
                                                      })
                                            }
                                            maw={300}
                                            multiline
                                        >
                                            <span
                                                aria-label={
                                                    isLastEnabled
                                                        ? t('node-control-addresses.last-enabled')
                                                        : undefined
                                                }
                                                style={{ display: 'inline-flex', marginTop: 8 }}
                                                tabIndex={
                                                    isLastEnabled && !disabled ? 0 : undefined
                                                }
                                            >
                                                <Switch
                                                    aria-label={t('node-control-addresses.toggle', {
                                                        address: label
                                                    })}
                                                    checked={item.enabled}
                                                    disabled={disabled || isLastEnabled}
                                                    onChange={(event) => {
                                                        const enabled = event.currentTarget.checked
                                                        if (disabled || (!enabled && isLastEnabled))
                                                            return
                                                        commit(
                                                            !enabled &&
                                                                !isSaved &&
                                                                !item.address.trim()
                                                                ? items.filter(
                                                                      (entry) =>
                                                                          entry.id !== item.id
                                                                  )
                                                                : items.map((entry) =>
                                                                      entry.id === item.id
                                                                          ? { ...entry, enabled }
                                                                          : entry
                                                                  )
                                                        )
                                                    }}
                                                />
                                            </span>
                                        </Tooltip>
                                        <Stack gap={0}>
                                            <ActionIcon
                                                aria-label={t('node-control-addresses.up', {
                                                    address: label
                                                })}
                                                disabled={disabled || index === 0}
                                                onClick={() => move(index, -1)}
                                                variant="subtle"
                                                size={18}
                                            >
                                                <TbArrowUp size={14} />
                                            </ActionIcon>
                                            <ActionIcon
                                                aria-label={t('node-control-addresses.down', {
                                                    address: label
                                                })}
                                                disabled={disabled || index === items.length - 1}
                                                onClick={() => move(index, 1)}
                                                variant="subtle"
                                                size={18}
                                            >
                                                <TbArrowDown size={14} />
                                            </ActionIcon>
                                        </Stack>
                                    </Group>
                                )
                            })}
                        </Stack>
                    </ScrollArea.Autosize>
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
