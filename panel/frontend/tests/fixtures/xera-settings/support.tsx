import { QueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

export const queryClient = new QueryClient()
export const fixtureSaves: unknown[] = []
export const useIsMobile = () => false
export const usePseudoFullscreen = () => {
    const [isFullscreen, setFullscreen] = useState(false)
    return { isFullscreen, toggle: () => setFullscreen((value) => !value) }
}
export const useViewportFillHeight = () => ({ containerRef: useRef(null), footerRef: useRef(null) })
export const useXrayMode = () => {
    const mode = new URLSearchParams(location.search).get('mode')
    return {
        isPending: mode === 'loading',
        isError: mode === 'error',
        data: { mode: mode === 'default' ? ('default' as const) : ('custom' as const) }
    }
}
export const useUpdateConfigProfile = () => ({
    isPending: false,
    mutate: (payload: unknown) => fixtureSaves.push(payload)
})
export const QueryKeys = {
    configProfiles: {
        getConfigProfile: ({ uuid }: { uuid: string }) => ({ queryKey: ['profile', uuid] }),
        getConfigProfiles: { queryKey: ['profiles'] }
    }
}
export const MonacoSetupFeature = { setup() {} }
export const useDownloadTemplate = () => ({ openDownloadModal() {} })
