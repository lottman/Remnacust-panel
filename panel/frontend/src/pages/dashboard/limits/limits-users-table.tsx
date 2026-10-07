import {
    MantineReactTable,
    MRT_ColumnDef,
    MRT_VisibilityState,
    MRT_ShowHideColumnsButton,
    MRT_ToggleDensePaddingButton,
    MRT_ToggleFullScreenButton,
    useMantineReactTable
} from '@kastov/mantine-react-table-open'
import { ActionIconGroup, SegmentedControl, Select, TextInput, Tooltip } from '@mantine/core'
import { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiUsersDuotone } from 'react-icons/pi'
import { TbRefresh } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { useMrtLocalization } from '@shared/i18n/mrt-localization'
import { RefreshActionIcon } from '@shared/ui/refresh-control'
import { DataTableShared } from '@shared/ui/table'

import { LimitUser, UserFilters } from './limits.api'

type Cell =
    | 'username'
    | 'id'
    | 'subscriptionStatus'
    | 'lastConnectedNode'
    | 'expireAt'
    | 'tag'
    | 'usedBytes'
    | 'remainingBytes'
    | 'bonusBytes'
    | 'status'
    | 'actions'
type Props = {
    rows: LimitUser[]
    total: number
    page: number
    filters: UserFilters
    search: string
    onSearchChange: (search: string) => void
    onPageChange: (page: number) => void
    onFiltersChange: (filters: UserFilters) => void
    selectable: boolean
    selected: string[]
    onSelectedChange: (ids: string[]) => void
    isLoading: boolean
    isFetching: boolean
    isError: boolean
    refetch: () => void
    unit: 'MB' | 'GB'
    onUnitChange: (unit: 'MB' | 'GB') => void
    renderCells: Record<Cell, (user: LimitUser) => ReactNode>
}

