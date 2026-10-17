import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect } from 'react'

import { instance } from '@shared/api/axios'

export type ReleaseDraft = {
    requestId: string
    generation: string
    bankRequest: string
    note: string
}
export type ReleaseApproval = ReleaseDraft & { planDigest: string }
export type FinalizationInput = { requestId: string; approvalRequest: string; note: string }
export type ReleaseStatus = {
    request: string
    generation: string
    actor: string
    planDigest: string
    bankRequest: string
    baseline: string
    note: string
    createdAt: string
    total: string
    acknowledged: string
    active: string
    finalization: string | null
}
export type FinalizationStatus = {
    requestId: string
    approvalRequest: string
    generation: string
    actor: string
    note: string
    busy: boolean
    result: { coordinatorGeneration: string; completedAt: string } | null
    total: string
    dispatch?: {
        state: 'QUEUED' | 'RUNNING' | 'FAILED' | 'COMPLETED'
        attempts: string
        error: string | null
        owner: string | null
    } | null
    attempts: {
        attempt: string
        requestedAt: string
        observedAt: string | null
        outcome: { confirmed: boolean; error?: string } | null
        checked: string
        dispatchOwner?: string | null
    }[]
    nextAfter: string | null
}
export type ReleaseJobs = {
    entries: {
        request: string
        node: string
        name?: string | null
        acknowledged: boolean
        busy: boolean
    }[]
    nextAfter: string | null
}
export type ReleaseJobDetails = {
    requestId: string
    approval: string
    node: string
    attempts: {
        attempt: string
        requestedAt: string
        outcome: { confirmed: boolean; error: string | null } | null
    }[]
    nextAfter: string | null
}
const base = '/api/limits/quota-recovery/releases'
const key = ['quota-release']
const readOptions = {
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
} as const
export function releaseProblem(error: unknown) {
    const code = isAxiosError<{ errorCode?: string }>(error)
        ? error.response?.data?.errorCode
        : undefined
    return releaseCodeProblem(code)
}
export function releaseCodeProblem(code: string | undefined) {
    if (code?.endsWith('NODE_UNAVAILABLE')) return 'nodeUnavailable'
    if (code?.endsWith('INVALID_ACK')) return 'invalidAck'
    if (code?.includes('REQUEST_CONFLICT') || code?.endsWith('ALREADY_APPROVED')) return 'conflict'
    if (code?.endsWith('NOT_PENDING')) return 'notPending'
    if (
        code?.includes('SOURCE_CHANGED') ||
        code?.endsWith('STALE_PLAN') ||
        code?.startsWith('QUOTA_BANK_')
    )
        return 'stale'
    if (code?.endsWith('BUSY') || code?.endsWith('LEASE_LOST')) return 'busy'
    if (code?.endsWith('NOT_READY')) return 'notReady'
    return 'unknown'
}
export function useReleaseStatus(generation: string, enabled: boolean, watch = false) {
    return useQuery({
        ...readOptions,
        queryKey: [...key, generation],
        enabled,
        refetchInterval: enabled && watch ? 2500 : false,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{ response: ReleaseStatus | null }>(base, {
                    params: { generation },
                    signal
                })
            ).data.response
    })
}
export function useReleaseJobs(approval: string | undefined, enabled: boolean, after?: string) {
    return useQuery({
        ...readOptions,
        queryKey: [...key, approval, 'jobs', after],
        enabled: enabled && !!approval,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{ response: ReleaseJobs }>(`${base}/${approval}/jobs`, {
                    params: { after },
                    signal
                })
            ).data.response
    })
}
export function useReleaseJob(approval: string, request: string, enabled: boolean, after?: string) {
    return useQuery({
        ...readOptions,
        queryKey: [...key, approval, request, after],
        enabled,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{ response: ReleaseJobDetails }>(
                    `${base}/${approval}/jobs/${request}`,
                    { params: { after }, signal }
                )
            ).data.response
    })
}
export function useFinalization(
    approval: string | undefined,
    request: string | undefined,
    enabled: boolean,
    after?: string
) {
    const client = useQueryClient()
    const query = useQuery<FinalizationStatus>({
        ...readOptions,
        queryKey: [...key, approval, 'finalization', request, after],
        enabled: enabled && !!approval && !!request,
        refetchInterval: (current) => (enabled && !current.state.data?.result ? 2500 : false),
        queryFn: async ({ signal }) =>
            (
                await instance.get<{ response: FinalizationStatus }>(
                    `${base}/${approval}/finalizations/${request}`,
                    { params: { after }, signal }
                )
            ).data.response
    })
    useEffect(() => {
        if (query.data?.result)
            void Promise.allSettled([
                client.invalidateQueries({ queryKey: ['quota-recovery'] }),
                client.invalidateQueries({ queryKey: ['limits'] })
            ])
    }, [client, query.data?.result?.coordinatorGeneration])
    return query
}
export function useReleasePreview() {
    return useMutation({
        retry: false,
        mutationFn: async (body: ReleaseDraft) => {
            await instance.post(
                '/api/limits/quota-recovery/bank-snapshots/capture',
                { generation: body.generation, requestId: body.bankRequest },
                { timeout: 75000 }
            )
            return (
                await instance.post<{
                    response: {
                        planDigest: string
                        plan: { nodes: { node: string }[] }
                        approved: boolean
                    }
                }>(base + '/preview', body, { timeout: 90000 })
            ).data.response
        }
    })
}
export function useApproveRelease() {
    const client = useQueryClient()
    return useMutation({
        retry: false,
        mutationFn: async (body: ReleaseApproval) =>
            (
                await instance.post<{ response: { request: string; planDigest: string } }>(
                    base + '/approve',
                    body,
                    { timeout: 90000 }
                )
            ).data.response,
        onSettled: () => {
            void client.invalidateQueries({ queryKey: key })
        }
    })
}
export function useDeliverRelease(approval: string) {
    const client = useQueryClient()
    return useMutation({
        retry: false,
        mutationFn: async (request: string) =>
            (
                await instance.post(
                    `${base}/${approval}/jobs/${request}/deliver`,
                    {},
                    { timeout: 90000 }
                )
            ).data.response,
        onSettled: () => {
            void client.invalidateQueries({ queryKey: key })
        }
    })
}
export function useFinalizeRelease() {
    const client = useQueryClient()
    return useMutation({
        retry: false,
        mutationFn: async (body: FinalizationInput) =>
            (
                await instance.post(
                    `${base}/${body.approvalRequest}/finalizations`,
                    { requestId: body.requestId, note: body.note },
                    { timeout: 90000 }
                )
            ).data.response,
        onSettled: () => {
            void Promise.allSettled([
                client.invalidateQueries({ queryKey: key }),
                client.invalidateQueries({ queryKey: ['quota-recovery'] }),
                client.invalidateQueries({ queryKey: ['quota-synchronization'] })
            ])
        }
    })
}
