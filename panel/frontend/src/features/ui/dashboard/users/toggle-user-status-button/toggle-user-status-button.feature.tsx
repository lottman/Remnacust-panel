import { Loader, Menu } from '@mantine/core'
import { GetUserByIdCommand, USERS_STATUS } from '@remnawave/backend-contract'
import { useTranslation } from 'react-i18next'
import { PiCellSignalFullDuotone, PiCellSignalSlashDuotone, PiTrashDuotone } from 'react-icons/pi'
import { TbSnowflake } from 'react-icons/tb'

import { queryClient } from '@shared/api'
import { useDisableUser, useEnableUser, useUpdateUser, usersQueryKeys, systemQueryKeys } from '@shared/api/hooks'

interface IProps {
    user: GetUserByIdCommand.Response['response']
}

export function ToggleUserStatusButtonFeature(props: IProps) {
    const { t } = useTranslation()

    const { user } = props
    const { id } = user
    const sync = (data: GetUserByIdCommand.Response['response']) => {
        queryClient.setQueryData(usersQueryKeys.getUserById({ userId: id }).queryKey, data)
        void queryClient.invalidateQueries({ queryKey: usersQueryKeys.getAllUsers._def })
        void queryClient.invalidateQueries({ queryKey: systemQueryKeys.getSystemStats.queryKey })
    }
    const canResume = user.status === USERS_STATUS.DISABLED || user.status === USERS_STATUS.FROZEN
    const { mutate: freezeUser, isPending: isFreezePending } = useUpdateUser({
        mutationFns: { onSuccess: sync }
    })

    const { mutate: disableUser, isPending: isDisableUserPending } = useDisableUser({
        mutationFns: {
            onSuccess: sync
        }
    })

    const { mutate: enableUser, isPending: isEnableUserPending } = useEnableUser({
        mutationFns: {
            onSuccess: sync
        }
    })

    let buttonLabel = ''
    let color = 'blue'
    let icon = <PiTrashDuotone size="16px" />

    if (canResume) {
        color = 'teal'
        buttonLabel = user.status === USERS_STATUS.FROZEN ? t('frozen-user.resume') : t('common.action.enable')
        icon = <PiCellSignalFullDuotone size="16px" />
    } else {
        color = 'var(--mantine-color-yellow-5)'
        buttonLabel = t('common.action.disable')
        icon = <PiCellSignalSlashDuotone size="16px" />
    }

    const handleToggleUserStatus = async () => {
        if (!canResume) {
            disableUser({ route: { userId: id } })
        } else {
            enableUser({ route: { userId: id } })
        }
    }

    return (
        <>
        {user.status !== USERS_STATUS.FROZEN && (
            <Menu.Item color="blue" disabled={isFreezePending}
                leftSection={isFreezePending ? <Loader size="1rem" /> : <TbSnowflake size={16} />}
                onClick={() => freezeUser({ variables: { id, status: USERS_STATUS.FROZEN } })}>
                {t('frozen-user.freeze')}
            </Menu.Item>
        )}
        <Menu.Item
            color={color}
            leftSection={
                isDisableUserPending || isEnableUserPending ? (
                    <Loader color={color} size="1rem" />
                ) : (
                    icon
                )
            }
            onClick={handleToggleUserStatus}
        >
            {buttonLabel}
        </Menu.Item>
        </>
    )
}
