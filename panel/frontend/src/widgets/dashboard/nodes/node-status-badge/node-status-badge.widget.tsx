import { ActionIcon, Badge, Tooltip } from '@mantine/core'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    PiCloudArrowUpDuotone,
    PiProhibitDuotone,
    PiPulseDuotone,
    PiWarningCircle
} from 'react-icons/pi'

import { getNodeHealth } from '@shared/utils/node-health'
import { nodeNeedsCustomUpgrade } from '@shared/utils/node-policy-status'

import { IProps } from './interface'

export const NodeStatusBadgeWidget = memo(
    ({ node, fetchedNode, withText = true, ...rest }: IProps) => {
        const { t } = useTranslation()

        const nodeData = fetchedNode || node
        const upgradeRequired = !nodeData.isDisabled && nodeData.isConnected && nodeNeedsCustomUpgrade(nodeData.lastStatusMessage)

        const health = getNodeHealth(nodeData)
        const needsAttention =
            nodeData.isConnected && (health.level === 'attention' || health.level === 'critical')
        const healthReason = health.issues
            .map((issue) => t(`xera-node-health.${issue}`))
            .join(' · ')

        const { icon, color, status } = (() => {
            let icon: React.ReactNode
            let color = 'red'
            let status = ''

            if (nodeData.isDisabled) {
                icon = (
                    <PiProhibitDuotone size={18} style={{ color: 'var(--mantine-color-gray-6)' }} />
                )
                color = 'gray'
                status = t('node-status-badge.widget.disabled')
            } else if (upgradeRequired) {
                icon = <PiPulseDuotone size={18} style={{ color: 'var(--mantine-color-violet-6)' }} />
                color = 'violet'
                status = t('xera-node-health.upgrade-required-title')
            } else if (needsAttention) {
                icon = (
                    <PiWarningCircle size={18} style={{ color: 'var(--mantine-color-yellow-6)' }} />
                )
                color = 'yellow'
                status = t(`xera-node-health.${health.level}`)
            } else if (nodeData.isConnected) {
                icon = <PiPulseDuotone size={18} style={{ color: 'var(--mantine-color-teal-6)' }} />
                color = 'teal'
                status = t('node-status-badge.widget.connected')
            } else if (nodeData.isConnecting) {
                icon = (
                    <PiCloudArrowUpDuotone
                        size={18}
                        style={{ color: 'var(--mantine-color-yellow-3)' }}
                    />
                )
                color = 'var(--mantine-color-yellow-3)'
                status = t('node-status-badge.widget.connecting')
            } else {
                icon = <PiWarningCircle size={18} style={{ color: 'var(--mantine-color-red-3)' }} />
                color = 'red'
                status = t('node-status-badge.widget.disconnected')
            }

            return { icon, color, status }
        })()

        if (!withText) {
            return (
                <Tooltip
                    label={upgradeRequired ? t('xera-node-health.upgrade-required-message') : needsAttention && healthReason ? healthReason : status}
                    multiline
                    w={300}
                    maw="calc(100vw - 24px)"
                    withArrow
                >
                    <ActionIcon aria-label={status} color={color} radius="md" size={26} {...rest}>
                        {icon}
                    </ActionIcon>
                </Tooltip>
            )
        }

        return (
            <Tooltip disabled={!upgradeRequired} label={t('xera-node-health.upgrade-required-message')} multiline w={300} maw="calc(100vw - 24px)" withArrow>
            <Badge color={color} leftSection={icon} maw="20ch" miw="20ch" size="lg" {...rest}>
                {status}
            </Badge>
            </Tooltip>
        )
    }
)
