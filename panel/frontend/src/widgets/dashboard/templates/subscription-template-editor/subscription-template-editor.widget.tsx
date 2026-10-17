import type { editor } from 'monaco-editor'

import { TemplateEditorActionsFeature } from '@features/dashboard/subscription-templates/template-editor-actions'
import { Alert, Box, Paper, Tabs } from '@mantine/core'
import { Monaco } from '@monaco-editor/react'
import 'monaco-yaml/yaml.worker.js'
import { GetHostsCommand, GetSubscriptionTemplateCommand } from '@remnawave/backend-contract'
import { decode } from '@stablelib/base64'
import clsx from 'clsx'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowsShuffle, TbCode, TbHistory } from 'react-icons/tb'

import { usePseudoFullscreen, useViewportFillHeight } from '@shared/hooks'
import { fullscreenClasses, FullscreenToggleButton } from '@shared/ui'
import { CodeEditor, editorClasses, EditorFooter } from '@shared/ui/code-editor'
import { preventBackScroll } from '@shared/utils/misc'
import { setupSuggestWidget } from '@shared/utils/setup-monaco/setup-suggest-monaco'

import { parseTemplate, poolsOf, validationPath } from './autoselect-model'
import { AutoselectPanel } from './autoselect-panel'
import styles from './SubscriptionTemplateEditor.module.css'
import { TemplateHistory } from './template-history'
import { configureMonaco, getTemplateModelPath } from './utils/setup-template-monaco'

interface Props {
    editorType: 'json' | 'yaml'
    hosts: GetHostsCommand.Response['response']
    template: GetSubscriptionTemplateCommand.Response['response']
}

export function SubscriptionTemplateEditorWidget(props: Props) {
    const { editorType, hosts, template } = props
    const { t } = useTranslation()
    const isXray = template.templateType === 'XRAY_JSON'
    const [activeTab, setActiveTab] = useState<string | null>('code')

    const { isFullscreen, toggle: toggleFullscreen } = usePseudoFullscreen()
    const { containerRef: editorWrapperRef, footerRef } = useViewportFillHeight({
        enabled: !isFullscreen && activeTab === 'code'
    })

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const monacoRef = useRef<Monaco | null>(null)

    const baseline = useMemo(() => {
        if (editorType === 'yaml') {
            return template.encodedTemplateYaml
                ? new TextDecoder().decode(decode(template.encodedTemplateYaml))
                : ''
        }
        return JSON.stringify(template.templateJson, null, 2)
    }, [editorType, template.templateJson, template.encodedTemplateYaml])
    const [value, setValue] = useState(() => baseline)
    const valueRef = useRef(value)
    const setDraft = (next: string) => {
        valueRef.current = next
        setValue(next)
    }
    const draft = useMemo(() => {
        if (editorType !== 'json') return { config: null, error: null }
        try {
            const config = parseTemplate(value)
            poolsOf(config)
            return { config, error: isXray ? validationPath(config) : null }
        } catch {
            return { config: null, error: 'JSON' }
        }
    }, [value, editorType, isXray])

    const handleEditorWillMount = (monaco: Monaco) => {
        configureMonaco(monaco, editorType, hosts, template.templateType)
    }

    const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
        editorRef.current = editor
        monacoRef.current = monaco

        setupSuggestWidget(editor)
    }

    useLayoutEffect(() => {
        document.body.addEventListener('wheel', preventBackScroll, {
            passive: false
        })
        return () => {
            document.body.removeEventListener('wheel', preventBackScroll)
        }
    }, [])

    return (
        <Box className={clsx(styles.container, isFullscreen && fullscreenClasses.overlay)}>
            <Tabs
                value={activeTab}
                onChange={(next) => {
                    if (next !== 'code' && isFullscreen) toggleFullscreen()
                    setActiveTab(next)
                }}
                keepMounted
            >
                <Tabs.List mb="md" className={styles.tabsList}>
                    <Tabs.Tab value="code" leftSection={<TbCode size={17} />}>
                        {t('autoselect.editing')}
                    </Tabs.Tab>
                    {isXray && (
                        <Tabs.Tab value="autoselect" leftSection={<TbArrowsShuffle size={17} />}>
                            {t('autoselect.title')}
                        </Tabs.Tab>
                    )}
                    <Tabs.Tab value="history" leftSection={<TbHistory size={17} />}>
                        {t('template-history.title')}
                    </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="code">
                    <Paper
                        className={clsx(
                            styles.editorWrapper,
                            !isFullscreen && editorClasses.editorAttached,
                            isFullscreen && fullscreenClasses.fill
                        )}
                        p={0}
                        ref={editorWrapperRef}
                        pos="relative"
                        style={{
                            direction: 'ltr'
                        }}
                        withBorder
                    >
                        {isFullscreen && (
                            <FullscreenToggleButton
                                isFullscreen={isFullscreen}
                                onToggle={toggleFullscreen}
                            />
                        )}

                        <CodeEditor
                            beforeMount={handleEditorWillMount}
                            className={styles.monacoEditor}
                            defaultLanguage={editorType}
                            onMount={handleEditorDidMount}
                            options={{
                                renderValidationDecorations: 'on',
                                quickSuggestions: {
                                    strings: true,
                                    comments: true,
                                    other: true
                                }
                            }}
                            path={`${getTemplateModelPath(template.templateType)}/${template.uuid}`}
                            value={value}
                            onChange={(next) => setDraft(next ?? '')}
                        />
                    </Paper>
                </Tabs.Panel>
                {isXray && (
                    <Tabs.Panel value="autoselect">
                        {draft.config ? (
                            <AutoselectPanel
                                text={value}
                                baseline={baseline}
                                config={draft.config}
                                hosts={hosts}
                                onChange={setDraft}
                            />
                        ) : (
                            <Alert color="red" title={t('autoselect.invalid-json')}>
                                {t('autoselect.invalid-json-help')}
                            </Alert>
                        )}
                    </Tabs.Panel>
                )}
                <Tabs.Panel value="history">
                    {activeTab === 'history' && (
                        <TemplateHistory
                            uuid={template.uuid}
                            language={editorType}
                            draft={value}
                            baseline={baseline}
                            onRestore={(code) => {
                                setDraft(code)
                                setActiveTab('code')
                            }}
                        />
                    )}
                </Tabs.Panel>
            </Tabs>
            {draft.error && (
                <Alert mt="md" color="red" title={t('autoselect.validation')}>
                    <span dir="ltr">{draft.error}</span>
                    <br />
                    {t('autoselect.validation-help')}
                </Alert>
            )}

            {!isFullscreen && (
                <EditorFooter ref={footerRef}>
                    <FullscreenToggleButton
                        floating={false}
                        isFullscreen={isFullscreen}
                        onToggle={toggleFullscreen}
                        size={36}
                    />

                    <TemplateEditorActionsFeature
                        editorRef={editorRef}
                        editorType={editorType}
                        template={template}
                        getValue={() => valueRef.current}
                        canSave={!draft.error && value.trim().length > 0}
                    />
                </EditorFooter>
            )}
        </Box>
    )
}
