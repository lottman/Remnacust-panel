import type { editor } from 'monaco-editor'

import {
    Alert,
    Badge,
    Button,
    Group,
    Paper,
    Select,
    Stack,
    Text,
    useMantineColorScheme
} from '@mantine/core'
import { DiffEditor } from '@monaco-editor/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowBackUp, TbRefresh } from 'react-icons/tb'

import classes from './revision-history.module.css'

export interface CodeRevision {
    uuid: string
    name: string
    createdAt: string
    code: string
}
interface Props {
    revisions: CodeRevision[]
    language: 'json' | 'yaml'
    draft: string
    baseline: string
    help: string
    isPending: boolean
    isError: boolean
    isFetching: boolean
    onRefresh: () => void
    onRestore: (revision: CodeRevision) => void
}

export function RevisionHistory(props: Props) {
    const {
        revisions,
        language,
        draft,
        baseline,
        help,
        isPending,
        isError,
        isFetching,
        onRefresh,
        onRestore
    } = props
    const { t, i18n } = useTranslation()
    const { colorScheme } = useMantineColorScheme()
    const [selected, setSelected] = useState<string | null>(null)
    const [confirmation, setConfirmation] = useState<{
        uuid: string
        code: string
        draft: string
    } | null>(null)
    const revision = revisions.find((item) => item.uuid === selected) ?? revisions[0]
    const diffRef = useRef<editor.IStandaloneDiffEditor | null>(null)
    const comparisonVisible = !!revision && !isPending && !isError
    useLayoutEffect(
        () => () => {
            const instance = diffRef.current
            diffRef.current = null
            const models = instance?.getModel()
            // Detach first: the wrapper disposes its editor later in passive cleanup.
            instance?.setModel(null)
            models?.original.dispose()
            models?.modified.dispose()
        },
        [comparisonVisible]
    )
    const confirmed =
        !!revision &&
        confirmation?.uuid === revision.uuid &&
        confirmation.code === revision.code &&
        confirmation.draft === draft
    if (isPending) return <Text c="dimmed">{t('template-history.loading')}</Text>
    if (isError)
        return (
            <Alert color="red" title={t('template-history.error')}>
                <Button onClick={onRefresh} loading={isFetching} variant="light">
                    {t('template-history.retry')}
                </Button>
            </Alert>
        )
    return (
        <Stack gap="md" className={classes.root}>
            <Paper withBorder p="md">
                <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                        {help}
                    </Text>
                    <Button
                        variant="subtle"
                        size="sm"
                        leftSection={<TbRefresh size={16} />}
                        loading={isFetching}
                        onClick={onRefresh}
                    >
                        {t('template-history.refresh')}
                    </Button>
                </Group>
            </Paper>
            {!revision && <Alert>{t('template-history.empty')}</Alert>}
            {revision && (
                <>
                    <Select
                        label={t('template-history.version')}
                        searchable
                        allowDeselect={false}
                        value={revision.uuid}
                        data={revisions.map((item, index) => ({
                            value: item.uuid,
                            label: `${new Date(item.createdAt).toLocaleString(i18n.language)} · ${item.name}${index === 0 ? ' · ' + t('template-history.latest') : ''}`
                        }))}
                        onChange={(value) => {
                            setSelected(value)
                            setConfirmation(null)
                        }}
                    />
                    <Group justify="space-between">
                        <Badge variant="light">{t('template-history.saved-left')}</Badge>
                        <Text size="sm">{t('template-history.draft-right')}</Text>
                    </Group>
                    <Paper withBorder p={0} className={classes.comparison}>
                        <DiffEditor
                            height="420px"
                            language={language}
                            original={revision.code}
                            modified={draft}
                            theme={colorScheme === 'light' ? 'vs' : 'vs-dark'}
                            keepCurrentOriginalModel
                            keepCurrentModifiedModel
                            onMount={(instance) => {
                                diffRef.current = instance
                            }}
                            options={{
                                readOnly: true,
                                originalEditable: false,
                                renderSideBySide: true,
                                useInlineViewWhenSpaceIsLimited: true,
                                automaticLayout: true,
                                minimap: { enabled: false }
                            }}
                        />
                    </Paper>
                    {confirmed && (
                        <Alert color="yellow" title={t('template-history.unsaved')}>
                            <Text size="sm">{t('template-history.confirm-help')}</Text>
                            <Button variant="subtle" mt="sm" onClick={() => setConfirmation(null)}>
                                {t('template-history.cancel')}
                            </Button>
                        </Alert>
                    )}
                    <Button
                        variant="light"
                        leftSection={<TbArrowBackUp size={17} />}
                        onClick={() => {
                            if (draft !== baseline && !confirmed) {
                                setConfirmation({ uuid: revision.uuid, code: revision.code, draft })
                                return
                            }
                            onRestore(revision)
                            setConfirmation(null)
                        }}
                    >
                        {t(confirmed ? 'template-history.replace' : 'template-history.restore')}
                    </Button>
                </>
            )}
        </Stack>
    )
}
