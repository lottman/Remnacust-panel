import type { GetHostsCommand } from '@remnawave/backend-contract'

import { ActionIcon, Alert, Button, Card, Group, MultiSelect, Select, Stack, Text, Title } from '@mantine/core'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TbPlus, TbTrash } from 'react-icons/tb'

import { editTemplate, type JsonObject } from './autoselect-model'
import styles from './autoselect-panel.module.css'

type Host = GetHostsCommand.Response['response'][number]
type Assignment = { hosts?: string[]; tags?: string[]; balancerTag?: string }

export function TemplateAssignmentPanel({ text, config, hosts, onChange }: {
    text: string
    config: JsonObject
    hosts: Host[]
    onChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const assignments: Assignment[] = [
        ...(config.remnawave?.assignments ?? []),
        ...(config.remnawave?.assignTo ? [config.remnawave.assignTo] : [])
    ]
    const balancers = (config.routing?.balancers ?? []).map((item: JsonObject) => ({ value: item.tag, label: item.tag }))
    const hostOptions = useMemo(() => hosts.map((host) => ({ value: host.uuid, label: `${host.remark} · ${host.address}:${host.port}` })), [hosts])
    const tagOptions = useMemo(() => [...new Set(hosts.flatMap((host) => host.tags))].map((value) => ({ value, label: value })), [hosts])
    const withSaved = (options: Array<{ value: string; label: string }>, values: string[]) => [
        ...options,
        ...values.filter((value) => !options.some((item) => item.value === value)).map((value) => ({ value, label: value }))
    ]
    const save = (next: Assignment[]) => {
        let updated = editTemplate(text, ['remnawave', 'assignTo'], undefined)
        updated = editTemplate(updated, ['remnawave', 'assignments'], next.length ? next : undefined)
        onChange(updated)
    }
    const patch = (index: number, changes: Partial<Assignment>) => save(assignments.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
    const available = balancers.filter((item: { value: string }) => !assignments.some((assignment) => assignment.balancerTag === item.value))
    return (
        <Card withBorder p="md">
            <Group justify="space-between" mb="md">
                <div className={styles.sectionHeader}>
                    <Title order={4}>{t('autoselect.assignments-title')}</Title>
                    <Text size="sm" c="dimmed" mt={4}>{t('autoselect.assignments-help')}</Text>
                </div>
                <Button variant="light" leftSection={<TbPlus size={16} />} disabled={!available.length} onClick={() => save([...assignments, { balancerTag: available[0].value, hosts: [], tags: [] }])}>
                    {t('autoselect.assign-hosts')}
                </Button>
            </Group>
            <Stack gap="md">
                {!assignments.length && <Text size="sm" c="dimmed">{t('autoselect.assignments-empty')}</Text>}
                {assignments.map((assignment, index) => (
                    <Stack key={index} gap="sm" className={styles.assignment}>
                        <Group align="flex-end" wrap="nowrap">
                            <Select
                                flex={1}
                                label={t('autoselect.assigned-selection')}
                                placeholder={t('autoselect.choose-selection')}
                                searchable
                                allowDeselect={false}
                                data={withSaved(balancers.filter((item: { value: string }) => item.value === assignment.balancerTag || !assignments.some((other) => other.balancerTag === item.value)), assignment.balancerTag ? [assignment.balancerTag] : [])}
                                value={assignment.balancerTag ?? null}
                                onChange={(value) => value && patch(index, { balancerTag: value })}
                            />
                            <ActionIcon variant="subtle" color="red" size="lg" aria-label={t('autoselect.remove-assignment')} onClick={() => save(assignments.filter((_, itemIndex) => itemIndex !== index))}><TbTrash size={18} /></ActionIcon>
                        </Group>
                        {!assignment.balancerTag && <Alert color="yellow">{t('autoselect.legacy-assignment')}</Alert>}
                        <div className={styles.fields}>
                            <MultiSelect searchable clearable limit={50} label={t('autoselect.assignment-hosts')} data={withSaved(hostOptions, assignment.hosts ?? [])} value={assignment.hosts ?? []} onChange={(value) => patch(index, { hosts: value })} />
                            <MultiSelect searchable clearable limit={50} label={t('autoselect.assignment-tags')} data={withSaved(tagOptions, assignment.tags ?? [])} value={assignment.tags ?? []} onChange={(value) => patch(index, { tags: value })} />
                        </div>
                    </Stack>
                ))}
                {!!assignments.length && <Text size="xs" c="dimmed">{t('autoselect.assignment-priority')}</Text>}
            </Stack>
        </Card>
    )
}
