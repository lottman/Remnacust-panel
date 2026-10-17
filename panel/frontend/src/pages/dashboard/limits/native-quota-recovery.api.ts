import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { instance } from '@shared/api/axios'

import { LegacyAllocation, LegacyPlan, legacyRecoveryProblem } from './legacy-quota-recovery.api'

export type NativeAccount = {
    account: string
    eligible: boolean
    label?: string | null
    kind: string | null
    key: string | null
    prices: { owner: string; factor: string; scale: string; bytes: string }[]
}
export type NativeSource = {
    sourceRequest: string
    generation: string
    node: string
    stream: string
    sequence: string
    multiplier: string
    alreadyCommitted: boolean
    owners: { u: string; b: string; n: string }[]
    candidates?: { owner: string; subject: string; username: string }[]
    accounts: NativeAccount[]
    decision?: NativeDecision | null
}
export type NativeDraft = {
    generation: string
    sourceRequest: string
    bankRequest: string
    allocations: LegacyAllocation[]
    accounts: { account: string; action: 'APPLY' | 'LOSS' }[]
    note: string
}
export type NativePlan = {
    billing: LegacyPlan
    accountChanges?: { account: string; before: string; after: string; charged: string }[]
    source: { alreadyCommitted: boolean; frame?: { coreProcessId: string; stats: unknown[] } }
    accounts: NativeDraft['accounts']
    applyOutside: { account: string; owner: string; factor: string; scale: string; bytes: string }[]
    lostOutside: { account: string; owner: string; factor: string; scale: string; bytes: string }[]
}
export type NativeDecision = {
    requestId: string
    actor: string
    createdAt: string
    planDigest: string
    plan: NativePlan
}
const base = (uuid: string) => `/api/limits/quota-recovery/nodes/${uuid}/native-import`
export function nativeOutcomeUnknown(error: unknown) {
    if (!isAxiosError<{ errorCode?: string }>(error)) return true
    const code = error.response?.data?.errorCode
    if (code && /^(NATIVE_RECOVERY_|LEGACY_RECOVERY_|QUOTA_BANK_)/.test(code)) return false
    return !error.response || error.response.status >= 500
}
export function nativeRecoveryProblem(error: unknown) {
    const code = isAxiosError<{ errorCode?: string }>(error)
        ? error.response?.data?.errorCode
        : undefined
    if (code === 'QUOTA_BANK_CAPACITY') return 'bankCapacity'
    if (code === 'QUOTA_BANK_CORRUPT') return 'bankCorrupt'
    if (code?.startsWith('QUOTA_BANK_')) return 'stale'
    if (code === 'NATIVE_RECOVERY_SOURCE_MISSING' || code === 'NATIVE_RECOVERY_SOURCE_INVALID')
        return 'sourceInvalid'
    if (code === 'NATIVE_RECOVERY_ACCOUNT_UNPROVEN') return 'accountUnproven'
    if (code?.startsWith('NATIVE_RECOVERY_')) return 'stale'
    return legacyRecoveryProblem(error) ?? 'failed'
}
export function useNativeSource(
    uuid: string,
    request: string,
    generation: string,
    enabled: boolean
) {
    return useQuery({
        queryKey: ['native-quota-source', uuid, request, generation],
        enabled,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 0,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{ response: NativeSource }>(`${base(uuid)}/${request}`, {
                    signal,
                    params: { generation },
                    timeout: 75000
                })
            ).data.response
    })
}
export function useNativePreview(uuid: string) {
    return useMutation({
        mutationFn: async (body: NativeDraft) => {
            await instance.post(
                '/api/limits/quota-recovery/bank-snapshots/capture',
                { generation: body.generation, requestId: body.bankRequest },
                { timeout: 75000 }
            )
            return (
                await instance.post<{ response: { plan: NativePlan; planDigest: string } }>(
                    base(uuid) + '/preview',
                    body,
                    { timeout: 75000 }
                )
            ).data.response
        }
    })
}
export function useNativeResolve(uuid: string) {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (body: NativeDraft & { requestId: string; planDigest: string }) =>
            (
                await instance.post<{
                    response: NativeDecision
                }>(base(uuid) + '/resolve', body, { timeout: 75000 })
            ).data.response,
        onSuccess: async () => {
            await Promise.all([
                client.invalidateQueries({ queryKey: ['quota-recovery'] }),
                client.invalidateQueries({ queryKey: ['quota-bank'] }),
                client.invalidateQueries({ queryKey: ['legacy-quota-recovery'] })
            ])
        }
    })
}
