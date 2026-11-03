import { DataTableColumn } from '@kastov/mantine-datatable'
import { ActionIcon, Group, Text } from '@mantine/core'
import { GetTopUsersByHwidDevicesCommand } from '@remnawave/backend-contract'
import { TFunction } from 'i18next'
import { PiUserCircle } from 'react-icons/pi'
import { TbSum, TbUser } from 'react-icons/tb'

export function getHwidInspectorLeaderboardColumns(
    t: TFunction,
    handleViewUser: (userId: number) => void
): DataTableColumn<GetTopUsersByHwidDevicesCommand.Response['response']['users'][number]>[] {
    return [
        {
            accessor: 'actions',
            draggable: false,

            titleStyle: {
                backgroundColor: 'var(--panel-surface, var(--mantine-color-body))',
                width: 56,
                minWidth: 56,
                maxWidth: 56
            },
            cellsStyle: () => {
                return {
                    backgroundColor: 'var(--panel-surface, var(--mantine-color-body))',
                    width: 56,
                    minWidth: 56,
                    maxWidth: 56
                }
            },
            title: (
                <Group c="dimmed" gap={4} justify="center" wrap="nowrap">
                    <TbUser size={18} />
                </Group>
            ),
            width: 56,
            textAlign: 'center',
            render: ({ id }) => (
                <Group gap={4} justify="center" wrap="nowrap">
                    <ActionIcon onClick={() => handleViewUser(id)} size="input-sm" variant="soft">
                        <PiUserCircle size="1.5rem" />
                    </ActionIcon>
                </Group>
            )
        },
        {
            accessor: 'username',
            title: t('common.field.username'),
            render: ({ username }) => username
        },
        {
            accessor: 'id',
            title: 'ID',
            width: 80,
            render: ({ id }) => id
        },
        {
            accessor: 'devicesCount',
            width: 80,
            title: <TbSum size={18} />,
            render: ({ devicesCount }) => (
                <Text c="white" fw={600} size="sm">
                    {devicesCount}
                </Text>
            )
        }
    ]
}
