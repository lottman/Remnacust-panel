import {
    ActionIcon,
    Box,
    Card,
    Group,
    Loader,
    Stack,
    Text,
    ThemeIcon,
    Tooltip
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useTranslation } from 'react-i18next'
import { TbDevices, TbRefresh, TbTrash } from 'react-icons/tb'
import { Virtuoso } from 'react-virtuoso'

import {
    QueryKeys,
    useBlockUserHwidDevice,
    useDeleteAllUserHwidDevices,
    useDeleteUserHwidDevice,
    useGetUserHwidDevices,
    useUnblockUserHwidDevice
} from '@shared/api/hooks'
import { queryClient } from '@shared/api/query-client'
import { EmptyPageLayout } from '@shared/ui/layouts/empty-page'
import { LoaderModalShared } from '@shared/ui/loader-modal'
import { RefreshActionIcon } from '@shared/ui/refresh-control'

import { HwidRegistrationControl } from './hwid-registration-control'
import { UserHwidDeviceItem } from './user-hwid-device-item'
import classes from './user-hwid-devices.module.css'
import { UserHwidDevicesTable } from './user-hwid-devices.table'

interface IProps {
    mobile: boolean
    userId: number
}

export const UserHwidDevicesContentModal = (props: IProps) => {
    const { userId, mobile } = props
    const { t } = useTranslation()

    const {
        data: devices,
        isLoading,
        isFetching,
        refetch
    } = useGetUserHwidDevices({
        route: {
            userId
        }
    })

    const deviceQueryKey = QueryKeys['hwid-user-devices'].getUserHwidDevices({ userId }).queryKey
    const cancelDeviceRead = () => queryClient.cancelQueries({ queryKey: deviceQueryKey })
    const refreshDevices = () => queryClient.invalidateQueries({ queryKey: deviceQueryKey })

    const { mutate: deleteDevice, isPending: deletingDevice } = useDeleteUserHwidDevice({
        mutationFns: {
            onMutate: cancelDeviceRead,
            onError: refreshDevices,
            onSuccess: (data) => {
                queryClient.setQueryData(
                    QueryKeys['hwid-user-devices'].getUserHwidDevices({
                        userId
                    }).queryKey,
                    data
                )
            }
        }
    })

    const {
        mutate: blockDevice,
        isPending: blockingDevice,
        variables: blockVariables
    } = useBlockUserHwidDevice({
        mutationFns: {
            onMutate: cancelDeviceRead,
            onSuccess: (data) => queryClient.setQueryData(deviceQueryKey, data),
            onError: refreshDevices
        }
    })

    const {
        mutate: unblockDevice,
        isPending: unblockingDevice,
        variables: unblockVariables
    } = useUnblockUserHwidDevice({
        mutationFns: {
            onMutate: cancelDeviceRead,
            onSuccess: (data) => queryClient.setQueryData(deviceQueryKey, data),
            onError: refreshDevices
        }
    })

    const handleToggleBlock = (hwid: string, blocked: boolean) => {
        if (isMutating) return
        const mutation = blocked ? blockDevice : unblockDevice
        mutation({
            variables: {
                hwid,
                userId
            }
        })
    }

    const { mutate: deleteAllDevices, isPending: deletingAllDevices } = useDeleteAllUserHwidDevices(
        {
            mutationFns: {
                onMutate: cancelDeviceRead,
                onError: refreshDevices,
                onSuccess: (data) => {
                    queryClient.setQueryData(
                        QueryKeys['hwid-user-devices'].getUserHwidDevices({
                            userId
                        }).queryKey,
                        data
                    )
                }
            }
        }
    )

    const isMutating = blockingDevice || unblockingDevice || deletingDevice || deletingAllDevices
    const pendingHwid = blockingDevice
        ? blockVariables?.variables?.hwid
        : unblockingDevice
          ? unblockVariables?.variables?.hwid
          : undefined

    const handleDeleteDevice = (hwid: string) => {
        if (isMutating) return
        modals.openConfirmModal({
            title: t('common.action.confirm-action'),
            children: t('get-hwid-user-devices.feature.delete-device-confirmation'),
            labels: {
                confirm: t('common.action.delete'),
                cancel: t('common.action.cancel')
            },
            confirmProps: { color: 'red', variant: 'soft' },
            cancelProps: {
                variant: 'subtle'
            },
            centered: true,
            onConfirm: () => {
                deleteDevice({
                    variables: {
                        hwid,
                        userId
                    }
                })
            }
        })
    }

    const handleDeleteAllDevices = () => {
        if (isMutating) return
        modals.openConfirmModal({
            title: t('common.action.confirm-action'),
            children: t('get-hwid-user-devices.feature.delete-unblocked-confirmation'),
            labels: {
                confirm: t('common.action.delete'),
                cancel: t('common.action.cancel')
            },
            confirmProps: { color: 'red', variant: 'soft' },
            cancelProps: {
                variant: 'subtle'
            },
            centered: true,
            onConfirm: () => {
                deleteAllDevices({
                    variables: { userId }
                })
            }
        })
    }

    const renderListContent = () => {
        if (!devices || devices.devices.length === 0) return null
        return (
            <Box className={classes.listContainer}>
                <Virtuoso
                    data={devices.devices}
                    itemContent={(index, device) => {
                        return (
                            <Box className={classes.itemWrapper}>
                                <UserHwidDeviceItem
                                    actionsDisabled={isMutating}
                                    blockPending={pendingHwid === device.hwid}
                                    device={device}
                                    index={index}
                                    onDelete={handleDeleteDevice}
                                    onToggleBlock={handleToggleBlock}
                                />
                            </Box>
                        )
                    }}
                    style={{
                        height: '100%'
                    }}
                    totalCount={devices.devices.length}
                    useWindowScroll={false}
                />
            </Box>
        )
    }

    return (
        <Box style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Stack className={classes.drawerContent}>
                <HwidRegistrationControl userId={userId} />
                <Card withBorder>
                    <Stack gap="md">
                        <Group gap="sm" justify="space-between">
                            <Group>
                                <ThemeIcon color="indigo" radius="md" size="xl" variant="soft">
                                    <TbDevices size={24} />
                                </ThemeIcon>
                                <Stack gap={0}>
                                    <Box
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            height: 'calc(var(--mantine-font-size-xl) * var(--mantine-line-height))'
                                        }}
                                    >
                                        {isLoading ? (
                                            <Loader color="cyan" size="sm" type="oval" />
                                        ) : (
                                            <Text c="white" fw={700} size="xl">
                                                {devices?.devices.length ?? 0}
                                            </Text>
                                        )}
                                    </Box>
                                    <Text c="dimmed" size="xs">
                                        {t('get-hwid-user-devices.feature.devices')}
                                    </Text>
                                </Stack>
                            </Group>
                            <Group gap="xs">
                                <Tooltip label={t('common.action.refresh')}>
                                    <RefreshActionIcon
                                        color="indigo"
                                        disabled={isMutating}
                                        loading={isFetching}
                                        onClick={() => refetch()}
                                        size="lg"
                                        variant="soft"
                                    >
                                        <TbRefresh size={20} />
                                    </RefreshActionIcon>
                                </Tooltip>
                                <Tooltip
                                    label={t('get-hwid-user-devices.feature.delete-all-devices')}
                                >
                                    <ActionIcon
                                        color="red"
                                        disabled={
                                            isMutating ||
                                            !devices?.devices.some((device) => !device.blocked)
                                        }
                                        onClick={handleDeleteAllDevices}
                                        size="lg"
                                        variant="soft"
                                    >
                                        <TbTrash size={20} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                    </Stack>
                </Card>

                <Text c="dimmed" size="xs">
                    {t('get-hwid-user-devices.feature.block-scope')}
                </Text>

                {mobile && !isLoading && devices?.devices.length === 0 && (
                    <EmptyPageLayout icon={<TbDevices size={32} />} />
                )}

                {mobile && isLoading && <LoaderModalShared mih="80vh" />}
                {mobile && !isLoading && renderListContent()}

                {!mobile && (
                    <Box className={classes.tableContainer}>
                        <UserHwidDevicesTable
                            actionsDisabled={isMutating}
                            pendingHwid={pendingHwid}
                            devices={devices?.devices}
                            isLoading={isLoading}
                            onDelete={handleDeleteDevice}
                            onToggleBlock={handleToggleBlock}
                        />
                    </Box>
                )}
            </Stack>
        </Box>
    )
}
