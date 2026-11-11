import { NiceModalHandler } from '@ebay/nice-modal-react'
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'

import { useIsMobile } from '@shared/hooks/use-is-mobile'
import { isPseudoFullscreenActive } from '@shared/hooks/use-pseudo-fullscreen'

const stack: { id: string; hide: () => void }[] = []
let listening = false

function hasManagedModalOpen(): boolean {
    const dialogs = document.querySelectorAll('[role="dialog"]')
    for (const d of dialogs) {
        if (!d.closest('[data-nice-modal]')) return true
    }
    return false
}

function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    if (e.defaultPrevented || e.isComposing) return
    if (isPseudoFullscreenActive()) return
    if (hasManagedModalOpen()) return
    // A popup gets the first Escape; the editor remains open underneath it.
    const popups = document.querySelectorAll('[role="listbox"], [role="menu"]')
    for (const popup of popups) {
        if (!popup.closest('[role="dialog"]') && popup.getClientRects().length > 0) return
    }
    const top = stack[stack.length - 1]
    if (!top) return
    top.hide()
}

function register(id: string, hide: () => void) {
    const existing = stack.find((m) => m.id === id)
    if (existing) {
        existing.hide = hide
        return
    }
    stack.push({ id, hide })
    if (!listening) {
        document.addEventListener('keydown', handleKeyDown)
        listening = true
    }
}

function unregister(id: string) {
    const i = stack.findIndex((m) => m.id === id)
    if (i !== -1) stack.splice(i, 1)
    if (listening && stack.length === 0) {
        document.removeEventListener('keydown', handleKeyDown)
        listening = false
    }
}

interface IProps {
    modal: NiceModalHandler
    drawer?: boolean
    onClose?: () => void
}

export function useNiceMantineModal(props: IProps) {
    const { modal, onClose } = props
    const isMobile = useIsMobile()
    const [entered, setEntered] = useState(false)
    const current = useRef(modal)
    useLayoutEffect(() => {
        current.current = modal
    }, [modal])
    const closing = useRef(false)
    const afterClose = useRef<(() => void) | undefined>(undefined)

    const hide = useCallback(() => {
        if (closing.current || !modal.visible) return
        closing.current = true
        afterClose.current = onClose
        modal.hide()
    }, [onClose, modal])

    const finishClose = useCallback(() => {
        const handler = current.current
        if (handler.visible) return
        const callback = afterClose.current
        afterClose.current = undefined
        closing.current = false
        handler.resolveHide()
        try {
            callback?.()
        } finally {
            if (!handler.keepMounted) handler.remove()
        }
    }, [])

    const stackHide = useEffectEvent(() => hide())

    useEffect(() => {
        if (modal.visible) {
            closing.current = false
            afterClose.current = undefined
        } else if (!entered && closing.current) {
            finishClose()
        }
    }, [modal.visible, entered, finishClose])

    useEffect(() => {
        const raf = requestAnimationFrame(() => setEntered(true))
        return () => cancelAnimationFrame(raf)
    }, [])

    useEffect(() => {
        if (!modal.visible) return

        register(modal.id, stackHide)
        return () => unregister(modal.id)
    }, [modal.visible, modal.id])

    const modalProps = {
        ...(props.drawer ? {} : { fullScreen: isMobile }),
        opened: entered && modal.visible,
        closeOnEscape: false,
        'data-nice-modal': modal.id,
        onClose: hide,
        onExitTransitionEnd: finishClose
    }

    return { modalProps, hide }
}
