import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { instance } from '@shared/api/axios'
export type ExposureDraft = { generation: string; bankRequest: string; note: string }
export type ExposureApproval = ExposureDraft & { requestId: string; planDigest: string }
export type ExposurePlan = {
    version: string
    node: string
    generation: string
    bankRequest: string
    bankDigest: string
    acknowledgementRequest: string
    decisionRequest: string
    witnessDigest: string
    core: string
    instance: string
    sequence: string
    scope: { revision: string; requestedAt: string; eligible: string; remaining: string }
    note: string
}
export type ExposureDecision = {
    requestId: string
    node: string
    generation: string
    actor: string
    planDigest: string
    plan: ExposurePlan
    createdAt: string
}
const base = (uuid: string) => `/api/limits/quota-recovery/nodes/${uuid}/exposure-closures`
const key = ['quota-exposure-closure']
export function exposureClosureCode(error: unknown) {
    return isAxiosError<{ errorCode?: string }>(error) ? error.response?.data?.errorCode : undefined
}
export function exposureClosureProblem(error: unknown) {
    const code = exposureClosureCode(error)
    if (code === 'RECOVERY_EXPOSURE_SOURCE_CHANGED') return 'sourceChanged'
    if (code === 'RECOVERY_EXPOSURE_STALE_PLAN') return 'stale'
    if (code === 'RECOVERY_EXPOSURE_REQUEST_CONFLICT') return 'conflict'
    if (code === 'RECOVERY_EXPOSURE_NOT_PENDING') return 'notPending'
    if (code === 'RECOVERY_EXPOSURE_NOTHING_TO_CLOSE') return 'none'
    if (code === 'RECOVERY_EXPOSURE_NODE_UNAVAILABLE') return 'nodeUnavailable'
    if (code?.startsWith('QUOTA_BANK_')) return 'stale'
    return 'failed'
}
export function exposureClosureRejected(error: unknown) {
    const code = exposureClosureCode(error)
    return (
        !!code &&
        [
            'RECOVERY_EXPOSURE_SOURCE_CHANGED',
            'RECOVERY_EXPOSURE_STALE_PLAN',
            'RECOVERY_EXPOSURE_REQUEST_CONFLICT',
            'RECOVERY_EXPOSURE_NOT_PENDING',
            'RECOVERY_EXPOSURE_NOTHING_TO_CLOSE',
            'RECOVERY_EXPOSURE_INVALID_REQUEST'
        ].includes(code)
    )
}
export function useExposureHistory(
    uuid: string,
    generation: string,
    enabled: boolean,
    after?: string
) {
    return useQuery({
        queryKey: [...key, uuid, generation, 'history', after ?? ''],
        enabled,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: async () =>
            (
                await instance.get<{
                    response: { entries: ExposureDecision[]; nextAfter: string | null }
                }>(base(uuid), {
                    params: { generation, ...(after ? { after } : {}) },
                    timeout: 75000
                })
            ).data.response
    })
}
export function useExposureDecision(
    uuid: string,
    generation: string,
    request: string | undefined,
    enabled: boolean
) {
    return useQuery({
        queryKey: [...key, uuid, generation, request ?? ''],
        enabled: enabled && !!request,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: async () =>
            (
                await instance.get<{ response: ExposureDecision }>(base(uuid) + '/' + request, {
                    params: { generation },
                    timeout: 75000
                })
            ).data.response
    })
}
export function useExposurePreview(uuid: string) {
    return useMutation({
        retry: false,
        mutationFn: async (body: ExposureDraft) => {
            await instance.post(
                '/api/limits/quota-recovery/bank-snapshots/capture',
                { generation: body.generation, requestId: body.bankRequest },
                { timeout: 75000 }
            )
            return (
                await instance.post<{ response: { plan: ExposurePlan; planDigest: string } }>(
                    base(uuid) + '/preview',
                    body,
                    { timeout: 90000 }
                )
            ).data.response
        }
    })
}
export function useExposureResolve(uuid: string, generation: string) {
    const client = useQueryClient()
    return useMutation({
        retry: false,
        mutationFn: async (body: ExposureApproval) =>
            (
                await instance.post<{ response: ExposureDecision }>(base(uuid) + '/resolve', body, {
                    timeout: 90000
                })
            ).data.response,
        onSettled: () => {
            void Promise.allSettled([
                client.invalidateQueries({ queryKey: [...key, uuid, generation] }),
                client.invalidateQueries({ queryKey: ['quota-recovery'] }),
                client.invalidateQueries({ queryKey: ['quota-bank'] })
            ])
        }
    })
}
