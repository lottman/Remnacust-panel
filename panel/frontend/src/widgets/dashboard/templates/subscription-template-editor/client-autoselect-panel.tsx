import type { GetHostsCommand } from '@remnawave/backend-contract'

import {
    Alert,
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbPlus, TbTrash } from 'react-icons/tb'

import { type JsonObject } from './autoselect-model'
import styles from './autoselect-panel.module.css'
import {
    addClientGroup,
    editClientTemplate,
    nativeGroupPath,
    removeClientGroup,
    renameClientGroup,
    type ClientFormat
} from './client-template-model'

export function ClientAutoselectPanel({
    text,
    config,
    format,
    hosts,
    onChange
}: {
    text: string
    config: JsonObject
    format: ClientFormat
    hosts: GetHostsCommand.Response['response']
    onChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const [error, setError] = useState(false)
    const sing = format === 'SINGBOX'
    const key = nativeGroupPath(format)[0]
    const all: JsonObject[] = Array.isArray(config[key]) ? config[key] : []
    const groups = all
        .map((group, index) => ({ group, index }))
        .filter(({ group }) => !sing || ['selector', 'urltest'].includes(group.type))
    const edit = (operation: () => string) => {
        try {
            onChange(operation())
            setError(false)
        } catch {
            setError(true)
        }
    }
    const patch = (index: number, path: (string | number)[], value: unknown) =>
        edit(() => editClientTemplate(text, format, [key, index, ...path], value))
    const hostOptions = hosts.map((host) => ({
        value: host.uuid,
        label: `${host.remark} · ${host.address}:${host.port}`
    }))
    const tags = [...new Set(hosts.flatMap((host) => host.tags))]
        .sort()
        .map((value) => ({ value, label: value }))
    const withSaved = (options: { value: string; label: string }[], values: string[]) => [
        ...options,
        ...values
            .filter((value) => !options.some((option) => option.value === value))
            .map((value) => ({ value, label: value }))
    ]
    return (
        <Stack gap="md">
            <Paper withBorder p="md">
                <Group justify="space-between" gap="md">
                    <div>
                        <Title order={3}>{t('autoselect.title')}</Title>
                        <Text size="sm" c="dimmed">
                            {t('client-template.native-help')}
                        </Text>
                    </div>
                    <Button
                        leftSection={<TbPlus size={17} />}
                        onClick={() => edit(() => addClientGroup(text, format))}
                    >
                        {t('autoselect.create')}
                    </Button>
                </Group>
            </Paper>
            {error && (
                <Alert color="red" withCloseButton onClose={() => setError(false)}>
                    {t('autoselect.structure-error')}
                </Alert>
            )}
            {!groups.length && (
                <Paper withBorder p="xl">
                    <Text ta="center" c="dimmed">
                        {t('autoselect.empty')}
                    </Text>
                </Paper>
            )}
            {groups.map(({ group, index }) => {
                const pool = group.remnawave?.pool
                const selector = pool?.selector ?? { type: 'remarkRegex', pattern: '.*' }
                const mode = pool?.mode ?? 'all'
                const values: string[] = selector.values ?? []
                const memberOptions = selector.type === 'tags' ? tags : hostOptions
                const name: string = sing ? group.tag : group.name
                const field = sing ? 'outbounds' : 'proxies'
                const defaultGroup = sing
                    ? config.route?.final === name
                    : (config.rules ?? []).some(
                          (rule: unknown) =>
                              typeof rule === 'string' &&
                              rule.split(',')[0].trim() === 'MATCH' &&
                              rule.split(',')[1]?.trim() === name
                      )
                const poolPatch = (path: (string | number)[], value: unknown) =>
                    patch(index, ['remnawave', 'pool', ...path], value)
                return (
                    <Paper key={index} withBorder p="md" className={styles.card}>
                        <Stack gap="md">
                            <Group justify="space-between">
                                <Title order={4}>{name}</Title>
                                <Button
                                    color="red"
                                    variant="subtle"
                                    size="compact-sm"
                                    leftSection={<TbTrash size={16} />}
                                    onClick={() =>
                                        edit(() => removeClientGroup(text, format, index))
                                    }
                                >
                                    {t('client-template.remove-group')}
                                </Button>
                            </Group>
                            <div className={styles.fields}>
                                <TextInput
                                    label={t('client-template.group-name')}
                                    defaultValue={name}
                                    key={name}
                                    onBlur={(event) =>
                                        event.currentTarget.value !== name &&
                                        edit(() =>
                                            renameClientGroup(
                                                text,
                                                format,
                                                index,
                                                event.currentTarget.value
                                            )
                                        )
                                    }
                                />
                                <Select
                                    label={t('autoselect.strategy')}
                                    value={group.type}
                                    allowDeselect={false}
                                    data={(sing
                                        ? ['urltest', 'selector']
                                        : ['url-test', 'fallback', 'load-balance', 'select']
                                    ).map((value) => ({
                                        value,
                                        label: t(`client-template.strategy-${value}`, {
                                            defaultValue: value
                                        })
                                    }))}
                                    onChange={(value) =>
                                        value &&
                                        edit(() => {
                                            let next = editClientTemplate(
                                                text,
                                                format,
                                                [key, index, 'type'],
                                                value
                                            )
                                            for (const property of ['url', 'interval', 'tolerance'])
                                                next = editClientTemplate(
                                                    next,
                                                    format,
                                                    [key, index, property],
                                                    ['select', 'selector'].includes(value)
                                                        ? undefined
                                                        : property === 'url'
                                                          ? (group.url ??
                                                            'https://www.gstatic.com/generate_204')
                                                          : property === 'interval'
                                                            ? (group.interval ??
                                                              (sing ? '5m' : 300))
                                                            : (group.tolerance ?? 50)
                                                )
                                            return next
                                        })
                                    }
                                />
                            </div>
                            <Switch
                                label={t('client-template.use-pool')}
                                description={t('client-template.use-pool-help')}
                                checked={!!pool}
                                onChange={(event) =>
                                    patch(
                                        index,
                                        ['remnawave', 'pool'],
                                        event.currentTarget.checked
                                            ? {
                                                  mode: 'all',
                                                  selectFrom: 'NOT_HIDDEN',
                                                  selector: { type: 'remarkRegex', pattern: '.*' }
                                              }
                                            : undefined
                                    )
                                }
                            />
                            {pool && (
                                <>
                                    <div className={styles.fields}>
                                        <Select
                                            label={t('autoselect.source')}
                                            allowDeselect={false}
                                            value={selector.type}
                                            data={(
                                                [
                                                    'uuids',
                                                    'tags',
                                                    'remarkRegex',
                                                    'tagRegex'
                                                ] as const
                                            ).map((value) => ({
                                                value,
                                                label: t(
                                                    (
                                                        {
                                                            uuids: 'autoselect.hosts',
                                                            tags: 'autoselect.tags',
                                                            remarkRegex: 'autoselect.remark-regex',
                                                            tagRegex: 'autoselect.tag-regex'
                                                        } as const
                                                    )[value]
                                                )
                                            }))}
                                            onChange={(value) =>
                                                value &&
                                                poolPatch(['selector'], {
                                                    type: value,
                                                    ...(['tags', 'uuids'].includes(value)
                                                        ? { values: [] }
                                                        : { pattern: '.*' }),
                                                    ...(mode === 'random' ? { expected: 3 } : {}),
                                                    ...(mode === 'group'
                                                        ? { groups: { 'group-1': [] } }
                                                        : {})
                                                })
                                            }
                                        />
                                        <Select
                                            label={t('autoselect.mode')}
                                            allowDeselect={false}
                                            value={mode}
                                            data={(['all', 'random', 'group'] as const).map(
                                                (value) => ({
                                                    value,
                                                    label: t(`autoselect.mode-${value}`)
                                                })
                                            )}
                                            onChange={(value) =>
                                                value &&
                                                edit(() => {
                                                    let next = editClientTemplate(
                                                        text,
                                                        format,
                                                        [key, index, 'remnawave', 'pool', 'mode'],
                                                        value
                                                    )
                                                    if (value === 'random')
                                                        next = editClientTemplate(
                                                            next,
                                                            format,
                                                            [
                                                                key,
                                                                index,
                                                                'remnawave',
                                                                'pool',
                                                                'selector',
                                                                'expected'
                                                            ],
                                                            selector.expected ?? 3
                                                        )
                                                    if (value === 'group' && !selector.groups)
                                                        next = editClientTemplate(
                                                            next,
                                                            format,
                                                            [
                                                                key,
                                                                index,
                                                                'remnawave',
                                                                'pool',
                                                                'selector',
                                                                'groups'
                                                            ],
                                                            { 'group-1': values }
                                                        )
                                                    return next
                                                })
                                            }
                                        />
                                        <Select
                                            label={t('autoselect.visibility')}
                                            value={pool.selectFrom ?? 'NOT_HIDDEN'}
                                            allowDeselect={false}
                                            data={(['ALL', 'HIDDEN', 'NOT_HIDDEN'] as const).map(
                                                (value) => ({
                                                    value,
                                                    label: t(`autoselect.visibility-${value}`)
                                                })
                                            )}
                                            onChange={(value) =>
                                                value && poolPatch(['selectFrom'], value)
                                            }
                                        />
                                    </div>
                                    {mode === 'random' && (
                                        <NumberInput
                                            label={t('autoselect.expected')}
                                            min={1}
                                            max={1000}
                                            allowDecimal={false}
                                            value={selector.expected ?? 3}
                                            onChange={(value) =>
                                                poolPatch(['selector', 'expected'], Number(value))
                                            }
                                        />
                                    )}
                                    {mode !== 'group' &&
                                        ['tags', 'uuids'].includes(selector.type) && (
                                            <MultiSelect
                                                label={t('autoselect.pool-members')}
                                                searchable
                                                clearable
                                                data={withSaved(memberOptions, values)}
                                                value={values}
                                                error={
                                                    !values.length
                                                        ? t('autoselect.select-members')
                                                        : undefined
                                                }
                                                onChange={(value) =>
                                                    poolPatch(['selector', 'values'], value)
                                                }
                                            />
                                        )}
                                    {['remarkRegex', 'tagRegex'].includes(selector.type) && (
                                        <TextInput
                                            label={t('autoselect.pattern')}
                                            value={selector.pattern ?? ''}
                                            onChange={(event) =>
                                                poolPatch(
                                                    ['selector', 'pattern'],
                                                    event.currentTarget.value
                                                )
                                            }
                                        />
                                    )}
                                    {mode === 'group' && (
                                        <Stack gap="sm">
                                            {Object.entries(selector.groups ?? {}).map(
                                                ([groupName, members], i) => (
                                                    <Group key={groupName} align="end">
                                                        <MultiSelect
                                                            flex={1}
                                                            label={t('autoselect.group-members', {
                                                                count: i + 1
                                                            })}
                                                            searchable
                                                            data={withSaved(
                                                                memberOptions,
                                                                members as string[]
                                                            )}
                                                            value={members as string[]}
                                                            onChange={(value) =>
                                                                poolPatch(
                                                                    [
                                                                        'selector',
                                                                        'groups',
                                                                        groupName
                                                                    ],
                                                                    value
                                                                )
                                                            }
                                                        />
                                                        <Button
                                                            color="red"
                                                            variant="subtle"
                                                            onClick={() =>
                                                                poolPatch(
                                                                    ['selector', 'groups'],
                                                                    Object.fromEntries(
                                                                        Object.entries(
                                                                            selector.groups
                                                                        ).filter(
                                                                            ([name]) =>
                                                                                name !== groupName
                                                                        )
                                                                    )
                                                                )
                                                            }
                                                        >
                                                            {t('autoselect.remove-group')}
                                                        </Button>
                                                    </Group>
                                                )
                                            )}
                                            <Button
                                                variant="light"
                                                onClick={() => {
                                                    const next = { ...selector.groups }
                                                    let n = Object.keys(next).length + 1
                                                    while (next[`group-${n}`]) n++
                                                    next[`group-${n}`] = []
                                                    poolPatch(['selector', 'groups'], next)
                                                }}
                                            >
                                                {t('autoselect.add-group')}
                                            </Button>
                                        </Stack>
                                    )}
                                </>
                            )}
                            {!['select', 'selector'].includes(group.type) && (
                                <div className={styles.fields}>
                                    <TextInput
                                        label={t('autoselect.probe-url')}
                                        value={group.url ?? ''}
                                        onChange={(event) =>
                                            patch(index, ['url'], event.currentTarget.value)
                                        }
                                    />
                                    {sing ? (
                                        <TextInput
                                            label={t('autoselect.probe-interval')}
                                            value={group.interval ?? '5m'}
                                            onChange={(event) =>
                                                patch(
                                                    index,
                                                    ['interval'],
                                                    event.currentTarget.value
                                                )
                                            }
                                        />
                                    ) : (
                                        <NumberInput
                                            label={t('client-template.interval-seconds')}
                                            min={1}
                                            value={group.interval ?? 300}
                                            onChange={(value) =>
                                                patch(index, ['interval'], Number(value))
                                            }
                                        />
                                    )}
                                    <NumberInput
                                        label={t('client-template.tolerance')}
                                        min={0}
                                        value={group.tolerance ?? 50}
                                        onChange={(value) =>
                                            patch(index, ['tolerance'], Number(value))
                                        }
                                    />
                                </div>
                            )}
                            <Switch
                                label={t('client-template.default-group')}
                                checked={defaultGroup}
                                onChange={(event) =>
                                    edit(() => {
                                        if (sing)
                                            return editClientTemplate(
                                                text,
                                                format,
                                                ['route', 'final'],
                                                event.currentTarget.checked ? name : undefined
                                            )
                                        const rules: string[] = config.rules ?? []
                                        const retained = rules.filter(
                                            (rule) => rule.split(',')[0].trim() !== 'MATCH'
                                        )
                                        let next = editClientTemplate(
                                            text,
                                            format,
                                            ['rules'],
                                            event.currentTarget.checked
                                                ? [...retained, `MATCH,${name}`]
                                                : retained
                                        )
                                        if (event.currentTarget.checked)
                                            next = editClientTemplate(
                                                next,
                                                format,
                                                ['mode'],
                                                'rule'
                                            )
                                        return next
                                    })
                                }
                            />
                            <Text size="xs" c="dimmed">
                                {t('client-template.manual-members', {
                                    count: Array.isArray(group[field]) ? group[field].length : 0
                                })}
                            </Text>
                        </Stack>
                    </Paper>
                )
            })}
            <Alert>{t('autoselect.access-help')}</Alert>
        </Stack>
    )
}
