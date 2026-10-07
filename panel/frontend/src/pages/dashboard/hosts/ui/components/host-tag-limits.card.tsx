import {
    Alert,
    Drawer,
    TextInput,
    Button,
    Group,
    NumberInput,
    Select,
    SimpleGrid,
    Stack,
    Text
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    TbPlus,
    TbSearch,
    TbTag,
    TbChartLine,
    TbGauge,
    TbMultiplier1X,
    TbUsers,
    TbClock,
    TbCalendar
} from 'react-icons/tb'

import { instance } from '@shared/api/axios'
import {
    HostTagLimit,
    tagLimitsEndpoint,
    tagLimitsQueryKey,
    useHostTagLimits
} from '@shared/api/hooks/hosts/host-tag-limits.query'
import { hostsQueryKeys } from '@shared/api/hooks/hosts/hosts.query.hooks'
import { invalidateLimits } from '@shared/api/limit-invalidation'
import { useUiText } from '@shared/i18n/interface-text'
import { DisclosureCard } from '@shared/ui/disclosure-card/disclosure-card'

const GIB = 1024 ** 3

export function HostTagLimitsCard({ tags }: { tags: string[] }) {
    const uiText = useUiText()

    const { i18n } = useTranslation()
    const { data: limits = [], isPending, isError, refetch } = useHostTagLimits()
    const [expanded, setExpanded] = useState(false)
    const [editing, setEditing] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [newTag, setNewTag] = useState('')
    const allTags = [...new Set([...tags, ...limits.map((item) => item.tag)])].sort((a, b) =>
        a.localeCompare(b, i18n.language, { numeric: true })
    )
    const trimmed = newTag.trim()
    const canCreate =
        trimmed.length > 0 &&
        trimmed.length <= 100 &&
        !Array.from(trimmed).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    return (
        <>
            <DisclosureCard
                icon={<TbTag size={20} />}
                onChange={setExpanded}
                opened={expanded}
                title={uiText('tag-settings-9449b1a')}
            >
                <Stack gap="sm">
                    {isError ? (
                        <Alert color="red">
                            <Button variant="subtle" onClick={() => void refetch()}>
                                {uiText('could-not-load-retry-7e0704a')}
                            </Button>
                        </Alert>
                    ) : (
                        <>
                            <Group align="end">
                                <TextInput
                                    style={{ flex: '1 1 200px' }}
                                    leftSection={<TbSearch size={16} />}
                                    placeholder={uiText('find-tag-8344cc6')}
                                    aria-label={uiText('find-tag-8344cc6')}
                                    value={search}
                                    onChange={(event) => setSearch(event.currentTarget.value)}
                                />
                                <TextInput
                                    style={{ flex: '1 1 200px' }}
                                    maxLength={100}
                                    placeholder={uiText('new-tag-609117d')}
                                    aria-label={uiText('new-tag-609117d')}
                                    value={newTag}
                                    onChange={(event) => setNewTag(event.currentTarget.value)}
                                />
                                <Button
                                    leftSection={<TbPlus size={16} />}
                                    disabled={!canCreate || isPending}
                                    onClick={() => {
                                        setEditing(trimmed)
                                        setNewTag('')
                                    }}
                                >
                                    {uiText('configure-6defafa')}
                                </Button>
                            </Group>
                            {isPending ? (
                                <Text c="dimmed">{uiText('loading-ba3bbbe')}</Text>
                            ) : (
                                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
                                    {allTags
                                        .filter((tag) =>
                                            tag
                                                .toLocaleLowerCase()
                                                .includes(search.toLocaleLowerCase())
                                        )
                                        .map((tag) => {
                                            const setting = limits.find((item) => item.tag === tag)
                                            return (
                                                <Button
                                                    key={tag}
                                                    variant="default"
                                                    h="auto"
                                                    py="sm"
                                                    justify="start"
                                                    onClick={() => setEditing(tag)}
                                                    styles={{
                                                        label: {
                                                            display: 'block',
                                                            minWidth: 0,
                                                            textAlign: 'start'
                                                        }
                                                    }}
                                                >
                                                    <Text fw={600} truncate>
                                                        {tag}
                                                    </Text>
                                                    <Text size="xs" c="dimmed" truncate>
                                                        {setting
                                                            ? `${setting.limitBytes ? (setting.limitBytes / GIB).toLocaleString(i18n.language) + ' GiB' : '∞'} · ${setting.speedLimitMbps ?? '∞'} Mbps · ${setting.trafficMultiplier}×`
                                                            : uiText('unlimited-11dde17')}
                                                    </Text>
                                                </Button>
                                            )
                                        })}
                                </SimpleGrid>
                            )}
                            {!isPending && allTags.length === 0 && (
                                <Text c="dimmed" size="sm">
                                    {uiText(
                                        'create-a-tag-and-configure-it-before-adding-hosts-b4df42f'
                                    )}
                                </Text>
                            )}
                        </>
                    )}
                </Stack>
            </DisclosureCard>
            <Drawer
                closeButtonProps={{
                    'aria-label': uiText('close-tag-settings-f3b8745')
                }}
                styles={{ title: { overflowWrap: 'anywhere' } }}
                opened={editing !== null}
                onClose={() => setEditing(null)}
                position="right"
                size="lg"
                title={editing}
            >
                {editing !== null && (
                    <HostTagEditor
                        key={editing}
                        tag={editing}
                        initial={limits.find((item) => item.tag === editing)}
                        onSaved={() =>
                            setEditing((current) => (current === editing ? null : current))
                        }
                    />
                )}
            </Drawer>
        </>
    )
}

