import { useQuery } from '@tanstack/react-query'

import { instance } from '@shared/api/axios'

export type HostTagLimit = {
    tag: string
    limitBytes: number
    trafficMultiplier: number
    totalSpeedLimitMbps: number | null
    speedLimitMbps: number | null
    resetValue: number
    resetUnit: 'DAYS' | 'MONTHS'
    resetAnchorAt?: string
}
export const tagLimitsQueryKey = ['host-tag-limits']
export const tagLimitsEndpoint = '/api/hosts/panel-tag-limits'

export function useHostTagLimits() {
    return useQuery({
        queryKey: tagLimitsQueryKey,
        queryFn: async () => {
            const { data } = await instance.get<{ response: HostTagLimit[] }>(tagLimitsEndpoint)
            return data.response
        }
    })
}
