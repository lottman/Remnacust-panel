import type { GetHostsCommand } from '@remnawave/backend-contract'

import { Alert, MultiSelect, Select, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import { type JsonObject } from './autoselect-model'
import styles from './autoselect-panel.module.css'
import {
    assignmentFor,
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
            <div className={styles.fields}>
                <MultiSelect
                    searchable
                    clearable
                    limit={50}
                    label={t('autoselect.assignment-hosts')}
                    placeholder={t('autoselect.recipient-host-placeholder')}
                    data={withSaved(hostOptions, assignment?.hosts ?? [])}
                    value={assignment?.hosts ?? []}
                    onChange={(value) => onChange(setAssignment(text, balancerTag, 'hosts', value))}
                />
                <MultiSelect
                    searchable
                    clearable
                    limit={50}
                    label={t('autoselect.assignment-tags')}
                    placeholder={t('autoselect.recipient-tag-placeholder')}
                    data={withSaved(tags, assignment?.tags ?? [])}
                    value={assignment?.tags ?? []}
                    onChange={(value) => onChange(setAssignment(text, balancerTag, 'tags', value))}
                />
            </div>
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