function HostTagEditor({
    tag,
    initial,
    onSaved
}: {
    tag: string
    initial?: HostTagLimit
    onSaved: () => void
}) {
    const uiText = useUiText()

    const client = useQueryClient()
    const [gib, setGib] = useState<number | string>((initial?.limitBytes ?? 0) / GIB)
    const [multiplier, setMultiplier] = useState<number | string>(initial?.trafficMultiplier ?? 1)
    const [totalSpeed, setTotalSpeed] = useState<number | string>(initial?.totalSpeedLimitMbps ?? 0)
    const [speed, setSpeed] = useState<number | string>(initial?.speedLimitMbps ?? 0)
    const [resetValue, setResetValue] = useState<number | string>(initial?.resetValue ?? 0)
    const [resetUnit, setResetUnit] = useState<'DAYS' | 'MONTHS'>(initial?.resetUnit ?? 'DAYS')
    const [confirmRemove, setConfirmRemove] = useState(false)
    const remove = useMutation({
        mutationFn: () => instance.delete(tagLimitsEndpoint, { data: { tag } }),
        onSuccess: async () => {
            await Promise.all([
                client.invalidateQueries({ queryKey: tagLimitsQueryKey }),
                client.invalidateQueries({ queryKey: hostsQueryKeys.getAllTags.queryKey }),
                invalidateLimits(client)
            ])
            onSaved()
        },
        onError: (error) => notifications.show({ color: 'red', message: error.message })
    })
    const save = useMutation({
        mutationFn: async (value: HostTagLimit) => instance.put(tagLimitsEndpoint, value),
        onSuccess: async () => {
            await Promise.all([
                client.invalidateQueries({ queryKey: tagLimitsQueryKey }),
                client.invalidateQueries({ queryKey: hostsQueryKeys.getAllTags.queryKey }),
                invalidateLimits(client)
            ])
            notifications.show({
                color: 'teal',
                title: uiText('settings-for-value-saved-b164a5f', { value1: tag }),
                message: uiText('tag-settings-sync-on-compatible-nodes-a94e2f1')
            })
            onSaved()
        },
        onError: (error) => notifications.show({ color: 'red', message: error.message })
    })
    const bytes = Math.round(Number(gib) * GIB)
    const valid =
        !!tag &&
        Number.isSafeInteger(bytes) &&
        bytes >= 0 &&
        Number.isFinite(Number(multiplier)) &&
        Number(multiplier) >= 0.01 &&
        Number(multiplier) <= 100 &&
        Number.isSafeInteger(Number(totalSpeed)) &&
        Number(totalSpeed) >= 0 &&
        Number(totalSpeed) <= 10000 &&
        Number.isSafeInteger(Number(speed)) &&
        Number(speed) >= 0 &&
        Number(speed) <= 10000 &&
        Number.isSafeInteger(Number(resetValue)) &&
        Number(resetValue) >= 0 &&
        Number(resetValue) <= (resetUnit === 'MONTHS' ? 120 : 3650)

    return (
        <Stack gap="sm">
            <Text c="dimmed" size="sm">
                {uiText('apply-to-tagged-hosts-with-the-corresponding-inheritance-switc-efe2579')}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <NumberInput
                    allowNegative={false}
                    decimalScale={8}
                    max={Number.MAX_SAFE_INTEGER / GIB}
                    label={uiText('per-user-limit-gib-555cb5c')}
                    description={uiText(
                        'combined-user-usage-across-all-tagged-hosts-including-multipli-aa5364d'
                    )}
                    min={0}
                    onChange={setGib}
                    leftSection={<TbChartLine size={16} />}
                    onBlur={() => {
                        if (gib === '') setGib(0)
                    }}
                    value={gib}
                />
                <NumberInput
                    allowDecimal={false}
                    allowNegative={false}
                    label={uiText('per-user-speed-mbps-1824561')}
                    description={uiText('for-each-user-independently-on-each-host-1ea423d')}
                    min={0}
                    max={10000}
                    leftSection={<TbGauge size={16} />}
                    onBlur={() => {
                        if (speed === '') setSpeed(0)
                    }}
                    value={speed}
                    onChange={setSpeed}
                />
                <NumberInput
                    min={0.01}
                    max={100}
                    step={0.1}
                    decimalScale={2}
                    allowNegative={false}
                    label={uiText('tag-traffic-multiplier-4ad10d9')}
                    description={uiText(
                        'for-hosts-using-the-tag-multiplier-recalculates-the-current-pe-e2ad055'
                    )}
                    rightSection="×"
                    leftSection={<TbMultiplier1X size={16} />}
                    onBlur={() => {
                        if (multiplier === '') setMultiplier(1)
                    }}
                    value={multiplier}
                    onChange={setMultiplier}
                />
                <NumberInput
                    allowNegative={false}
                    allowDecimal={false}
                    min={0}
                    max={10000}
                    label={uiText('whole-group-speed-mbps-3c36e77')}
                    description={uiText(
                        'one-shared-cap-across-all-users-and-all-tagged-hosts-3a81bf7'
                    )}
                    leftSection={<TbUsers size={16} />}
                    onBlur={() => {
                        if (totalSpeed === '') setTotalSpeed(0)
                    }}
                    value={totalSpeed}
                    onChange={setTotalSpeed}
                />
                <NumberInput
                    allowDecimal={false}
                    allowNegative={false}
                    label={uiText('reset-every-8c98f6a')}
                    min={0}
                    max={resetUnit === 'MONTHS' ? 120 : 3650}
                    onChange={setResetValue}
                    leftSection={<TbClock size={16} />}
                    onBlur={() => {
                        if (resetValue === '') setResetValue(0)
                    }}
                    value={resetValue}
                />
                <Select
                    data={[
                        { value: 'DAYS', label: uiText('days-ab51004') },
                        { value: 'MONTHS', label: uiText('months-1683743') }
                    ]}
                    label={uiText('unit-4e54596')}
                    onChange={(value) => setResetUnit(value === 'MONTHS' ? 'MONTHS' : 'DAYS')}
                    leftSection={<TbCalendar size={16} />}
                    value={resetUnit}
                />
                <Button
                    disabled={!valid || save.isPending || remove.isPending}
                    loading={save.isPending}
                    onClick={() =>
                        save.mutate({
                            tag,
                            limitBytes: bytes,
                            trafficMultiplier: Number(multiplier),
                            totalSpeedLimitMbps: Number(totalSpeed) || null,
                            speedLimitMbps: Number(speed) || null,
                            resetValue: Number(resetValue),
                            resetUnit
                        })
                    }
                >
                    {uiText('save-1509f56')}
                </Button>
            </SimpleGrid>
            {initial && (
                <Group justify="space-between">
                    <Button
                        color="red"
                        variant="subtle"
                        loading={remove.isPending}
                        disabled={save.isPending}
                        onClick={() => (confirmRemove ? remove.mutate() : setConfirmRemove(true))}
                    >
                        {confirmRemove
                            ? uiText('confirm-removing-settings-be691de')
                            : uiText('remove-tag-settings-12cb09d')}
                    </Button>
                    {confirmRemove && (
                        <Button
                            variant="subtle"
                            disabled={remove.isPending}
                            onClick={() => setConfirmRemove(false)}
                        >
                            {uiText('cancel-19766ed')}
                        </Button>
                    )}
                </Group>
            )}
        </Stack>
    )
}
