import { Alert, Badge, Button, Group, Paper, Select, Stack, Text } from '@mantine/core'
import 'monaco-editor/features/diffEditor/register'
import { DiffEditor } from '@monaco-editor/react'
import { GetSubscriptionTemplateRevisionsCommand } from '@remnawave/backend-contract'
import { decode } from '@stablelib/base64'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowBackUp, TbRefresh } from 'react-icons/tb'

import { instance } from '@shared/api'

type Props = {
    uuid: string
    language: 'json' | 'yaml'
    draft: string
    baseline: string
    onRestore: (code: string) => void
}
export const templateHistoryKey = (uuid: string) => ['subscription-template-revisions', uuid]
export function TemplateHistory({ uuid, language, draft, baseline, onRestore }: Props) {
    const { t, i18n } = useTranslation()
    const [selected, setSelected] = useState<string | null>(null)
    const [confirm, setConfirm] = useState(false)
    const { data, isPending, isError, refetch } = useQuery({
        queryKey: templateHistoryKey(uuid),
        queryFn: async () =>
            GetSubscriptionTemplateRevisionsCommand.ResponseSchema.parse(
                (await instance.get(GetSubscriptionTemplateRevisionsCommand.url(uuid))).data
            ).response,
        staleTime: 15_000
    })
    if (isPending) return <Text c="dimmed">{t('template-history.loading')}</Text>
    if (isError)
        return (
            <Alert color="red" title={t('template-history.error')}>
                <Button onClick={() => void refetch()} variant="light">
                    {t('template-history.retry')}
                </Button>
            </Alert>
        )
    const revisions = data ?? []
    const revision = revisions.find((item) => item.uuid === selected) ?? revisions[0]
    const code = revision
        ? language === 'json'
            ? JSON.stringify(revision.templateJson, null, 2)
            : revision.encodedTemplateYaml
              ? new TextDecoder().decode(decode(revision.encodedTemplateYaml))
              : ''
        : ''
    const restore = () => {
        if (draft !== baseline && !confirm) {
            setConfirm(true)
            return
        }
        onRestore(code)
        setConfirm(false)
    }
    return (
        <Stack gap="md">
            <Paper withBorder p="md">
                <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                        {t('template-history.help')}
                    </Text>
                    <Button
                        variant="subtle"
                        size="sm"
                        leftSection={<TbRefresh size={16} />}
                        onClick={() => void refetch()}
                    >
                        {t('template-history.refresh')}
                    </Button>
                </Group>
            </Paper>
            {!revisions.length && <Alert>{t('template-history.empty')}</Alert>}
            {revision && (
                <>
                    <Select
                        label={t('template-history.version')}
                        searchable
                        allowDeselect={false}
                        value={revision.uuid}
                        data={revisions.map((item, index) => ({
                            value: item.uuid,
                            label: `${new Date(item.createdAt).toLocaleString(i18n.language)} \u00b7 ${item.name}${index === 0 ? ' \u00b7 ' + t('template-history.latest') : ''}`
                        }))}
                        onChange={(value) => {
                            setSelected(value)
                            setConfirm(false)
                        }}
                    />
                    <Group justify="space-between">
                        <Badge variant="light">{t('template-history.saved-left')}</Badge>
                        <Text size="sm">{t('template-history.draft-right')}</Text>
                    </Group>
                    <Paper withBorder p={0} style={{ direction: 'ltr', overflow: 'hidden' }}>
                        <DiffEditor
                            height="420px"
                            language={language}
                            original={code}
                            modified={draft}
                            theme="vs-dark"
                            options={{
                                readOnly: true,
                                renderSideBySide: true,
                                useInlineViewWhenSpaceIsLimited: true,
                                automaticLayout: true,
                                minimap: { enabled: false },
                                originalEditable: false
                            }}
                        />
                    </Paper>
                    {confirm && (
                        <Alert color="yellow" title={t('template-history.unsaved')}>
                            <Text size="sm">{t('template-history.confirm-help')}</Text>
                            <Button variant="subtle" mt="sm" onClick={() => setConfirm(false)}>
                                {t('template-history.cancel')}
                            </Button>
                        </Alert>
                    )}
                    <Button
                        leftSection={<TbArrowBackUp size={17} />}
                        onClick={restore}
                        variant="light"
                    >
                        {t(confirm ? 'template-history.replace' : 'template-history.restore')}
                    </Button>
                </>
            )}
        </Stack>
    )
}
