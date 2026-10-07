import {
    Badge,
    Box,
    Card,
    Group,
    Loader,
    ScrollArea,
    SegmentedControl,
    Select,
    Stack,
    Table,
    Text,
    ThemeIcon
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    TbArrowRight,
    TbBan,
    TbBoxMultiple,
    TbCrown,
    TbFilter,
    TbGauge,
    TbPlayerPlay,
    TbRoute,
    TbServer,
    TbShieldCheck,
    TbUser
} from 'react-icons/tb'

import { useGetTrafficPaths, useGetUsers } from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'

interface IProps {
    mobile?: boolean
}

export const TrafficPathsWidget = (props: IProps) => {
    const uiText = useUiText()

    const { mobile = false } = props
    const { t } = useTranslation()

    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, 350)
    const [selectedUser, setSelectedUser] = useState<string | null>(null)
    const [selectedHostUuid, setSelectedHostUuid] = useState<string | null>(null)
    const [hostFilter, setHostFilter] = useState('all')

    const { data: usersResult, isFetching: isUsersFetching } = useGetUsers({
        query: {
            start: 0,
            size: 50,
            filters: debouncedSearch ? [{ id: 'username', value: debouncedSearch }] : undefined
        }
    })

    const userOptions = useMemo(() => {
        const response = usersResult as unknown as
            | { users?: Array<{ shortUuid: string; username: string }> }
            | undefined
        return (response?.users ?? []).map((user) => ({
            value: user.shortUuid,
            label: `${user.username} (${user.shortUuid.slice(0, 8)}…)`
        }))
    }, [usersResult])

    const { data: paths, isLoading: isPathsLoading } = useGetTrafficPaths({
        query: selectedUser ? { userShortUuid: selectedUser } : {},
        rQueryParams: { enabled: !!selectedUser, refetchOnMount: true }
    })

    const data = paths as
        | import('@remnawave/backend-contract').GetTrafficPathsCommand.Response['response']
        | undefined

    const hosts = data?.hosts ?? []
    const filteredHosts = useMemo(() => {
        return hosts.filter((host) => {
            if (hostFilter === 'accessible') return !host.isDisabled && !host.isHidden
            if (hostFilter === 'blocked') return host.isDisabled
            if (hostFilter === 'hidden') return host.isHidden
            if (hostFilter === 'limited') {
                return (
                    host.userTrafficLimitBytes !== null &&
                    (host.usedTrafficBytes ?? 0) >= (host.userTrafficLimitBytes ?? 0)
                )
            }
            return true
        })
    }, [hosts, hostFilter])

    const selectedHost =
        filteredHosts.find((host) => host.uuid === selectedHostUuid) ?? filteredHosts[0] ?? null
    const activeProfile = selectedHost
        ? data?.profiles.find((profile) => profile.uuid === selectedHost.profileUuid)
        : undefined
    const blockedDomains = activeProfile
        ? activeProfile.routing.rules
              .filter((rule) =>
                  activeProfile.outbounds.some(
                      (outbound) =>
                          outbound.protocol === 'blackhole' && outbound.tag === rule.outboundTag
                  )
              )
              .flatMap((rule) =>
                  Array.isArray(rule.domains) ? rule.domains : rule.domains ? [rule.domains] : []
              )
              .slice(0, 40)
        : []

    const outboundColor = (tag: string | null): string => {
        if (!tag) return 'gray'
        if (/block|reject|ban/i.test(tag)) return 'red'
        if (/direct|freedom/i.test(tag)) return 'teal'
        return 'indigo'
    }

    return (
        <Stack gap="md" h={mobile ? undefined : '72vh'}>
            <Group gap="md" align="flex-start">
                <Box style={{ flex: 1, minWidth: 260 }}>
                    <Select
                        searchable
                        clearable
                        data={userOptions}
                        description={uiText('pick-a-user-to-visualize-the-traffic-path-b575fdc')}
                        label={uiText('user-optional-a99b884')}
                        leftSection={<TbUser size={16} />}
                        limit={50}
                        nothingFoundMessage={uiText('nothing-found-9f5cac3')}
                        onChange={(value) => {
                            setSelectedUser(value)
                            setSelectedHostUuid(null)
                        }}
                        onSearchChange={setSearch}
                        rightSection={isUsersFetching ? <Loader size="xs" /> : undefined}
                        searchValue={search}
                        size="sm"
                        value={selectedUser}
                    />
                </Box>
            </Group>

            {isPathsLoading && (
                <Group justify="center" p="xl">
                    <Loader />
                </Group>
            )}

            {selectedUser && !isPathsLoading && data && (
                <>
                    <Group gap="xs">
                        <Badge color="indigo" leftSection={<TbRoute size={12} />} variant="light">
                            {uiText('visible-hosts-value-value-2083f9d', {
                                value1: data.summary.hostsAccessible,
                                value2: data.summary.hostsTotal
                            })}
                        </Badge>
                        <Badge
                            color="cyan"
                            leftSection={<TbBoxMultiple size={12} />}
                            variant="light"
                        >
                            {uiText('inbounds-value-35f7340', {
                                value1: data.summary.inboundsTotal
                            })}
                        </Badge>
                        <Badge color="grape" leftSection={<TbServer size={12} />} variant="light">
                            {uiText('nodes-value-45d22b6', { value1: data.summary.nodesTotal })}
                        </Badge>
                        <Badge
                            color="teal"
                            leftSection={<TbPlayerPlay size={12} />}
                            variant="light"
                        >
                            {uiText('outbounds-value-4613c6c', {
                                value1: data.summary.outboundsTotal
                            })}
                        </Badge>
                        <Badge color="orange" leftSection={<TbFilter size={12} />} variant="light">
                            {uiText('routing-rules-value-31fa013', {
                                value1: data.summary.routingRulesTotal
                            })}
                        </Badge>
                    </Group>

                    <Group gap="xs" align="flex-start" wrap={mobile ? 'wrap' : 'nowrap'}>
                        <Card
                            padding="sm"
                            radius="md"
                            style={{ flex: '1 1 220px', minWidth: 220 }}
                            withBorder
                        >
                            <Group gap="xs" mb={4}>
                                <ThemeIcon color="indigo" size="sm" variant="soft">
                                    <TbUser size={14} />
                                </ThemeIcon>
                                <Text fw={600} size="sm">
                                    {data.user?.username ?? uiText('all-hosts-e568a3c')}
                                </Text>
                            </Group>
                            <Table fz="xs">
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Td c="dimmed">{uiText('status-920e413')}</Table.Td>
                                        <Table.Td>{data.user?.status ?? '—'}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td c="dimmed">{uiText('expires-f6725f3')}</Table.Td>
                                        <Table.Td>
                                            {data.user?.expireAt
                                                ? new Date(data.user.expireAt).toLocaleDateString()
                                                : '—'}
                                        </Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </Card>

                        <TbArrowRight
                            color="gray"
                            style={{ alignSelf: 'center', flex: '0 0 auto' }}
                        />

                        <Card
                            padding="sm"
                            radius="md"
                            style={{ flex: '1 1 300px', minWidth: 260 }}
                            withBorder
                        >
                            <Group gap="xs" mb={6} justify="space-between">
                                <Text fw={600} size="sm">
                                    {uiText('hosts-bba9af1')}
                                </Text>
                                <SegmentedControl
                                    data={[
                                        { value: 'all', label: uiText('all-a52ace4') },
                                        { value: 'accessible', label: uiText('ok-565339b') },
                                        { value: 'blocked', label: uiText('off-ca7981b') }
                                    ]}
                                    onChange={setHostFilter}
                                    size="xs"
                                    value={hostFilter}
                                />
                            </Group>
                            <ScrollArea.Autosize mah={320} type="auto">
                                <Stack gap={4}>
                                    {filteredHosts.map((host) => {
                                        const active = selectedHost?.uuid === host.uuid
                                        const limited =
                                            host.userTrafficLimitBytes !== null &&
                                            (host.usedTrafficBytes ?? 0) >=
                                                (host.userTrafficLimitBytes ?? 0)
                                        return (
                                            <Box
                                                key={host.uuid}
                                                onClick={() => {
                                                    setSelectedHostUuid(host.uuid)
                                                }}
                                                p={6}
                                                style={{
                                                    border: '1px solid',
                                                    borderColor: active
                                                        ? 'var(--mantine-primary-color-filled)'
                                                        : 'transparent',
                                                    background: active
                                                        ? 'var(--mantine-primary-color-light)'
                                                        : 'var(--mantine-color-body)',
                                                    borderRadius: 8,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <Group
                                                    gap={6}
                                                    justify="space-between"
                                                    wrap="nowrap"
                                                >
                                                    <Text fz="xs" fw={500} truncate>
                                                        {host.remark}
                                                    </Text>
                                                    <Group gap={4} wrap="nowrap">
                                                        {limited && (
                                                            <ThemeIcon
                                                                color="orange"
                                                                size="xs"
                                                                variant="light"
                                                            >
                                                                <TbGauge size={10} />
                                                            </ThemeIcon>
                                                        )}
                                                        {host.isDisabled && (
                                                            <ThemeIcon
                                                                color="red"
                                                                size="xs"
                                                                variant="light"
                                                            >
                                                                <TbBan size={10} />
                                                            </ThemeIcon>
                                                        )}
                                                        {host.alwaysAvailable && (
                                                            <ThemeIcon
                                                                color="teal"
                                                                size="xs"
                                                                variant="light"
                                                            >
                                                                <TbShieldCheck size={10} />
                                                            </ThemeIcon>
                                                        )}
                                                    </Group>
                                                </Group>
                                                <Text c="dimmed" fz="10px">
                                                    {host.address}:{host.port}
                                                    {host.inbound ? ` → ${host.inbound.tag}` : ''}
                                                </Text>
                                            </Box>
                                        )
                                    })}
                                    {filteredHosts.length === 0 && (
                                        <Text c="dimmed" fz="xs">
                                            {uiText('no-hosts-fe3c6a1')}
                                        </Text>
                                    )}
                                </Stack>
                            </ScrollArea.Autosize>
                        </Card>

                        <TbArrowRight
                            color="gray"
                            style={{ alignSelf: 'center', flex: '0 0 auto' }}
                        />

                        <Card
                            padding="sm"
                            radius="md"
                            style={{ flex: '1 1 300px', minWidth: 260 }}
                            withBorder
                        >
                            <Text fw={600} mb={6} size="sm">
                                {selectedHost
                                    ? uiText('path-value-6701191', { value1: selectedHost.remark })
                                    : uiText('path-62fa5a5')}
                            </Text>
                            {!selectedHost && (
                                <Text c="dimmed" fz="xs">
                                    {uiText('select-a-host-c8030cf')}
                                </Text>
                            )}
                            {selectedHost && (
                                <Stack gap={6}>
                                    <Text fz="xs">
                                        <Text c="dimmed" component="span" fz="xs">
                                            {uiText('key-99a52df')}:{' '}
                                        </Text>
                                        {data.user ? `${data.user.shortUuid.slice(0, 8)}… → ` : ''}
                                        {selectedHost.inbound?.tag ?? '—'}
                                    </Text>
                                    <Text fz="xs">
                                        <Text c="dimmed" component="span" fz="xs">
                                            {uiText('nodes-7ac3620')}:{' '}
                                        </Text>
                                        {selectedHost.nodes.length
                                            ? selectedHost.nodes.join(', ')
                                            : '—'}
                                    </Text>
                                    <Text fz="xs">
                                        <Text c="dimmed" component="span" fz="xs">
                                            {uiText('speed-c372fee')}:{' '}
                                        </Text>
                                        {selectedHost.speedLimitMbps
                                            ? `${selectedHost.speedLimitMbps} Mbps (Brutal)`
                                            : uiText('unlimited-2044fbd')}
                                    </Text>
                                    {(() => {
                                        const mode = (
                                            selectedHost.domainRules as { mode?: string } | null
                                        )?.mode
                                        if (!mode || mode === 'OFF') return null
                                        return (
                                            <Text fz="xs">
                                                <Text c="dimmed" component="span" fz="xs">
                                                    {uiText('domains-ced6771')}:{' '}
                                                </Text>
                                                {String(mode)}
                                            </Text>
                                        )
                                    })()}
                                    {activeProfile && (
                                        <Stack gap={2} mt={4}>
                                            <Text c="dimmed" fz="10px">
                                                {t(
                                                    activeProfile.isActive
                                                        ? 'trafficPaths.profileActive'
                                                        : 'trafficPaths.profile',
                                                    { name: activeProfile.name }
                                                )}
                                            </Text>
                                            {activeProfile.routing.rules
                                                .slice(0, 12)
                                                .map((rule, index) => (
                                                    <Group key={index} gap={4} wrap="nowrap">
                                                        <Badge
                                                            color={outboundColor(
                                                                Array.isArray(rule.outboundTag)
                                                                    ? rule.outboundTag[0]
                                                                    : rule.outboundTag
                                                            )}
                                                            size="xs"
                                                            variant="light"
                                                        >
                                                            {Array.isArray(rule.outboundTag)
                                                                ? rule.outboundTag[0]
                                                                : (rule.outboundTag ?? '?')}
                                                        </Badge>
                                                        <Text fz="10px" truncate>
                                                            {(() => {
                                                                const toArr = (
                                                                    value: unknown
                                                                ): string[] =>
                                                                    Array.isArray(value)
                                                                        ? value.map(String)
                                                                        : typeof value === 'string'
                                                                          ? [value]
                                                                          : []
                                                                const parts = toArr(rule.domains)
                                                                if (parts.length)
                                                                    return parts
                                                                        .slice(0, 4)
                                                                        .join(', ')
                                                                const ips = toArr(rule.ip)
                                                                if (ips.length)
                                                                    return ips
                                                                        .slice(0, 4)
                                                                        .join(', ')
                                                                return (
                                                                    rule.port ??
                                                                    rule.network ??
                                                                    (rule.protocol
                                                                        ? String(rule.protocol)
                                                                        : '…')
                                                                )
                                                            })()}
                                                        </Text>
                                                    </Group>
                                                ))}
                                            {activeProfile.routing.rules.length > 12 && (
                                                <Text c="dimmed" fz="10px">
                                                    … +{activeProfile.routing.rules.length - 12}
                                                </Text>
                                            )}
                                        </Stack>
                                    )}
                                </Stack>
                            )}
                        </Card>

                        <TbArrowRight
                            color="gray"
                            style={{ alignSelf: 'center', flex: '0 0 auto' }}
                        />

                        <Card
                            padding="sm"
                            radius="md"
                            style={{ flex: '1 1 240px', minWidth: 220 }}
                            withBorder
                        >
                            <Group gap="xs" mb={6}>
                                <ThemeIcon color="teal" size="sm" variant="soft">
                                    <TbCrown size={14} />
                                </ThemeIcon>
                                <Text fw={600} size="sm">
                                    {uiText('exits-5e56101')}
                                </Text>
                            </Group>
                            <ScrollArea.Autosize mah={320} type="auto">
                                <Table fz="xs">
                                    <Table.Tbody>
                                        {(activeProfile?.outbounds ?? []).map((outbound) => (
                                            <Table.Tr key={outbound.tag}>
                                                <Table.Td>
                                                    <Badge
                                                        color={outboundColor(outbound.tag)}
                                                        size="xs"
                                                        variant="light"
                                                    >
                                                        {outbound.tag}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    {outbound.exit ?? outbound.protocol ?? '—'}
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                        {(activeProfile?.outbounds.length ?? 0) === 0 && (
                                            <Table.Tr>
                                                <Table.Td c="dimmed">—</Table.Td>
                                            </Table.Tr>
                                        )}
                                    </Table.Tbody>
                                </Table>
                            </ScrollArea.Autosize>
                            {blockedDomains.length > 0 && (
                                <>
                                    <Text c="dimmed" fz="10px" mt={8}>
                                        {uiText('blocked-by-routing-rules-samples-c390eb9')}
                                    </Text>
                                    <Text c="red.4" fz="10px" lineClamp={4}>
                                        {blockedDomains.join(', ')}
                                    </Text>
                                </>
                            )}
                        </Card>
                    </Group>
                </>
            )}
        </Stack>
    )
}
