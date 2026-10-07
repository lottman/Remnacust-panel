import { Badge, CopyButton, Drawer, Group, Menu, Text, Tooltip } from '@mantine/core'
import { GetInternalSquadsCommand } from '@remnawave/backend-contract'
import { ImportUsersModalWidget } from '@widgets/dashboard/users/users-import/import-users.widget'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiCheck, PiCopy, PiPencil, PiTag, PiTrashDuotone, PiUsers } from 'react-icons/pi'
import {
    TbChartArcs,
    TbCirclesRelation,
    TbDownload,
    TbServerCog,
    TbTags,
    TbUpload
} from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { instance } from '@shared/api/axios'
import { WithDndSortable } from '@shared/hocs/with-dnd-sortable'
import { useUiText } from '@shared/i18n/interface-text'
import { EntityCardShared } from '@shared/ui/entity-card'
import { formatInt } from '@shared/utils/misc'

interface IProps {
    disableReordering?: boolean
    handleDeleteInternalSquad: (internalSquadUuid: string, internalSquadName: string) => void
    internalSquad: GetInternalSquadsCommand.Response['response']['internalSquads'][number]
    isDragOverlay?: boolean
}

export function InternalSquadCardWidget(props: IProps) {
    const uiText = useUiText()

    const {
        disableReordering = false,
        handleDeleteInternalSquad,
        internalSquad,
        isDragOverlay = false
    } = props

    const { t } = useTranslation()
    const [importOpened, setImportOpened] = useState(false)

    const handleExportSquadUsers = async () => {
        const response = await instance.get('/users/export', {
            params: { squadUuid: internalSquad.uuid }
        })
        const payload = response.data?.response ?? response.data
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `squad-${internalSquad.name}-users-${new Date()
            .toISOString()
            .slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)
    }

    const { membersCount } = internalSquad.info
    const { inboundsCount } = internalSquad.info
    const isActive = membersCount > 0

    const handleOpenInbounds = () => {
        showModal('internalSquads_internalSquadsInboundsDrawer', {
            squadUuid: internalSquad.uuid
        })
    }

    return (
        <>
            <Drawer
                onClose={() => setImportOpened(false)}
                opened={importOpened}
                position="right"
                size="md"
                title={
                    <Group gap="xs">
                        <TbUpload size={16} />
                        <Text fw={600}>
                            {uiText('import-users-to-value-65bb3a8', {
                                value1: internalSquad.name
                            })}
                        </Text>
                    </Group>
                }
            >
                <ImportUsersModalWidget defaultSquadUuid={internalSquad.uuid} lockedSquad />
            </Drawer>
            <WithDndSortable
                disableReordering={disableReordering}
                dragHandlePosition="inline-end"
                id={internalSquad.uuid}
                isDragOverlay={isDragOverlay}
            >
                <EntityCardShared.Root isActive={isActive} onClick={handleOpenInbounds}>
                    <EntityCardShared.Header>
                        <EntityCardShared.Icon highlight={isActive}>
                            <TbCirclesRelation size={22} />
                        </EntityCardShared.Icon>
                        <EntityCardShared.Content
                            tags={internalSquad.tags}
                            badges={
                                <Group gap="xs" wrap="nowrap">
                                    <Tooltip label={t('common.field.inbounds')}>
                                        <Badge
                                            color="blue"
                                            leftSection={<PiTag size={12} />}
                                            size="lg"
                                            variant="soft"
                                        >
                                            {formatInt(inboundsCount, {
                                                thousandSeparator: ','
                                            })}
                                        </Badge>
                                    </Tooltip>

                                    <Tooltip label={t('internal-squads-grid.widget.users')}>
                                        <Badge
                                            color={isActive ? 'teal' : 'gray'}
                                            leftSection={<PiUsers size={12} />}
                                            size="lg"
                                            variant="soft"
                                        >
                                            {formatInt(membersCount, {
                                                thousandSeparator: ','
                                            })}
                                        </Badge>
                                    </Tooltip>
                                </Group>
                            }
                            title={internalSquad.name}
                        />
                    </EntityCardShared.Header>

                    <EntityCardShared.Actions>
                        <EntityCardShared.Menu>
                            <Menu.Item
                                color="indigo"
                                leftSection={<TbDownload size={18} />}
                                onClick={() => void handleExportSquadUsers()}
                            >
                                {uiText('export-squad-users-file-0a3a333')}
                            </Menu.Item>
                            <Menu.Item
                                color="yellow"
                                leftSection={<TbUpload size={18} />}
                                onClick={() => setImportOpened(true)}
                            >
                                {uiText('import-users-from-file-514dd40')}
                            </Menu.Item>

                            <Menu.Item
                                leftSection={<TbServerCog size={18} />}
                                onClick={() =>
                                    showModal('internalSquads_internalSquadAccessibleNodesDrawer', {
                                        uuid: internalSquad.uuid
                                    })
                                }
                            >
                                {t('internal-squad-card.widget.available-nodes')}
                            </Menu.Item>

                            <Menu.Item
                                leftSection={<TbChartArcs size={18} />}
                                onClick={() =>
                                    showModal('internalSquads_internalSquadsUsageDrawer', {
                                        squadUuid: internalSquad.uuid
                                    })
                                }
                            >
                                {t('common.field.usage-stats')}
                            </Menu.Item>

                            <CopyButton timeout={2000} value={internalSquad.uuid}>
                                {({ copied, copy }) => (
                                    <Menu.Item
                                        color={copied ? 'teal' : undefined}
                                        leftSection={
                                            copied ? <PiCheck size={18} /> : <PiCopy size={18} />
                                        }
                                        onClick={copy}
                                    >
                                        {t('common.action.copy-uuid')}
                                    </Menu.Item>
                                )}
                            </CopyButton>

                            <Menu.Item
                                leftSection={<PiPencil size={18} />}
                                onClick={() =>
                                    showModal('renameModal', {
                                        renameFrom: 'internalSquad',
                                        name: internalSquad.name,
                                        uuid: internalSquad.uuid
                                    })
                                }
                            >
                                {t('common.action.rename')}
                            </Menu.Item>

                            <Menu.Item
                                leftSection={<TbTags size={18} />}

                                onClick={() => {
                                    showModal('editTagsModal', {
                                        editTagsFrom: 'internalSquad',

                                        tags: internalSquad.tags,

                                        uuid: internalSquad.uuid
                                    })
                                }}
                            >
                                {t('common.field.tags')}
                            </Menu.Item>

                            <Menu.Item
                                color="red"
                                leftSection={<PiTrashDuotone size={18} />}
                                onClick={() =>
                                    handleDeleteInternalSquad(
                                        internalSquad.uuid,
                                        internalSquad.name
                                    )
                                }
                            >
                                {t('internal-squads-grid.widget.delete-squad')}
                            </Menu.Item>
                        </EntityCardShared.Menu>
                    </EntityCardShared.Actions>
                </EntityCardShared.Root>
            </WithDndSortable>
        </>
    )
}
