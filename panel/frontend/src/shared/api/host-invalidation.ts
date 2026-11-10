import type { QueryClient } from '@tanstack/react-query'

export const affectsHosts = (endpoint: string) =>
    /^\/?(?:api\/)?hosts(?:\/|$)/.test(endpoint.split('?')[0])

export const cancelHostReads = (client: QueryClient) =>
    Promise.all([
        client.cancelQueries({ queryKey: ['hosts'] }),
        client.cancelQueries({ queryKey: ['host-template-assignments'] })
    ])

export const invalidateHosts = async (client: QueryClient, deletedHostUuid?: string) => {
    // A GET started before the write must not repopulate a fresh cache with old values.
    await cancelHostReads(client)
    if (deletedHostUuid) {
        client.removeQueries({
            queryKey: ['hosts', 'getHost', { uuid: deletedHostUuid }],
            exact: true
        })
        client.removeQueries({
            queryKey: ['host-template-assignments', deletedHostUuid],
            exact: true
        })
    }
    await Promise.all([
        client.invalidateQueries({ queryKey: ['hosts'], refetchType: 'active' }),
        client.invalidateQueries({ queryKey: ['host-template-assignments'], refetchType: 'active' })
    ])
}
