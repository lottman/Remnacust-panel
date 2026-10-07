import { ActionIcon, ActionIconGroup, Group, Tooltip } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { TbCards, TbLayoutGrid, TbLayoutList, TbPlus, TbRefresh, TbTable } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { HelpActionIconShared } from '@shared/_modals/universal'
import { queryClient } from '@shared/api'
import { QueryKeys, useGetHosts } from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { RefreshActionIcon } from '@shared/ui/refresh-control'
import { UniversalSpotlightActionIconShared } from '@shared/ui/universal-spotlight'

import {
    HOSTS_VIEW_MODE,
    useHostsCardColumns,
    useViewPreferencesStoreActions
} from '@entities/dashboard/view-preferences-store'

interface IProps {
    setViewMode: (viewMode: HOSTS_VIEW_MODE) => void
    viewMode: HOSTS_VIEW_MODE
}

export const HeaderActionButtonsFeature = (props: IProps) => {
    const uiText = useUiText()

    const { setViewMode, viewMode } = props

    const { t } = useTranslation()
    const cardColumns = useHostsCardColumns()
    const { setHostsCardColumns } = useViewPreferencesStoreActions()
    const columnsLabel = t(
        cardColumns === 2 ? 'layoutActions.oneCardPerRow' : 'layoutActions.twoCardsPerRow'
    )

    const { isFetching } = useGetHosts()

    const handleCreate = () => {
        showModal('hosts_createHostDrawer')
    }

    const handleUpdate = async () => {
        await queryClient.refetchQueries({
            queryKey: QueryKeys.hosts._def
        })
    }

    return (
        <Group gap="xs" wrap="wrap">
            <HelpActionIconShared hidden={false} screen="PAGE_HOSTS" />

            <UniversalSpotlightActionIconShared />

            <ActionIconGroup>
                <Tooltip label={uiText('toggle-view-mode-de9a6a9')}>
                    <ActionIcon
                        aria-label={uiText('toggle-view-mode-de9a6a9')}
                        color="gray"
                        onClick={() =>
                            setViewMode(
                                viewMode === HOSTS_VIEW_MODE.TABLE
                                    ? HOSTS_VIEW_MODE.CARDS
                                    : HOSTS_VIEW_MODE.TABLE
                            )
                        }
                        size="input-md"
                        variant="soft"
                    >
                        {viewMode === HOSTS_VIEW_MODE.CARDS ? (
                            <TbTable size="24px" />
                        ) : (
                            <TbCards size="24px" />
                        )}
                    </ActionIcon>
                </Tooltip>
            </ActionIconGroup>

            {viewMode === HOSTS_VIEW_MODE.CARDS && (
                <ActionIconGroup>
                    <Tooltip label={columnsLabel}>
                        <ActionIcon
                            aria-label={columnsLabel}
                            color="gray"
                            onClick={() => setHostsCardColumns(cardColumns === 2 ? 1 : 2)}
                            size="input-md"
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
                <Tooltip label={t('common.action.update')} withArrow>
                    <RefreshActionIcon
                        aria-label={t('common.action.update')}
                        loading={isFetching}
                        onClick={handleUpdate}
                        size="input-md"
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
                        color="teal"
                        onClick={handleCreate}
                        size="input-md"
                        variant="soft"
                    >
                        <TbPlus size="24px" />
                    </ActionIcon>
                </Tooltip>
            </ActionIconGroup>
        </Group>
    )
}
