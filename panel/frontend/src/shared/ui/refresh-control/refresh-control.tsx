import { ActionIcon, ActionIconProps, Button, ButtonProps } from '@mantine/core'
import clsx from 'clsx'
import { ComponentPropsWithoutRef, forwardRef, MouseEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import classes from './refresh-control.module.css'

type ClickHandler = (event: MouseEvent<HTMLButtonElement>) => unknown
type NativeProps = Omit<ComponentPropsWithoutRef<'button'>, 'onClick'> & { onClick?: ClickHandler }
type RefreshActionIconProps = ActionIconProps & NativeProps
type RefreshButtonProps = ButtonProps & NativeProps

// Retain the action glyph and text during a request instead of swapping the entire control.
// The promise and the query's loading flag both describe actual work; no artificial timer.
function useRefreshState(loading: boolean | undefined, onClick: ClickHandler | undefined) {
    const [pending, setPending] = useState(false)
    const locked = useRef(false)
    const busy = Boolean(loading || pending)
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (busy || locked.current) return
        const result = onClick?.(event)
        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
            locked.current = true
            setPending(true)
            const finish = () => {
                locked.current = false
                setPending(false)
            }
            void Promise.resolve(result).then(finish, finish)
        }
    }
    return { busy, handleClick }
}

export const RefreshActionIcon = forwardRef<HTMLButtonElement, RefreshActionIconProps>(
    ({ loading, onClick, disabled, className, ...props }, ref) => {
        const { t } = useTranslation()
        const { busy, handleClick } = useRefreshState(loading, onClick)
        return (
            <ActionIcon
                aria-label={t('common.action.refresh')}
                {...props}
                aria-busy={busy || undefined}
                className={clsx(classes.control, className)}
                data-refreshing={busy || undefined}
                disabled={disabled || busy}
                onClick={handleClick}
                ref={ref}
            />
        )
    }
)
RefreshActionIcon.displayName = 'RefreshActionIcon'

export const RefreshButton = forwardRef<HTMLButtonElement, RefreshButtonProps>(
    ({ loading, onClick, disabled, className, ...props }, ref) => {
        const { busy, handleClick } = useRefreshState(loading, onClick)
        return (
            <Button
                {...props}
                aria-busy={busy || undefined}
                className={clsx(classes.control, className)}
                data-refreshing={busy || undefined}
                disabled={disabled || busy}
                onClick={handleClick}
                ref={ref}
            />
        )
    }
)
RefreshButton.displayName = 'RefreshButton'
