import { ActionIcon, ActionIconGroup, Group, Tooltip } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { TbCode, TbPlus, TbRefresh } from 'react-icons/tb'
import { useNavigate } from 'react-router'

import { showModal } from '@shared/_modals/show-modal'
import { HelpActionIconShared } from '@shared/_modals/universal'
import { RefreshActionIcon } from '@shared/ui/refresh-control'
import { UniversalSpotlightActionIconShared } from '@shared/ui/universal-spotlight'

interface IProps {
    configProfileCount: number
    isRefreshing: boolean
    onRefresh: () => Promise<unknown>
}

export const ConfigProfilesHeaderActionButtonsFeature = (props: IProps) => {
    const { configProfileCount, isRefreshing, onRefresh } = props
    const { t } = useTranslation()

    const navigate = useNavigate()

    return (
        <Group grow preventGrowOverflow={false} wrap="wrap">
            <HelpActionIconShared hidden={false} screen="PAGE_CONFIG_PROFILES" />

            {configProfileCount > 0 && <UniversalSpotlightActionIconShared />}

            <ActionIconGroup>
                <Tooltip label={t('snippets.drawer.widget.snippets')} withArrow>
                    <ActionIcon
                        aria-label={t('snippets.drawer.widget.snippets')}
                        color="teal"
                        onClick={() => showModal('snippets_snippetsModal')}
                        size="input-md"
                        variant="soft"
                    >
                        <TbCode size="24px" />
                    </ActionIcon>
                </Tooltip>
            </ActionIconGroup>

            <ActionIconGroup>
                <Tooltip label={t('common.action.update')} withArrow>
                    <RefreshActionIcon
                        loading={isRefreshing}
                        onClick={onRefresh}
                        size="input-md"
                        variant="soft"
                    >
                        <TbRefresh size="24px" />
                    </RefreshActionIcon>
                </Tooltip>
            </ActionIconGroup>

            <ActionIconGroup>
                <Tooltip label={t('common.action.create')} withArrow>
                    <ActionIcon
                        aria-label={t('common.action.create')}
                        color="teal"
                        onClick={() =>
                            showModal('createModal', {
                                createFrom: 'configProfile',
                                contentOptions: { navigate }
                            })
                        }
                        size="input-md"
                        variant="soft"
                    >
                        <TbPlus size="24px" />
                    </ActionIcon>
                </Tooltip>
            </ActionIconGroup>
        </Group>
    )
}
