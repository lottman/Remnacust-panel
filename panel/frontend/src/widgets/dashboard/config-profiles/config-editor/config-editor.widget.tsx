import type { editor } from 'monaco-editor'

import { ConfigEditorActionsFeature } from '@features/dashboard/config-profiles/config-editor-actions'
import { ConfigValidationFeature } from '@features/dashboard/config-profiles/config-validation'
import { MonacoSetupFeature } from '@features/dashboard/config-profiles/monaco-setup'
import { Box, Button, Code, Group, Loader, Paper } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMonaco } from '@monaco-editor/react'
import clsx from 'clsx'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbAlertTriangle } from 'react-icons/tb'
import { useBlocker } from 'react-router'

import { usePseudoFullscreen, useViewportFillHeight } from '@shared/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { CodeEditor, editorClasses, EditorFooter, EditorStatusBar } from '@shared/ui/code-editor'
import { FullscreenToggleButton, fullscreenClasses } from '@shared/ui/fullscreen-toggle-button'
import { LoaderModalShared } from '@shared/ui/loader-modal'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { preventBackScroll } from '@shared/utils/misc'

import styles from './ConfigEditor.module.css'
import { IProps } from './interfaces'

export function ConfigEditorWidget(props: IProps) {
    const uiText = useUiText()

    const { t, i18n } = useTranslation()
    const monaco = useMonaco()

    const {
        configProfile,
        isWasmCrashed,
        isWasmLoading,
        isWasmRestarting,
        onRestartWasm,
        snippets,
        restoreDraft
    } = props

    const [result, setResult] = useState('')
    const [isConfigValid, setIsConfigValid] = useState(true)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const configText = useMemo(
        () => JSON.stringify(configProfile.config, null, 2) || '',
        [configProfile.config]
    )
    const [originalValue, setOriginalValue] = useState(configText)

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const validationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const { isFullscreen, toggle: toggleFullscreen } = usePseudoFullscreen()
    const { containerRef: editorWrapperRef, footerRef } = useViewportFillHeight({
        enabled: !isFullscreen
    })

    useEffect(() => {
        if (!monaco) return

        MonacoSetupFeature.setup(i18n.language, snippets.snippets)
    }, [i18n.language, snippets, monaco])

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
    )

    const snippetMap = useMemo(
        () => new Map(snippets.snippets.map((s) => [s.name, s.snippet])),
        [snippets.snippets]
    )

    useEffect(() => {
        if (!isWasmLoading && !isWasmRestarting && !isWasmCrashed && editorRef.current) {
            ConfigValidationFeature.validate(editorRef, setResult, setIsConfigValid, snippetMap)
        }
    }, [isWasmLoading, isWasmRestarting, isWasmCrashed, snippetMap])

    useEffect(
        () => () => {
            if (validationTimer.current) clearTimeout(validationTimer.current)
        },
        []
    )

    const checkForChanges = () => {
        if (!editorRef.current) return

        const currentValue = editorRef.current.getValue()
        const hasChanges = currentValue !== originalValue
        setHasUnsavedChanges(hasChanges)
    }

    const applyRestoreDraft = () => {
        if (!restoreDraft || !editorRef.current) return
        const restored = JSON.stringify(restoreDraft.config, null, 2)
        if (!restored) return
        editorRef.current.setValue(restored)
        setHasUnsavedChanges(restored !== originalValue)
        ConfigValidationFeature.validate(editorRef, setResult, setIsConfigValid, snippetMap)
    }

    useEffect(() => {
        let cancelled = false
        queueMicrotask(() => {
            if (!cancelled) applyRestoreDraft()
        })
        return () => {
            cancelled = true
        }
    }, [restoreDraft])

    useLayoutEffect(() => {
        document.body.addEventListener('wheel', preventBackScroll, {
            passive: false
        })
        return () => {
            document.body.removeEventListener('wheel', preventBackScroll)
        }
    }, [])

    useEffect(() => {
        if (blocker.state === 'blocked') {
            modals.openConfirmModal({
                title: (
                    <BaseOverlayHeader
                        iconColor="red"
                        IconComponent={TbAlertTriangle}
                        iconSize={20}
                        iconVariant="soft"
                        title={t('config-editor.widget.unsaved-changes')}
                    />
                ),
                children: t(
                    'config-editor.widget.your-changes-will-be-lost-if-you-leave-this-page-without-saving'
                ),
                centered: true,
                labels: {
                    confirm: t('config-editor.widget.leave'),
                    cancel: t('config-editor.widget.stay')
                },

                confirmProps: {
                    color: 'red',
                    variant: 'soft'
                },
                cancelProps: {
                    variant: 'light'
                },
                onConfirm: () => {
                    blocker.proceed()
                },
                onCancel: () => {
                    blocker.reset()
                },
                closeOnConfirm: true,
                closeOnCancel: true
            })
        }
    }, [blocker])

    const statusBar = (result || isWasmLoading || isWasmRestarting || isWasmCrashed) && (
        <EditorStatusBar
            status={
                isWasmLoading || isWasmRestarting
                    ? 'warning'
                    : isWasmCrashed || !isConfigValid
                      ? 'error'
                      : 'success'
            }
        >
            {isWasmLoading && !isWasmCrashed && (
                <Group gap="xs">
                    <Loader size="xs" />
                    <Code className={styles.statusCode}>
                        {uiText('xray-validator-is-loading-c1b8f5f')}
                    </Code>
                </Group>
            )}
            {isWasmRestarting && (
                <Group gap="xs">
                    <Loader color="orange" size="xs" />
                    <Code className={styles.statusCode} color="orange">
                        {uiText('xray-core-wasm-is-restarting-a544e56')}
                    </Code>
                </Group>
            )}
            {!isWasmRestarting && isWasmCrashed && (
                <Group gap="sm">
                    <Code className={styles.statusCode} color="red">
                        {uiText('xray-core-wasm-crashed-validation-is-unavailable-32f2d4d')}
                    </Code>
                    <Button color="red" onClick={onRestartWasm} size="compact-xs" variant="light">
                        {t('restart-node-button.feature.restart')}
                    </Button>
                </Group>
            )}
            {!isWasmLoading && !isWasmRestarting && !isWasmCrashed && result}
        </EditorStatusBar>
    )

    return (
        <Box className={clsx(styles.container, isFullscreen && fullscreenClasses.overlay)}>
            <Paper
                className={clsx(
                    styles.editorWrapper,
                    !isFullscreen && editorClasses.editorAttached,
                    isFullscreen && fullscreenClasses.fill
                )}
                p={0}
                pos="relative"
                ref={editorWrapperRef}
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
                    footer={statusBar}
                    className={styles.monacoEditor}
                    defaultLanguage="json"
                    loading={<LoaderModalShared mih="100%" />}
                    onChange={() => {
                        if (validationTimer.current) clearTimeout(validationTimer.current)
                        validationTimer.current = setTimeout(() => {
                            ConfigValidationFeature.validate(
                                editorRef,
                                setResult,
                                setIsConfigValid,
                                snippetMap
                            )
                        }, 350)
                        checkForChanges()
                    }}
                    onMount={(editor) => {
                        editorRef.current = editor
                        applyRestoreDraft()

                        editor.getAction('editor.foldLevel7')?.run()

                        if (!isWasmLoading)
                            ConfigValidationFeature.validate(
                                editorRef,
                                setResult,
                                setIsConfigValid,
                                snippetMap
                            )
                    }}
                    options={{
                        stickyScroll: { enabled: false }
                    }}
                    path="xray-config://*"
                    value={configText}
                />
            </Paper>

            {!isFullscreen && (
                <EditorFooter ref={footerRef}>
                    <FullscreenToggleButton
                        floating={false}
                        isFullscreen={isFullscreen}
                        onToggle={toggleFullscreen}
                        size={36}
                    />

                    <ConfigEditorActionsFeature
                        configProfile={configProfile}
                        editorRef={editorRef}
                        hasUnsavedChanges={hasUnsavedChanges}
                        isConfigValid={isConfigValid}
                        originalValue={originalValue}
                        setHasUnsavedChanges={setHasUnsavedChanges}
                        setIsConfigValid={setIsConfigValid}
                        setOriginalValue={setOriginalValue}
                        setResult={setResult}
                    />
                </EditorFooter>
            )}
        </Box>
    )
}
