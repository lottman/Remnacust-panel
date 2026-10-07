import { ActionIcon, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import { TbCopy } from 'react-icons/tb'

import { hideModal } from '@shared/_modals/show-modal'
import { queryClient } from '@shared/api'
import { QueryKeys, useCloneHost, useGetHost } from '@shared/api/hooks'

interface IProps {
    hostUuid: string
}

export function CloneHostFeature(props: IProps) {
    const { hostUuid } = props

    const { t } = useTranslation()

    const { data: host } = useGetHost({
        route: { uuid: hostUuid },
        rQueryParams: { enabled: false }
    })

    const { mutateAsync: cloneHost, isPending: isCloneHostPending } = useCloneHost()

    const handleCloneHost = async () => {
        if (!host) {
            return
        }

        if (!host.inbound.configProfileUuid || !host.inbound.configProfileInboundUuid) {
            notifications.show({
                title: t('common.message.error'),
                message: t('edit-host-modal.widget.dangling-host-cannot-be-cloned'),
                color: 'red'
            })

            return
        }

        try {
            await cloneHost({ variables: { cloneFromUuid: host.uuid } })
            hideModal('hosts_editHostDrawer')
            void queryClient.refetchQueries({ queryKey: QueryKeys.hosts.getAllHosts.queryKey })
        } catch {
            // The mutation hook displays the request error; keep the editor open.
        }
    }

    return (
        <Tooltip label={t('common.action.clone')}>
            <ActionIcon
                color="cyan"
                disabled={!host}
                loading={isCloneHostPending}
                onClick={() => void handleCloneHost()}
                size="xl"
                variant="soft"
            >
                <TbCopy size="24px" />
            </ActionIcon>
        </Tooltip>
    )
}
