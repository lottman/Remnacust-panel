import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Modal, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { TbQrcode } from 'react-icons/tb'

import { useNiceMantineModal } from '@shared/_modals/use-nice-modal'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { QrCodeBuilder } from '@shared/ui/qr-code-builder'
import { CopyableFieldShared } from '@shared/ui/copyable-field/copyable-field'

interface IProps {
    subscriptionUrl: string
    username: string
}

export const SubscriptionQrCodeModal = NiceModal.create((props: IProps) => {
    const { subscriptionUrl, username } = props
    const { t } = useTranslation()

    const modal = useModal()
    const { modalProps } = useNiceMantineModal({
        modal
    })

    return (
        <Modal
            {...modalProps}
            size="lg"
            title={
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={TbQrcode}
                    iconVariant="soft"
                    title={t('view-user-modal.widget.subscription-qr-code')}
                />
            }
        >
            <Stack gap="md">
                <CopyableFieldShared label={t('user-domain-links.current')} value={subscriptionUrl} />
                <QrCodeBuilder data={subscriptionUrl} title={username} />
            </Stack>
        </Modal>
    )
})
