import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { EditorRecoveryController, recoveryOwner } from '@shared/utils/editor-recovery-controller'
import { registerEditorRecovery } from '@shared/utils/editor-recovery-flush'

import { useToken } from '@entities/auth'

const unavailable = { entry: null, status: 'error', error: 'unavailable' } as const
const noSubscribe = () => () => {}
const emptySnapshot = () => unavailable

export function useEditorRecovery({
    kind,
    id,
    baseline
}: {
    kind: 'profile' | 'template'
    id: string
    baseline: string
}) {
    const token = useToken()
    const owner = recoveryOwner(token)
    const controller = useMemo(
        () => (owner ? new EditorRecoveryController({ owner, kind, id }, baseline) : null),
        [owner, kind, id]
    )
    const snapshot = useSyncExternalStore(
        controller?.subscribe ?? noSubscribe,
        controller?.getSnapshot ?? emptySnapshot,
        emptySnapshot
    )
    useEffect(() => {
        void controller?.start()
    }, [controller])
    useEffect(() => {
        void controller?.rebase(baseline).catch(() => {})
    }, [controller, baseline])
    useEffect(() => {
        if (!controller) return
        const unregister = registerEditorRecovery(controller.flush)
        const flush = () => {
            void controller.flush().catch(() => {})
        }
        const refresh = () => {
            void controller.refresh().catch(() => {})
        }
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') flush()
        }
        window.addEventListener('pagehide', flush)
        window.addEventListener('focus', refresh)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            unregister()
            window.removeEventListener('pagehide', flush)
            window.removeEventListener('focus', refresh)
            document.removeEventListener('visibilitychange', onVisibility)
            flush()
        }
    }, [controller])
    return useMemo(
        () => ({
            ...snapshot,
            track: controller?.track ?? (() => {}),
            saved: controller?.saved ?? (async () => {}),
            discard: controller?.discard ?? (async () => {}),
            retry: controller?.retry ?? (async () => {})
        }),
        [controller, snapshot]
    )
}
