import {
    ActionIcon,
    Alert,
    Menu,
    UnstyledButton,
    Tooltip,
    Badge,
    Button,
    Card,
    Group,
    Modal,
    NumberInput,
    SegmentedControl,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title
} from '@mantine/core'
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { UserStatusBadge } from '@widgets/dashboard/users/user-status-badge'
import { isAxiosError } from 'axios'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiClockCountdown, PiPause, PiProhibit, PiPulse } from 'react-icons/pi'
import {
    TbArrowLeft,
    TbGauge,
    TbRefresh,
    TbSearch,
    TbChartLine,
    TbDots,
    TbUser,
    TbPlus,
    TbPlayerPause,
    TbPlayerPlay,
    TbArrowDown,
    TbArrowUp
} from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { useUiText } from '@shared/i18n/interface-text'
import { Page, PageHeaderShared, LoadingScreen } from '@shared/ui'
import { RefreshButton } from '@shared/ui/refresh-control'
import { getExpirationTextUtil } from '@shared/utils/time-utils'

import { ConnectedNodeColumnEntity } from '@entities/dashboard/users/ui/table-columns/connected-node'
import { UsernameCell } from '@entities/dashboard/users/ui/table-columns/username/username.column'

import { ScopeSort, sortLimitScopes } from './limits-sort'
import { LimitsUsageCell } from './limits-usage-cell'
import { LimitsUsersTable } from './limits-users-table'
import {
    Action,
    Scope,
    Selection,
    LimitUser,
    UserFilters,
    useLimitAction,
    useLimitSelectionState,
    useLimitScopes,
    useLimitTargets,
    useLimitUsers
} from './limits.api'
import classes from './limits.module.css'
import { trafficBlockAction } from './traffic-block-action'
import { hasVisibleLimit } from './visible-limit-scope'

const gib = (value: string) =>
    (Number(value) / 1073741824).toLocaleString(undefined, {
        maximumFractionDigits: 3
    }) + ' GiB'
const quota = (value: string) => (value === '0' ? '∞' : gib(value))

