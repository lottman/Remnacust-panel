import { instance } from '@shared/api/axios'

export type CdnCredentialsSession = {
    uuid: string
    requestId: string
}

export function cdnCredentialsQuery(session: CdnCredentialsSession | null) {
    return {
        queryKey: ['subscription-domain-credentials', session?.uuid, session?.requestId] as const,
        enabled: !!session,
        gcTime: 0,
        staleTime: 0,
        retry: false as const,
        refetchOnMount: 'always' as const,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
            if (!session) throw new Error('CDN credentials view is closed')
            return (
                await instance.post<{
                    response: { requestHeaderName: string; requestHeaderValue: string }
                }>(`/api/subscription-domains/${session.uuid}/credentials`, undefined, {
                    signal,
                    timeout: 15_000,
                    params: { _request: crypto.randomUUID() },
                    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' }
                })
            ).data.response
        }
    }
}
