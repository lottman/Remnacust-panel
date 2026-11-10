import { spotlight } from '@mantine/spotlight'
import { useEffect } from 'react'

export function installPageSearchShortcut(view: Window, open: () => void): () => void {
    const handle = (event: KeyboardEvent) => {
        const find =
            (event.ctrlKey || event.metaKey) &&
            !event.shiftKey &&
            (event.key.toLowerCase() === 'f' || event.code === 'KeyF')
        const next = event.key === 'F3' && !event.ctrlKey && !event.metaKey
        if (event.isComposing || event.altKey || (!find && !next)) return
        if (event.target instanceof Element && event.target.closest('.monaco-editor')) return
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) open()
    }
    view.addEventListener('keydown', handle, { capture: true })
    return () => view.removeEventListener('keydown', handle, { capture: true })
}

export function usePageSearchShortcut() {
    useEffect(() => installPageSearchShortcut(window, spotlight.open), [])
}
