import { ThemeIcon, Tooltip } from '@mantine/core'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    PiCloudArrowUpDuotone,
    PiProhibitDuotone,
    PiPulseDuotone,
    PiWarningCircle
} from 'react-icons/pi'

import { nodeNeedsCustomUpgrade } from '@shared/utils/node-policy-status'

import { getNodeStatus } from '../node-status'
import { IProps } from './interface'

export const NodeStatusSimplfiedBadgeWidget = memo(
    ({
        isConnected,
        isConnecting,
        isDisabled,
        nodeUuid,
        lastStatusMessage,
        xrayUptime,
        ...rest
    }: IProps) => {
        const { t } = useTranslation()
        const connectionStatus = getNodeStatus({
            isConnected,
            isConnecting,
            isDisabled,
            xrayUptime
        })
        const upgradeRequired =
            isConnected && !isDisabled && !isConnecting && nodeNeedsCustomUpgrade(lastStatusMessage)
        let icon: React.ReactNode
        let color = 'red'

        if (isDisabled) {
            icon = <PiProhibitDuotone size={18} style={{ color: 'var(--mantine-color-gray-6)' }} />
            color = 'gray'
        } else if (isConnecting) {
            icon = (
                <PiCloudArrowUpDuotone
                    size={18}
                    style={{ color: 'var(--mantine-color-yellow-3)' }}
                />
            )
            color = 'var(--mantine-color-yellow-3)'
        } else if (upgradeRequired) {
            icon = <PiPulseDuotone size={18} style={{ color: 'var(--mantine-color-violet-6)' }} />
            color = 'violet'
        } else if (connectionStatus === 'limited') {
            icon = <PiPulseDuotone size={18} style={{ color: 'var(--mantine-color-blue-6)' }} />
            color = 'blue'
        } else if (isConnected) {
            icon = <PiPulseDuotone size={18} style={{ color: 'var(--mantine-color-teal-6)' }} />
            color = 'teal'
        } else {
            icon = <PiWarningCircle size={18} style={{ color: 'var(--mantine-color-red-3)' }} />
            color = 'red'
        }

        return (
            <Tooltip
                disabled={!upgradeRequired && connectionStatus !== 'limited'}
                label={t(
                    upgradeRequired
                        ? 'xera-node-health.upgrade-required-message'
                        : 'xera-node-health.limited'
                )}
                multiline
                w="max-content"
                maw="min(300px, calc(100vw - 24px))"
                withArrow
            >
                <ThemeIcon
                    aria-label={
                        upgradeRequired
                            ? t('xera-node-health.upgrade-required-title')
                            : connectionStatus === 'limited'
                              ? t('xera-node-health.limited')
                              : undefined
                    }
                    color={color}
                    size="md"
                    variant="outline"
                    {...rest}
                >
                    {icon}
                </ThemeIcon>
            </Tooltip>
        )
    }
)
