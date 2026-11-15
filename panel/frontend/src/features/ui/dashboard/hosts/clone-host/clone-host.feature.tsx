import { ActionIcon, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import { TbCopy } from 'react-icons/tb'

import { hideModal } from '@shared/_modals/show-modal'
import { queryClient } from '@shared/api'
import { QueryKeys, useCloneHost, useGetHost } from '@shared/api/hooks'
import { type HostConfigProfiles, resolveHostInbound } from '@shared/utils/host-inbound'

interface IProps {
    configProfiles: HostConfigProfiles | undefined
    hostUuid: string
}

export function CloneHostFeature(props: IProps) {
    const { configProfiles, hostUuid } = props

    const { t } = useTranslation()

    const { data: host } = useGetHost({
        route: { uuid: hostUuid },
        rQueryParams: { enabled: false }
    })

    const { mutateAsync: cloneHost, isPending: isCloneHostPending } = useCloneHost()
    const hasInbound = Boolean(resolveHostInbound(host?.inbound, configProfiles))

    const handleCloneHost = async () => {
        if (!host) {
            return
        }

        if (!resolveHostInbound(host.inbound, configProfiles)) {
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
        <Tooltip
            events={{ hover: true, focus: true, touch: true }}
            label={t(
                host && !hasInbound
                    ? 'edit-host-modal.widget.dangling-host-cannot-be-cloned'
                    : 'common.action.clone'
            )}
        >
            <span
                aria-label={
                    host && !hasInbound
                        ? t('edit-host-modal.widget.dangling-host-cannot-be-cloned')
                        : undefined
                }
                style={{ display: 'inline-flex' }}
                tabIndex={host && !hasInbound ? 0 : undefined}
            >
                <ActionIcon
                    aria-label={t('common.action.clone')}
                    color="cyan"
                    disabled={!host || !hasInbound}
                    loading={isCloneHostPending}
                    onClick={() => void handleCloneHost()}
                    size="xl"
                    variant="soft"
                >
                    <TbCopy size="24px" />
                </ActionIcon>
            </span>
        </Tooltip>
    )
}
