import type { editor } from 'monaco-editor'

import { TemplateEditorActionsFeature } from '@features/dashboard/subscription-templates/template-editor-actions'
import { Alert, Box, Button, Paper, Tabs } from '@mantine/core'
import { Monaco } from '@monaco-editor/react'
import { GetHostsCommand, GetSubscriptionTemplateCommand } from '@remnawave/backend-contract'
import { decode } from '@stablelib/base64'
import clsx from 'clsx'
import { findNodeAtLocation, parseTree } from 'jsonc-parser'
import { Suspense, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowsShuffle, TbCode, TbDatabaseImport, TbHistory } from 'react-icons/tb'

import type { useGetHosts } from '@shared/api/hooks'
import { useGetSubscriptionSettings } from '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks'
import { usePseudoFullscreen, useViewportFillHeight } from '@shared/hooks'
import { useEditorRecovery } from '@shared/hooks/use-editor-recovery'
import { fullscreenClasses, FullscreenToggleButton } from '@shared/ui'
import { CodeEditor, editorClasses, EditorFooter } from '@shared/ui/code-editor'
import { LoaderModalShared } from '@shared/ui/loader-modal/loader-model.shared'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'
import { lazyWithRecovery as lazy } from '@shared/utils/lazy-with-recovery'
import { preventBackScroll } from '@shared/utils/misc'
import { registerHostHoverData } from '@shared/utils/monaco/host-hover'
import { setupSuggestWidget } from '@shared/utils/setup-monaco/setup-suggest-monaco'

import { parseTemplate, poolsOf, templateChanges, validationPath } from './autoselect-model'
import panelStyles from './autoselect-panel.module.css'
import {
    clientValidationPath,
    geofileEditorShapeError,
    readClientTemplate,
    type ClientFormat
} from './client-template-model'
import styles from './SubscriptionTemplateEditor.module.css'
import { TemplateChanges } from './template-changes'
import { configureMonaco, getTemplateModelPath } from './utils/setup-template-monaco'

const AutoselectPanel = lazy(() =>
    import('./autoselect-panel').then((module) => ({ default: module.AutoselectPanel }))
)
const ClientAutoselectPanel = lazy(() =>
    import('./client-autoselect-panel').then((module) => ({
        default: module.ClientAutoselectPanel
    }))
)
const GeofilesPanel = lazy(() =>
    import('./geofiles-panel').then((module) => ({ default: module.GeofilesPanel }))
)
const TemplateHistory = lazy(() =>
    import('./template-history').then((module) => ({ default: module.TemplateHistory }))
)
const EMPTY_HOSTS: GetHostsCommand.Response['response'] = []

interface Props {
    editorType: 'json' | 'yaml'
    hostsQuery: ReturnType<typeof useGetHosts>
    template: GetSubscriptionTemplateCommand.Response['response']
}

function templateSource(template: Props['template'], editorType: Props['editorType']): string {
    if (template.draftContent !== undefined && template.draftContent !== null)
        return template.draftContent
    if (editorType === 'yaml')
        return template.encodedTemplateYaml
            ? new TextDecoder().decode(decode(template.encodedTemplateYaml))
            : ''
    return JSON.stringify(template.templateJson, null, 2)
}

