import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { instance } from '@shared/api/axios'

export type LegacyAllocation =
    | { owner: string; action: 'LOSS' }
    | { owner: string; action: 'CHARGE'; subject: string; period: 'CURRENT' | 'LIFETIME' }
export type LegacyDraft = { generation: string; allocations: LegacyAllocation[]; note: string }
export type LegacyTarget = { subject: string; userId: string; username: string }
export type LegacySource = {
    digest: string
    applied: boolean
    pendingUsers: string[] | null
    committedAt: string
    payload: { u: string; b: string; n: string }[]
}
export type LegacyPlan = {
    receipt: string
    generation: string
    source: LegacySource
    note: string
    allocations: LegacyAllocation[]
    charges: (LegacyTarget & {
        bytes: string
        currentBytes: string
        before: { used: string; lifetime: string }
        after: { used: string; lifetime: string }
        window: { epoch: string; resetAt: string | null; limit: string; strategy: string }
    })[]
    losses: { owner: string; bytes: string; nodeUuid: string }[]
    discardedEvents: string[]
    totals: { charged: string; current: string; lost: string }
}
export type LegacyDecision = {
    requestId: string
    generation: string
    actorUuid: string
    receipt: string
    createdAt: string
    planDigest: string
    plan: LegacyPlan
}
export type LegacyJobDetails = {
    decision: LegacyDecision | null
    source: LegacySource | null
    candidates: { owner: string; subject: string; username: string }[]
}
type LegacyPage = {
    entries: {
        receipt: string
        applied: boolean
        owners: number
        committedAt: string
        requestId: string | null
    }[]
    nextAfter: string | null
}
const prefix = ['legacy-quota-recovery']
const base = '/api/limits/quota-recovery/legacy-jobs'
export function legacyRecoveryProblem(error: unknown) {
    const code = isAxiosError<{ errorCode?: string }>(error)
        ? error.response?.data?.errorCode
        : undefined
    if (code === 'LEGACY_RECOVERY_STALE_PLAN' || code === 'LEGACY_RECOVERY_TARGET_CHANGED')
        return 'stale'
    if (
        code === 'LEGACY_RECOVERY_NOT_PENDING' ||
        code === 'LEGACY_RECOVERY_ALREADY_RESOLVED' ||
        code === 'LEGACY_RECOVERY_REQUEST_CONFLICT'
    )
        return 'closed'
    if (
        code === 'LEGACY_RECOVERY_SOURCE_INVALID' ||
        code === 'LEGACY_RECOVERY_SOURCE_MISSING' ||
        code === 'LEGACY_RECOVERY_DECISION_CORRUPT'
    )
        return 'sourceInvalid'
    if (code === 'LEGACY_RECOVERY_OVERFLOW') return 'overflow'
    if (code === 'LEGACY_RECOVERY_QUEUE_UNAVAILABLE') return 'queueUnavailable'
    if (code === 'LEGACY_RECOVERY_INVALID_ALLOCATION' || code === 'LEGACY_RECOVERY_INVALID_REQUEST')
        return 'allocationInvalid'
    return null
}
export function useLegacyJobs(generation: string, enabled: boolean, after?: string) {
    return useQuery({
        queryKey: [...prefix, generation, 'list', after],
        enabled,
        queryFn: async ({ signal }) =>
            (await instance.get<{ response: LegacyPage }>(base, { signal, params: { after } })).data
                .response,
        placeholderData: (previous) => previous,
        staleTime: 0
    })
}
export function useLegacyJob(generation: string, receipt: string, enabled: boolean) {
    return useQuery({
        queryKey: [...prefix, generation, receipt],
        enabled,
        queryFn: async ({ signal }) =>
            (await instance.get<{ response: LegacyJobDetails }>(`${base}/${receipt}`, { signal }))
                .data.response,
        staleTime: 0
    })
}
export function useLegacyTargets(generation: string, search: string, enabled: boolean) {
    return useQuery({
        queryKey: [...prefix, generation, 'targets', search],
        enabled,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{ response: { entries: LegacyTarget[] } }>(`${base}/targets`, {
                    signal,
                    params: { search }
                })
            ).data.response.entries,
        staleTime: 0
    })
}
export function useLegacyPreview(receipt: string) {
    return useMutation({
        mutationFn: async (draft: LegacyDraft) =>
            (
                await instance.post<{ response: { plan: LegacyPlan; planDigest: string } }>(
                    `${base}/${receipt}/preview`,
                    draft,
                    { timeout: 20000 }
                )
            ).data.response
    })
}
export function useResolveLegacyJob(receipt: string) {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (body: LegacyDraft & { requestId: string; planDigest: string }) =>
            (
                await instance.post<{ response: LegacyDecision }>(
                    `${base}/${receipt}/resolve`,
                    body,
                    { timeout: 45000 }
                )
            ).data.response,
        onSettled: async () => {
            await Promise.all([
                client.invalidateQueries({ queryKey: prefix }),
                client.invalidateQueries({ queryKey: ['quota-recovery'] }),
                client.invalidateQueries({ queryKey: ['limit-management'] })
            ])
        }
    })
}

export function useCaptureLegacyQueue() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (body: { generation: string; offset: number }) =>
            (
                await instance.post<{
                    response: {
                        entries: {
                            receipt: string | null
                            state:
                                | 'CAPTURED'
                                | 'RETRY_SCHEDULED'
                                | 'RETRY_REQUIRED'
                                | 'INVALID_SOURCE'
                        }[]
                        nextOffset: number | null
                    }
                }>(`${base}/capture-failed`, body, { timeout: 45000 })
            ).data.response,
        onSettled: async () => {
            await client.invalidateQueries({ queryKey: prefix })
        }
    })
}
