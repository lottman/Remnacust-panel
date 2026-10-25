import { useQuery } from '@tanstack/react-query'

import { instance } from '@shared/api/axios'

export type PortBinding = {
    uuid: string
    configProfileUuid: string
    configProfileInboundUuid: string
    listenAddress: string
    port: number
}
export type PortPlanRequest = {
    expectedRevision: string
    requestId?: string
    reviewHash?: string
} & (
    | { enabled: true; bindings: PortBinding[] }
    | { enabled: false; profileUuid: string; activeInbounds: string[] }
)
export type PortPlanView = {
    bindingTraffic?: {
        capability: 'remnacust-profile-traffic-v1'
        coreProcessId: string
        capturedAt: string
        bindings: {
            bindingUuid: string
            uplink: string
            downlink: string
            available: boolean
            retired: boolean
        }[]
    } | null
    nodeUuid: string
    name: string
    disabled: boolean
    revision: string
    enabled: boolean
    status: 'UNMANAGED' | 'PENDING' | 'APPLIED' | 'ERROR'
    appliedRevision: string | null
    errorCode: string | null
    profileUuid: string | null
    activeInbounds: string[]
    bindings: (PortBinding & { inboundTag: string; networks: string[] })[]
    queued?: boolean
}
export type PortPlanHistory = {
    uuid: string
    revision: string
    createdAt: string
    snapshot:
        | { enabled: true; bindings: PortBinding[] }
        | { enabled: false; profileUuid: string; activeInbounds: string[] }
}
export type PortPlanPreview = {
    reviewHash: string
    revision: string
    enabled: boolean
    changed: boolean
    bindings: PortPlanView['bindings']
    inbounds: { tag: string; protocol: string; listen?: string; port?: number }[]
    outbounds: { tag: string; protocol: string }[]
}
export const portPlanKey = (uuid: string) => ['node-port-plan', uuid] as const
export function useNodePortPlan(uuid: string, active = true) {
    return useQuery({
        queryKey: portPlanKey(uuid),
        enabled: active && !!uuid,
        retry: false,
        queryFn: async ({ signal }) =>
            (await instance.get<{ response: PortPlanView }>(`/api/nodes/${uuid}/ports`, { signal }))
                .data.response,
        refetchInterval: active
            ? (query) =>
                  ['PENDING', 'ERROR'].includes(query.state.data?.status ?? '') ? 3000 : 15000
            : false
    })
}
export const previewPortPlan = async (uuid: string, request: PortPlanRequest) =>
    (
        await instance.post<{ response: PortPlanPreview }>(
            `/api/nodes/${uuid}/ports/preview`,
            request,
            { timeout: 35000 }
        )
    ).data.response
export const savePortPlan = async (uuid: string, request: PortPlanRequest) =>
    (
        await instance.post<{ response: PortPlanView }>(`/api/nodes/${uuid}/ports/apply`, request, {
            timeout: 35000
        })
    ).data.response
export const retryPortPlan = async (uuid: string, expectedRevision: string) =>
    (
        await instance.post<{ response: PortPlanView }>(
            `/api/nodes/${uuid}/ports/retry`,
            { expectedRevision },
            { timeout: 35000 }
        )
    ).data.response
export const getPortPlanHistory = async (uuid: string, signal?: AbortSignal) =>
    (
        await instance.get<{ response: PortPlanHistory[] }>(`/api/nodes/${uuid}/ports/history`, {
            signal
        })
    ).data.response

export const restorePortPlan = async (
    uuid: string,
    historyUuid: string,
    expectedRevision: string
) =>
    (
        await instance.post<{ response: PortPlanView }>(
            `/api/nodes/${uuid}/ports/history/${historyUuid}/restore`,
            { expectedRevision, requestId: crypto.randomUUID() },
            { timeout: 35000 }
        )
    ).data.response
