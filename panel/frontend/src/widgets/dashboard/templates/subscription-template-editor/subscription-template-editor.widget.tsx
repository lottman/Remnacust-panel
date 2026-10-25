import type { editor } from 'monaco-editor'

import { TemplateEditorActionsFeature } from '@features/dashboard/subscription-templates/template-editor-actions'
import { Alert, Box, Button, Paper, Tabs } from '@mantine/core'
import { Monaco } from '@monaco-editor/react'
import 'monaco-yaml/yaml.worker.js'
import { GetHostsCommand, GetSubscriptionTemplateCommand } from '@remnawave/backend-contract'
import { decode } from '@stablelib/base64'
import clsx from 'clsx'
import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowsShuffle, TbCode, TbDatabaseImport, TbHistory } from 'react-icons/tb'

import { usePseudoFullscreen, useViewportFillHeight } from '@shared/hooks'
import { fullscreenClasses, FullscreenToggleButton } from '@shared/ui'
import { CodeEditor, editorClasses, EditorFooter } from '@shared/ui/code-editor'
import { preventBackScroll } from '@shared/utils/misc'
import { setupSuggestWidget } from '@shared/utils/setup-monaco/setup-suggest-monaco'

import { parseTemplate, poolsOf, templateChanges, validationPath } from './autoselect-model'
import { AutoselectPanel } from './autoselect-panel'
import panelStyles from './autoselect-panel.module.css'
import { ClientAutoselectPanel } from './client-autoselect-panel'
import {
    clientValidationPath,
    geofileEditorShapeError,
    readClientTemplate,
    type ClientFormat
} from './client-template-model'
import { GeofilesPanel } from './geofiles-panel'
import { StableEntryPanel } from './stable-entry-panel'
import styles from './SubscriptionTemplateEditor.module.css'
import { TemplateAssignmentPanel } from './template-assignment-panel'
import { TemplateChanges } from './template-changes'
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
    const format = template.templateType as ClientFormat
    const [activeTab, setActiveTab] = useState<string | null>('code')

    const { isFullscreen, toggle: toggleFullscreen } = usePseudoFullscreen()
    const { containerRef: editorWrapperRef, footerRef } = useViewportFillHeight({
        enabled: !isFullscreen && activeTab === 'code'
    })

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const monacoRef = useRef<Monaco | null>(null)

    const baseline = useMemo(() => {
        if (template.draftContent !== undefined && template.draftContent !== null)
            return template.draftContent
        if (editorType === 'yaml') {
            return template.encodedTemplateYaml
                ? new TextDecoder().decode(decode(template.encodedTemplateYaml))
                : ''
        }
        return JSON.stringify(template.templateJson, null, 2)
    }, [editorType, template.templateJson, template.encodedTemplateYaml, template.draftContent])
    const [value, setValue] = useState(() => baseline)
    const valueRef = useRef(value)
    const setDraft = (next: string) => {
        valueRef.current = next
        setValue(next)
    }
    const draft = useMemo(() => {
        try {
            const config = isXray ? parseTemplate(value) : readClientTemplate(value, format)
            const shapeError = geofileEditorShapeError(config)
            if (shapeError) return { config: null, error: shapeError }
            if (isXray) poolsOf(config)
            return {
                config,
                error:
                    (isXray ? validationPath(config) : null) ?? clientValidationPath(config, format)
            }
        } catch {
            return { config: null, error: editorType === 'yaml' ? 'YAML' : 'JSON' }
        }
    }, [value, format, isXray, editorType])
    const deferredValue = useDeferredValue(value)
    const changes = useMemo(() => {
        try {
            return templateChanges(
                readClientTemplate(baseline, format),
                readClientTemplate(deferredValue, format)
            )
        } catch {
            return []
        }
    }, [baseline, deferredValue, format])

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
                    <Tabs.Tab value="autoselect" leftSection={<TbArrowsShuffle size={17} />}>
                        {t('autoselect.title')}
                    </Tabs.Tab>
                    <Tabs.Tab value="geofiles" leftSection={<TbDatabaseImport size={17} />}>
                        {t('geofiles.title')}
                    </Tabs.Tab>
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
                <Tabs.Panel value="autoselect">
                    {activeTab === 'autoselect' && <StableEntryPanel hosts={hosts} />}
                    {isXray && draft.config && (
                        <TemplateAssignmentPanel
                            text={value}
                            config={draft.config}
                            hosts={hosts}
                            onChange={setDraft}
                        />
                    )}
                    {draft.config ? (
                        isXray ? (
                            <AutoselectPanel
                                text={value}
                                baseline={baseline}
                                config={draft.config}
                                hosts={hosts}
                                onChange={setDraft}
                            />
                        ) : (
                            <div className={panelStyles.layout}>
                                <div className={panelStyles.main}>
                                    <ClientAutoselectPanel
                                        text={value}
                                        config={draft.config}
                                        format={format}
                                        hosts={hosts}
                                        onChange={setDraft}
                                    />
                                </div>
                                <TemplateChanges changes={changes} />
                            </div>
                        )
                    ) : (
                        <Alert color="red" title={t('autoselect.validation')}>
                            {t('client-template.invalid-help')}
                        </Alert>
                    )}
                </Tabs.Panel>
                <Tabs.Panel value="geofiles">
                    {activeTab === 'geofiles' &&
                        (draft.config ? (
                            <div className={panelStyles.layout}>
                                <div className={panelStyles.main}>
                                    <GeofilesPanel
                                        text={value}
                                        config={draft.config}
                                        format={format}
                                        onChange={setDraft}
                                        getValue={() => valueRef.current}
                                    />
                                </div>
                                <TemplateChanges changes={changes} />
                            </div>
                        ) : (
                            <Alert color="red">{t('client-template.invalid-help')}</Alert>
                        ))}
                </Tabs.Panel>
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
                <Alert mt="md" color="yellow" title={t('template-draft.warning')}>
                    <span dir="ltr">{draft.error}</span>
                    <br />
                    {t(
                        draft.error.endsWith('.tolerance')
                            ? 'template-draft.tolerance-help'
                            : 'template-draft.warning-help'
                    )}
                </Alert>
            )}
            {template.draftContent !== undefined && template.draftContent !== null && (
                <Alert mt="md" color="yellow" title={t('template-draft.saved-title')}>
                    {t('template-draft.saved-help')}
                </Alert>
            )}

            {!isFullscreen && (
                <EditorFooter ref={footerRef} attached={activeTab === 'code'}>
                    {activeTab === 'code' && (
                        <FullscreenToggleButton
                            floating={false}
                            isFullscreen={isFullscreen}
                            onToggle={toggleFullscreen}
                            size={36}
                        />
                    )}

                    <TemplateEditorActionsFeature
                        editorRef={editorRef}
                        editorType={editorType}
                        template={template}
                        getValue={() => valueRef.current}
                        showEditorTools={activeTab === 'code'}
                    />
                    {activeTab !== 'code' && (
                        <Button
                            variant="default"
                            disabled={value === baseline}
                            onClick={() => setDraft(baseline)}
                        >
                            {t('client-template.reset-draft')}
                        </Button>
                    )}
                </EditorFooter>
            )}
        </Box>
    )
}
