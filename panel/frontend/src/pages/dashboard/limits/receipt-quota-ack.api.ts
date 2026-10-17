import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { instance } from '@shared/api/axios'

export type ReceiptAckReply = {
    requestId: string
    generation: string
    coreProcessId: string
    instance: string
    decisionDigest: string
    sourceDigest: string
    alreadyAcknowledged: boolean
    journal: {
        stream: string
        acked: string
        ackDigest: string
        pending: { sequence: string; coreProcessId: string; digest: string } | null
    }
}
export type ReceiptAckJob = {
    requestId: string
    generation: string
    node: string
    actor: string
    decisionRequest: string
    source: {
        decisionDigest: string
        sourceDigest: string
        receipt: { stream: string; sequence: string; coreProcessId: string; digest: string }
    }
    acknowledgement: ReceiptAckReply | null
    busy: boolean
    attempts: {
        id: string
        requestedAt: string
        observedAt: string | null
        payload: { coreProcessId: string } | null
        details: { confirmed: boolean; error: string | null } | null
    }[]
    nextAfter: string | null
}
const base = (uuid: string) => `/api/limits/quota-recovery/nodes/${uuid}/receipt-ack`
const key = (uuid: string) => ['receipt-quota-ack', uuid]
export function receiptAckCodeProblem(code: string | undefined) {
    if (code === 'BUSY' || code === 'LEASE_LOST') return 'busy'
    if (code === 'HELD_POLICY_REQUIRED') return 'prepare'
    if (code === 'SOURCE_CHANGED' || code === 'NOT_PENDING' || code === 'TICKET_CHANGED')
        return 'sourceChanged'
    if (code === 'REQUEST_CONFLICT') return 'conflict'
    if (code === 'SOURCE_MISSING' || code === 'SOURCE_INVALID') return 'sourceInvalid'
    if (code === 'NODE_UNAVAILABLE' || code === 'NODE_MISSING') return 'unavailable'
    return 'unknown'
}
export function receiptAckProblem(error: unknown) {
    const code = isAxiosError<{ errorCode?: string }>(error)
        ? error.response?.data?.errorCode
        : undefined
    return receiptAckCodeProblem(code?.replace(/^RECOVERY_RECEIPT_/, ''))
}
export function receiptAckMissing(error: unknown) {
    return (
        isAxiosError<{ errorCode?: string }>(error) &&
        error.response?.data?.errorCode === 'RECOVERY_RECEIPT_JOB_MISSING'
    )
}
export function useReceiptAcks(
    uuid: string,
    generation: string,
    decisionRequest: string,
    enabled: boolean,
    after?: string
) {
    return useQuery({
        queryKey: [...key(uuid), 'list', generation, decisionRequest, after],
        enabled,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{
                    response: {
                        entries: {
                            requestId: string
                            actor: string
                            createdAt: string
                            acknowledged: boolean
                            busy: boolean
                        }[]
                        nextAfter: string | null
                    }
                }>(base(uuid), { params: { generation, decisionRequest, after }, signal })
            ).data.response
    })
}
export function useReceiptAck(
    uuid: string,
    request: string | undefined,
    enabled: boolean,
    after?: string
) {
    return useQuery({
        queryKey: [...key(uuid), 'job', request, after],
        enabled: enabled && !!request,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{ response: ReceiptAckJob }>(`${base(uuid)}/${request}`, {
                    params: { after },
                    signal
                })
            ).data.response
    })
}
export function useDeliverReceiptAck(uuid: string) {
    const client = useQueryClient()
    return useMutation({
        retry: false,
        mutationFn: async (body: {
            generation: string
            requestId: string
            decisionRequest: string
        }) =>
            (
                await instance.post<{
                    response: {
                        requestId: string
                        acknowledgement: ReceiptAckReply
                        alreadyAcknowledged: boolean
                    }
                }>(base(uuid), body, { timeout: 45000 })
            ).data.response,
        onSettled: () => client.invalidateQueries({ queryKey: key(uuid) })
    })
}