export function SubscriptionTemplateEditorWidget(props: Props) {
    const { editorType, hostsQuery, template } = props
    const hosts = hostsQuery.data ?? EMPTY_HOSTS
    const hostsReady = hostsQuery.data !== undefined
    const hostsFailed = hasPageQueryError([hostsQuery])
    useLayoutEffect(() => registerHostHoverData(hosts), [hosts])
    const { t } = useTranslation()
    const isXray = template.templateType === 'XRAY_JSON'
    const settings = useGetSubscriptionSettings()
    const geofilesEnabled =
        settings.isSuccess &&
        settings.data?.geofilesSystemEnabled === true &&
        settings.data.serveJsonAtBaseSubscription === true &&
        template.geofilesEnabled === true
    const format = template.templateType as ClientFormat
    const [selectedTab, setActiveTab] = useState<string | null>('code')
    const [autoselectOpened, setAutoselectOpened] = useState(false)
    const activeTab = !geofilesEnabled && selectedTab === 'geofiles' ? 'code' : selectedTab

    const { isFullscreen, toggle: toggleFullscreen } = usePseudoFullscreen()
    const { containerRef: editorWrapperRef, footerRef } = useViewportFillHeight({
        enabled: !isFullscreen && activeTab === 'code'
    })

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const monacoRef = useRef<Monaco | null>(null)
    const hostsRef = useRef(hosts)
    const monacoSetupRef = useRef<ReturnType<typeof configureMonaco> | null>(null)
    useLayoutEffect(() => {
        hostsRef.current = hosts
        let cancelled = false
        void monacoSetupRef.current?.then((updateHosts) => {
            if (!cancelled) updateHosts?.(hosts)
        })
        return () => {
            cancelled = true
        }
    }, [hosts])

    const baseline = useMemo(
        () => templateSource(template, editorType),
        [editorType, template.templateJson, template.encodedTemplateYaml, template.draftContent]
    )
    const recovery = useEditorRecovery({ kind: 'template', id: template.uuid, baseline })
    const [value, setValue] = useState(() => baseline)
    const valueRef = useRef(value)
    const setDraft = (next: string) => {
        valueRef.current = next
        setValue(next)
        recovery.track(next)
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
        if ((activeTab !== 'autoselect' && activeTab !== 'geofiles') || baseline === deferredValue)
            return []
        try {
            return templateChanges(
                readClientTemplate(baseline, format),
                readClientTemplate(deferredValue, format)
            )
        } catch {
            return []
        }
    }, [baseline, deferredValue, format, activeTab])

    const handleEditorWillMount = (monaco: Monaco) => {
        monacoSetupRef.current = configureMonaco(
            monaco,
            editorType,
            hostsRef.current,
            template.templateType
        )
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

    const hasSavedDraft = template.draftContent !== undefined && template.draftContent !== null
    const isDisplayedSavedDraft = hasSavedDraft && value === template.draftContent
    const warningPath =
        (isDisplayedSavedDraft ? template.validationWarnings?.[0] : undefined) ?? draft.error
    const isAppliedToleranceWarning =
        !hasSavedDraft &&
        value === baseline &&
        warningPath?.endsWith('.tolerance') &&
        template.validationWarnings?.includes(warningPath)
    const revealIssue = () => {
        setActiveTab('code')
        requestAnimationFrame(() => {
            const model = editorRef.current?.getModel()
            if (!model) return
            const path = (warningPath ?? '')
                .split('.')
                .map((part) => (/^\d+$/.test(part) ? Number(part) : part))
            const tree = parseTree(value)
            const node = tree ? findNodeAtLocation(tree, path) : undefined
            const position = model.getPositionAt(node?.offset ?? 0)
            editorRef.current?.setPosition(position)
            editorRef.current?.revealPositionInCenter(position)
            editorRef.current?.focus()
        })
    }
    const issueLocation =
        /^(remnawave\.injectHosts|routing\.balancers|remnawave\.assignments)\.(\d+)/.exec(
            warningPath ?? ''
        )

    return (
        <Box className={clsx(styles.container, isFullscreen && fullscreenClasses.overlay)}>
            {hostsFailed && <PageQueryError queries={[hostsQuery]} />}
            <Tabs
                value={activeTab}
                onChange={(next) => {
                    if (next !== 'code' && isFullscreen) toggleFullscreen()
                    if (next === 'autoselect') setAutoselectOpened(true)
                    setActiveTab(next)
                }}
                keepMounted
                keepMountedMode="display-none"
            >
                <Tabs.List mb="md" className={styles.tabsList}>
                    <Tabs.Tab value="code" leftSection={<TbCode size={17} />}>
                        {t('autoselect.editing')}
                    </Tabs.Tab>
                    <Tabs.Tab value="autoselect" leftSection={<TbArrowsShuffle size={17} />}>
                        {t('autoselect.title')}
                    </Tabs.Tab>
                    {geofilesEnabled && (
                        <Tabs.Tab value="geofiles" leftSection={<TbDatabaseImport size={17} />}>
                            {t('geofiles.title')}
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
                            value={activeTab === 'code' ? value : deferredValue}
                            onChange={(next) => setDraft(next ?? '')}
                        />
                    </Paper>
                </Tabs.Panel>
                <Tabs.Panel value="autoselect">
                    {autoselectOpened &&
                        (hostsReady ? (
                            <Suspense fallback={<LoaderModalShared />}>
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
                            </Suspense>
                        ) : !hostsFailed ? (
                            <LoaderModalShared />
                        ) : null)}
                </Tabs.Panel>
                <Tabs.Panel value="geofiles">
                    {geofilesEnabled &&
                        activeTab === 'geofiles' &&
                        (hostsReady ? (
                            <Suspense fallback={<LoaderModalShared />}>
                                {draft.config ? (
                                    <div className={panelStyles.layout}>
                                        <div className={panelStyles.main}>
                                            <GeofilesPanel
                                                hosts={hosts}
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
                                )}
                            </Suspense>
                        ) : !hostsFailed ? (
                            <LoaderModalShared />
                        ) : null)}
                </Tabs.Panel>
                <Tabs.Panel value="history">
                    {activeTab === 'history' && (
                        <Suspense fallback={<LoaderModalShared />}>
                            <TemplateHistory
                                uuid={template.uuid}
                                language={editorType}
                                draft={value}
                                baseline={baseline}
                                recovery={recovery}
                                onRestore={(code) => {
                                    setDraft(code)
                                    setActiveTab('code')
                                }}
                            />
                        </Suspense>
                    )}
                </Tabs.Panel>
            </Tabs>
            <Box ref={footerRef} className={styles.controls}>
                {(warningPath || isDisplayedSavedDraft) && (
                    <Alert
                        className={styles.validationMessage}
                        color="yellow"
                        title={t(
                            isDisplayedSavedDraft
                                ? 'template-draft.saved-title'
                                : 'template-draft.warning'
                        )}
                    >
                        {issueLocation && (
                            <Box fw={600} mb={4}>
                                {t(
                                    issueLocation[1] === 'remnawave.injectHosts'
                                        ? 'autoselect.issue-pool'
                                        : issueLocation[1] === 'routing.balancers'
                                          ? 'autoselect.issue-balancer'
                                          : 'autoselect.issue-assignment',
                                    { number: Number(issueLocation[2]) + 1 }
                                )}
                            </Box>
                        )}
                        {warningPath && (
                            <Button
                                variant="subtle"
                                size="compact-sm"
                                onClick={revealIssue}
                                title={t('autoselect.reveal-issue')}
                            >
                                <span dir="ltr">{warningPath}</span>
                            </Button>
                        )}
                        {warningPath && <br />}
                        {t(
                            isDisplayedSavedDraft
                                ? 'template-draft.saved-help'
                                : isAppliedToleranceWarning
                                  ? 'template-draft.applied-warning-help'
                                  : warningPath?.endsWith('.tolerance')
                                    ? 'template-draft.tolerance-help'
                                    : warningPath?.endsWith('.tagPrefix')
                                      ? 'autoselect.prefix-conflict-help'
                                      : 'template-draft.warning-help'
                        )}
                    </Alert>
                )}
                {!isFullscreen && (
                    <EditorFooter className={styles.footer} attached={activeTab === 'code'}>
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
                            onSaved={async (data, submitted) => {
                                const next = templateSource(data, editorType)
                                await recovery.saved(next, submitted).catch(() => {})
                                if (valueRef.current === submitted) {
                                    valueRef.current = next
                                    setValue(next)
                                }
                            }}
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
        </Box>
    )
}
