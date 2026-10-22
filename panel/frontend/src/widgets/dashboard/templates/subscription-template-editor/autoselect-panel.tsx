import type { GetHostsCommand } from '@remnawave/backend-contract'

import {
    Alert,
    Accordion,
    TagsInput,
    Badge,
    Button,
    Group,
    MultiSelect,
    NumberInput,
    Paper,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title
} from '@mantine/core'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowsShuffle, TbPlus, TbTrash } from 'react-icons/tb'

import {
    addBalancer,
    addPool,
    renameBalancer,
    editTemplate,
    observerFor,
    needsProbes,
    setBalancerStrategy,
    removeUnusedProbes,
    parseTemplate,
    poolsOf,
    removeBalancer,
    removePool,
    renamePoolPrefix,
    templateChanges,
    updatePool,
    type JsonObject,
    type Pool
} from './autoselect-model'
import styles from './autoselect-panel.module.css'
import { TemplateChanges } from './template-changes'

type Host = GetHostsCommand.Response['response'][number]
type Option = { value: string; label: string }
type Edit = (operation: (text: string) => string) => void

function optionsWithSaved(options: Option[], selected: string[]): Option[] {
    const known = new Set(options.map((option) => option.value))
    return [
        ...options,
        ...selected.filter((value) => !known.has(value)).map((value) => ({ value, label: value }))
    ]
}

