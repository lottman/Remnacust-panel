import { ActionIcon, ActionIconGroup, Drawer, Group, Text, Tooltip } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { ImportUsersModalWidget } from '@widgets/dashboard/users/users-import/import-users.widget'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbDownload, TbFilterOff, TbPlus, TbRefresh, TbRestore, TbUpload } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { instance } from '@shared/api/axios'
import { useUiText } from '@shared/i18n/interface-text'
import { RefreshActionIcon } from '@shared/ui/refresh-control'

import { useUsersTableStoreActions } from '@entities/dashboard/users/users-table-store'

import { UsersTableTemplatesFeature } from '../users-table-templates/users-table-templates.feature'
import { IProps } from './interfaces'

export const UserActionGroupFeature = (props: IProps) => {
    const uiText = useUiText()

    const { t } = useTranslation()

    const { isLoading, refetch, table } = props
    const actions = useUsersTableStoreActions()

    const handleRefetch = () => {
        if (table && refetch) {
            return refetch()
        }
    }

    const handleResetTable = () => {
        if (table && refetch) {
            refetch()
            actions.resetState()

            table.resetPageIndex(false)
            table.resetSorting(false)
            table.resetPagination(false)
            table.resetColumnFilters(true)
            table.resetGlobalFilter(true)
        }
    }

    const [importOpened, setImportOpened] = useState(false)
    const [isExporting, setIsExporting] = useState(false)

    const queryClient = useQueryClient()

    const handleExportUsers = async () => {
        try {
            setIsExporting(true)
            const response = await instance.get('/users/export')
            const payload = response.data?.response ?? response.data
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `users-export-${new Date().toISOString().slice(0, 10)}.json`
            link.click()
            URL.revokeObjectURL(url)
        } finally {
            setIsExporting(false)
        }
    }

    const handleClearFilters = () => {
        if (table && refetch) {
            refetch()

            table.resetPageIndex(false)
            table.resetSorting(false)
            table.resetPagination(false)
            table.resetColumnFilters(true)
            table.resetGlobalFilter(true)
        }
    }

    if (!table || !refetch) {
        return null
    }

    return (
        <Group grow preventGrowOverflow={false} wrap="wrap">
            <ActionIconGroup>
                <UsersTableTemplatesFeature table={table} />

                <Tooltip label={t('action-group.feature.clear-filters')} withArrow>
                    <ActionIcon
                        color="gray"
                        loading={isLoading}
                        onClick={handleClearFilters}
                        size="input-md"
                        variant="soft"
                    >
                        <TbFilterOff size="24px" />
                    </ActionIcon>
                </Tooltip>

                <Tooltip label={t('action-group.feature.reset-table')} withArrow>
                    <ActionIcon
                        color="gray"
                        loading={isLoading}
                        onClick={handleResetTable}
                        size="input-md"
                        variant="soft"
                    >
                        <TbRestore size="24px" />
                    </ActionIcon>
                </Tooltip>
            </ActionIconGroup>

            <ActionIconGroup>
                <Tooltip label={uiText('export-users-e875475')} withArrow>
                    <ActionIcon
                        color="indigo"
                        loading={isExporting}
                        onClick={handleExportUsers}
                        size="input-md"
                        variant="soft"
                    >
                        <TbDownload size="24px" />
                    </ActionIcon>
                </Tooltip>

                <Tooltip label={uiText('import-users-f8e8e1b')} withArrow>
                    <ActionIcon
                        color="yellow"
                        onClick={() => setImportOpened(true)}
                        size="input-md"
                        variant="soft"
                    >
                        <TbUpload size="24px" />
                    </ActionIcon>
                </Tooltip>
            </ActionIconGroup>

            <Drawer
                onClose={() => setImportOpened(false)}
                opened={importOpened}
                position="right"
                size="md"
                title={
                    <Group gap="xs">
                        <Text fw={600}>{uiText('import-users-f8e8e1b')}</Text>
                    </Group>
                }
            >
                <ImportUsersModalWidget
                    onFinished={() => {
                        queryClient.invalidateQueries({ queryKey: ['users'] })
                        if (refetch) refetch()
                    }}
                />
            </Drawer>

            <ActionIconGroup>
                <Tooltip label={t('common.action.refresh')} withArrow>
                    <RefreshActionIcon
                        loading={isLoading}
                        onClick={handleRefetch}
                        size="input-md"
                        variant="soft"
                    >
                        <TbRefresh size="24px" />
                    </RefreshActionIcon>
                </Tooltip>

                <Tooltip label={t('common.action.create')} withArrow>
                    <ActionIcon
                        color="teal"
                        onClick={() => showModal('users_createUserModal')}
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
