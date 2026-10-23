import type { editor } from 'monaco-editor'

import { ActionIcon, Button, Group, Menu } from '@mantine/core'
import { useClipboard, useDisclosure } from '@mantine/hooks'
import { GetSubscriptionTemplateCommand } from '@remnawave/backend-contract'
import { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { PiCheckSquareOffset, PiFloppyDisk } from 'react-icons/pi'
import {
    TbClipboardCopy,
    TbClipboardText,
    TbCut,
    TbDownload,
    TbMenuDeep,
    TbSelectAll
} from 'react-icons/tb'

import { queryClient } from '@shared/api'
import { QueryKeys, useUpdateSubscriptionTemplate } from '@shared/api/hooks'
import { useIsMobile } from '@shared/hooks'
import { useDownloadTemplate } from '@shared/ui/load-templates/use-download-template'

import classes from './template-editor-actions.module.css'

interface Props {
    editorRef: RefObject<editor.IStandaloneCodeEditor | null>
    editorType: 'json' | 'yaml'
    template: GetSubscriptionTemplateCommand.Response['response']
    getValue?: () => string
    showEditorTools?: boolean
}

export function TemplateEditorActionsFeature(props: Props) {
    const { editorRef, template, getValue, showEditorTools = true } = props
    const { t } = useTranslation()

    const isMobile = useIsMobile()
    const clipboard = useClipboard({ timeout: 500 })
    const [opened, handlers] = useDisclosure(false)

    const { mutate: updateConfig, isPending: isUpdating } = useUpdateSubscriptionTemplate({
        mutationFns: {
            onSuccess: (data) => {
                queryClient.setQueryData(
                    QueryKeys.subscriptionTemplate.getSubscriptionTemplate({ uuid: template.uuid })
                        .queryKey,
                    data
                )
                void queryClient.invalidateQueries({
                    queryKey: QueryKeys.subscriptionTemplate.getSubscriptionTemplates.queryKey
                })
                void queryClient.invalidateQueries({
                    queryKey: ['subscription-template-revisions', template.uuid]
                })
            }
        }
    })

    const { openDownloadModal } = useDownloadTemplate({
        editorType: 'SUBSCRIPTION',
        templateType: template.templateType,
        editorRef
    })

    const handleSave = () => {
        const currentValue = getValue?.() ?? editorRef.current?.getValue() ?? ''
        updateConfig({ variables: { uuid: template.uuid, draftContent: currentValue } })
    }

    const handleCopyConfig = () => {
        const currentValue = getValue?.() ?? editorRef.current?.getValue()
        if (currentValue) clipboard.copy(currentValue)
    }

    const formatDocument = () => {
        if (!editorRef.current) return

        editorRef.current.getAction('editor.action.formatDocument')?.run()
    }

    const handleSelectAll = () => {
        if (!editorRef.current) return

        const model = editorRef.current.getModel()
        if (!model) return

        editorRef.current.setSelection({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: model.getLineCount(),
            endColumn: model.getLineMaxColumn(model.getLineCount())
        })
    }

    const handleCut = () => {
        if (!editorRef.current) return

        const selection = editorRef.current.getSelection()
        const model = editorRef.current.getModel()
        if (!selection || !model) return

        const selectedText = model.getValueInRange(selection)
        clipboard.copy(selectedText)

        editorRef.current.executeEdits('', [{ range: selection, text: '' }])
    }

    const handlePaste = () => {
        if (!editorRef.current) return

        const position = editorRef.current.getPosition()
        if (!position) return

        navigator.clipboard.readText().then((text) => {
            if (!editorRef.current) return
            editorRef.current.executeEdits('', [
                {
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    },
                    text
                }
            ])
        })
    }

    return (
        <Group grow={isMobile} preventGrowOverflow={false} wrap="wrap">
            <Button
                color="teal"
                leftSection={<PiFloppyDisk size={16} />}
                loading={isUpdating}
                onClick={handleSave}
                variant="soft"
            >
                {t('common.action.save')}
            </Button>

            {showEditorTools && (
                <Group gap={0} wrap="nowrap">
                    <Menu
                        onClose={() => handlers.close()}
                        onOpen={() => handlers.open()}
                        shadow="md"
                        trigger="click-hover"
                        withinPortal
                    >
                        <Menu.Target>
                            <ActionIcon
                                className={classes.actionIconLeft}
                                size={36}
                                variant={opened ? 'outline' : 'default'}
                            >
                                <TbMenuDeep size={20} />
                            </ActionIcon>
                        </Menu.Target>

                        <Menu.Dropdown>
                            <Menu.Item
                                color={clipboard.copied ? 'teal' : undefined}
                                leftSection={<TbClipboardCopy size={14} />}
                                onClick={handleCopyConfig}
                            >
                                {t('config-editor-actions.feature.copy-all-content')}
                            </Menu.Item>

                            <Menu.Item
                                leftSection={<TbSelectAll size={14} />}
                                onClick={handleSelectAll}
                            >
                                {t('common.action.select-all')}
                            </Menu.Item>

                            <Menu.Item leftSection={<TbCut size={14} />} onClick={handleCut}>
                                {t('config-editor-actions.feature.cut-selection')}
                            </Menu.Item>

                            <Menu.Item
                                leftSection={<TbClipboardText size={14} />}
                                onClick={handlePaste}
                            >
                                {t('config-editor-actions.feature.paste-from-clipboard')}
                            </Menu.Item>

                            <Menu.Divider />

                            <Menu.Item
                                leftSection={<TbDownload size={14} />}
                                onClick={openDownloadModal}
                            >
                                {t('common.action.load-from-github')}
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>

                    <Button
                        className={classes.centeredButton}
                        leftSection={<PiCheckSquareOffset size={16} />}
                        onClick={formatDocument}
                        variant="default"
                    >
                        {t('config-editor-actions.feature.format')}
                    </Button>
                </Group>
            )}
        </Group>
    )
}
