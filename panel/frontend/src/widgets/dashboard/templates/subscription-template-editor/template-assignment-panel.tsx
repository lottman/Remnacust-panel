import type { GetHostsCommand } from '@remnawave/backend-contract'

import { Alert, MultiSelect, Select, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type JsonObject } from './autoselect-model'
import styles from './autoselect-panel.module.css'
import {
    assignmentFor,
    assignmentMode,
    bindLegacyAssignment,
    setAssignment,
    templateAssignments
} from './template-assignment-model'

type Host = GetHostsCommand.Response['response'][number]
type Props = { text: string; config: JsonObject; hosts: Host[]; onChange: (value: string) => void }
const withSaved = (options: Array<{ value: string; label: string }>, values: string[]) => [
    ...options,
    ...[...new Set(values)]
        .filter((value) => !options.some((item) => item.value === value))
        .map((value) => ({ value, label: value }))
]

export function TemplateAssignmentPanel({
    text,
    config,
    hosts,
    onChange,
    balancerTag
}: Props & { balancerTag: string }) {
    const { t } = useTranslation()
    const assignment = assignmentFor(config, balancerTag)
    const [emptyMode, setEmptyMode] = useState<'hosts' | 'tags'>('hosts')
    const savedMode = assignmentMode(assignment)
    const mode = savedMode === 'mixed' ? null : (savedMode ?? emptyMode)
    const hostOptions = hosts.map((host) => ({
        value: host.uuid,
        label: `${host.remark} · ${host.address}:${host.port}`
    }))
    const tags = [...new Set(hosts.flatMap((host) => host.tags))].map((value) => ({
        value,
        label: value
    }))
    return (
        <Stack gap="sm" className={styles.section}>
            <div>
                <Text fw={600}>{t('autoselect.recipients-title')}</Text>
                <Text size="sm" c="dimmed" mt={4}>
                    {t('autoselect.recipients-help', { name: balancerTag })}
                </Text>
            </div>
            <Select
                label={t('autoselect.assignment-mode')}
                placeholder={t('autoselect.assignment-mode')}
                allowDeselect={false}
                data={[
                    { value: 'hosts', label: t('autoselect.hosts') },
                    { value: 'tags', label: t('autoselect.tags') }
                ]}
                value={mode}
                onChange={(value) => {
                    if (value !== 'hosts' && value !== 'tags') return
                    setEmptyMode(value)
                    onChange(setAssignment(text, balancerTag, value, assignment?.[value] ?? []))
                }}
            />
            {savedMode === 'mixed' && (
                <Alert color="yellow">
                    <Text size="sm">{t('autoselect.assignment-mixed')}</Text>
                    <Text size="xs" mt={4}>
                        {[
                            ...(assignment?.hosts ?? []).map(
                                (uuid) =>
                                    hostOptions.find((host) => host.value === uuid)?.label ?? uuid
                            ),
                            ...(assignment?.tags ?? []).map((tag) => `#${tag}`)
                        ].join(', ')}
                    </Text>
                </Alert>
            )}
            {mode && (
                <MultiSelect
                    key={mode}
                    searchable
                    clearable
                    limit={50}
                    label={t(
                        mode === 'hosts'
                            ? 'autoselect.assignment-hosts'
                            : 'autoselect.assignment-tags'
                    )}
                    placeholder={t(
                        mode === 'hosts'
                            ? 'autoselect.recipient-host-placeholder'
                            : 'autoselect.recipient-tag-placeholder'
                    )}
                    data={withSaved(
                        mode === 'hosts' ? hostOptions : tags,
                        assignment?.[mode] ?? []
                    )}
                    value={assignment?.[mode] ?? []}
                    onChange={(value) => onChange(setAssignment(text, balancerTag, mode, value))}
                />
            )}
            <Text size="xs" c="dimmed">
                {t('autoselect.recipients-empty-help')}
            </Text>
        </Stack>
    )
}

export function LegacyAssignments({ text, config, hosts, onChange }: Props) {
    const { t } = useTranslation()
    const rows = templateAssignments(config)
    const available: JsonObject[] = (config.routing?.balancers ?? []).filter(
        (balance: JsonObject) => typeof balance.tag === 'string' && balance.tag.length > 0
    )
    const unbound = (row: (typeof rows)[number]) =>
        !available.some((balance: JsonObject) => balance.tag === row.balancerTag)
    if (
        !available.length ||
        !rows.some(unbound) ||
        (available.length === 1 && rows.length === 1 && !rows[0].balancerTag)
    )
        return null
    return (
        <Alert color="yellow" title={t('autoselect.legacy-assignment-title')}>
            <Stack gap="sm">
                <Text size="sm">{t('autoselect.legacy-assignment')}</Text>
                {rows.map(
                    (row, index) =>
                        unbound(row) && (
                            <Select
                                key={index}
                                label={t('autoselect.legacy-assignment-row', {
                                    count: (row.hosts?.length ?? 0) + (row.tags?.length ?? 0)
                                })}
                                description={[
                                    ...(row.hosts ?? []).map(
                                        (uuid) =>
                                            hosts.find((host) => host.uuid === uuid)?.remark ?? uuid
                                    ),
                                    ...(row.tags ?? []).map((tag) => `#${tag}`)
                                ].join(', ')}
                                placeholder={t('autoselect.choose-selection')}
                                value={null}
                                searchable
                                data={[
                                    ...new Set(available.map((balance) => balance.tag as string))
                                ].map((value) => ({ value, label: value }))}
                                onChange={(value) =>
                                    value && onChange(bindLegacyAssignment(text, index, value))
                                }
                            />
                        )
                )}
            </Stack>
        </Alert>
    )
}
