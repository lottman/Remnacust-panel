import { Button } from '@mantine/core'
import { QueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

export const queryClient = new QueryClient()
export const fullscreenClasses = {}
export const FullscreenToggleButton = () => null
export const usePanelReducedMotion = () => true
export const usePseudoFullscreen = () => {
    const [isFullscreen, setFullscreen] = useState(false)
    return { isFullscreen, toggle: () => setFullscreen((value) => !value) }
}
export const useViewportFillHeight = () => ({ containerRef: useRef(null), footerRef: useRef(null) })
export const useGetSubscriptionSettings = () => ({
    isSuccess: true,
    data: { geofilesSystemEnabled: true, serveJsonAtBaseSubscription: true }
})
export const subscriptionSettingsQueryKeys = {
    getSubscriptionSettings: { queryKey: ['template-opening-settings'] }
}
export const useUpdateSubscriptionSettings = () => ({ isPending: false, mutate() {} })
export const useEditorRecovery = () => ({
    entry: null,
    status: 'ready',
    track() {},
    saved: async () => {},
    discard: async () => {},
    retry: async () => {}
})
export function TemplateEditorActionsFeature({ getValue }: { getValue: () => string }) {
    return (
        <Button
            onClick={() => {
                document.getElementById('fixture-saved')!.textContent = getValue()
            }}
        >
            Capture current text
        </Button>
    )
}
export const instance = { get: async () => ({ data: { response: [] } }) }
export const selectedXrayMode = () =>
    new URLSearchParams(location.search).get('mode') === 'default'
        ? ('default' as const)
        : ('custom' as const)
export const loadXrayMode = async () => ({ mode: selectedXrayMode(), revision: 1 })
