import {
    ActionIcon,
    Box,
    Center,
    Checkbox,
    Divider,
    Group,
    MantineStyleProp,
    Stack,
    Text,
    ThemeIcon
} from '@mantine/core'
import { GetInfraBillingNodesCommand } from '@remnawave/backend-contract'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCheck, TbCpu, TbExternalLink, TbServer } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { queryClient } from '@shared/api'
import { QueryKeys, useUpdateInfraBillingNode } from '@shared/api/hooks'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'

import { getBillingDateStatus } from '../billing-date-status'
import { BillingDateStatusRow } from '../billing-date-status-row'
import classes from '../billing-date-status.module.css'
import { useBillingToday } from '../use-billing-today'

type BillingNode = GetInfraBillingNodesCommand.Response['response']['billingNodes'][number]

interface IProps {
    nodes: GetInfraBillingNodesCommand.Response['response']['billingNodes']
    onToggleSelect?: (uuid: string) => void
    selectedUuids?: Set<string>
    selectMode?: boolean
    style: MantineStyleProp
}

export function MobileNodesListWidget(props: IProps) {
    const { nodes, style, selectMode = false, selectedUuids, onToggleSelect } = props
    const { t, i18n } = useTranslation()
    const today = useBillingToday()
    const [updatingUuids, setUpdatingUuids] = useState<Set<string>>(new Set())

    const { mutate: updateNode } = useUpdateInfraBillingNode({
        mutationFns: {
            onSuccess: (data) => {
                queryClient.setQueryData(QueryKeys.infraBilling.getInfraBillingNodes.queryKey, data)
                setUpdatingUuids(new Set())
            },
            onError: () => setUpdatingUuids(new Set())
        }
    })

    const handleQuickUpdate = (uuid: string, currentDate: Date) => {
        setUpdatingUuids((prev) => new Set(prev).add(uuid))
        updateNode({
            variables: {
                uuids: [uuid],
                // @ts-expect-error - TODO: fix ZOD schema
                nextBillingAt: dayjs(currentDate).add(1, 'month').toISOString()
            }
        })
    }

    const handleClickBillingAt = (node: BillingNode) => {
        showModal('infraBilling_updateBillingDateModal', {
            uuids: [node.uuid],
            nextBillingAt: node.nextBillingAt
        })
    }

    const handleOpenNode = (node: BillingNode) => {
        if (!node.nodeUuid) return

        showModal('nodes_editNodeModal', {
            nodeUuid: node.nodeUuid
        })
    }

    const handleOpenProvider = (node: BillingNode) => {
        if (node.provider.loginUrl) {
            window.open(node.provider.loginUrl, '_blank', 'noopener,noreferrer')
        }
    }

    const groupedByMonth = useMemo((): { label: string; nodes: BillingNode[] }[] => {
        const sorted = [...nodes].sort(
            (a, b) => dayjs(a.nextBillingAt).valueOf() - dayjs(b.nextBillingAt).valueOf()
        )

        const groups = new Map<string, BillingNode[]>()

        for (const node of sorted) {
            const key = dayjs.utc(node.nextBillingAt).isValid()
                ? dayjs.utc(node.nextBillingAt).format('YYYY-MM')
                : 'unknown'
            const existing = groups.get(key)
            if (existing) {
                existing.push(node)
            } else {
                groups.set(key, [node])
            }
        }

        return Array.from(groups.entries()).map(([key, groupNodes]) => ({
            label:
                key === 'unknown'
                    ? t('billing-date-status.date-unavailable')
                    : dayjs.utc(key).locale(i18n.language).format('MMMM YYYY'),
            nodes: groupNodes
        }))
    }, [nodes, i18n.language, t])

    if (nodes.length === 0) {
        return (
            <SectionCard.Root p="xl">
                <SectionCard.Section>
                    <Center py="xl">
                        <Stack align="center" gap="lg">
                            <ThemeIcon color="gray" radius="xl" size={64} variant="soft">
                                <TbServer size={32} />
                            </ThemeIcon>

                            <Stack align="center" gap="xs">
                                <Text c="dimmed" fw={600} size="md" ta="center">
                                    {t('infra-billing-nodes.widget.no-nodes-found')}
                                </Text>
                            </Stack>
                        </Stack>
                    </Center>
                </SectionCard.Section>
            </SectionCard.Root>
        )
    }

    return (
        <Stack gap="md" style={style}>
            {groupedByMonth.map((group) => (
                <Stack gap="xs" key={group.label}>
                    <Divider
                        label={
                            <Text c="dimmed" fw={600} size="xs" tt="capitalize">
                                {group.label}
                            </Text>
                        }
                        labelPosition="center"
                    />

                    {group.nodes.map((node) => {
                        const status = getBillingDateStatus(node.nextBillingAt, today)
                        const isSelected = selectedUuids?.has(node.uuid) ?? false

                        return (
                            <Box
                                key={node.uuid}
                                onClick={selectMode ? () => onToggleSelect?.(node.uuid) : undefined}
                                style={{ cursor: selectMode ? 'pointer' : undefined }}
                            >
                                <SectionCard.Root
                                    className={`${classes.statusColors} ${classes.card}`}
                                    data-billing-state={status.state}
                                    style={{
                                        background: 'var(--billing-card-bg)',
                                        transitionProperty: 'border-color',
                                        borderColor:
                                            selectMode && isSelected
                                                ? 'var(--mantine-primary-color-filled)'
                                                : 'var(--billing-card-border)'
                                    }}
                                >
                                    <SectionCard.Section>
                                        <Group
                                            className={classes.nodeHeader}
                                            justify="space-between"
                                            wrap="nowrap"
                                        >
                                            <Group
                                                className={classes.nodeTitle}
                                                gap="sm"
                                                wrap="nowrap"
                                            >
                                                {selectMode && (
                                                    <Checkbox
                                                        checked={isSelected}
                                                        color="cyan"
                                                        readOnly
                                                    />
                                                )}

                                                {node.node && (
                                                    <BaseOverlayHeader
                                                        countryCode={node.node.countryCode}
                                                        hideIcon={true}
                                                        iconColor="blue"
                                                        IconComponent={TbServer}
                                                        iconVariant="soft"
                                                        subtitle={node.provider.name}
                                                        title={node.node.name}
                                                    />
                                                )}

                                                {!node.node && (
                                                    <BaseOverlayHeader
                                                        iconColor="blue"
                                                        IconComponent={TbServer}
                                                        iconVariant="soft"
                                                        subtitle={node.provider.name}
                                                        title={node.name!}
                                                    />
                                                )}
                                            </Group>

                                            {!selectMode && (
                                                <Group
                                                    className={classes.nodeActions}
                                                    gap={4}
                                                    wrap="nowrap"
                                                >
                                                    {node.node && (
                                                        <ActionIcon
                                                            aria-label={`${t('common.action.open')}: ${node.node.name}`}
                                                            color="blue"
                                                            onClick={() => handleOpenNode(node)}
                                                            size="input-xs"
                                                            variant="soft"
                                                        >
                                                            <TbCpu size={18} />
                                                        </ActionIcon>
                                                    )}

                                                    {node.provider.loginUrl && (
                                                        <ActionIcon
                                                            aria-label={`${t('common.action.open')}: ${node.provider.name}`}
                                                            color="gray"
                                                            onClick={() => handleOpenProvider(node)}
                                                            size="input-xs"
                                                            variant="soft"
                                                        >
                                                            <TbExternalLink size={18} />
                                                        </ActionIcon>
                                                    )}

                                                    <ActionIcon
                                                        aria-label={t('common.action.update')}
                                                        color="teal"
                                                        loading={updatingUuids.has(node.uuid)}
                                                        onClick={() =>
                                                            handleQuickUpdate(
                                                                node.uuid,
                                                                node.nextBillingAt
                                                            )
                                                        }
                                                        size="input-xs"
                                                        variant="soft"
                                                    >
                                                        <TbCheck size={18} />
                                                    </ActionIcon>
                                                </Group>
                                            )}
                                        </Group>
                                    </SectionCard.Section>

                                    <SectionCard.Section>
                                        <BillingDateStatusRow
                                            date={node.nextBillingAt}
                                            today={today}
                                            onEdit={
                                                selectMode
                                                    ? undefined
                                                    : () => handleClickBillingAt(node)
                                            }
                                        />
                                    </SectionCard.Section>
                                </SectionCard.Root>
                            </Box>
                        )
                    })}
                </Stack>
            ))}
        </Stack>
    )
}
