import {
    Group,
    NumberInput,
    Select,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Switch,
    TagsInput,
    Text
} from '@mantine/core'
import { useState } from 'react'
import {
    TbClock,
    TbGauge,
    TbChartLine,
    TbArrowsShuffle,
    TbUsers,
    TbMultiplier1X,
    TbCalendar,
    TbWorld,
    TbHash
} from 'react-icons/tb'

import { useHostTagLimits } from '@shared/api/hooks/hosts/host-tag-limits.query'
import { useUiText } from '@shared/i18n/interface-text'

import { HostDomainRules } from './host-domain-rules'
import { HostLimitInput } from './host-limit-input'
import { useHostFormData } from './options/host-form-data.context'

const GIB = 1024 * 1024 * 1024

function TagLimitSwitch({
    field,
    hasTags,
    label,
    description
}: {
    field: 'useTagTrafficLimit' | 'useTagSpeedLimit' | 'useTagTotalSpeedLimit'
    hasTags: boolean
    label: string
    description: string
}) {
    const uiText = useUiText()

    const { form } = useHostFormData()
    const [enabled, setEnabled] = useState(form.getValues()[field] !== false)
    form.watch(field, ({ value }) => setEnabled(value !== false))
    return (
        <Switch
            label={label}
            description={hasTags ? description : uiText('assign-a-tag-to-this-host-first-636effb')}
            disabled={!hasTags}
            checked={hasTags && enabled}
            onChange={(event) => form.setFieldValue(field, event.currentTarget.checked)}
        />
    )
}