function PoolCard({
    pool,
    index,
    hostOptions,
    tags,
    edit
}: {
    pool: Pool
    index: number
    hostOptions: Option[]
    tags: Option[]
    edit: Edit
}) {
    const { t } = useTranslation()
    const selector = pool.selector ?? { type: 'uuids' }
    const mode = pool.mode ?? 'all'
    const type = selector.type ?? 'uuids'
    const options = type === 'tags' ? tags : hostOptions
    const values: string[] = Array.isArray(selector.values) ? selector.values : []
    const groups: [string, string[]][] =
        selector.groups && typeof selector.groups === 'object'
            ? Object.entries(selector.groups)
            : []
    const patch = (path: (string | number)[], value: unknown) =>
        edit((text) => updatePool(text, index, path, value))
    const selectMode = (value: string) =>
        edit((text) => {
            let next = updatePool(text, index, ['mode'], value)
            if (value === 'random' && !selector.expected)
                next = updatePool(next, index, ['selector', 'expected'], 3)
            if (value === 'group' && !groups.length)
                next = updatePool(next, index, ['selector', 'groups'], { 'group-1': values })
            return next
        })
    const addGroup = () => {
        const nextGroups = Object.fromEntries(groups)
        let name = 'group-' + (groups.length + 1)
        for (let suffix = groups.length + 2; Object.hasOwn(nextGroups, name); suffix++)
            name = 'group-' + suffix
        patch(
            ['selector', 'groups'],
            Array.isArray(selector.groups)
                ? [...selector.groups, []]
                : { ...nextGroups, [name]: [] }
        )
    }
    return (
        <Paper withBorder p="md" className={styles.card}>
            <Group justify="space-between" mb="md" gap="sm">
                <Group gap="sm">
                    <TbArrowsShuffle aria-hidden size={20} />
                    <Title order={4}>
                        {t('autoselect.pool')} {index + 1}
                    </Title>
                    <Badge variant="light">{t(`autoselect.mode-${mode}`)}</Badge>
                </Group>
                <Button
                    variant="subtle"
                    color="red"
                    size="compact-sm"
                    leftSection={<TbTrash size={16} />}
                    title={t('client-template.remove-pool-help')}
                    onClick={() => edit((text) => removePool(text, index))}
                >
                    {t('autoselect.remove-pool')}
                </Button>
            </Group>
            <div className={styles.fields}>
                <Select
                    label={t('autoselect.source')}
                    value={type}
                    allowDeselect={false}
                    data={[
                        { value: 'uuids', label: t('autoselect.hosts') },
                        { value: 'tags', label: t('autoselect.tags') },
                        { value: 'sameTagAsRecipient', label: t('autoselect.same-tag') },
                        { value: 'remarkRegex', label: t('autoselect.remark-regex') },
                        { value: 'tagRegex', label: t('autoselect.tag-regex') }
                    ]}
                    onChange={(value) =>
                        value &&
                        edit((text) => {
                            const pooled = ['uuids', 'tags'].includes(value)
                            const next = updatePool(
                                text,
                                index,
                                ['selector'],
                                pooled
                                    ? {
                                          type: value,
                                          values: [],
                                          ...(mode === 'random'
                                              ? { expected: selector.expected ?? 3 }
                                              : {}),
                                          ...(mode === 'group' ? { groups: { 'group-1': [] } } : {})
                                      }
                                    : {
                                          type: value,
                                          ...(mode === 'random'
                                              ? { expected: selector.expected ?? 3 }
                                              : {}),
                                          ...(mode === 'group'
                                              ? { groups: { 'group-1': [] } }
                                              : {}),
                                          ...(['tagRegex', 'remarkRegex'].includes(value)
                                              ? { pattern: '' }
                                              : {})
                                      }
                            )
                            return next
                        })
                    }
                />
                <Select
                    label={t('autoselect.mode')}
                    value={mode}
                    allowDeselect={false}
                    data={(['all', 'random', 'group'] as const).map((value) => ({
                        value,
                        label: t(`autoselect.mode-${value}`)
                    }))}
                    onChange={(value) => value && selectMode(value)}
                />
                <Select
                    label={t('autoselect.visibility')}
                    value={pool.selectFrom ?? 'HIDDEN'}
                    allowDeselect={false}
                    data={(['ALL', 'HIDDEN', 'NOT_HIDDEN'] as const).map((value) => ({
                        value,
                        label: t(`autoselect.visibility-${value}`)
                    }))}
                    onChange={(value) => value && patch(['selectFrom'], value)}
                />
                <TextInput
                    label={t('autoselect.prefix')}
                    description={t('autoselect.prefix-help')}
                    value={pool.tagPrefix ?? ''}
                    onChange={(event) =>
                        edit((text) => renamePoolPrefix(text, index, event.currentTarget.value))
                    }
                />
            </div>
            {mode === 'random' && (
                <NumberInput
                    mt="md"
                    label={t('autoselect.expected')}
                    description={t('autoselect.expected-help')}
                    min={1}
                    max={1000}
                    allowDecimal={false}
                    allowNegative={false}
                    value={selector.expected ?? ''}
                    onChange={(value) =>
                        patch(['selector', 'expected'], value === '' ? undefined : Number(value))
                    }
                />
            )}
            {mode !== 'group' && ['uuids', 'tags'].includes(type) && (
                <MultiSelect
                    mt="md"
                    searchable
                    clearable
                    limit={50}
                    label={t('autoselect.pool-members')}
                    description={t('autoselect.pool-help')}
                    data={optionsWithSaved(options, values)}
                    value={values}
                    error={!values.length ? t('autoselect.select-members') : undefined}
                    onChange={(value) => patch(['selector', 'values'], value)}
                    nothingFoundMessage={t('autoselect.no-results')}
                />
            )}
            {['tagRegex', 'remarkRegex'].includes(type) && (
                <TextInput
                    mt="md"
                    label={t('autoselect.pattern')}
                    value={selector.pattern ?? ''}
                    onChange={(event) => patch(['selector', 'pattern'], event.currentTarget.value)}
                />
            )}
            {mode === 'group' && (
                <Stack gap="sm" mt="md">
                    <Text size="sm" c="dimmed">
                        {t('autoselect.group-help')}
                    </Text>
                    {groups.map(([name, members], groupIndex) => (
                        <Paper key={name} withBorder p="sm">
                            <Group justify="space-between" mb="sm">
                                <Text fw={600}>{name}</Text>
                                <Button
                                    color="red"
                                    variant="subtle"
                                    size="compact-sm"
                                    onClick={() =>
                                        patch(
                                            ['selector', 'groups'],
                                            Array.isArray(selector.groups)
                                                ? selector.groups.filter(
                                                      (_: unknown, memberIndex: number) =>
                                                          memberIndex !== groupIndex
                                                  )
                                                : Object.fromEntries(
                                                      groups.filter(([key]) => key !== name)
                                                  )
                                        )
                                    }
                                >
                                    {t('autoselect.remove-group')}
                                </Button>
                            </Group>
                            <MultiSelect
                                searchable
                                clearable
                                limit={50}
                                label={t('autoselect.group-members', { count: groupIndex + 1 })}
                                data={optionsWithSaved(
                                    options,
                                    Array.isArray(members) ? members : []
                                )}
                                value={Array.isArray(members) ? members : []}
                                error={
                                    !members?.length ? t('autoselect.select-members') : undefined
                                }
                                onChange={(value) =>
                                    patch(
                                        [
                                            'selector',
                                            'groups',
                                            Array.isArray(selector.groups) ? groupIndex : name
                                        ],
                                        value
                                    )
                                }
                                nothingFoundMessage={t('autoselect.no-results')}
                            />
                        </Paper>
                    ))}
                    <Button variant="light" leftSection={<TbPlus size={16} />} onClick={addGroup}>
                        {t('autoselect.add-group')}
                    </Button>
                </Stack>
            )}
            {(pool.useHostRemarkAsTag || pool.useHostTagAsTag) && (
                <Alert mt="md">
                    <Text size="sm">{t('autoselect.legacy-tags')}</Text>
                    <Button
                        mt="sm"
                        variant="light"
                        onClick={() =>
                            edit((text) =>
                                updatePool(
                                    updatePool(text, index, ['useHostRemarkAsTag'], false),
                                    index,
                                    ['useHostTagAsTag'],
                                    false
                                )
                            )
                        }
                    >
                        {t('autoselect.use-prefix')}
                    </Button>
                </Alert>
            )}
            <Group mt="md">
                <Button
                    variant="light"
                    leftSection={<TbPlus size={16} />}
                    disabled={!pool.tagPrefix || pool.useHostRemarkAsTag || pool.useHostTagAsTag}
                    onClick={() =>
                        pool.tagPrefix && edit((text) => addBalancer(text, pool.tagPrefix!))
                    }
                >
                    {t('autoselect.add-balancer')}
                </Button>
            </Group>
        </Paper>
    )
}

