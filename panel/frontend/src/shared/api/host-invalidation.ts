import type { QueryClient } from '@tanstack/react-query'

export const affectsHosts = (endpoint: string) =>
    /^\/?(?:api\/)?hosts(?:\/|$)/.test(endpoint.split('?')[0])

export const cancelHostReads = (client: QueryClient) =>
    client.cancelQueries({ queryKey: ['hosts'] })

export const invalidateHosts = async (client: QueryClient) => {
    // A GET started before the write must not repopulate a fresh cache with old values.
    await cancelHostReads(client)
    await client.invalidateQueries({ queryKey: ['hosts'], refetchType: 'active' })
}
