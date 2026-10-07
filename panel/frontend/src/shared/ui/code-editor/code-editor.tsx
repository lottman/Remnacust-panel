import type { editor } from 'monaco-editor'

import { Box, Text, useMantineColorScheme } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import Editor, { EditorProps, OnMount } from '@monaco-editor/react'
import clsx from 'clsx'
import { parse } from 'jsonc-parser'
import { Fragment, ReactNode, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BASE_MONACO_OPTIONS, MONACO_THEME_NAME } from '@shared/constants/monaco-theme'
import { translateUiText as uiText } from '@shared/i18n/interface-text'
import { usePanelReducedMotion } from '@shared/ui/appearance/appearance'
import { describeJsonPath } from '@shared/utils/monaco/json-path'
import { RepairResult, repairJsonInEditor } from '@shared/utils/monaco/repair-json'
import '@shared/utils/setup-monaco/setup-monaco'

import { LoaderModalShared } from '../loader-modal/loader-model.shared'
import styles from './CodeEditor.module.css'

const REPAIR_ACTION_ID = 'remnawave.repairJson'

const RESULT_COLORS: Record<RepairResult, { color: string; message: string }> = {
    failed: {
        color: 'red',
        get message() {
            return uiText('could-not-repair-this-json-45b21e3')
        }
    },
    repaired: {
        color: 'teal',
        get message() {
            return uiText('json-repaired-c6046c7')
        }
    },
    unchanged: {
        color: 'gray',
        get message() {
            return uiText('nothing-to-repair-05924d7')
        }
    }
}

interface Props extends Omit<EditorProps, 'wrapperProps'> {
    footer?: ReactNode
    withJsonPath?: boolean
    wrapperProps?: Record<string, unknown> & { className?: string }
}

export function CodeEditor(props: Props) {
    const { t } = useTranslation()
    const repairLabel = t('common.action.repair-json')
    const { colorScheme } = useMantineColorScheme()
    const reducedMotion = usePanelReducedMotion()
    const {
        defaultLanguage,
        defaultPath,
        footer,
        language,
        onMount,
        options,
        path,
        withJsonPath,
        wrapperProps,
        ...rest
    } = props

    const instanceId = encodeURIComponent(useId())
    const modelPath = path?.replaceAll('*', instanceId)
    const defaultModelPath = defaultPath?.replaceAll('*', instanceId)

    const [jsonPath, setJsonPath] = useState<string[]>([])
    const documentTextRef = useRef('')
    const documentValueRef = useRef<unknown>(undefined)

    const isJson = (language ?? defaultLanguage) === 'json'
    const showJsonPath = withJsonPath ?? isJson

    const syncDocumentSnapshot = (instance: editor.IStandaloneCodeEditor) => {
        const model = instance.getModel()

        if (!model) return

        const text = model.getValue()

        documentTextRef.current = text
        documentValueRef.current = parse(text)
    }

    const updateJsonPath = (instance: editor.IStandaloneCodeEditor) => {
        const model = instance.getModel()
        const [firstVisibleRange] = instance.getVisibleRanges()

        if (!model || !firstVisibleRange) {
            setJsonPath([])
            return
        }

        const topLine = firstVisibleRange.startLineNumber

        const offset = model.getOffsetAt({
            lineNumber: topLine,
            column: model.getLineMaxColumn(topLine)
        })

        const nextPath = describeJsonPath(documentTextRef.current, offset, documentValueRef.current)

        setJsonPath((currentPath) =>
            currentPath.length === nextPath.length &&
            currentPath.every((segment, index) => segment === nextPath[index])
                ? currentPath
                : nextPath
        )
    }

    const handleMount: OnMount = (instance, monaco) => {
        if (isJson) {
            instance.addAction({
                id: REPAIR_ACTION_ID,
                label: repairLabel,
                contextMenuGroupId: '1_modification',
                contextMenuOrder: 1.32,
                run: (target) => {
                    const result = repairJsonInEditor(target as editor.IStandaloneCodeEditor)

                    notifications.show({
                        color: RESULT_COLORS[result].color,
                        message: RESULT_COLORS[result].message,
                        title: repairLabel
                    })
                }
            })
        }

        if (showJsonPath) {
            syncDocumentSnapshot(instance)
            updateJsonPath(instance)

            let scrollFrame: number | undefined
            const scrollListener = instance.onDidScrollChange(() => {
                if (scrollFrame !== undefined) return
                scrollFrame = requestAnimationFrame(() => {
                    scrollFrame = undefined
                    updateJsonPath(instance)
                })
            })
            let snapshotTimer: ReturnType<typeof setTimeout> | undefined
            instance.onDidChangeModelContent(() => {
                clearTimeout(snapshotTimer)
                snapshotTimer = setTimeout(() => {
                    syncDocumentSnapshot(instance)
                    updateJsonPath(instance)
                }, 180)
            })
            instance.onDidDispose(() => {
                clearTimeout(snapshotTimer)
                if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
                scrollListener.dispose()
            })
        }

        onMount?.(instance, monaco)
    }

    return (
        <Box className={styles.root}>
            {showJsonPath && (
                <Box className={styles.pathBar}>
                    <Text c="dimmed" ff="monospace" size="xs" truncate="end">
                        {jsonPath.map((segment, index) => (
                            <Fragment key={`${index}-${segment}`}>
                                {index > 0 && <span className={styles.pathSeparator}> › </span>}
                                <span
                                    className={
                                        index === jsonPath.length - 1
                                            ? styles.pathSegmentActive
                                            : undefined
                                    }
                                >
                                    {segment}
                                </span>
                            </Fragment>
                        ))}
                    </Text>
                </Box>
            )}

            <Editor
                key={modelPath ?? defaultModelPath}
                defaultLanguage={defaultLanguage}
                defaultPath={defaultModelPath}
                language={language}
                path={modelPath}
                loading={<LoaderModalShared mih="100%" />}
                onMount={handleMount}
                theme={colorScheme === 'light' ? 'vs' : MONACO_THEME_NAME}
                {...rest}
                options={{
                    ...BASE_MONACO_OPTIONS,
                    ...options,
                    cursorBlinking: options?.cursorBlinking ?? 'solid',
                    cursorWidth: options?.cursorWidth ?? 2,
                    smoothScrolling: reducedMotion
                        ? false
                        : (options?.smoothScrolling ?? BASE_MONACO_OPTIONS.smoothScrolling)
                }}
                wrapperProps={{
                    ...wrapperProps,
                    className: clsx(styles.editorWrapper, wrapperProps?.className)
                }}
            />

            {footer}
        </Box>
    )
}

export { styles as editorClasses }