function BalancerCard({
    balance,
    index,
    selectors,
    edit
}: {
    balance: JsonObject
    index: number
    selectors: Option[]
    edit: Edit
}) {
    const { t } = useTranslation()
    const strategy = balance.strategy?.type ?? 'random'
    const values: string[] = Array.isArray(balance.selector) ? balance.selector : []
    const patch = (field: (string | number)[], value: unknown) =>
        edit((text) => editTemplate(text, ['routing', 'balancers', index, ...field], value))
    return (
        <Paper withBorder p="md" className={styles.card}>
            <Group justify="space-between" mb="md">
                <Title order={4}>{balance.tag || t('autoselect.balancer')}</Title>
                <Button
                    color="red"
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<TbTrash size={16} />}
                    onClick={() => edit((text) => removeBalancer(text, index))}
                >
                    {t('autoselect.remove-balancer')}
                </Button>
            </Group>
            <TextInput
                mb="md"
                label={t('autoselect.balancer-name')}
                value={balance.tag ?? ''}
                onChange={(event) =>
                    edit((text) => renameBalancer(text, index, event.currentTarget.value))
                }
            />
            <div className={styles.fields}>
                <Select
                    label={t('autoselect.strategy')}
                    value={strategy}
                    allowDeselect={false}
                    data={[
                        'random',
                        'roundRobin',
                        'leastPing',
                        'leastLoad',
                        ...(!['random', 'roundRobin', 'leastPing', 'leastLoad'].includes(strategy)
                            ? [strategy]
                            : [])
                    ].map((value) => ({
                        value,
                        label: t(`autoselect.strategy-${value}`, { defaultValue: value })
                    }))}
                    onChange={(value) =>
                        value && edit((text) => setBalancerStrategy(text, index, value))
                    }
                />
                <TextInput
                    label={t('autoselect.fallback')}
                    description={t('autoselect.fallback-help')}
                    value={balance.fallbackTag ?? ''}
                    onChange={(event) =>
                        patch(['fallbackTag'], event.currentTarget.value || undefined)
                    }
                />
            </div>
            {strategy === 'leastLoad' && (
                <Stack gap="md" mt="md">
                    <Text size="xs" c="dimmed">
                        {t('autoselect.least-load-help')}
                    </Text>
                    <div className={styles.fields}>
                        <NumberInput
                            label={t('autoselect.least-load-expected')}
                            min={0}
                            max={2147483647}
                            allowDecimal={false}
                            allowNegative={false}
                            value={balance.strategy?.settings?.expected ?? ''}
                            placeholder="0"
                            onChange={(value) =>
                                patch(
                                    ['strategy', 'settings', 'expected'],
                                    value === '' ? undefined : Number(value)
                                )
                            }
                        />
                        <NumberInput
                            label={t('autoselect.least-load-tolerance')}
                            min={0}
                            max={1}
                            step={0.05}
                            decimalScale={6}
                            allowNegative={false}
                            value={balance.strategy?.settings?.tolerance ?? ''}
                            placeholder="0"
                            onChange={(value) =>
                                patch(
                                    ['strategy', 'settings', 'tolerance'],
                                    value === '' ? undefined : Number(value)
                                )
                            }
                        />
                        <TextInput
                            label={t('autoselect.least-load-max-rtt')}
                            value={balance.strategy?.settings?.maxRTT ?? ''}
                            placeholder="0s"
                            onChange={(event) =>
                                patch(
                                    ['strategy', 'settings', 'maxRTT'],
                                    event.currentTarget.value || undefined
                                )
                            }
                        />
                    </div>
                    <TagsInput
                        label={t('autoselect.least-load-baselines')}
                        description={t('autoselect.least-load-baselines-help')}
                        value={balance.strategy?.settings?.baselines ?? []}
                        onChange={(value) =>
                            patch(
                                ['strategy', 'settings', 'baselines'],
                                value.length ? value : undefined
                            )
                        }
                    />
                </Stack>
            )}
            <MultiSelect
                mt="md"
                searchable
                label={t('autoselect.balancer-selectors')}
                description={t('autoselect.balancer-selectors-help')}
                data={optionsWithSaved(selectors, values)}
                value={values}
                onChange={(value) =>
                    edit((text) =>
                        observerFor(
                            editTemplate(text, ['routing', 'balancers', index, 'selector'], value),
                            value,
                            strategy
                        )
                    )
                }
            />
            <Text mt="sm" size="xs" c="dimmed">
                {t('autoselect.remove-balancer-help')}
            </Text>
        </Paper>
    )
}

