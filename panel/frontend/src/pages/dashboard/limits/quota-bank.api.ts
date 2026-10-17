import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { instance } from '@shared/api/axios'

export type QuotaBank = {
    requestId: string
    generation: string
    actorUuid: string
    version: string
    sourceDigest: string
    partCount: number
    rowCount: string
    createdAt: string
}
const prefix = ['quota-bank'],
    base = '/api/limits/quota-recovery/bank-snapshots'
export function quotaBankProblem(error: unknown) {
    const code = isAxiosError<{ errorCode?: string }>(error)
        ? error.response?.data?.errorCode
        : undefined
    if (code === 'QUOTA_BANK_NOT_PENDING' || code === 'QUOTA_BANK_REQUEST_CONFLICT') return 'stale'
    if (code === 'QUOTA_BANK_CAPACITY') return 'capacity'
    if (code === 'QUOTA_BANK_CORRUPT') return 'corrupt'
    return 'failed'
}
export function useQuotaBanks(generation: string, enabled: boolean, after?: string) {
    return useQuery({
        queryKey: [...prefix, generation, after],
        enabled,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{
                    response: { entries: QuotaBank[]; nextAfter: string | null }
                }>(base, { signal, params: { after } })
            ).data.response,
        placeholderData: (previous) => previous,
        staleTime: 0
    })
}
export function useCaptureQuotaBank() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (body: { generation: string; requestId: string }) =>
            (
                await instance.post<{ response: QuotaBank }>(base + '/capture', body, {
                    timeout: 75000
                })
            ).data.response,
        onSettled: async () => {
            await client.invalidateQueries({ queryKey: prefix })
        }
    })
}
export function useCompareQuotaBank(request: string) {
    return useMutation({
        mutationFn: async (generation: string) =>
            (
                await instance.post<{
                    response: {
                        matches: boolean
                        changedSections: string[]
                        originalDigest: string
                        currentDigest: string
                    }
                }>(`${base}/${request}/compare`, { generation }, { timeout: 75000 })
            ).data.response
    })
}
export function useQuotaBankParts(request: string, enabled: boolean, after?: number) {
    return useQuery({
        queryKey: [...prefix, 'parts', request, after],
        enabled,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{
                    response: {
                        entries: {
                            ordinal: number
                            section: string
                            digest: string
                            rows: number
                        }[]
                        nextAfter: number | null
                    }
                }>(`${base}/${request}/parts`, { signal, params: { after } })
            ).data.response,
        placeholderData: (previous) => previous
    })
}
export function useDownloadQuotaBank(request: string) {
    return useMutation({
        mutationFn: async (digest: string) => {
            const response = await instance.get<Blob>(`${base}/${request}/artifacts/${digest}`, {
                responseType: 'blob',
                timeout: 30000
            })
            if (
                response.data.type !== 'application/gzip' ||
                !response.data.size ||
                response.data.size > 32 * 1024 * 1024 + 65536
            )
                throw Error('Invalid bank archive download')
            const url = URL.createObjectURL(response.data),
                link = document.createElement('a')
            link.href = url
            link.download = `quota-bank-${request}-${digest.slice(0, 12)}.json.gz`
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
