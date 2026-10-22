import type { ReactNode, Ref } from 'react'

import clsx from 'clsx'

import styles from './CodeEditor.module.css'

interface Props {
    children: ReactNode
    className?: string
    ref?: Ref<HTMLDivElement>
    attached?: boolean
}

export function EditorFooter(props: Props) {
    const { children, className, ref, attached = true } = props

    return (
        <div className={clsx(styles.footer, !attached && styles.standalone, className)} ref={ref}>
            {children}
        </div>
    )
}
