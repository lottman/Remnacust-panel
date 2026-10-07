import type { QueryClient } from '@tanstack/react-query'

// These resources change membership, availability, or quota shown on Limits.
export const affectsLimits = (endpoint: string) =>
    /^\/?(?:api\/)?(?:users|hosts|internal-squads|external-squads|config-profiles|hwid)(?:\/|$)/.test(
        endpoint.split('?')[0]
    )

export const invalidateLimits = (client: QueryClient) =>
    client.invalidateQueries({ queryKey: ['limit-management'] })
