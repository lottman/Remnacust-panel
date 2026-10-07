import { ThemeIcon, Tooltip } from '@mantine/core'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    PiCloudArrowUpDuotone,
    PiProhibitDuotone,
    PiPulseDuotone,
    PiWarningCircle
} from 'react-icons/pi'

import { IProps } from './interface'
import { nodeNeedsCustomUpgrade } from '@shared/utils/node-policy-status'

export const NodeStatusSimplfiedBadgeWidget = memo(
    ({ isConnected, isConnecting, isDisabled, nodeUuid, lastStatusMessage, ...rest }: IProps) => {
        const { t } = useTranslation()
        const upgradeRequired = !isDisabled && isConnected && nodeNeedsCustomUpgrade(lastStatusMessage)
        let icon: React.ReactNode
        let color = 'red'

        if (isDisabled) {
            icon = <PiProhibitDuotone size={18} style={{ color: 'var(--mantine-color-gray-6)' }} />
            color = 'gray'
        } else if (upgradeRequired) {
            icon = <PiPulseDuotone size={18} style={{ color: 'var(--mantine-color-violet-6)' }} />
            color = 'violet'
        } else if (isConnected) {
            icon = <PiPulseDuotone size={18} style={{ color: 'var(--mantine-color-teal-6)' }} />
            color = 'teal'
        } else if (isConnecting) {
            icon = (
                <PiCloudArrowUpDuotone
                    size={18}
                    style={{ color: 'var(--mantine-color-yellow-3)' }}
                />
            )
            color = 'var(--mantine-color-yellow-3)'
        } else if (isDisabled) {
            icon = <PiProhibitDuotone size={18} style={{ color: 'var(--mantine-color-gray-6)' }} />
            color = 'gray'
        } else {
            icon = <PiWarningCircle size={18} style={{ color: 'var(--mantine-color-red-3)' }} />
            color = 'red'
        }

        return (
            <Tooltip disabled={!upgradeRequired} label={t('xera-node-health.upgrade-required-message')} multiline w={300} maw="calc(100vw - 24px)" withArrow>
            <ThemeIcon aria-label={upgradeRequired ? t('xera-node-health.upgrade-required-title') : undefined} color={color} size="md" variant="outline" {...rest}>
                {icon}
            </ThemeIcon>
            </Tooltip>
        )
    }
)
