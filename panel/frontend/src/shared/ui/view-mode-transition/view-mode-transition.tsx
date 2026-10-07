import type { ReactNode } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import { usePanelReducedMotion } from '@shared/ui/appearance/appearance'

interface ViewModeTransitionProps {
    children: ReactNode
    mode: string
}

export const ViewModeTransition = ({ children, mode }: ViewModeTransitionProps) => {
    const reducedMotion = usePanelReducedMotion()

    if (reducedMotion) return <div>{children}</div>

    return (
        <AnimatePresence initial={false} mode="wait">
            <motion.div
                key={mode}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    )
}
