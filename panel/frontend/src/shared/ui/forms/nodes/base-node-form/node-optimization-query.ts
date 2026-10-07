import { z } from 'zod'

const statusSchema = z.object({
    nodeUuid: z.string().uuid(),
    level: z.enum(['none', 'safe', 'balanced', 'performance']).nullable(),
    checkedAt: z.string().nullable(),
    verifiedAt: z.string().nullable(),
    verified: z.boolean()
})

export function nodeOptimizationQuery(
    nodeUuid: string,
    fetchStatus: (url: string, signal: AbortSignal) => Promise<unknown>
) {
    return {
        queryKey: ['node-optimization', nodeUuid] as const,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
            const status = statusSchema.parse(
                await fetchStatus(`/api/node-ssh/${encodeURIComponent(nodeUuid)}/optimization`, signal)
            )
            if (status.nodeUuid !== nodeUuid) throw new Error('Node optimization identity mismatch')
            return status
        },
        placeholderData: () => undefined,
        refetchInterval: 5000,
        staleTime: 0
    }
}
