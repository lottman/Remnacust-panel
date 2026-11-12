import { queryOptions } from '@tanstack/react-query'

import { instance } from '@shared/api/axios'

export type SubscriptionDomain = {
    uuid: string
    name: string
    domain: string
    path: string
    kind: 'PRIMARY' | 'CDN'
    parentUuid: string | null
    isDefault: boolean
    accessMode: 'OPEN' | 'CDN_ONLY' | 'REDIRECT' | 'BLOCKED'
    redirectDomainUuid: string | null
    usersCount: number
    aliasesCount: number
    publicBaseUrl: string
    requestHeaderName: string | null
}

type SubscriptionDomainsResponse = {
    response: SubscriptionDomain[]
    environment?: 'synced' | 'unavailable' | 'invalid' | 'conflict'
}

export const subscriptionDomainsKey = ['subscription-domains'] as const

export function subscriptionDomainsQuery() {
    return queryOptions({
        queryKey: subscriptionDomainsKey,
        queryFn: async ({ signal }) =>
            (
                await instance.get<SubscriptionDomainsResponse>('/api/subscription-domains', {
                    signal
                })
            ).data,
        staleTime: 15_000,
        refetchOnWindowFocus: 'always'
    })
}

const selectDomains = (data: SubscriptionDomainsResponse) => data.response

export function subscriptionDomainItemsQuery() {
    return { ...subscriptionDomainsQuery(), select: selectDomains }
}