export function AutoselectPanel({
    text,
    baseline,
    config,
    hosts,
    onChange
}: {
    text: string
    baseline: string
    config: JsonObject
    hosts: Host[]
    onChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const [error, setError] = useState<string | null>(null)
    const options = useMemo(
        () =>
            hosts.map((host) => ({
                value: host.uuid,
                label: `${host.remark} \u00b7 ${host.address}:${host.port}`
            })),
        [hosts]
    )
    const tags = useMemo(
        () =>
            [...new Set(hosts.flatMap((host) => host.tags))]
                .sort()
                .map((value) => ({ value, label: value })),
        [hosts]
    )
    const pools = poolsOf(config)
    const balancers: JsonObject[] = Array.isArray(config.routing?.balancers)
        ? config.routing.balancers
        : []
    const selectorOptions = [
        ...new Set([
            ...pools.map((pool) => pool.tagPrefix),
            ...(Array.isArray(config.outbounds)
                ? config.outbounds.map((outbound: JsonObject) => outbound.tag)
                : [])
        ])
    ]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => ({ value, label: value }))
    const deferredText = useDeferredValue(text)
    const changes = useMemo(() => {
        try {
            return templateChanges(parseTemplate(baseline), parseTemplate(deferredText))
        } catch {
            return []
        }
    }, [baseline, deferredText])
    const edit: Edit = (operation) => {
        try {
            const next = operation(text)
            onChange(next)
            setError(null)
        } catch (issue) {
            setError(issue instanceof Error ? issue.message : 'structure')
        }
    }
    const assignment = config.remnawave?.assignTo ?? {}
    return (
        <div className={styles.layout}>
            <Stack gap="md" className={styles.main}>
                <Paper withBorder p="md">
                    <Group justify="space-between" gap="sm">
                        <div>
                            <Title order={3}>{t('autoselect.title')}</Title>
                            <Text size="sm" c="dimmed" mt={4}>
                                {t('autoselect.description')}
                            </Text>
                        </div>
                        <Button leftSection={<TbPlus size={17} />} onClick={() => edit(addPool)}>
                            {pools.length ? t('autoselect.add-pool') : t('autoselect.create')}
                        </Button>
                    </Group>
                </Paper>
                {error && (
                    <Alert
                        color="red"
                        title={t('autoselect.edit-error')}
                        onClose={() => setError(null)}
                        withCloseButton
                    >
                        {t(`autoselect.error-${error}`, {
                            defaultValue: t('autoselect.structure-error')
                        })}
                    </Alert>
                )}
                {!pools.length && (
                    <Paper withBorder p="xl">
                        <Stack align="center" gap="sm">
                            <TbArrowsShuffle size={32} aria-hidden />
                            <Title order={4}>{t('autoselect.empty')}</Title>
                            <Text size="sm" c="dimmed" ta="center">
                                {t('autoselect.empty-help')}
                            </Text>
                        </Stack>
                    </Paper>
                )}
                {pools.map((pool, index) => (
                    <PoolCard
                        key={index}
                        pool={pool}
                        index={index}
                        hostOptions={options}
                        tags={tags}
                        edit={edit}
                    />
                ))}
                {pools.length > 0 && <Alert variant="light">{t('autoselect.access-help')}</Alert>}
                <Accordion variant="contained">
                    <Accordion.Item value="assignment">
                        <Accordion.Control>
                            {t('autoselect.assignment')} ·{' '}
                            {(assignment.hosts?.length ?? 0) + (assignment.tags?.length ?? 0)}
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Text size="sm" c="dimmed" mb="md">
                                {t('autoselect.assignment-help')}
                            </Text>
                            <Stack gap="md">
                                <MultiSelect
                                    searchable
                                    clearable
                                    limit={50}
                                    label={t('autoselect.assignment-hosts')}
                                    data={optionsWithSaved(options, assignment.hosts ?? [])}
                                    value={assignment.hosts ?? []}
                                    onChange={(value) =>
                                        edit((text) =>
                                            editTemplate(
                                                text,
                                                ['remnawave', 'assignTo', 'hosts'],
                                                value
                                            )
                                        )
                                    }
                                />
                                <MultiSelect
                                    searchable
                                    clearable
                                    limit={50}
                                    label={t('autoselect.assignment-tags')}
                                    data={optionsWithSaved(tags, assignment.tags ?? [])}
                                    value={assignment.tags ?? []}
                                    onChange={(value) =>
                                        edit((text) =>
                                            editTemplate(
                                                text,
                                                ['remnawave', 'assignTo', 'tags'],
                                                value
                                            )
                                        )
                                    }
                                />
                                <Text size="xs" c="dimmed">
                                    {t('autoselect.assignment-priority')}
                                </Text>
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
                {balancers.length > 0 && (
                    <>
                        <Title order={3}>{t('autoselect.balancers')}</Title>
                        {balancers.map((balance, index) => (
                            <BalancerCard
                                key={index}
                                balance={balance}
                                index={index}
                                selectors={selectorOptions}
                                edit={edit}
                            />
                        ))}
                    </>
                )}
                {(config.observatory || config.burstObservatory) &&
                    !balancers.some((balance) => needsProbes(balance.strategy?.type)) && (
                        <Alert>
                            <Text size="sm">{t('autoselect.probes-not-needed')}</Text>
                            <Button
                                mt="sm"
                                variant="light"
                                onClick={() => edit(removeUnusedProbes)}
                            >
                                {t('autoselect.remove-unused-probes')}
                            </Button>
                        </Alert>
                    )}
                {(config.observatory || config.burstObservatory) &&
                    balancers.some((balance) => needsProbes(balance.strategy?.type)) && (
                        <Paper withBorder p="md">
                            <Title order={4} mb="sm">
                                {t('autoselect.probes')}
                            </Title>
                            <Text size="sm" c="dimmed" mb="md">
                                {t('autoselect.probes-help')}
                            </Text>
                            {['observatory', 'burstObservatory']
                                .filter((key) => config[key])
                                .map((key) => (
                                    <Stack key={key} gap="sm" mt="sm">
                                        <Badge variant="light">{key}</Badge>
                                        <TextInput
                                            label={t('autoselect.probe-url')}
                                            value={
                                                key === 'observatory'
                                                    ? (config[key].probeUrl ?? '')
                                                    : (config[key].pingConfig?.destination ?? '')
                                            }
                                            onChange={(event) =>
                                                edit((text) =>
                                                    editTemplate(
                                                        text,
                                                        key === 'observatory'
                                                            ? [key, 'probeUrl']
                                                            : [key, 'pingConfig', 'destination'],
                                                        event.currentTarget.value
                                                    )
                                                )
                                            }
                                        />
                                        <TextInput
                                            label={t('autoselect.probe-interval')}
                                            value={
                                                key === 'observatory'
                                                    ? (config[key].probeInterval ?? '')
                                                    : (config[key].pingConfig?.interval ?? '')
                                            }
                                            onChange={(event) =>
                                                edit((text) =>
                                                    editTemplate(
                                                        text,
                                                        key === 'observatory'
                                                            ? [key, 'probeInterval']
                                                            : [key, 'pingConfig', 'interval'],
                                                        event.currentTarget.value
                                                    )
                                                )
                                            }
                                        />
                                    </Stack>
                                ))}
                        </Paper>
                    )}
                <Paper withBorder p="md">
                    <Switch
                        label={t('autoselect.recipient-outbound')}
                        description={t('autoselect.recipient-help')}
                        checked={config.remnawave?.addVirtualHostAsOutbound === true}
                        onChange={(event) =>
                            edit((text) =>
                                editTemplate(
                                    text,
                                    ['remnawave', 'addVirtualHostAsOutbound'],
                                    event.currentTarget.checked
                                )
                            )
                        }
                    />
                </Paper>
            </Stack>
            <TemplateChanges changes={changes} />
        </div>
    )
}
