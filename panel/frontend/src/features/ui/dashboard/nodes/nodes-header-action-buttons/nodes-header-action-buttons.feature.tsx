import { CoreManagementFeature } from '@features/dashboard/nodes/core-management/core-management.feature'
import { ActionIcon, ActionIconGroup, Group, Menu, Stack, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { spotlight } from '@mantine/spotlight'
import { useTranslation } from 'react-i18next'
import { PiSpiral } from 'react-icons/pi'
import {
    TbAlertCircle,
    TbDots,
    TbCards,
    TbLayoutGrid,
    TbLayoutList,
    TbPlus,
    TbPlugConnected,
    TbRefresh,
    TbRocket,
    TbSearch,
    TbTable
} from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { useGetNodes, useRestartAllNodes } from '@shared/api/hooks'
import { useIsMobile } from '@shared/hooks'
import { ActionCardShared } from '@shared/ui'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { RefreshActionIcon } from '@shared/ui/refresh-control'

import {
    NODES_VIEW_MODE,
    useNodesCardColumns,
    useViewPreferencesStoreActions
} from '@entities/dashboard/view-preferences-store'

interface IProps {
    setViewMode: (viewMode: NODES_VIEW_MODE) => void
    viewMode: NODES_VIEW_MODE
}

export const NodesHeaderActionButtonsFeature = (props: IProps) => {
    const { setViewMode, viewMode } = props
    const isMobile = useIsMobile()
    const cardColumns = useNodesCardColumns()
    const { setNodesCardColumns } = useViewPreferencesStoreActions()

    const { t } = useTranslation()
    const viewLabel = t(
        viewMode === NODES_VIEW_MODE.CARDS ? 'layoutActions.showTable' : 'layoutActions.showCards'
    )
    const columnsLabel = t(
        cardColumns === 2 ? 'layoutActions.oneCardPerRow' : 'layoutActions.twoCardsPerRow'
    )

    const {
        data: nodes = [],
        isLoading: isGetNodesPending,
        refetch: refetchNodes,
        isPending,
        isRefetching
    } = useGetNodes()
    const { mutate: restartAllNodes, isPending: isRestartAllNodesPending } = useRestartAllNodes()

    const openRestartAllNodesModal = () => {
        modals.open({
            title: (
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={TbRocket}
                    iconVariant="soft"
                    title={t('nodes-header-action-buttons.feature.restart-all-nodes')}
                />
            ),
            centered: true,
            size: 'md',
            children: (
                <Stack gap="sm">
                    <ActionCardShared
                        description={t(
                            'nodes-header-action-buttons.feature.force-restart-description'
                        )}
                        icon={<TbAlertCircle size={22} />}
                        iconColor="red"
                        isLoading={isPending}
                        onClick={() => {
                            restartAllNodes({
                                variables: {
                                    forceRestart: true
                                }
                            })
                            modals.closeAll()
                        }}
                        title={t('nodes-header-action-buttons.feature.force')}
                        variant="soft"
                    />

                    <ActionCardShared
                        description={t(
                            'nodes-header-action-buttons.feature.graceful-restart-description-1'
                        )}
                        icon={<TbRocket size={22} />}
                        iconColor="teal"
                        isLoading={isPending}
                        onClick={() => {
                            restartAllNodes({
                                variables: {
                                    forceRestart: false
                                }
                            })
                            modals.closeAll()
                        }}
                        title={t('nodes-header-action-buttons.feature.graceful')}
                        variant="soft"
                    />
                </Stack>
            )
        })
    }

    if (isMobile) {
        return (
            <Group gap={8} wrap="nowrap">
                <CoreManagementFeature nodes={nodes} allowSelection />
                <Tooltip label={t('common.action.update')}>
                    <RefreshActionIcon
                        aria-label={t('common.action.update')}
                        loading={isGetNodesPending || isPending || isRefetching}
                        onClick={() => refetchNodes()}
                        size={44}
                        color="gray"
                        variant="subtle"
                    >
                        <TbRefresh size={22} />
                    </RefreshActionIcon>
                </Tooltip>
                <Menu position="bottom-end" width={260}>
                    <Menu.Target>
                        <ActionIcon
                            aria-label={t('design-ui.more')}
                            size={44}
                            color="gray"
                            variant="subtle"
                        >
                            <TbDots size={22} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {viewMode === NODES_VIEW_MODE.CARDS && (
                            <Menu.Item
                                leftSection={<TbSearch size={18} />}
                                onClick={spotlight.open}
                            >
                                {t('nodes-header-action-buttons.feature.search-nodes')}
                            </Menu.Item>
                        )}
                        <Menu.Item
                            leftSection={<TbTable size={18} />}
                            onClick={() =>
                                setViewMode(
                                    viewMode === NODES_VIEW_MODE.TABLE
                                        ? NODES_VIEW_MODE.CARDS
                                        : NODES_VIEW_MODE.TABLE
                                )
                            }
                        >
                            {viewLabel}
                        </Menu.Item>
                        {viewMode === NODES_VIEW_MODE.CARDS && (
                            <Menu.Item
                                leftSection={<TbLayoutGrid size={18} />}
                                onClick={() => setNodesCardColumns(cardColumns === 2 ? 1 : 2)}
                            >
                                {columnsLabel}
                            </Menu.Item>
                        )}
                        <Menu.Divider />
                        <Menu.Item
                            leftSection={<TbPlugConnected size={18} />}
                            onClick={() => showModal('nodeIntegrations_nodeIntegrationsModal')}
                        >
                            {t('node-integrations.modal.title')}
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<PiSpiral size={18} />}
                            disabled={isRestartAllNodesPending}
                            onClick={openRestartAllNodesModal}
                        >
                            {t('nodes-header-action-buttons.feature.restart-all-nodes')}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
                <Tooltip label={t('common.action.create')}>
                    <ActionIcon
                        aria-label={t('common.action.create')}
                        onClick={() => showModal('nodes_createNodeModal')}
                        size={44}
                        variant="filled"
                    >
                        <TbPlus size={22} />
                    </ActionIcon>
                </Tooltip>
            </Group>
        )
    }

    return (
        <Group gap="xs" wrap="wrap">
            <CoreManagementFeature nodes={nodes} allowSelection />
            {viewMode === NODES_VIEW_MODE.CARDS && (
                <ActionIconGroup>
                    <Tooltip label={t('nodes-header-action-buttons.feature.search-nodes')}>
                        <ActionIcon
                            aria-label={t('nodes-header-action-buttons.feature.search-nodes')}
                            color="gray"
                            onClick={spotlight.open}
                            size={44}
                            variant="soft"
                        >
                            <TbSearch size="24px" />
                        </ActionIcon>
                    </Tooltip>
                </ActionIconGroup>
            )}

            <ActionIconGroup>
                <Tooltip label={viewLabel}>
                    <ActionIcon
                        aria-label={viewLabel}
                        color="gray"
                        onClick={() =>
                            setViewMode(
                                viewMode === NODES_VIEW_MODE.TABLE
                                    ? NODES_VIEW_MODE.CARDS
                                    : NODES_VIEW_MODE.TABLE
                            )
                        }
                        size={44}
                        variant="soft"
                    >
                        {viewMode === NODES_VIEW_MODE.CARDS ? (
                            <TbTable size="24px" />
                        ) : (
                            <TbCards size="24px" />
                        )}
                    </ActionIcon>
                </Tooltip>
            </ActionIconGroup>

            {viewMode === NODES_VIEW_MODE.CARDS && (
                <ActionIconGroup>
                    <Tooltip label={columnsLabel}>
                        <ActionIcon
                            aria-label={columnsLabel}
                            color="gray"
                            onClick={() => setNodesCardColumns(cardColumns === 2 ? 1 : 2)}
                            size={44}
                            variant="soft"
                        >
                            {cardColumns === 2 ? (
                                <TbLayoutList size="24px" />
                            ) : (
                                <TbLayoutGrid size="24px" />
                            )}
                        </ActionIcon>
                    </Tooltip>
                </ActionIconGroup>
            )}

            <ActionIconGroup>
                <Tooltip label={t('node-integrations.modal.title')} withArrow>
                    <ActionIcon
                        aria-label={t('node-integrations.modal.title')}
                        color="gray"
                        onClick={() => showModal('nodeIntegrations_nodeIntegrationsModal')}
                        size={44}
                        variant="soft"
                    >
                        <TbPlugConnected size="24px" />
                    </ActionIcon>
                </Tooltip>
            </ActionIconGroup>

            <ActionIconGroup>
                <Tooltip
                    label={t('nodes-header-action-buttons.feature.restart-all-nodes')}
                    withArrow
                >
                    <ActionIcon
                        aria-label={t('nodes-header-action-buttons.feature.restart-all-nodes')}
                        color="gray"
                        loading={isRestartAllNodesPending}
                        onClick={() => {
                            openRestartAllNodesModal()
                        }}
                        size={44}
                        variant="soft"
                    >
                        <PiSpiral size="24px" />
                    </ActionIcon>
                </Tooltip>
            </ActionIconGroup>

            <ActionIconGroup>
                <Tooltip label={t('common.action.update')} withArrow>
                    <RefreshActionIcon
                        aria-label={t('common.action.update')}
                        loading={isGetNodesPending || isPending || isRefetching}
                        onClick={() => refetchNodes()}
                        size={44}
                        variant="soft"
                    >
                        <TbRefresh size="24px" />
                    </RefreshActionIcon>
                </Tooltip>
            </ActionIconGroup>
            <ActionIconGroup>
                <Tooltip label={t('common.action.create')} withArrow>
                    <ActionIcon
                        aria-label={t('common.action.create')}
                        onClick={() => showModal('nodes_createNodeModal')}
                        size={44}
                        variant="filled"
                    >
                        <TbPlus size="24px" />
                    </ActionIcon>
                </Tooltip>
            </ActionIconGroup>
        </Group>
    )
}
