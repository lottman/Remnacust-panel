import type { NodeUpgradeRequest } from './node-upgrade.types'

import { Alert, Group, Loader, Text } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { nodesQueryKeys } from '@shared/api/hooks/nodes/nodes.query.hooks'
import { useUiText } from '@shared/i18n/interface-text'

import { useSshStatuses, useSshTabsActions } from './tabs/ssh-tabs.store'

export function NodeUpgradePanel({
    request,
    nodeUuid,
    enabled
}: {
    request: NodeUpgradeRequest
    nodeUuid: string
    enabled: boolean
}) {
    const uiText = useUiText()

    const statuses = useSshStatuses()
    const actions = useSshTabsActions()
    const client = useQueryClient()
    const sent = useRef(false)
    const [sendError, setSendError] = useState(false)
    const session = statuses[nodeUuid]
    const update = session?.nodeUpgrade?.id === request.id ? session.nodeUpgrade : undefined
    useEffect(() => {
        if (!enabled || sent.current || !session?.isConnected) return
        const handle = actions.getHandle(nodeUuid)
        if (!handle) return
        sent.current = true
        void Promise.resolve()
            .then(() => handle.upgradeNode(request))
            .catch(() => setSendError(true))
    }, [actions, enabled, nodeUuid, request, session])
    useEffect(() => {
        if (update?.status === 'succeeded') {
            void client.invalidateQueries({
                queryKey: nodesQueryKeys.getNode({ uuid: nodeUuid }).queryKey
            })
            void client.invalidateQueries({ queryKey: nodesQueryKeys.getAllNodes.queryKey })
        }
    }, [client, nodeUuid, update?.status])
    const failed =
        update?.status !== 'succeeded' &&
        (sendError ||
            update?.status === 'failed' ||
            session?.stage === 'failed' ||
            !!session?.statusText)
    const labels = {
        preparing: uiText('checking-installation-and-access-9ae1be6'),
        downloading: uiText('downloading-and-verifying-updater-e2ba68a'),
        updating: uiText('updating-node-backup-and-startup-verification-81927ea'),
        finished: uiText('node-updated-298d17b')
    }
    return (
        <Alert m="xs" color={failed ? 'red' : update?.status === 'succeeded' ? 'teal' : 'cyan'}>
            <Group gap="xs" wrap="nowrap">
                {!failed && update?.status !== 'succeeded' && <Loader size="xs" />}
                <Text size="sm">
                    {failed
                        ? uiText(
                              'update-not-confirmed-check-ssh-directory-token-and-node-state--2d230c4'
                          )
                        : update
                          ? labels[update.phase]
                          : uiText('waiting-for-ssh-connection-309d2b4')}
                </Text>
            </Group>
        </Alert>
    )
}
