import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { instance } from '@shared/api/axios'

export type QuotaRecoveryIssue =
    | 'NODE_REMOVED'
    | 'NODE_DISABLED'
    | 'NODE_UNAVAILABLE'
    | 'UNSUPPORTED'
    | 'POLICY_NOT_APPLIED'
    | 'INVALID_REPORT'
    | 'JOURNAL_CHANGED'
    | 'JOURNAL_BEHIND'
    | 'JOURNAL_AHEAD'
    | 'POLICY_CHANGED'
    | 'CORE_CHANGED'
    | 'PAGINATION_REQUIRED'
    | 'UNKNOWN_RESERVES'
    | 'MISSING_RESERVES'
    | 'RESERVE_BINDING'
    | 'ACTIVATION_CHANGED'
    | 'REGISTRATION_CHANGED'
    | 'SETTLEMENT_REQUIRED'
    | 'USAGE_EXPOSURE'
    | 'PENDING_RECEIPT'
    | 'STATE_CHANGED'
    | 'RECOVERY_PAUSE_UNCONFIRMED'
    | 'RECOVERY_FENCE_UNVERIFIED'
    | 'OWNER_UNPROVEN'
    | 'OWNER_CHANGED'

export type QuotaRecoveryReport = {
    pauseRequested?: boolean
    recoveryFence?: { state: 'FENCED' | 'RELEASED'; generation: string; digest: string } | null
    issues: QuotaRecoveryIssue[]
    databaseGrants: string
    nodeGrants: number | null
    unknownGrants: number
    missingGrants: number
    exposureCount: string
}
export type QuotaRecoveryStatus = {
    financial?: Record<
        | 'unsettledReserves'
        | 'exposures'
        | 'nativeTickets'
        | 'nativeEffects'
        | 'legacyStreams'
        | 'legacyJobs'
        | 'recoveryDeliveries'
        | 'activeWorkers',
        string
    > | null
    checkingNode: string | null
    restore: { generation: string; restoredAt: string; reconciledAt: string | null } | null
    nodes: {
        uuid: string
        name: string | null
        disabled: boolean | null
        checking: boolean
        startedAt: string | null
        finishedAt: string | null
        report: QuotaRecoveryReport | null
    }[]
    nextAfter: string | null
}
const key = ['quota-recovery']
export function useQuotaRecovery(after?: string) {
    return useQuery({
        queryKey: [...key, after],
        queryFn: async ({ signal }) =>
            (
                await instance.get<{ response: QuotaRecoveryStatus }>(
                    '/api/limits/quota-recovery',
                    { params: { after }, signal }
                )
            ).data.response,
        placeholderData: (previous) => previous,
        staleTime: 0,
        refetchInterval: 15000,
        refetchOnWindowFocus: true
    })
}
export function useCheckQuotaRecovery() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async ({ uuid, generation }: { uuid: string; generation: string }) =>
            (
                await instance.post(
                    `/api/limits/quota-recovery/nodes/${uuid}/check`,
                    { generation },
                    { timeout: 70000 }
                )
            ).data,
        onSettled: () => client.invalidateQueries({ queryKey: key })
    })
}

export function usePauseQuotaRecovery() {
    const client = useQueryClient()
    return useMutation({
        retry: false,
        mutationFn: async ({ uuid, generation }: { uuid: string; generation: string }) =>
            (
                await instance.post(
                    `/api/limits/quota-recovery/nodes/${uuid}/pause`,
                    { generation },
                    { timeout: 70000 }
                )
            ).data,
        onSettled: () => client.invalidateQueries({ queryKey: key })
    })
}

export type QuotaRecoveryEvidence = {
    id: string
    generation: string
    actorUuid: string
    createdAt: string
    journalDigest: string
    sqlDigest: string
    sqlParts: number
    sqlRows: string
    journalMetadata: { entries: number; sequence: string; instance: string; coreProcessId: string }
    report: QuotaRecoveryReport
}

export function useQuotaRecoveryHistory(uuid: string, enabled: boolean, after?: string) {
    return useQuery({
        queryKey: [...key, 'history', uuid, after],
        enabled,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{
                    response: { entries: QuotaRecoveryEvidence[]; nextAfter: string | null }
                }>(`/api/limits/quota-recovery/nodes/${uuid}/history`, {
                    params: { after },
                    signal
                })
            ).data.response,
        placeholderData: (previous) => previous,
        staleTime: 0
    })
}

export function useDownloadQuotaEvidence(uuid: string) {
    return useMutation({
        mutationFn: async ({ id, digest }: { id: string; digest: string }) => {
            const response = await instance.get<Blob>(
                `/api/limits/quota-recovery/nodes/${uuid}/history/${id}/artifacts/${digest}`,
                { responseType: 'blob', timeout: 30000 }
            )
            if (
                response.data.type !== 'application/gzip' ||
                response.data.size === 0 ||
                response.data.size > 32 * 1024 * 1024 + 65536
            )
                throw new Error('Invalid quota snapshot download')
            const url = URL.createObjectURL(response.data)
            const link = document.createElement('a')
            link.href = url
            link.download = `quota-${id}-${digest.slice(0, 12)}.json.gz`
            document.body.appendChild(link)
            try {
                link.click()
            } finally {
                link.remove()
                setTimeout(() => URL.revokeObjectURL(url), 60000)
            }
        }
    })
}
