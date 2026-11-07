import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { instance } from '../axios'

const schema = z.object({
    mode: z.enum(['custom', 'default']),
    revision: z.number().int().nonnegative(),
    customFeatures: z.array(z.string()).optional()
})
export type XrayModeState = z.infer<typeof schema>
export const XRAY_MODE_QUERY_KEY = ['xray-mode'] as const
export const XRAY_MODE_ENDPOINT = '/api/nodes/core-management/settings'
let selectedMode: XrayModeState['mode'] = 'custom'
let loading: Promise<XrayModeState> | undefined

export const selectedXrayMode = () => selectedMode

export function loadXrayMode(): Promise<XrayModeState> {
    if (loading) return loading
    const operation = instance
        .get(XRAY_MODE_ENDPOINT, { timeout: 15000 })
        .then((response) => {
            const state = schema.parse(response.data.response)
            selectedMode = state.mode
            return state
        })
        .finally(() => {
            if (loading === operation) loading = undefined
        })
    loading = operation
    return operation
}

export function useXrayMode() {
    const query = useQuery({
        queryKey: XRAY_MODE_QUERY_KEY,
        queryFn: loadXrayMode,
        staleTime: 10000,
        refetchInterval: 30000,
        refetchOnWindowFocus: true
    })
    return { ...query, isCustom: query.data?.mode === 'custom' }
}
