import { NodesSchema } from '@remnawave/backend-contract'
import { useQuery } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { useState } from 'react'

import { RequestError } from '../../../src/shared/api/helpers/handler-request-error'
export * from '../node-wizard/api'
import { queryClient } from '../node-wizard/api'
const revision = '10000000-0000-4000-8000-000000000002'
const base = {
    uuid: '10000000-0000-4000-8000-000000000001',
    id: 1,
    name: 'Saved fixture node',
    note: 'Saved description',
    address: 'manual.example.test',
    port: 2222,
    proxyUrl: null,
    hasProxy: false,
    controlRevision: revision,
    controlAddresses: [
        { address: 'manual.example.test', enabled: true },
        { address: '192.0.2.20', enabled: false }
    ],
    ips: [{ ip: '192.0.2.20', status: 'INBOUND' }],
    isConnected: true,
    isDisabled: false,
    isConnecting: false,
    lastStatusChange: null,
    lastStatusMessage: null,
    isTrafficTrackingActive: false,
    trafficResetDay: null,
    trafficLimitBytes: null,
    trafficUsedBytes: null,
    notifyPercent: null,
    viewPosition: 0,
    countryCode: 'XX',
    consumptionMultiplier: 1,
    nodeConsumptionMultiplier: 1,
    tags: [],
    integrationUuids: [],
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    configProfile: { activeConfigProfileUuid: null, activeInbounds: [] },
    providerUuid: null,
    provider: null,
    activePluginUuid: null,
    system: null,
    versions: { node: '1.1.38', xray: '26.11.9' },
    xrayUptime: 100,
    usersOnline: 0,
    ipScan: null
}
const refreshed = {
    ...base,
    controlRevision: '10000000-0000-4000-8000-000000000003',
    controlAddresses: [base.controlAddresses[0], { address: '2001:db8::30', enabled: false }],
    ips: [{ ip: '2001:db8::30', status: 'OUTBOUND' }],
    ipScan: { addresses: ['2001:db8::30'], scannedAt: '2026-11-15T12:00:00.000Z' }
}

export const node = NodesSchema.parse(base)
export const nodesQueryKeys = {
    getNode: ({ uuid }: { uuid: string }) => ({ queryKey: ['rescan-node', uuid] }),
    getAllNodes: { queryKey: ['fixture-nodes'] }
}
queryClient.setQueryData(nodesQueryKeys.getNode(node).queryKey, node)
export function useGetNode() {
    return useQuery({
        queryKey: nodesQueryKeys.getNode(node).queryKey,
        queryFn: async () => node,
        staleTime: Infinity
    })
}
export const useGetNodeIntegrations = () => ({ data: { nodeIntegrations: [] } })
export const useGetNodeMetadata = () => ({ data: undefined, isLoading: false })
export const useUpdateNode = () => ({ mutate: () => {}, isPending: false })
export const instance = {
    get: async () => ({ data: { response: { enabled: false, bindings: [] } } }),
    post: async () => ({ data: { response: {} } })
}
export let pendingScan: { resolve: () => void; reject: () => void } | undefined
export const scan = {
    calls: 0,
    pending: false,
    resolve: () => pendingScan?.resolve(),
    reject: () => pendingScan?.reject()
}
export function useRescanNodeIps({
    mutationFns
}: {
    mutationFns: {
        onSuccess: (value: typeof node) => unknown
        onError: (error: RequestError) => void
    }
}) {
    const [isPending, setPending] = useState(false)
    return {
        isPending,
        mutate: () => {
            scan.calls++
            scan.pending = true
            setPending(true)
            pendingScan = {
                resolve: async () => {
                    await mutationFns.onSuccess(NodesSchema.parse(refreshed))
                    scan.pending = false
                    setPending(false)
                },
                reject: () => {
                    const e = new RequestError(
                        new AxiosError(
                            'Synthetic scan unavailable',
                            'ERR_BAD_RESPONSE',
                            undefined,
                            null,
                            {
                                status: 503,
                                data: { errorCode: 'A267', message: 'Synthetic scan unavailable' },
                                headers: {},
                                config: { headers: {} }
                            } as never
                        )
                    )
                    mutationFns.onError(e)
                    scan.pending = false
                    setPending(false)
                }
            }
        }
    }
}
export const useXrayMode = () => ({ data: { mode: 'custom' }, isLoading: false })