export function LimitsPage() {
    const uiText = useUiText()

    const client = useQueryClient()
    const locale = useTranslation().i18n.language
    const scopes = useLimitScopes()
    const [sort, setSort] = useLocalStorage<ScopeSort>({
        key: 'limit-scope-sort',
        defaultValue: 'position'
    })
    const [direction, setDirection] = useLocalStorage<'asc' | 'desc'>({
        key: 'limit-scope-direction',
        defaultValue: 'asc'
    })
    const [filter, setFilter] = useState('ALL')
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<Scope | null>(null)
    const list = useMemo(
        () =>
            sortLimitScopes(
                (scopes.data ?? []).filter(
                    (s) =>
                        hasVisibleLimit(s) &&
                        (filter === 'ALL' || s.kind === filter) &&
                        s.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
                ),
                sort,
                direction,
                locale
            ),
        [scopes.data, filter, search, sort, direction, locale]
    )
    return (
        <Page title={uiText('limits-dffb64d')}>
            <PageHeaderShared
                title={uiText('limits-dffb64d')}
                icon={<TbGauge size={24} />}
                actions={
                    <RefreshButton
                        variant="light"
                        loading={scopes.isFetching}
                        leftSection={<TbRefresh />}
                        onClick={() =>
                            void client.invalidateQueries({ queryKey: ['limit-management'] })
                        }
                    >
                        {uiText('refresh-0e91610')}
                    </RefreshButton>
                }
            />
            {selected ? (
                <ScopeUsers
                    key={selected.kind + selected.key}
                    scope={selected}
                    back={() => setSelected(null)}
                />
            ) : (
                <Stack gap="lg">
                    <Text c="dimmed">
                        {uiText(
                            'host-and-tag-quotas-and-speeds-manage-all-users-a-squad-or-sel-dedaadc'
                        )}
                    </Text>
                    <Group className={classes.toolbar} wrap="wrap">
                        <SegmentedControl
                            value={filter}
                            onChange={setFilter}
                            data={[
                                { value: 'ALL', label: uiText('all-a52ace4') },
                                { value: 'HOST', label: uiText('hosts-bba9af1') },
                                { value: 'TAG', label: uiText('tags-1331275') }
                            ]}
                        />
                        <TextInput
                            style={{ flex: '1 1 220px' }}
                            aria-label={uiText('search-scopes-4072c9d')}
                            placeholder={uiText('find-a-host-or-tag-32f269c')}
                            value={search}
                            onChange={(e) => setSearch(e.currentTarget.value)}
                            leftSection={<TbSearch />}
                        />
                        <Group gap="xs" wrap="nowrap" style={{ flex: '0 1 280px', minWidth: 0 }}>
                            <Select
                                aria-label={uiText('sort-limits-575f4cc')}
                                style={{ flex: 1, minWidth: 0 }}
                                value={sort}
                                onChange={(value) => {
                                    if (value) {
                                        setSort(value as ScopeSort)
                                        setDirection(value === 'usedBytes' ? 'desc' : 'asc')
                                    }
                                }}
                                allowDeselect={false}
                                data={[
                                    {
                                        value: 'position',
                                        label: uiText('host-order-a7a00c3')
                                    },
                                    { value: 'name', label: uiText('name-dcd1d52') },
                                    {
                                        value: 'usedBytes',
                                        label: uiText('traffic-used-355b28c')
                                    },
                                    { value: 'limitBytes', label: uiText('quota-6c105ca') },
                                    {
                                        value: 'speedLimitMbps',
                                        label: uiText('user-speed-bbb06a4')
                                    },
                                    {
                                        value: 'totalSpeedLimitMbps',
                                        label: uiText('total-speed-c3c0eb4')
                                    }
                                ]}
                            />
                            <Tooltip
                                label={
                                    direction === 'asc'
                                        ? uiText('ascending-7718459')
                                        : uiText('descending-79479a6')
                                }
                            >
                                <ActionIcon
                                    size={36}
                                    variant="light"
                                    aria-label={uiText('reverse-sort-direction-b4d2088')}
                                    onClick={() =>
                                        setDirection(direction === 'asc' ? 'desc' : 'asc')
                                    }
                                >
                                    {direction === 'asc' ? <TbArrowUp /> : <TbArrowDown />}
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    </Group>
                    {scopes.isError ? (
                        <Alert color="red">
                            {uiText('could-not-load-limits-press-refresh-8e66afe')}
                        </Alert>
                    ) : scopes.isLoading ? (
                        <LoadingScreen />
                    ) : list.length === 0 ? (
                        <Card withBorder>
                            <Text>{uiText('no-hosts-or-tags-found-5e14329')}</Text>
                        </Card>
                    ) : (
                        <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>
                            {list.map((s) => (
                                <Card
                                    key={s.kind + s.key}
                                    withBorder
                                    radius="lg"
                                    className={classes.scopeCard}
                                    style={{ minWidth: 0 }}
                                >
                                    <Stack gap={14} h="100%">
                                        <Group justify="space-between">
                                            <Badge variant="light">
                                                {s.kind === 'HOST'
                                                    ? uiText('host-4a82311')
                                                    : uiText('tag-1503916')}
                                            </Badge>
                                            {s.paused && (
                                                <Badge color="yellow">
                                                    {uiText('paused-for-all-d332b4f')}
                                                </Badge>
                                            )}
                                        </Group>
                                        <Text
                                            fw={700}
                                            size="lg"
                                            style={{ overflowWrap: 'anywhere' }}
                                        >
                                            {s.name}
                                        </Text>
                                        <Text size="sm" c="dimmed">
                                            {uiText('current-period-usage-73e93ad')}
                                            {s.usedBytes == null ? '—' : gib(s.usedBytes)}
                                        </Text>
                                        <Text size="sm">
                                            {uiText('quota-per-user-5c0ec2b')}
                                            {quota(s.limitBytes)}
                                        </Text>
                                        <Text size="sm">
                                            {uiText('speed-per-user-host-f449280')}
                                            {s.speedLimitMbps ? `${s.speedLimitMbps} Mbps` : '∞'}
                                        </Text>
                                        <Text size="sm">
                                            {uiText('shared-speed-2012ee5')}
                                            {s.totalSpeedLimitMbps
                                                ? `${s.totalSpeedLimitMbps} Mbps`
                                                : '∞'}{' '}
                                            · {s.trafficMultiplier ?? uiText('tag-1-266d618')}×
                                        </Text>
                                        {s.kind === 'TAG' && (
                                            <Text size="sm" c="dimmed">
                                                {uiText('hosts-e365c9f')}
                                                {s.hostCount}
                                            </Text>
                                        )}
                                        <Button
                                            mt="auto"
                                            variant="light"
                                            onClick={() => setSelected(s)}
                                        >
                                            {uiText('users-and-actions-87dce8a')}
                                        </Button>
                                    </Stack>
                                </Card>
                            ))}
                        </SimpleGrid>
                    )}
                </Stack>
            )}
        </Page>
    )
}

