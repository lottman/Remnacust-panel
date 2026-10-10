import { ActionIcon, Tooltip } from '@mantine/core'
import { ReactNode } from 'react'

import classes from './field-action-button.module.css'

interface IProps {
    children: ReactNode
    compact?: boolean
    disabled?: boolean
    label: string
    onClick: () => void
}

export function FieldActionButton({ children, compact = true, disabled, label, onClick }: IProps) {
    return (
        <Tooltip label={label} openDelay={250} withArrow>
            <ActionIcon
                aria-label={label}
                className={classes.button}
                classNames={{ icon: classes.icon }}
                data-compact={compact || undefined}
                data-field-action
                data-icon-motion="off"
                disabled={disabled}
                onClick={onClick}
                size={compact ? 28 : 36}
                type="button"
                variant="transparent"
            >
                {children}
            </ActionIcon>
        </Tooltip>
    )
}
