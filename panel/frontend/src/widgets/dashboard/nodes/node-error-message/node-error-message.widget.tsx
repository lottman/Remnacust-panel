import { useTranslation } from 'react-i18next'
import { TbAlertTriangle } from 'react-icons/tb'

import { ErrorMessageBlock } from '@shared/ui/error-message-block'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'
import {
    getNodeErrorMessage,
    hasNodeErrorMessage,
    nodeConfigurationNeedsRestart
} from '@shared/utils/node-error-message'
import {
    nodeNeedsCustomUpgrade,
    nodePolicyIsPending,
    nodeUsesCompatibility
} from '@shared/utils/node-policy-status'

import { IProps } from './interfaces'

export const NodeErrorMessageWidget = (props: IProps) => {
    const { t } = useTranslation()

    const { node } = props

    if (!node || !hasNodeErrorMessage(node.lastStatusMessage)) {
        return null
    }
    const policyPending = nodePolicyIsPending(node.lastStatusMessage)
    const maintenancePending = nodeConfigurationNeedsRestart(node.lastStatusMessage)
    const telemetryUnavailable = node.lastStatusMessage === 'Failed to get system stats'
    const warning = policyPending || maintenancePending || telemetryUnavailable
    const upgradeRequired = nodeNeedsCustomUpgrade(node.lastStatusMessage)
    const compatibility = nodeUsesCompatibility(node.lastStatusMessage)
    const explanation = getNodeErrorMessage(node.lastStatusMessage, t)

    return (
        <SectionCard.Root>
            <SectionCard.Section>
                <BaseOverlayHeader
                    iconColor={
                        compatibility
                            ? 'blue'
                            : upgradeRequired
                              ? 'violet'
                              : warning
                                ? 'yellow'
                                : 'red'
                    }
                    IconComponent={TbAlertTriangle}
                    iconVariant="soft"
                    title={t(
                        compatibility
                            ? 'nodeErrors.compatibilityTitle'
                            : upgradeRequired
                              ? 'xera-node-health.upgrade-required-title'
                              : policyPending || maintenancePending
                                ? 'xera-node-health.policy-pending-title'
                                : 'common.message.last-error-message'
                    )}
                    titleOrder={5}
                />
            </SectionCard.Section>

            <SectionCard.Section>
                <ErrorMessageBlock
                    copyValue={node.lastStatusMessage}
                    details={node.lastStatusMessage}
                    message={
                        compatibility
                            ? explanation
                            : upgradeRequired
                              ? t('xera-node-health.upgrade-required-message')
                              : policyPending
                                ? t('xera-node-health.policy-pending-message')
                                : explanation
                    }
                    tone={
                        upgradeRequired ? 'upgrade' : compatibility || warning ? 'warning' : 'error'
                    }
                />
            </SectionCard.Section>
        </SectionCard.Root>
    )
}
