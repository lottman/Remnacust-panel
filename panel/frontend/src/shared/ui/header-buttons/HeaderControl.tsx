import { BoxProps, createPolymorphicComponent, UnstyledButton } from '@mantine/core'
import cx from 'clsx'
import { forwardRef } from 'react'

import classes from './HeaderControl.module.css'

export interface HeaderControlProps extends BoxProps {
    children: React.ReactNode
    label?: string
}

const _HeaderControl = forwardRef<HTMLButtonElement, HeaderControlProps>(
    ({ className, label, children, ...others }, ref) => (
        <UnstyledButton
            className={cx(classes.control, { [classes.withLabel]: !!label }, className)}
            data-panel-control
            ref={ref}
            {...others}
        >
            {children}
            {label && <span className={classes.label}>{label}</span>}
        </UnstyledButton>
    )
)

export const HeaderControl = createPolymorphicComponent<'button', HeaderControlProps>(
    _HeaderControl
)