export function HostLimitsAndRules() {
    const uiText = useUiText()

    const { form } = useHostFormData()

    const values = form.getValues()
    const { data: tagLimits = [] } = useHostTagLimits()
    const [tags, setTags] = useState(values.tags ?? [])
    form.watch('tags', ({ value }) => setTags(value ?? []))
    const matchingTagLimits = tagLimits.filter((item) => tags.includes(item.tag))
    const hasTags = tags.length > 0
    const [limitBytes, setLimitBytes] = useState(values.userTrafficLimitBytes)
    form.watch('userTrafficLimitBytes', ({ value }) => setLimitBytes(value))
    const [resetUnit, setResetUnit] = useState<'DAYS' | 'MONTHS'>(
        values.trafficLimitResetUnit === 'MONTHS' ? 'MONTHS' : 'DAYS'
    )
    const [multiplier, setMultiplier] = useState(values.trafficMultiplier ?? null)
    form.watch('trafficMultiplier', ({ value }) => setMultiplier(value ?? null))
    form.watch('trafficLimitResetUnit', ({ value }) =>
        setResetUnit(value === 'MONTHS' ? 'MONTHS' : 'DAYS')
    )
    const [domainRules, setDomainRules] = useState(values.domainRules)
    const [sni, setSni] = useState(values.sniRegeneration)
    form.watch('domainRules', ({ value }) => setDomainRules(value))
    form.watch('sniRegeneration', ({ value }) => setSni(value))

    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">
                {uiText('the-host-s-own-limits-apply-independently-each-kind-of-limit-c-9735c38')}
            </Text>
            {matchingTagLimits.length > 0 && (
                <Text size="xs" c="dimmed">
                    {uiText('groups-176c620')}
                    {matchingTagLimits.map((item) => item.tag).join(', ')}
                </Text>
            )}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" w="100%">
                <Stack gap="xs">
                    <HostLimitInput
                        field="userTrafficLimitBytes"
                        label={uiText('traffic-limit-per-user-a5e049d')}
                        description={uiText(
                            'per-user-within-this-host-zero-means-unlimited-82da8b7'
                        )}
                        leftSection={<TbChartLine size={16} />}
                        rightSection="GiB"
                        rightSectionWidth={48}
                        hideControls
                        decimalScale={8}
                        allowNegative={false}
                        max={Number.MAX_SAFE_INTEGER / GIB}
                        scale={GIB}
                        min={0}
                    />
                    <TagLimitSwitch
                        field="useTagTrafficLimit"
                        hasTags={hasTags}
                        label={uiText('apply-tag-traffic-quota-3fb4646')}
                        description={uiText(
                            'one-user-s-shared-quota-across-participating-hosts-using-the-t-1b4551d'
                        )}
                    />
                </Stack>
                <Stack gap="xs">
                    <HostLimitInput
                        field="serverSpeedLimitMbps"
                        label={uiText('server-speed-limit-per-user-e6705eb')}
                        description={uiText(
                            'shared-by-all-devices-and-connections-of-one-user-zero-means-u-9bbeda4'
                        )}
                        leftSection={<TbGauge size={16} />}
                        hideControls
                        min={0}
                        max={10000}
                        allowDecimal={false}
                        allowNegative={false}
                        rightSection="Mbps"
                        rightSectionWidth={58}
                    />
                    <TagLimitSwitch
                        field="useTagSpeedLimit"
                        hasTags={hasTags}
                        label={uiText('apply-tag-per-user-speed-4ad7483')}
                        description={uiText(
                            'the-same-limit-separately-on-each-host-shared-by-one-user-s-de-50737b5'
                        )}
                    />
                </Stack>
                <Stack gap="xs">
                    <HostLimitInput
                        field="totalSpeedLimitMbps"
                        label={uiText('whole-host-speed-limit-e5c8f33')}
                        description={uiText(
                            'shared-by-every-user-of-this-host-other-hosts-on-the-node-are--207fb7b'
                        )}
                        leftSection={<TbUsers size={16} />}
                        hideControls
                        min={0}
                        max={10000}
                        allowDecimal={false}
                        allowNegative={false}
                        rightSection="Mbps"
                        rightSectionWidth={58}
                    />
                    <TagLimitSwitch
                        field="useTagTotalSpeedLimit"
                        hasTags={hasTags}
                        label={uiText('apply-tag-shared-speed-0471605')}
                        description={uiText(
                            'one-shared-speed-pool-for-all-users-and-participating-hosts-of-0e8ab7a'
                        )}
                    />
                </Stack>
                <Stack gap="xs">
                    <HostLimitInput
                        field="trafficMultiplier"
                        label={uiText('host-traffic-multiplier-629284f')}
                        description={uiText(
                            '1-counts-normal-usage-2-charges-twice-the-traffic-to-host-and--92c312c'
                        )}
                        leftSection={<TbMultiplier1X size={16} />}
                        emptyValue={1}
                        disabled={hasTags && multiplier === null}
                        hideControls
                        min={0.01}
                        max={100}
                        step={0.1}
                        decimalScale={2}
                        allowNegative={false}
                        rightSection="×"
                    />
                    <Switch
                        label={uiText('use-the-tag-multiplier-e071b5e')}
                        description={
                            !hasTags
                                ? uiText('assign-a-tag-to-this-host-first-636effb')
                                : uiText('the-host-s-own-quota-uses-1-218665d')
                        }
                        disabled={!hasTags}
                        checked={hasTags && multiplier === null}
                        onChange={(event) =>
                            form.setFieldValue(
                                'trafficMultiplier',
                                event.currentTarget.checked ? null : 1
                            )
                        }
                    />
                </Stack>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" w="100%">
                <HostLimitInput
                    field="trafficLimitResetValue"
                    label={uiText('reset-traffic-every-587e56d')}
                    description={uiText(
                        '0-means-never-the-period-starts-on-the-day-the-setting-is-save-fc881dd'
                    )}
                    leftSection={<TbClock size={16} />}
                    disabled={!limitBytes}
                    allowDecimal={false}
                    allowNegative={false}
                    min={0}
                    max={resetUnit === 'MONTHS' ? 120 : 3650}
                />
                <Select
                    key={form.key('trafficLimitResetUnit')}
                    label={uiText('period-unit-f65d821')}
                    leftSection={<TbCalendar size={16} />}
                    styles={{ label: { marginBottom: 4 } }}
                    data={[
                        { value: 'DAYS', label: uiText('days-e08c0aa') },
                        { value: 'MONTHS', label: uiText('months-09ca755') }
                    ]}
                    disabled={!limitBytes}
                    defaultValue={resetUnit}
                    onChange={(value) => {
                        const next = value === 'MONTHS' ? 'MONTHS' : 'DAYS'
                        setResetUnit(next)
                        form.setFieldValue('trafficLimitResetUnit', next)
                    }}
                />
            </SimpleGrid>

            <Stack gap="xs">
                <SegmentedControl
                    key={form.key('domainRules.mode')}
                    value={domainRules?.mode ?? 'OFF'}
                    data={[
                        { value: 'OFF', label: uiText('off-ca7981b') },
                        {
                            value: 'ALLOW_ONLY',
                            label: uiText('allow-only-43c63e5')
                        },
                        { value: 'DENY', label: uiText('deny-05a2d73') }
                    ]}
                    onChange={(value) => {
                        form.setFieldValue('domainRules', {
                            mode: value,
                            domains: domainRules?.domains ?? []
                        })
                    }}
                    fullWidth
                />
                {domainRules?.mode && domainRules.mode !== 'OFF' && (
                    <HostDomainRules
                        value={domainRules.domains ?? []}
                        mode={domainRules.mode}
                        onChange={(domains) =>
                            form.setFieldValue('domainRules', { ...domainRules, domains })
                        }
                    />
                )}
            </Stack>

            <Stack gap="xs">
                <Switch
                    label={uiText('automatic-sni-and-shortid-regeneration-fa50b0e')}
                    description={uiText(
                        'sni-rotates-through-the-pool-shortid-is-regenerated-nodes-rest-aa632da'
                    )}
                    checked={!!sni?.enabled}
                    onChange={(event) => {
                        form.setFieldValue('sniRegeneration', {
                            enabled: event.currentTarget.checked,
                            intervalHours: sni?.intervalHours ?? 24,
                            pool: sni?.pool ?? [],
                            rotateShortIds: sni?.rotateShortIds ?? true,
                            shortIdLength: sni?.shortIdLength ?? 8,
                            shortIdCount: sni?.shortIdCount ?? 1,
                            lastRotatedAt: sni?.lastRotatedAt ?? null
                        })
                    }}
                />
                {sni?.enabled && (
                    <Stack gap="sm">
                        <Group gap="md" grow justify="space-between" w="100%">
                            <NumberInput
                                label={uiText('interval-hours-e456194')}
                                leftSection={<TbClock size={16} />}
                                hideControls
                                allowDecimal={false}
                                allowNegative={false}
                                clampBehavior="strict"
                                decimalScale={0}
                                min={1}
                                max={8760}
                                value={sni.intervalHours}
                                onChange={(value) =>
                                    form.setFieldValue('sniRegeneration', {
                                        ...sni,
                                        intervalHours: Number(value) || 24
                                    })
                                }
                            />
                            <NumberInput
                                label={uiText('shortid-count-724ec96')}
                                leftSection={<TbHash size={16} />}
                                hideControls
                                allowDecimal={false}
                                allowNegative={false}
                                clampBehavior="strict"
                                decimalScale={0}
                                min={1}
                                max={10}
                                value={sni.shortIdCount ?? 1}
                                onChange={(value) =>
                                    form.setFieldValue('sniRegeneration', {
                                        ...sni,
                                        shortIdCount: Number(value) || 1
                                    })
                                }
                            />
                            <NumberInput
                                label={uiText('shortid-length-a595758')}
                                leftSection={<TbArrowsShuffle size={16} />}
                                hideControls
                                allowDecimal={false}
                                allowNegative={false}
                                clampBehavior="strict"
                                decimalScale={0}
                                min={4}
                                max={16}
                                value={sni.shortIdLength}
                                onChange={(value) =>
                                    form.setFieldValue('sniRegeneration', {
                                        ...sni,
                                        shortIdLength: Number(value) || 8
                                    })
                                }
                            />
                        </Group>
                        <TagsInput
                            label={uiText('sni-pool-42869d6')}
                            leftSection={<TbWorld size={16} />}
                            placeholder="example.com"
                            value={sni.pool ?? []}
                            onChange={(value) =>
                                form.setFieldValue('sniRegeneration', {
                                    ...sni,
                                    pool: value
                                })
                            }
                        />
                        <Switch
                            label={uiText('regenerate-shortid-5b4336d')}
                            checked={sni.rotateShortIds ?? true}
                            onChange={(event) =>
                                form.setFieldValue('sniRegeneration', {
                                    ...sni,
                                    rotateShortIds: event.currentTarget.checked
                                })
                            }
                        />
                        {sni.lastRotatedAt && (
                            <Text c="dimmed" size="xs">
                                {uiText('last-rotation-ffd71b1')}
                                {new Date(sni.lastRotatedAt).toLocaleString()}
                            </Text>
                        )}
                    </Stack>
                )}
            </Stack>
        </Stack>
    )
}
