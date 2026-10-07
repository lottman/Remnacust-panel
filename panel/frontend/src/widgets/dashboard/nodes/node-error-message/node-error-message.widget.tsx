import { useTranslation } from 'react-i18next'
import { TbAlertTriangle } from 'react-icons/tb'

import { ErrorMessageBlock } from '@shared/ui/error-message-block'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'
import { nodeNeedsCustomUpgrade, nodePolicyIsPending } from '@shared/utils/node-policy-status'

import { IProps } from './interfaces'

export const NodeErrorMessageWidget = (props: IProps) => {
    const { t } = useTranslation()

    const { node } = props

    if (!node || !node.lastStatusMessage) {
        return null
    }
    const policyPending = nodePolicyIsPending(node.lastStatusMessage)
    const upgradeRequired = nodeNeedsCustomUpgrade(node.lastStatusMessage)

    return (
        <SectionCard.Root>
            <SectionCard.Section>
                <BaseOverlayHeader
                    iconColor={upgradeRequired ? 'violet' : policyPending ? 'yellow' : 'red'}
                    IconComponent={TbAlertTriangle}
                    iconVariant="soft"
                    title={t(upgradeRequired ? 'xera-node-health.upgrade-required-title' : policyPending ? 'xera-node-health.policy-pending-title' : 'common.message.last-error-message')}
                    titleOrder={5}
                />
            </SectionCard.Section>

            <SectionCard.Section>
                <ErrorMessageBlock
                    message={upgradeRequired ? t('xera-node-health.upgrade-required-message') : policyPending ? t('xera-node-health.policy-pending-message') : node.lastStatusMessage}
                    tone={upgradeRequired ? 'upgrade' : policyPending ? 'warning' : 'error'}
                />
            </SectionCard.Section>
        </SectionCard.Root>
    )
}
