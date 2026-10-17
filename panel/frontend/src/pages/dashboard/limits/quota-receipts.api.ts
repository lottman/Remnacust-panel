import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { instance } from '@shared/api/axios'

export type QuotaReceiptEntry = {
    requestId: string
    generation: string
    actorUuid: string
    createdAt: string
    state: 'PRESENT' | 'ABSENT' | 'INVALID' | 'UNAVAILABLE' | 'CAPTURING' | 'INTERRUPTED'
    sourceBytes: number | null
    capturedAt: string | null
    digest: string | null
    metadata: {
        stream: string
        acked: string
        ackDigest: string
        pending: {
            sequence: string
            coreProcessId: string
            capturedAt: string
            counters: number
            digest: string
        } | null
    } | null
    reason: string | null
}
const prefix = ['quota-receipts']
export function useCaptureQuotaReceipt() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async ({ uuid, generation }: { uuid: string; generation: string }) =>
            (
                await instance.post<{
                    response: { requestId: string; state: QuotaReceiptEntry['state'] }
                }>(
                    `/api/limits/quota-recovery/nodes/${uuid}/receipts`,
                    { generation },
                    { timeout: 70000 }
                )
            ).data.response,
        onSettled: async () => {
            await Promise.all([
                client.invalidateQueries({ queryKey: prefix }),
                client.invalidateQueries({ queryKey: ['quota-recovery'] })
            ])
        }
    })
}
export function useQuotaReceipts(uuid: string, enabled: boolean, active: boolean, after?: string) {
    return useQuery({
        queryKey: [...prefix, uuid, after ?? 'first'],
        enabled,
        queryFn: async ({ signal }) =>
            (
                await instance.get<{
                    response: { entries: QuotaReceiptEntry[]; nextAfter: string | null }
                }>(`/api/limits/quota-recovery/nodes/${uuid}/receipts`, {
                    params: { after },
                    signal
                })
            ).data.response,
        placeholderData: (previous) => previous,
        staleTime: 0,
        refetchInterval: (query) =>
            active || query.state.data?.entries.some((entry) => entry.state === 'CAPTURING')
                ? 1500
                : false
    })
}
export function useDownloadQuotaReceipt(uuid: string) {
    return useMutation({
        mutationFn: async ({ requestId, digest }: { requestId: string; digest: string }) => {
            const response = await instance.get<Blob>(
                `/api/limits/quota-recovery/nodes/${uuid}/receipts/${requestId}/journal`,
                { responseType: 'blob', timeout: 30000 }
            )
            if (
                response.data.type !== 'application/gzip' ||
                response.data.size === 0 ||
                response.data.size > 8 * 1024 * 1024 + 65536
            )
                throw new Error('Invalid usage journal download')
            const url = URL.createObjectURL(response.data),
                link = document.createElement('a')
            link.href = url
            link.download = `usage-${requestId}-${digest.slice(0, 12)}.journal.gz`
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
