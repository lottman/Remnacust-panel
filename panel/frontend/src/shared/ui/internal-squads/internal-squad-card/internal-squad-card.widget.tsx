import { ActionIcon, Badge, Card, Drawer, Group, Text, Tooltip } from '@mantine/core'
import { ImportUsersModalWidget } from '@widgets/dashboard/users/users-import/import-users.widget'
import { memo, useState } from 'react'
import { PiTag, PiUsers } from 'react-icons/pi'
import { TbCirclesRelation, TbDownload, TbUpload } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { instance } from '@shared/api/axios'
import { translateUiText as uiText } from '@shared/i18n/interface-text'
import { formatInt } from '@shared/utils/misc'

import classes from './Checkbox.module.css'
import { IProps } from './interfaces'

export const InternalSquadCardShared = memo((props: IProps) => {
    const { internalSquad } = props
    const [importOpened, setImportOpened] = useState(false)

    const handleOpenEditModal = (squadUuid: string) => {
        showModal('internalSquads_internalSquadsInboundsDrawer', {
            squadUuid
        })
    }

    const handleExportSquadUsers = async (squadUuid: string, squadName: string) => {
        const response = await instance.get('/users/export', {
            params: { squadUuid }
        })
        const payload = response.data?.response ?? response.data
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `squad-${squadName}-users-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)
    }

    if (!internalSquad) {
        return null
    }

    return (
        <Card
            className={classes.compactRoot}
            key={internalSquad.uuid}
            onClick={() => handleOpenEditModal(internalSquad.uuid)}
        >
            <Drawer
                onClose={() => setImportOpened(false)}
                opened={importOpened}
                position="right"
                size="md"
                title={
                    <Group gap="xs">
                        <TbUpload size={16} />
                        <Text fw={600}>
                            {uiText('message-324c53a')}
                            {internalSquad.name}»
                        </Text>
                    </Group>
                }
            >
                <ImportUsersModalWidget
                    defaultSquadUuid={internalSquad.uuid}
                    lockedSquad
                    onFinished={() => setImportOpened(false)}
                />
            </Drawer>
            <Group align="center" gap="xs" justify="space-between" wrap="nowrap">
                <Group align="center" gap="xs" style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
                    <TbCirclesRelation size={20} />
                    <Text className={classes.compactLabel} size="xs" truncate>
                        {internalSquad.name}
                    </Text>
                </Group>

                <Group gap="xs" wrap="nowrap">
                    <Tooltip label={uiText('message-7e4abe1')}>
                        <ActionIcon
                            color="indigo"
                            onClick={(event) => {
                                event.stopPropagation()
                                void handleExportSquadUsers(internalSquad.uuid, internalSquad.name)
                            }}
                            size="input-sm"
                            variant="soft"
                        >
                            <TbDownload size={16} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label={uiText('message-0268a2c')}>
                        <ActionIcon
                            color="yellow"
                            onClick={(event) => {
                                event.stopPropagation()
                                setImportOpened(true)
                            }}
                            size="input-sm"
                            variant="soft"
                        >
                            <TbUpload size={16} />
                        </ActionIcon>
                    </Tooltip>
                    <Badge
                        color="teal"
                        leftSection={<PiUsers size="16" />}
                        size="md"
                        variant="light"
                        visibleFrom="sm"
                    >
                        {formatInt(internalSquad.info.membersCount, {
                            thousandSeparator: ','
                        })}{' '}
                    </Badge>
                    <Badge color="blue" leftSection={<PiTag size="16" />} size="md" variant="light">
                        {internalSquad.info.inboundsCount}
                    </Badge>
                </Group>
            </Group>
        </Card>
    )
})