export function LimitsUsersTable(props: Props) {
    const uiText = useUiText()
    const { t } = useTranslation()
    const localization = useMrtLocalization()
    const [columnVisibility, setColumnVisibility] = useState<MRT_VisibilityState>({
        limitBytes: false
    })
    const columns: MRT_ColumnDef<LimitUser>[] = [
        {
            accessorKey: 'username',
            header: t('common.field.username'),
            size: 220,
            enableColumnFilter: true,
            Filter: () => (
                <TextInput
                    placeholder={uiText('filter-by-9d50c25')}
                    aria-label={uiText('search-users-e4bb77a')}
                    value={props.search}
                    maxLength={100}
                    onChange={(event) => props.onSearchChange(event.currentTarget.value)}
                />
            )
        },
        { accessorKey: 'id', header: 'ID', size: 80 },
        {
            id: 'subscriptionStatus',
            accessorFn: (row: LimitUser) => row.status,
            header: t('common.field.status'),
            enableSorting: false,
            enableColumnFilter: true,
            mantineTableBodyCellProps: { align: 'center' as const },
            Filter: () => (
                <Select
                    placeholder={uiText('filter-by-9d50c25')}
                    aria-label={t('common.field.status')}
                    clearable
                    value={props.filters.status === 'ALL' ? null : props.filters.status}
                    onChange={(value) =>
                        props.onFiltersChange({ ...props.filters, status: value ?? 'ALL' })
                    }
                    data={[
                        { value: 'ACTIVE', label: t('user-status.active') },
                        { value: 'DISABLED', label: t('user-status.disabled') },
                        { value: 'LIMITED', label: t('user-status.limited') },
                        { value: 'EXPIRED', label: t('user-status.expired') }
                    ]}
                />
            ),
            size: 200
        },
        {
            accessorKey: 'lastConnectedNode',
            header: t('use-table-columns.last-connected-node'),
            enableSorting: false,
            mantineTableBodyCellProps: { align: 'center' as const },
            size: 220
        },
        {
            accessorKey: 'expireAt',
            header: t('use-table-columns.expire-at'),
            mantineTableBodyCellProps: { align: 'center' as const },
            size: 200
        },
        { accessorKey: 'usedBytes', header: uiText('usage-quota-a47c881'), size: 320 },
        {
            accessorKey: 'tag',
            header: t('common.field.tag'),
            enableSorting: false,
            mantineTableBodyCellProps: { align: 'center' as const },
            size: 150
        },
        {
            id: 'remainingBytes',
            accessorFn: (row: LimitUser) =>
                row.limitBytes == null || row.usedBytes == null || row.limitBytes === '0'
                    ? null
                    : (BigInt(row.limitBytes) > BigInt(row.usedBytes)
                          ? BigInt(row.limitBytes) - BigInt(row.usedBytes)
                          : 0n
                      ).toString(),
            header: uiText('remaining-f3e4352'),
            size: 190
        },
        { accessorKey: 'bonusBytes', header: uiText('extra-allowance-a855328'), size: 190 },
        {
            accessorKey: 'status',
            header: uiText('scope-state-1acf78e'),
            enableSorting: false,
            enableColumnFilter: true,
            mantineTableBodyCellProps: { align: 'center' as const },
            Filter: () => (
                <Select
                    placeholder={uiText('filter-by-9d50c25')}
                    aria-label={uiText('scope-state-1acf78e')}
                    clearable
                    value={props.filters.state === 'ALL' ? null : props.filters.state}
                    onChange={(value) =>
                        props.onFiltersChange({ ...props.filters, state: value ?? 'ALL' })
                    }
                    data={[
                        { value: 'PAUSED', label: uiText('paused-e159b06') },
                        { value: 'EXHAUSTED', label: uiText('quota-exhausted-8d99493') },
                        { value: 'AVAILABLE', label: uiText('available-e674447') },
                        { value: 'UNAVAILABLE', label: uiText('no-subscription-access-6fbdfa5') }
                    ]}
                />
            ),
            size: 230
        },
        // Separate quota sorting is available from Show/Hide columns, as in Users.
        {
            accessorKey: 'limitBytes',
            header: t('traffic-limits-card.traffic-limit'),
            size: 180,
            Cell: ({ row }: { row: { original: LimitUser } }) =>
                props.renderCells.remainingBytes({ ...row.original, usedBytes: '0' })
        },
        {
            id: 'actions',
            header: uiText('actions-ff8059d'),
            enableSorting: false,
            enableColumnActions: false,
            enableHiding: false,
            enableResizing: false,
            size: 100
        }
    ].map((column) => ({
        ...column,
        ...(column.id !== 'actions' &&
            column.accessorKey !== 'id' && { minSize: 120, maxSize: 440 }),
        ...(column.accessorKey !== 'limitBytes' && {
            Cell: ({ row }: { row: { original: LimitUser } }) => (
                <div
                    style={{
                        minWidth: 0,
                        display: 'block',
                        width: '100%'
                    }}
                >
                    {props.renderCells[(column.id ?? column.accessorKey) as Cell](row.original)}
                </div>
            )
        })
    }))
    const rowSelection = Object.fromEntries(props.selected.map((id) => [id, true]))
    const sorting = [{ id: props.filters.sort, desc: props.filters.direction === 'desc' }]
    const pagination = { pageIndex: props.page - 1, pageSize: props.filters.pageSize }
    const table = useMantineReactTable({
        localization,
        columns,
        data: props.rows,
        rowCount: props.total,
        getRowId: (row) => row.id,
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        enableGlobalFilter: false,
        enableColumnFilters: true,
        defaultColumn: { enableColumnFilter: false },
        enableMultiSort: false,
        enableSortingRemoval: false,
        enableColumnOrdering: true,
        enableColumnPinning: true,
        enableColumnResizing: true,
        columnResizeMode: 'onEnd',
        enableRowSelection: (row) =>
            props.selectable && (props.selected.includes(row.id) || props.selected.length < 500),
        enableSelectAll: props.selectable,
        selectAllMode: 'page',
        initialState: { density: 'xxs', columnVisibility: { limitBytes: false } },
        displayColumnDefOptions: {
            'mrt-row-select': {
                size: 52,
                minSize: 52,
                maxSize: 52,
                enableResizing: false,
                ...(!props.selectable && { visibleInShowHideMenu: false })
            }
        },
        onSortingChange: (updater) => {
            const next = typeof updater === 'function' ? updater(sorting) : updater
            if (next[0])
                props.onFiltersChange({
                    ...props.filters,
                    sort: next[0].id,
                    direction: next[0].desc ? 'desc' : 'asc'
                })
        },
        onPaginationChange: (updater) => {
            const next = typeof updater === 'function' ? updater(pagination) : updater
            if (next.pageSize !== props.filters.pageSize) {
                props.onFiltersChange({ ...props.filters, pageSize: next.pageSize })
            } else props.onPageChange(next.pageIndex + 1)
        },
        onRowSelectionChange: (updater) => {
            const next = typeof updater === 'function' ? updater(rowSelection) : updater
            // Page selection must preserve recipients selected on other pages.
            props.onSelectedChange(
                Object.keys(next)
                    .filter((id) => next[id])
                    .slice(0, 500)
            )
        },
        onColumnVisibilityChange: setColumnVisibility,
        mantineSelectCheckboxProps: ({ row }) => ({
            size: 'md',
            color: 'cyan',
            variant: 'outline',
            'aria-label': uiText('select-1f7133c') + row.original.username
        }),
        mantineSelectAllCheckboxProps: { size: 'md', color: 'cyan', variant: 'outline' },
        mantinePaginationProps: { rowsPerPageOptions: ['25', '50', '100'] },
        mantineTopToolbarProps: { style: { '--mrt-base-background-color': 'var(--panel-subtle)' } },
        mantineTableHeadProps: { style: { '--mrt-base-background-color': 'var(--panel-subtle)' } },
        mantineBottomToolbarProps: {
            style: { '--mrt-base-background-color': 'var(--panel-subtle)' }
        },
        mantinePaperProps: { radius: 'md', className: 'xera-users-table', withBorder: false },
        mantineToolbarAlertBannerProps: props.isError
            ? {
                  color: 'red',
                  children: t('user-table.widget.error-loading-data')
              }
            : undefined,
        renderToolbarInternalActions: ({ table: instance }) => (
            <ActionIconGroup>
                <MRT_ToggleDensePaddingButton table={instance} />
                <MRT_ToggleFullScreenButton table={instance} />
                <MRT_ShowHideColumnsButton table={instance} />
            </ActionIconGroup>
        ),
        state: {
            showColumnFilters: true,
            sorting,
            pagination,
            rowSelection,
            columnVisibility: { ...columnVisibility, 'mrt-row-select': props.selectable },
            isLoading: props.isLoading,
            showProgressBars: props.isFetching,
            showAlertBanner: props.isError
        }
    })

    return (
        <DataTableShared.Container>
            <DataTableShared.Title
                icon={<PiUsersDuotone size={24} />}
                title={
                    <>
                        {t('user-table.widget.table-title')} · {props.total}
                    </>
                }
                actions={
                    <>
                        <SegmentedControl
                            size="xs"
                            value={props.unit}
                            data={['MB', 'GB']}
                            aria-label={uiText('traffic-unit-e8fcf48')}
                            onChange={(value) => props.onUnitChange(value as 'MB' | 'GB')}
                        />
                        <Tooltip label={uiText('refresh-users-7e079f1')}>
                            <RefreshActionIcon
                                variant="soft"
                                size="lg"
                                loading={props.isFetching}
                                aria-label={uiText('refresh-users-7e079f1')}
                                onClick={props.refetch}
                            >
                                <TbRefresh size={20} />
                            </RefreshActionIcon>
                        </Tooltip>
                    </>
                }
            />
            <DataTableShared.Content>
                <MantineReactTable table={table} />
            </DataTableShared.Content>
        </DataTableShared.Container>
    )
}
