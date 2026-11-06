import type { editor } from 'monaco-editor'

import {
    Alert,
    Badge,
    Button,
    Card,
    Group,
    Stack,
    Tabs,
    Text,
    useMantineColorScheme
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { DiffEditor, type DiffEditorProps } from '@monaco-editor/react'
import { ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowBackUp, TbTrash } from 'react-icons/tb'

import type { useEditorRecovery } from '@shared/hooks/use-editor-recovery'

import classes from './revision-history.module.css'

interface Props {
    children: ReactNode
    recovery: ReturnType<typeof useEditorRecovery>
    baseline: string
    currentDraft: string
    language: 'json' | 'yaml'
    onRestore: (code: string) => void
}

function RecoveryComparison(props: DiffEditorProps) {
    const instance = useRef<editor.IStandaloneDiffEditor | null>(null)
    useLayoutEffect(
        () => () => {
            const editor = instance.current
            instance.current = null
            const models = editor?.getModel()
            editor?.setModel(null)
            models?.original.dispose()
            models?.modified.dispose()
        },
        []
    )
    return (
        <DiffEditor
            {...props}
            onMount={(editor) => {
                instance.current = editor
            }}
        />
    )
}

export function EditorRecoveryHistory({
    children,
    recovery,
    baseline,
    currentDraft,
    language,
    onRestore
}: Props) {
    const { t, i18n } = useTranslation()
    const { colorScheme } = useMantineColorScheme()
    const [confirmation, setConfirmation] = useState<{ code: string; current: string } | null>(null)
    const [discarding, setDiscarding] = useState(false)
    const entry = recovery.entry
    const confirmed =
        entry && confirmation?.code === entry.code && confirmation.current === currentDraft
    const discard = () =>
        modals.openConfirmModal({
            title: t('editor-recovery.discard-title'),
            children: t('editor-recovery.discard-help'),
            labels: { confirm: t('common.action.delete'), cancel: t('common.action.cancel') },
            confirmProps: { color: 'red' },
            onConfirm: () => {
                setDiscarding(true)
                void recovery
                    .discard()
                    .catch(() => {})
                    .finally(() => setDiscarding(false))
            }
        })
    return (
        <Tabs defaultValue={entry ? 'unsaved' : 'saved'} keepMounted={false}>
            <Tabs.List mb="md">
                <Tabs.Tab value="saved">{t('editor-recovery.saved-tab')}</Tabs.Tab>
                <Tabs.Tab
                    value="unsaved"
                    rightSection={
                        entry ? (
                            <Badge size="xs" variant="light">
                                1
                            </Badge>
                        ) : undefined
                    }
                >
                    {t('editor-recovery.unsaved-tab')}
                </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="saved">{children}</Tabs.Panel>
            <Tabs.Panel value="unsaved">
                <Stack gap="md" className={classes.root}>
                    <Text c="dimmed" size="sm">
                        {t('editor-recovery.help')}
                    </Text>
                    {recovery.status === 'loading' && (
                        <Text c="dimmed">{t('template-history.loading')}</Text>
                    )}
                    {recovery.status === 'error' && (
                        <Alert color={recovery.error === 'stale' ? 'yellow' : 'red'}>
                            {t(`editor-recovery.${recovery.error ?? 'unavailable'}`)}
                            {recovery.error !== 'stale' && (
                                <Group mt="sm">
                                    <Button
                                        variant="light"
                                        size="sm"
                                        onClick={() => void recovery.retry().catch(() => {})}
                                    >
                                        {t('common.action.try-again')}
                                    </Button>
                                    {recovery.error === 'corrupt' && (
                                        <Button
                                            variant="subtle"
                                            color="red"
                                            size="sm"
                                            onClick={discard}
                                        >
                                            {t('common.action.delete')}
                                        </Button>
                                    )}
                                </Group>
                            )}
                        </Alert>
                    )}
                    {recovery.status === 'ready' && !entry && (
                        <Alert>{t('editor-recovery.empty')}</Alert>
                    )}
                    {recovery.status === 'ready' && entry && (
                        <>
                            <Group justify="space-between">
                                <Text size="sm">
                                    {t('editor-recovery.updated', {
                                        time: new Date(entry.updatedAt).toLocaleString(
                                            i18n.language
                                        )
                                    })}
                                </Text>
                                <Badge variant="light">{t('template-history.unsaved')}</Badge>
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm">{t('editor-recovery.baseline')}</Text>
                                <Text size="sm">{t('editor-recovery.recovered')}</Text>
                            </Group>
                            <Card withBorder p={0} className={classes.comparison}>
                                <RecoveryComparison
                                    height="min(420px, 60vh)"
                                    language={language}
                                    original={baseline}
                                    modified={entry.code}
                                    theme={colorScheme === 'light' ? 'vs' : 'vs-dark'}
                                    options={{
                                        readOnly: true,
                                        originalEditable: false,
                                        automaticLayout: true,
                                        renderSideBySide: true,
                                        useInlineViewWhenSpaceIsLimited: true,
                                        renderOverviewRuler: false,
                                        minimap: { enabled: false }
                                    }}
                                />
                            </Card>
                            {confirmed && (
                                <Alert color="yellow">{t('template-history.confirm-help')}</Alert>
                            )}
                            <Group justify="space-between" wrap="wrap">
                                <Button
                                    variant="light"
                                    leftSection={<TbArrowBackUp size={17} />}
                                    onClick={() => {
                                        if (
                                            currentDraft !== baseline &&
                                            currentDraft !== entry.code &&
                                            !confirmed
                                        ) {
                                            setConfirmation({
                                                code: entry.code,
                                                current: currentDraft
                                            })
                                            return
                                        }
                                        onRestore(entry.code)
                                        setConfirmation(null)
                                    }}
                                >
                                    {t(
                                        confirmed
                                            ? 'template-history.replace'
                                            : 'template-history.restore'
                                    )}
                                </Button>
                                <Button
                                    color="red"
                                    variant="subtle"
                                    leftSection={<TbTrash size={17} />}
                                    loading={discarding}
                                    onClick={discard}
                                >
                                    {t('common.action.delete')}
                                </Button>
                            </Group>
                        </>
                    )}
                </Stack>
            </Tabs.Panel>
        </Tabs>
    )
}
