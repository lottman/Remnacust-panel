import type { GetHostsCommand } from '@remnawave/backend-contract'

import { Accordion, MultiSelect, Stack, Text } from '@mantine/core'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { editTemplate, type JsonObject } from './autoselect-model'

type Host = GetHostsCommand.Response['response'][number]

export function TemplateAssignmentPanel({
    text,
    config,
    hosts,
    onChange
}: {
    text: string
    config: JsonObject
    hosts: Host[]
    onChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const assignment = config.remnawave?.assignTo ?? {}
    const hostOptions = useMemo(
        () => hosts.map((host) => ({ value: host.uuid, label: host.remark })),
        [hosts]
    )
    const tagOptions = useMemo(
        () =>
            [...new Set(hosts.flatMap((host) => host.tags))].map((tag) => ({
                value: tag,
                label: tag
            })),
        [hosts]
    )
    const withSaved = (options: Array<{ value: string; label: string }>, selected: string[]) => [
        ...options,
        ...selected
            .filter((value) => !options.some((option) => option.value === value))
            .map((value) => ({ value, label: value }))
    ]
    const update = (key: 'hosts' | 'tags', values: string[]) =>
        onChange(editTemplate(text, ['remnawave', 'assignTo', key], values))
    return (
        <Accordion variant="contained" mt="md">
            <Accordion.Item value="assignment">
                <Accordion.Control>
                    {t('autoselect.assignment')} ·{' '}
                    {(assignment.hosts?.length ?? 0) + (assignment.tags?.length ?? 0)}
                </Accordion.Control>
                <Accordion.Panel>
                    <Stack gap="md">
                        <Text size="sm" c="dimmed">
                            {t('autoselect.assignment-help')}
                        </Text>
                        <MultiSelect
                            searchable
                            clearable
                            limit={50}
                            label={t('autoselect.assignment-hosts')}
                            data={withSaved(hostOptions, assignment.hosts ?? [])}
                            value={assignment.hosts ?? []}
                            onChange={(value) => update('hosts', value)}
                        />
                        <MultiSelect
                            searchable
                            clearable
                            limit={50}
                            label={t('autoselect.assignment-tags')}
                            data={withSaved(tagOptions, assignment.tags ?? [])}
                            value={assignment.tags ?? []}
                            onChange={(value) => update('tags', value)}
                        />
                        <Text size="xs" c="dimmed">
                            {t('autoselect.assignment-priority')}
                        </Text>
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    )
}
