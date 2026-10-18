import { ActionIcon, ActionIconGroup, Group, Tabs, Tooltip } from '@mantine/core'
import { GetConfigProfileByUuidCommand, GetSnippetsCommand } from '@remnawave/backend-contract'
import { ConfigEditorWidget } from '@widgets/dashboard/config-profiles/config-editor/config-editor.widget'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowBackUp, TbCode, TbFile, TbHistory, TbSitemap } from 'react-icons/tb'
import { useNavigate } from 'react-router'

import { showModal } from '@shared/_modals/show-modal'
import { HelpActionIconShared } from '@shared/_modals/universal'
import { OPEN_ENTITY, ROUTES } from '@shared/constants'
import { useUiText } from '@shared/i18n/interface-text'
import { CopyEntityLinkButton } from '@shared/ui'
import { Page } from '@shared/ui/page'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'

import { ProfileHistory } from './profile-history'

interface Props {
    configProfile: GetConfigProfileByUuidCommand.Response['response']
    isWasmCrashed: boolean
    isWasmLoading: boolean
    isWasmRestarting: boolean
    onRestartWasm: () => void
    snippets: GetSnippetsCommand.Response['response']
}

export const ConfigProfileByUuidPageComponent = (props: Props) => {
    const uiText = useUiText()

    const {
        configProfile,
        isWasmCrashed,
        isWasmLoading,
        isWasmRestarting,
        onRestartWasm,
        snippets
    } = props

    const { t } = useTranslation()
    const navigate = useNavigate()
    const [tab, setTab] = useState<string | null>('editor')
    const [restoreDraft, setRestoreDraft] = useState<{
        uuid: string
        config: unknown
        profileUuid: string
    } | null>(null)
    const draftRef = useRef<{ uuid: string; code: string } | null>(null)
    const [historyDraft, setHistoryDraft] = useState<{ uuid: string; code: string } | null>(null)
    const onDraftChange = useCallback(
        (code: string) => {
            draftRef.current = { uuid: configProfile.uuid, code }
        },
        [configProfile.uuid]
    )

    return (
        <>
            <Page title={t('constants.config-profiles')}>
                <PageHeaderShared
                    actions={
                        <Group>
                            <CopyEntityLinkButton
                                entity={OPEN_ENTITY.CONFIG_PROFILE}
                                iconSize={24}
                                id={configProfile.uuid}
                                size="input-md"
                                variant="soft"
                            />

                            <HelpActionIconShared hidden={false} screen="PAGE_CONFIG_PROFILES" />

                            <ActionIconGroup>
                                <Tooltip label={t('snippets.drawer.widget.snippets')} withArrow>
                                    <ActionIcon
                                        color="teal"
                                        onClick={() => showModal('snippets_snippetsModal')}
                                        size="input-md"
                                        variant="soft"
                                    >
                                        <TbCode size="24px" />
                                    </ActionIcon>
                                </Tooltip>
                            </ActionIconGroup>

                            <ActionIcon
                                color="gray"
                                onClick={() =>
                                    navigate(ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILES)
                                }
                                size="input-md"
                                variant="soft"
                            >
                                <TbArrowBackUp size={24} />
                            </ActionIcon>
                        </Group>
                    }
                    description={configProfile.uuid}
                    icon={<TbFile size={24} />}
                    title={configProfile.name}
                />

                <Tabs
                    onChange={(value) => {
                        if (value === 'canvas-link') {
                            navigate(
                                ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILE_CANVAS.replace(
                                    ':uuid',
                                    configProfile.uuid
                                )
                            )
                            return
                        }
                        if (value === 'history') {
                            setHistoryDraft({
                                uuid: configProfile.uuid,
                                code:
                                    draftRef.current?.uuid === configProfile.uuid
                                        ? draftRef.current.code
                                        : (JSON.stringify(configProfile.config, null, 2) ?? '')
                            })
                        }
                        setTab(value)
                    }}
                    value={tab}
                >
                    <Tabs.List mb="md">
                        <Tabs.Tab leftSection={<TbCode size={16} />} value="editor">
                            {uiText('configuration-b332c34')}
                        </Tabs.Tab>
                        <Tabs.Tab leftSection={<TbSitemap size={16} />} value="canvas-link">
                            {uiText('canvas-3824a9f')}
                        </Tabs.Tab>
                        <Tabs.Tab leftSection={<TbHistory size={16} />} value="history">
                            {uiText('history-0e76960')}
                        </Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="editor">
                        <ConfigEditorWidget
                            key={configProfile.uuid}
                            configProfile={configProfile}
                            isWasmCrashed={isWasmCrashed}
                            isWasmLoading={isWasmLoading}
                            isWasmRestarting={isWasmRestarting}
                            onRestartWasm={onRestartWasm}
                            snippets={snippets}
                            restoreDraft={
                                restoreDraft?.profileUuid === configProfile.uuid
                                    ? restoreDraft
                                    : null
                            }
                            onDraftChange={onDraftChange}
                        />
                    </Tabs.Panel>
                    <Tabs.Panel value="history">
                        {tab === 'history' && (
                            <ProfileHistory
                                profileUuid={configProfile.uuid}
                                draft={
                                    historyDraft?.uuid === configProfile.uuid
                                        ? historyDraft.code
                                        : (JSON.stringify(configProfile.config, null, 2) ?? '')
                                }
                                baseline={JSON.stringify(configProfile.config, null, 2) ?? ''}
                                onRestore={(revision) => {
                                    setRestoreDraft({
                                        ...revision,
                                        profileUuid: configProfile.uuid
                                    })
                                    setTab('editor')
                                }}
                            />
                        )}
                    </Tabs.Panel>
                </Tabs>
            </Page>
        </>
    )
}
