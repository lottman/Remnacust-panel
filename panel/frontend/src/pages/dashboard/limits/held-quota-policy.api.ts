import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { instance } from '@shared/api/axios'

export type HeldPolicyReply = {
    requestId: string
    coreProcessId: string
    instance: string
    policyRevision: string
    policyGeneration: string
    quotaRecovery: { record: { state: 'FENCED'; generation: string; digest: string } }
}
export type HeldPolicyJob = {
    requestId: string
    generation: string
    node: string
    actor: string
    payload: { policyRevision: string; coreProcessId: string; instance: string; previous: string }
    acknowledgement: HeldPolicyReply | null
    busy: boolean
    attempts: {
        id: string
        requestedAt: string
        observedAt: string | null
        details: { confirmed: boolean; error: string | null } | null
    }[]
    nextAfter: string | null
}
const base = (uuid: string) => `/api/limits/quota-recovery/nodes/${uuid}/held-policy`
const key = (uuid: string) => ['held-quota-policy', uuid]
export function heldPolicyProblem(error: unknown) {
    const code = isAxiosError<{ errorCode?: string }>(error)
        ? error.response?.data?.errorCode
        : undefined
    return heldPolicyCodeProblem(code?.replace(/^RECOVERY_POLICY_/, ''))
}
export function heldPolicyCodeProblem(code: string | undefined) {
    if (code === 'BUSY' || code === 'LEASE_LOST') return 'busy'
    if (code === 'SOURCE_CHANGED' || code === 'NOT_PENDING') return 'sourceChanged'
    if (code === 'REQUEST_CONFLICT') return 'conflict'
    if (code === 'NODE_UNAVAILABLE' || code === 'NODE_MISSING') return 'unavailable'
    return 'unknown'
}

export function heldPolicyCanReplace(error: unknown) {
    return ['sourceChanged', 'conflict'].includes(heldPolicyProblem(error))
}
export function heldPolicyMissing(error: unknown) {
    return (
        isAxiosError<{ errorCode?: string }>(error) &&
        error.response?.data?.errorCode === 'RECOVERY_POLICY_JOB_MISSING'
    )
}
export function useHeldPolicies(
    uuid: string,
    generation: string,
    enabled: boolean,
    after?: string
) {
    return useQuery({
        queryKey: [...key(uuid), 'list', generation, after],
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
                            revision: string
                            acknowledged: boolean
                            busy: boolean
                        }[]
                        nextAfter: string | null
                    }
                }>(base(uuid), { params: { generation, after }, signal })
            ).data.response
    })
}
export function useHeldPolicy(
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
                await instance.get<{ response: HeldPolicyJob }>(`${base(uuid)}/${request}`, {
                    params: { after },
                    signal
                })
            ).data.response
    })
}
export function useStageHeldPolicy(uuid: string) {
    const client = useQueryClient()
    return useMutation({
        retry: false,
        mutationFn: async (body: { generation: string; requestId: string }) =>
            (
                await instance.post<{
                    response: {
                        requestId: string
                        acknowledgement: HeldPolicyReply
                        alreadyAcknowledged: boolean
                    }
                }>(base(uuid), body, { timeout: 30000 })
            ).data.response,
        onSettled: () => client.invalidateQueries({ queryKey: key(uuid) })
    })
}
