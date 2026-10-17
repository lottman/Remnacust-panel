import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { instance } from '@shared/api/axios'

export type TailBody = {
    generation: string
    requestId: string
    consumptionMultiplier: string
    note: string
}
export type TailPreparation = {
    request: string
    node: string
    actor: string
    source: string
    intent: TailBody & { acknowledgementRequest: string }
    plan: {
        sample: { sequence: string; coreProcessId: string }
        requiresSampling: boolean
        consumptionMultiplier: string
    }
}
const base = (uuid: string, ack: string) =>
    `/api/limits/quota-recovery/nodes/${uuid}/receipt-ack/${ack}/tail`
const key = (uuid: string, ack: string) => ['quota-tail', uuid, ack]
export function tailProblem(error: unknown) {
    const code = isAxiosError<{ errorCode?: string }>(error)
        ? error.response?.data?.errorCode?.replace(/^RECOVERY_TAIL_/, '')
        : undefined
    if (code === 'BUSY') return 'busy'
    if (code === 'HELD_POLICY_REQUIRED') return 'prepare'
    if (code === 'REQUEST_CONFLICT') return 'conflict'
    if (code === 'SAMPLE_UNSUPPORTED') return 'unsupported'
    if (
        code === 'SOURCE_CHANGED' ||
        code === 'NOT_PENDING' ||
        code === 'TICKET_CHANGED' ||
        code === 'ACK_REQUIRED'
    )
        return 'changed'
    if (code === 'SOURCE_MISSING' || code === 'SOURCE_INVALID' || code === 'SOURCE_CORRUPT')
        return 'sourceInvalid'
    return 'unknown'
}
export function useTail(uuid: string, ack: string, generation: string, enabled: boolean) {
    return useQuery({
        queryKey: [...key(uuid, ack), generation],
        enabled,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{
                    response: {
                        preparation: TailPreparation | null
                        sourceRequest: string | null
                        sourceConflict: boolean
                    }
                }>(base(uuid, ack), { params: { generation }, signal })
            ).data.response
    })
}
export function usePrepareTail(uuid: string, ack: string) {
    const client = useQueryClient()
    return useMutation({
        retry: false,
        mutationFn: async (body: TailBody) =>
            (
                await instance.post<{ response: TailPreparation }>(base(uuid, ack), body, {
                    timeout: 75000
                })
            ).data.response,
        onSettled: () => client.invalidateQueries({ queryKey: key(uuid, ack) })
    })
}
export function useExecuteTail(uuid: string, ack: string) {
    const client = useQueryClient()
    return useMutation({
        retry: false,
        mutationFn: async (body: { generation: string; request: string }) =>
            (
                await instance.post<{
                    response: { preparationRequest: string; sourceRequest: string }
                }>(
                    `${base(uuid, ack)}/${body.request}/execute`,
                    { generation: body.generation },
                    { timeout: 75000 }
                )
            ).data.response,
        onSettled: () => client.invalidateQueries({ queryKey: key(uuid, ack) })
    })
}
