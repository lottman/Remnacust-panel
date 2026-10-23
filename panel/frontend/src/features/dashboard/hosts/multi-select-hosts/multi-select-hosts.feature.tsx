import type { GetHostsCommand } from '@remnawave/backend-contract'

import {
    ActionIcon,
    Affix,
    Badge,
    Button,
    CloseButton,
    Group,
    Paper,
    Stack,
    Tooltip,
    Transition
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiProhibitDuotone, PiPulseDuotone } from 'react-icons/pi'
import {
    TbArrowBarToDown,
    TbArrowBarToUp,
    TbArrowBigDown,
    TbArrowBigUp,
    TbCategoryPlus,
    TbCopy,
    TbSelectAll,
    TbTrash
} from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { hostsQueryKeys, useBulkEnableHosts, useCloneHost } from '@shared/api/hooks'
import {
    useBulkDeleteHosts,
    useBulkDisableHosts
} from '@shared/api/hooks/hosts/hosts.mutation.hooks'
import { useUiText } from '@shared/i18n/interface-text'

import { useHostsActiveTag } from '@entities/dashboard/view-preferences-store'

import { IProps } from './interfaces/props.interface'

export const MultiSelectHostsFeature = (props: IProps) => {
    const uiText = useUiText()

    const { configProfiles, hosts, moveSelected, selectedHosts, setSelectedHosts } = props

    const { t } = useTranslation()
    const [isCloning, setIsCloning] = useState(false)
    const [cloneProgress, setCloneProgress] = useState(0)
    const [cloneTotal, setCloneTotal] = useState(0)
    const queryClient = useQueryClient()

    const hasSelection = selectedHosts.length > 0

    const activeTag = useHostsActiveTag()

    useEffect(() => {
        if (!hosts) return

        const existingUuids = new Set(hosts.map((host) => host.uuid))

        setSelectedHosts((current) => {
            const alive = current.filter((uuid) => existingUuids.has(uuid))

            return alive.length === current.length ? current : alive
        })
    }, [hosts])

    const updateHostCache = (uuids: string[], action: 'enable' | 'disable' | 'delete') => {
        const selected = new Set(uuids)
        queryClient.setQueryData<GetHostsCommand.Response['response']>(
            hostsQueryKeys.getAllHosts.queryKey,
            (previous) =>
                previous?.flatMap((host) =>
                    !selected.has(host.uuid)
                        ? [host]
                        : action === 'delete'
                          ? []
                          : [{ ...host, isDisabled: action === 'disable' }]
                )
        )
        setSelectedHosts((current) => current.filter((uuid) => !selected.has(uuid)))
        void queryClient.invalidateQueries({ queryKey: hostsQueryKeys.getAllHosts.queryKey })
    }
    const { mutate: bulkDeleteHosts, isPending: isDeleting } = useBulkDeleteHosts({
        mutationFns: {
            onMutate: () =>
                queryClient.cancelQueries({ queryKey: hostsQueryKeys.getAllHosts.queryKey }),
            onSuccess: (_data, request) => updateHostCache(request.variables?.uuids ?? [], 'delete')
        }
    })
    const { mutate: bulkEnableHosts, isPending: isEnabling } = useBulkEnableHosts({
        mutationFns: {
            onMutate: () =>
                queryClient.cancelQueries({ queryKey: hostsQueryKeys.getAllHosts.queryKey }),
            onSuccess: (_data, request) => updateHostCache(request.variables?.uuids ?? [], 'enable')
        }
    })
    const { mutate: bulkDisableHosts, isPending: isDisabling } = useBulkDisableHosts({
        mutationFns: {
            onMutate: () =>
                queryClient.cancelQueries({ queryKey: hostsQueryKeys.getAllHosts.queryKey }),
            onSuccess: (_data, request) =>
                updateHostCache(request.variables?.uuids ?? [], 'disable')
        }
    })
    const { mutateAsync: cloneHost } = useCloneHost()
    const isBusy = isCloning || isDeleting || isEnabling || isDisabling

    const selectAllHosts = () => {
        setSelectedHosts(hosts?.map((host) => host.uuid) || [])
    }

    const clearSelection = () => {
        setSelectedHosts([])
    }

    const deleteSelectedHosts = () => {
        modals.openConfirmModal({
            title: t('common.action.confirm-action'),
            centered: true,
            children: t('common.message.confirm-action-description'),
            labels: {
                confirm: t('common.action.delete'),
                cancel: t('common.action.cancel')
            },
            confirmProps: {
                color: 'red',
                variant: 'soft'
            },
            cancelProps: {
                variant: 'subtle'
            },
            onConfirm: () => {
                bulkDeleteHosts({ variables: { uuids: selectedHosts } })
            }
        })
    }

    const enableSelectedHosts = () => {
        bulkEnableHosts({ variables: { uuids: selectedHosts } })
    }

    const disableSelectedHosts = () => {
        bulkDisableHosts({ variables: { uuids: selectedHosts } })
    }

    const cloneSelectedHosts = async () => {
        if (isCloning) return
        const selectedIds = new Set(selectedHosts)
        const selected = (hosts ?? []).filter((host) => selectedIds.has(host.uuid))
        const cloneableHosts = selected.filter(
            (host) => host.inbound.configProfileInboundUuid && host.inbound.configProfileUuid
        )
        const danglingCount = selected.length - cloneableHosts.length

        if (cloneableHosts.length === 0) {
            notifications.show({
                title: t('common.message.error'),
                message: t('edit-host-modal.widget.dangling-host-cannot-be-cloned'),
                color: 'red'
            })

            return
        }

        if (danglingCount > 0) {
            notifications.show({
                title: t('common.message.error'),
                message: t('multi-select-hosts.feature.dangling-hosts-skipped', {
                    count: danglingCount
                }),
                color: 'yellow'
            })
        }

        setIsCloning(true)
        setCloneProgress(0)
        setCloneTotal(cloneableHosts.length)
        const completed = new Set<string>()
        try {
            const queue = [...cloneableHosts]
            await Promise.all(
                Array.from({ length: Math.min(3, queue.length) }, async () => {
                    while (queue.length) {
                        const host = queue.shift()!
                        try {
                            await cloneHost({ variables: { cloneFromUuid: host.uuid } })
                            completed.add(host.uuid)
                        } catch {
                            // Failed sources remain selected so retry does not duplicate successful clones.
                        } finally {
                            setCloneProgress((count) => count + 1)
                        }
                    }
                })
            )
            setSelectedHosts((current) => current.filter((uuid) => !completed.has(uuid)))
        } finally {
            void queryClient.invalidateQueries({ queryKey: hostsQueryKeys.getAllHosts.queryKey })
            setIsCloning(false)
        }
    }

    if (!configProfiles || !hosts) {
        return null
    }

    return (
        <Affix position={{ bottom: 20, right: 20 }} zIndex={100}>
            <Transition mounted={hasSelection} transition="slide-up">
                {(styles) => (
                    <Paper
                        p={4}
                        shadow="md"
                        style={{
                            ...styles,
                            width: '300px',
                            maxWidth: '1200px',
                            margin: '0 auto'
                        }}
                        withBorder
                    >
                        <Paper
                            p="md"
                            style={{
                                borderRadius: 'calc(var(--mantine-radius-default) - 4px)',
                                border: '1px solid var(--mantine-color-dark-5)'
                            }}
                        >
                            <Stack>
                                <Group justify="space-between">
                                    <Badge color="shaded-gray" size="lg" variant="soft">
                                        {t('common.message.selected', {
                                            count: selectedHosts.length
                                        })}
                                    </Badge>
                                    <Group gap={0} justify="flex-end">
                                        <Tooltip label={t('common.action.select-all')} withArrow>
                                            <ActionIcon
                                                color="gray"
                                                onClick={selectAllHosts}
                                                disabled={isBusy}
                                                size="lg"
                                                variant="subtle"
                                            >
                                                <TbSelectAll size={20} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip
                                            label={t('common.action.clear-selection')}
                                            withArrow
                                        >
                                            <CloseButton
                                                onClick={clearSelection}
                                                disabled={isBusy}
                                            />
                                        </Tooltip>
                                    </Group>
                                </Group>

                                {activeTag === null && (
                                    <ActionIcon.Group style={{ width: '100%' }}>
                                        <Tooltip label={uiText('move-to-top-349d5d6')} withArrow>
                                            <ActionIcon
                                                color="gray"
                                                onClick={() => moveSelected('top')}
                                                disabled={isBusy}
                                                size="lg"
                                                style={{ flex: 1 }}
                                                variant="soft"
                                            >
                                                <TbArrowBarToUp size={20} />
                                            </ActionIcon>
                                        </Tooltip>

                                        <Tooltip label={uiText('move-up-c66feb5')} withArrow>
                                            <ActionIcon
                                                color="gray"
                                                onClick={() => moveSelected('up')}
                                                disabled={isBusy}
                                                size="lg"
                                                style={{ flex: 1 }}
                                                variant="soft"
                                            >
                                                <TbArrowBigUp size={20} />
                                            </ActionIcon>
                                        </Tooltip>

                                        <Tooltip label={uiText('move-down-40bb50d')} withArrow>
                                            <ActionIcon
                                                color="gray"
                                                onClick={() => moveSelected('down')}
                                                disabled={isBusy}
                                                size="lg"
                                                style={{ flex: 1 }}
                                                variant="soft"
                                            >
                                                <TbArrowBigDown size={20} />
                                            </ActionIcon>
                                        </Tooltip>

                                        <Tooltip label={uiText('move-to-bottom-df93376')} withArrow>
                                            <ActionIcon
                                                color="gray"
                                                onClick={() => moveSelected('bottom')}
                                                disabled={isBusy}
                                                size="lg"
                                                style={{ flex: 1 }}
                                                variant="soft"
                                            >
                                                <TbArrowBarToDown size={20} />
                                            </ActionIcon>
                                        </Tooltip>
                                    </ActionIcon.Group>
                                )}

                                <Group grow justify="apart" preventGrowOverflow={false} wrap="wrap">
                                    <Button
                                        color="green"
                                        leftSection={<PiPulseDuotone />}
                                        onClick={enableSelectedHosts}
                                        loading={isEnabling}
                                        disabled={isBusy && !isEnabling}
                                        variant="soft"
                                    >
                                        {t('common.action.enable')}
                                    </Button>
                                    <Button
                                        color="gray"
                                        leftSection={<PiProhibitDuotone />}
                                        onClick={disableSelectedHosts}
                                        loading={isDisabling}
                                        disabled={isBusy && !isDisabling}
                                        variant="soft"
                                    >
                                        {t('common.action.disable')}
                                    </Button>
                                </Group>
                                <Stack>
                                    <Button
                                        color="cyan"
                                        fullWidth
                                        leftSection={<TbCategoryPlus size={18} />}
                                        disabled={isBusy}
                                        onClick={() =>
                                            showModal('hosts_editManyHostsDrawer', {
                                                uuids: selectedHosts
                                            })
                                        }
                                        variant="soft"
                                    >
                                        {t('common.action.update')}
                                    </Button>

                                    <Button
                                        color="indigo"
                                        fullWidth
                                        leftSection={<TbCopy size={18} />}
                                        loading={isCloning}
                                        disabled={isBusy && !isCloning}
                                        onClick={() => void cloneSelectedHosts()}
                                        variant="soft"
                                    >
                                        {isCloning
                                            ? t('host-actions.clone-progress', {
                                                  done: cloneProgress,
                                                  total: cloneTotal
                                              })
                                            : t('common.action.clone')}
                                    </Button>

                                    <Button
                                        color="red"
                                        fullWidth
                                        leftSection={<TbTrash size={18} />}
                                        onClick={deleteSelectedHosts}
                                        loading={isDeleting}
                                        disabled={isBusy && !isDeleting}
                                        variant="soft"
                                    >
                                        {t('common.action.delete')}
                                    </Button>
                                </Stack>
                            </Stack>
                        </Paper>
                    </Paper>
                )}
            </Transition>
        </Affix>
    )
}