function ScopeUsers({ scope: initial, back }: { scope: Scope; back: () => void }) {
    const uiText = useUiText()
    const { t, i18n } = useTranslation()
    const [mode, setMode] = useState('ALL')
    const [squad, setSquad] = useState<string | null>(null)
    const [selected, setSelected] = useState<string[]>([])
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, 250)
    const [unit, setUnit] = useState<'MB' | 'GB'>('GB')
    const [filters, setFilters] = useState<UserFilters>({
        pageSize: 50,
        status: 'ALL',
        state: 'ALL',
        sort: 'usedBytes',
        direction: 'desc'
    })
    const setFilter = (field: keyof UserFilters, value: string | number) => {
        setFilters((v) => ({ ...v, [field]: value }))
        setPage(1)
    }
    const display = (value: string) =>
        (Number(value) / (unit === 'MB' ? 1048576 : 1073741824)).toLocaleString(
            uiText('en-us-5c49f88'),
            { maximumFractionDigits: 3 }
        ) +
        ' ' +
        unit
    const [pendingCount, setPendingCount] = useState(0)
    const [pendingName, setPendingName] = useState('')
    const [amount, setAmount] = useState<string | number>(1)
    const [pending, setPending] = useState<Action | null>(null)
    const [success, setSuccess] = useState('')
    const targets = useLimitTargets()
    const mutation = useLimitAction()
    const errorStatus = isAxiosError(mutation.error) ? mutation.error.response?.status : undefined
    const errorMessage = mutation.isError
        ? errorStatus === 403
            ? t('requestErrors.forbidden')
            : errorStatus === 401
              ? t('requestErrors.unauthorized')
              : errorStatus && errorStatus !== 503
                ? t('requestErrors.http-status', { status: errorStatus })
                : t('requestErrors.unavailable')
        : null
    const squadSelection: Selection =
        mode === 'SQUAD' && squad
            ? {
                  type: 'SQUAD',
                  squadType: squad.startsWith('INTERNAL:') ? 'INTERNAL' : 'EXTERNAL',
                  squadUuid: squad.split(':')[1]
              }
            : { type: 'ALL' }
    const users = useLimitUsers(
        initial,
        page,
        debouncedSearch,
        squadSelection,
        mode !== 'SQUAD' || !!squad,
        filters
    )
    const lastPage = users.data ? Math.max(1, Math.ceil(users.data.total / filters.pageSize)) : page
    if (page > lastPage) setPage(lastPage)
    const scope = users.data?.scope ?? initial
    const rows = users.data?.users ?? []
    const selection: Selection =
        mode === 'SELECTED' ? { type: 'SELECTED', userIds: selected } : squadSelection
    const hasSelection = mode === 'SQUAD' ? !!squad : mode !== 'SELECTED' || selected.length > 0
    const selectionState = useLimitSelectionState(scope, selection, mode !== 'SQUAD' || !!squad)
    const count = mode === 'SELECTED' ? selected.length : (users.data?.allUsers ?? 0)
    const bytes = Math.round(Number(amount) * 1073741824)
    const validAmount = Number.isSafeInteger(bytes) && bytes > 0
    const loaded =
        !!users.data && !users.isFetching && !users.isError && (mode !== 'SQUAD' || !!squad)
    const ready = loaded && count > 0
    const pauseReady =
        loaded &&
        !selectionState.isFetching &&
        !selectionState.isError &&
        !!selectionState.data &&
        (mode === 'ALL' || selectionState.data.total > 0) &&
        (mode !== 'SELECTED' || selectionState.data.total === selected.length) &&
        (mode === 'ALL' || !selectionState.data.scopePaused)
    const blockAction = selectionState.data ? trafficBlockAction(selectionState.data) : 'PAUSE'
    const blockLabel = t(
        scope.kind === 'HOST'
            ? blockAction === 'PAUSE'
                ? 'limitsTrafficAction.blockHost'
                : 'limitsTrafficAction.unblockHost'
            : blockAction === 'PAUSE'
              ? 'limitsTrafficAction.blockTag'
              : 'limitsTrafficAction.unblockTag'
    )
    const actionNames = {
        ADD: uiText('add-allowance-4705372'),
        RESET: uiText('reset-usage-956c967'),
        PAUSE: uiText('pause-traffic-a604dca'),
        RESUME: uiText('resume-traffic-50b5bc3'),
        UNLIMITED: t('limitsUnlimited.grant'),
        LIMITED: t('limitsUnlimited.revoke')
    }
    const ask = (action: Action['action'], user?: LimitUser) => {
        setPendingCount(user ? 1 : count)
        setPendingName(user?.username ?? '')
        mutation.reset()
        setPending({
            kind: scope.kind,
            key: scope.key,
            action,
            amountBytes: action === 'ADD' ? bytes : 0,
            selection: user ? { type: 'SELECTED', userIds: [user.id] } : selection,
            requestId: crypto.randomUUID()
        })
    }
    const submit = async () => {
        if (!pending) return
        try {
            const result = await mutation.mutateAsync(pending)
            setSuccess(
                uiText('saved-for-value-users-node-policy-synchronization-requested-d4d11b6', {
                    value1: result.affectedUsers
                })
            )
            setPending(null)
        } catch {
            /* Keep the same request ID for a safe retry. */
        }
    }
    return (
        <Stack gap="lg">
            <Group justify="space-between">
                <Button variant="subtle" leftSection={<TbArrowLeft />} onClick={back}>
                    {uiText('all-limits-6d1a1ed')}
                </Button>
                <Button
                    variant="light"
                    loading={users.isFetching}
                    onClick={() => void users.refetch()}
                >
                    {uiText('refresh-users-7e079f1')}
                </Button>
            </Group>
            <Card withBorder radius="lg">
                <Stack gap="xs">
                    <Group>
                        <Badge>
                            {scope.kind === 'TAG' ? uiText('tag-1503916') : uiText('host-4a82311')}
                        </Badge>
                        <Title order={3} style={{ overflowWrap: 'anywhere' }}>
                            {scope.name}
                        </Title>
                    </Group>
                    <Text size="sm">
                        {uiText('base-quota-per-user-d6b9f30')}
                        {quota(scope.limitBytes)}
                    </Text>
                    <Text c="dimmed" size="sm">
                        {scope.kind === 'TAG'
                            ? uiText(
                                  'quota-combines-traffic-from-hosts-participating-in-the-tag-quo-669a173'
                              )
                            : uiText(
                                  'actions-affect-this-host-only-other-tag-limits-still-apply-4659b5e'
                              )}
                    </Text>
                    {scope.paused && (
                        <Alert color="yellow">
                            {uiText(
                                'this-scope-is-paused-for-everyone-select-all-resume-traffic-to-05c8eaf'
                            )}
                        </Alert>
                    )}
                </Stack>
            </Card>
            {success && (
                <Alert color="teal" withCloseButton onClose={() => setSuccess('')}>
                    {success}
                </Alert>
            )}
            <Card withBorder radius="lg">
                <Stack>
                    <Text fw={600}>{uiText('action-recipients-f6f5577')}</Text>
                    <SegmentedControl
                        fullWidth
                        value={mode}
                        onChange={(v) => {
                            setMode(v)
                            setSelected([])
                            setPage(1)
                        }}
                        data={[
                            { value: 'ALL', label: uiText('all-a52ace4') },
                            { value: 'SQUAD', label: uiText('squad-df6163f') },
                            { value: 'SELECTED', label: uiText('selected-57fd7a0') }
                        ]}
                    />
                    {mode === 'SQUAD' && (
                        <>
                            <Select
                                label={uiText('squad-df6163f')}
                                searchable
                                clearable
                                value={squad}
                                onChange={(v) => {
                                    setSquad(v)
                                    setPage(1)
                                }}
                                data={(targets.data ?? []).map((s) => ({
                                    value: s.type + ':' + s.uuid,
                                    label: `${s.name} · ${s.type === 'INTERNAL' ? uiText('internal-3bed2cb') : uiText('external-3c46238')}`
                                }))}
                                placeholder={uiText('choose-a-squad-1217e46')}
                                nothingFoundMessage={uiText('no-squad-found-d1d41dc')}
                            />
                            {targets.isError && (
                                <Alert color="red">
                                    {uiText('could-not-load-squads-fb7f789')}{' '}
                                    <Button variant="subtle" onClick={() => void targets.refetch()}>
                                        {uiText('retry-942087c')}
                                    </Button>
                                </Alert>
                            )}
                        </>
                    )}
                    {mode !== 'SQUAD' && (
                        <Text size="sm" c="dimmed">
                            {mode === 'ALL'
                                ? uiText(
                                      'all-users-entitled-to-this-scope-search-and-pagination-do-not--ad386c9'
                                  )
                                : uiText(
                                      'select-one-or-more-users-in-the-table-selection-spans-pages-ma-d1f6a9b'
                                  )}
                        </Text>
                    )}
                    <Group justify="space-between">
                        <Text fw={600}>
                            {uiText('recipients-a9aab54')}
                            {mode === 'SQUAD' && !squad ? '—' : count}
                        </Text>
                        {selected.length > 0 && (
                            <Button variant="subtle" onClick={() => setSelected([])}>
                                {uiText('clear-selection-cea4d2e')}
                            </Button>
                        )}
                    </Group>
                    <Group align="end" wrap="wrap">
                        <NumberInput
                            label={uiText('one-off-allowance-each-gib-964abcc')}
                            leftSection={<TbChartLine size={16} />}
                            min={0}
                            max={8388607}
                            decimalScale={3}
                            value={amount}
                            onChange={setAmount}
                            onBlur={() => {
                                if (amount === '') setAmount(0)
                            }}
                            style={{ flex: '1 1 210px', maxWidth: 440 }}
                        />
                        <Button
                            disabled={!ready || !validAmount || scope.limitBytes === '0'}
                            onClick={() => ask('ADD')}
                        >
                            {actionNames.ADD}
                        </Button>
                    </Group>
                    {scope.limitBytes === '0' && (
                        <Text size="xs" c="dimmed">
                            {uiText(
                                'traffic-is-unlimited-set-a-base-quota-in-host-or-tag-settings--96189bd'
                            )}
                        </Text>
                    )}
                    {hasSelection && selectionState.data && (
                        <Text size="xs" c="dimmed">
                            {t('limitsTrafficAction.blockedCount', {
                                blocked: selectionState.data.pausedUsers,
                                total: selectionState.data.total
                            })}
                        </Text>
                    )}
                    <Group wrap="wrap">
                        <Button
                            variant="light"
                            disabled={
                                !ready ||
                                !selectionState.data ||
                                selectionState.isFetching ||
                                selectionState.isError
                            }
                            onClick={() => ask('UNLIMITED')}
                        >
                            {actionNames.UNLIMITED}
                        </Button>
                        {!!selectionState.data?.unlimitedUsers && (
                            <Button
                                variant="light"
                                disabled={
                                    !ready || selectionState.isFetching || selectionState.isError
                                }
                                onClick={() => ask('LIMITED')}
                            >
                                {actionNames.LIMITED}
                            </Button>
                        )}
                        <Button variant="light" disabled={!ready} onClick={() => ask('RESET')}>
                            {actionNames.RESET}
                        </Button>
                        <Button
                            color={blockAction === 'PAUSE' ? 'yellow' : 'teal'}
                            variant="light"
                            disabled={!pauseReady}
                            onClick={() => ask(blockAction)}
                        >
                            {blockLabel}
                        </Button>
                    </Group>
                </Stack>
            </Card>
            <Card withBorder radius="lg">
                <Stack gap="sm">
                    <TextInput
                        aria-label={uiText('search-users-e4bb77a')}
                        placeholder={uiText('name-id-short-id-email-or-telegram-id-c7b3a50')}
                        maxLength={100}
                        value={search}
                        onChange={(e) => {
                            setSearch(e.currentTarget.value)
                            setPage(1)
                        }}
                        leftSection={<TbSearch />}
                    />
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <Select
                            label={uiText('subscription-status-f0723c4')}
                            value={filters.status}
                            onChange={(v) => setFilter('status', v ?? 'ALL')}
                            data={[
                                { value: 'ALL', label: uiText('all-a52ace4') },
                                { value: 'ACTIVE', label: uiText('active-9234069') },
                                { value: 'DISABLED', label: uiText('disabled-75081b5') },
                                { value: 'LIMITED', label: uiText('limited-e5125d9') },
                                { value: 'EXPIRED', label: uiText('expired-424a255') }
                            ]}
                        />
                        <Select
                            label={uiText('scope-state-1acf78e')}
                            value={filters.state}
                            onChange={(v) => setFilter('state', v ?? 'ALL')}
                            data={[
                                { value: 'ALL', label: uiText('all-a52ace4') },
                                { value: 'PAUSED', label: uiText('paused-e159b06') },
                                {
                                    value: 'EXHAUSTED',
                                    label: uiText('quota-exhausted-8d99493')
                                },
                                { value: 'AVAILABLE', label: uiText('available-e674447') },
                                {
                                    value: 'UNAVAILABLE',
                                    label: uiText('no-subscription-access-6fbdfa5')
                                }
                            ]}
                        />
                    </SimpleGrid>
                    {users.data && (
                        <Group gap="lg">
                            <Text size="sm">
                                {uiText('filtered-usage-58fcf33')}
                                <b>{display(users.data.summary.usedBytes)}</b>
                            </Text>
                            <Text size="sm">
                                {uiText('paused-ec7059d')}
                                {users.data.summary.pausedUsers}
                            </Text>
                            <Text size="sm">
                                {uiText('quota-exhausted-b910ef4')}
                                {users.data.summary.exhaustedUsers}
                            </Text>
                        </Group>
                    )}
                    <Text size="xs" c="dimmed">
                        {uiText(
                            'statistics-cover-this-scope-s-current-period-including-multipl-25bc1d4'
                        )}
                    </Text>
                </Stack>
            </Card>
            {mode === 'SQUAD' && !squad ? (
                <Text c="dimmed">{uiText('choose-a-squad-above-cee3096')}</Text>
            ) : (
                <LimitsUsersTable
                    rows={rows}
                    total={users.data?.total ?? 0}
                    page={page}
                    filters={filters}
                    search={search}
                    onSearchChange={(value) => {
                        setSearch(value)
                        setPage(1)
                    }}
                    onPageChange={setPage}
                    onFiltersChange={(next) => {
                        setFilters(next)
                        setPage(1)
                    }}
                    selectable={mode === 'SELECTED'}
                    selected={selected}
                    onSelectedChange={setSelected}
                    isLoading={users.isLoading}
                    isFetching={users.isFetching}
                    isError={users.isError}
                    refetch={() => void users.refetch()}
                    unit={unit}
                    onUnitChange={setUnit}
                    renderCells={{
                        username: (u) => (
                            <UnstyledButton
                                className={classes.username}
                                onClick={() =>
                                    void showModal('users_viewUserModal', {
                                        userId: Number(u.id)
                                    })
                                }
                            >
                                <UsernameCell username={u.username} onlineAt={u.onlineAt} />
                            </UnstyledButton>
                        ),
                        subscriptionStatus: (u) => <UserStatusBadge miw="13ch" status={u.status} />,
                        lastConnectedNode: (u) => (
                            <ConnectedNodeColumnEntity node={u.lastConnectedNode ?? undefined} />
                        ),
                        expireAt: (u) => (
                            <Text c="dimmed" size="xs">
                                {getExpirationTextUtil(u.expireAt, t, i18n)}
                            </Text>
                        ),
                        tag: (u) => (
                            <Text ff="monospace" fw={500} size="md">
                                {u.tag || '–'}
                            </Text>
                        ),
                        id: (u) => (
                            <Text size="sm">
                                <bdi dir="ltr">{u.id}</bdi>
                            </Text>
                        ),
                        usedBytes: (u) => <LimitsUsageCell user={u} display={display} />,
                        remainingBytes: (u) => (
                            <>
                                {u.limitBytes === '0'
                                    ? '∞'
                                    : display(
                                          (BigInt(u.limitBytes) > BigInt(u.usedBytes)
                                              ? BigInt(u.limitBytes) - BigInt(u.usedBytes)
                                              : 0n
                                          ).toString()
                                      )}
                            </>
                        ),
                        bonusBytes: (u) => <>{display(u.bonusBytes)}</>,
                        status: (u) => (
                            <>
                                <Badge
                                    variant="soft"
                                    size="lg"
                                    miw="13ch"
                                    leftSection={
                                        u.paused ? (
                                            <PiPause size={18} />
                                        ) : u.limitBytes !== '0' &&
                                          BigInt(u.usedBytes) >= BigInt(u.limitBytes) ? (
                                            <PiClockCountdown size={18} />
                                        ) : u.accessNow ? (
                                            <PiPulse size={18} />
                                        ) : (
                                            <PiProhibit size={18} />
                                        )
                                    }
                                    color={
                                        u.paused
                                            ? 'yellow'
                                            : u.limitBytes !== '0' &&
                                                BigInt(u.usedBytes) >= BigInt(u.limitBytes)
                                              ? 'red'
                                              : u.accessNow
                                                ? 'teal'
                                                : 'gray'
                                    }
                                >
                                    {u.paused
                                        ? uiText('paused-e159b06')
                                        : u.limitBytes !== '0' &&
                                            BigInt(u.usedBytes) >= BigInt(u.limitBytes)
                                          ? uiText('quota-exhausted-8d99493')
                                          : u.accessNow
                                            ? uiText('access-allowed-f505864')
                                            : uiText('no-current-access-5ccd803')}
                                </Badge>
                            </>
                        ),
                        actions: (u) => (
                            <>
                                <Menu withinPortal position="bottom-end">
                                    <Menu.Target>
                                        <ActionIcon
                                            variant="subtle"
                                            size="md"
                                            aria-label={uiText('actions-12ca9c2') + u.username}
                                        >
                                            <TbDots />
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        <Menu.Item
                                            leftSection={<TbUser />}
                                            onClick={() =>
                                                void showModal('users_viewUserModal', {
                                                    userId: Number(u.id)
                                                })
                                            }
                                        >
                                            {uiText('open-user-a030376')}
                                        </Menu.Item>
                                        <Menu.Divider />
                                        <Menu.Label>{uiText('this-scope-only-698e023')}</Menu.Label>
                                        <Menu.Item
                                            leftSection={<TbPlus />}
                                            disabled={
                                                !loaded ||
                                                !validAmount ||
                                                scope.limitBytes === '0' ||
                                                u.unlimited
                                            }
                                            onClick={() => ask('ADD', u)}
                                        >
                                            {actionNames.ADD} · {gib(String(bytes))}
                                        </Menu.Item>
                                        <Menu.Item
                                            leftSection={<TbGauge />}
                                            disabled={!loaded}
                                            onClick={() =>
                                                ask(u.unlimited ? 'LIMITED' : 'UNLIMITED', u)
                                            }
                                        >
                                            {u.unlimited
                                                ? actionNames.LIMITED
                                                : actionNames.UNLIMITED}
                                        </Menu.Item>
                                        <Menu.Item
                                            leftSection={<TbRefresh />}
                                            disabled={!loaded}
                                            onClick={() => ask('RESET', u)}
                                        >
                                            {actionNames.RESET}
                                        </Menu.Item>
                                        <Menu.Item
                                            leftSection={
                                                u.paused ? <TbPlayerPlay /> : <TbPlayerPause />
                                            }
                                            disabled={!loaded || scope.paused}
                                            onClick={() => ask(u.paused ? 'RESUME' : 'PAUSE', u)}
                                        >
                                            {t(
                                                u.paused
                                                    ? 'limitsTrafficAction.unblockUser'
                                                    : 'limitsTrafficAction.blockUser'
                                            )}
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            </>
                        )
                    }}
                />
            )}
            <Modal
                opened={!!pending}
                onClose={() => {
                    if (!mutation.isPending) setPending(null)
                }}
                title={pending ? actionNames[pending.action] : ''}
                centered
                closeOnClickOutside={!mutation.isPending}
                closeOnEscape={!mutation.isPending}
                withCloseButton={!mutation.isPending}
            >
                {pending && (
                    <Stack>
                        <Text fw={600}>{scope.name}</Text>
                        <Text>
                            {uiText('recipients-a9aab54')}
                            {pendingCount}
                            {pendingName ? ` · ${pendingName}` : ''}
                        </Text>
                        <Text size="sm">
                            {pending.action === 'UNLIMITED'
                                ? t('limitsUnlimited.grantDescription')
                                : pending.action === 'LIMITED'
                                  ? t('limitsUnlimited.revokeDescription')
                                  : pending.action === 'ADD'
                                    ? uiText(
                                          'add-value-to-each-user-s-current-period-base-quota-is-unchange-7891f41',
                                          { value1: gib(String(pending.amountBytes)) }
                                      )
                                    : pending.action === 'RESET'
                                      ? uiText(
                                            'reset-usage-in-this-scope-overall-subscription-statistics-are--6e727f4'
                                        )
                                      : pending.action === 'PAUSE'
                                        ? uiText(
                                              'pause-further-traffic-in-this-scope-until-manually-resumed-d906702'
                                          )
                                        : pending.selection.type === 'ALL'
                                          ? uiText(
                                                'clear-scope-and-individual-pauses-here-quotas-and-subscription-90cd1d0'
                                            )
                                          : uiText(
                                                'clear-individual-pauses-scope-pause-quotas-and-subscription-re-c6848d8'
                                            )}
                        </Text>
                        {mutation.isError && (
                            <Alert color="red">
                                {errorMessage && (
                                    <Text size="sm" mb="xs">
                                        {errorMessage}
                                    </Text>
                                )}
                                {uiText(
                                    'could-not-confirm-the-result-retrying-this-operation-is-safe-a-368c1e5'
                                )}
                            </Alert>
                        )}
                        <Button loading={mutation.isPending} onClick={() => void submit()}>
                            {mutation.isError
                                ? uiText('retry-operation-9d39a36')
                                : uiText('confirm-eebdd24')}
                        </Button>
                    </Stack>
                )}
            </Modal>
        </Stack>
    )
}
