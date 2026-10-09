import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Modal } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { TbCpu } from 'react-icons/tb'

import { useNiceMantineModal } from '@shared/_modals/use-nice-modal'
import { queryClient } from '@shared/api'
import { QueryKeys, useGetNode } from '@shared/api/hooks'
import { OPEN_ENTITY } from '@shared/constants'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'

import { EditNodeByUuidModalContent } from './edit-node.modal.content'

interface IProps {
    nodeUuid: string
}

export const EditNodeModal = NiceModal.create((props: IProps) => {
    const { nodeUuid } = props

    const modal = useModal()
    const { modalProps, hide } = useNiceMantineModal({
        modal,
        onClose() {
            queryClient.refetchQueries({
                queryKey: QueryKeys.nodes.getAllNodes.queryKey
            })
        }
    })

    const { data: node } = useGetNode({
        route: { uuid: nodeUuid },
        rQueryParams: { enabled: false }
    })

    const { t } = useTranslation()

    return (
        <Modal
            {...modalProps}
            size="1000px"
            yOffset={16}
            styles={{
                content: {
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: modalProps.fullScreen ? '100dvh' : 'calc(100dvh - 32px)',
                    overflow: 'hidden',
                    overscrollBehavior: 'contain'
                },
                header: { flexShrink: 0 },
                body: {
                    '--panel-overlay-footer-bottom':
                        'calc(-1 * var(--panel-overlay-bottom-padding, var(--panel-overlay-padding)))',
                    flex: '1 1 auto',
                    minHeight: 0,
                    overflowY: 'auto',
                    overscrollBehavior: 'contain'
                }
            }}
            title={
                <BaseOverlayHeader
                    countryCode={node?.countryCode}
                    iconColor="teal"
                    IconComponent={TbCpu}
                    iconVariant="soft"
                    title={node?.name ?? t('edit-node-modal.widget.edit-node')}
                    openEntity={{ entity: OPEN_ENTITY.NODE, id: nodeUuid }}
                />
            }
        >
            <EditNodeByUuidModalContent key={nodeUuid} nodeUuid={nodeUuid} onClose={hide} />
        </Modal>
    )
})
