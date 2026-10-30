type Resource = { resource: string; endpoints: { key: string; kind: string }[] }

const USER_SUBSCRIPTION_READ_KEYS = new Set([
    'subscriptions:by-username',
    'subscriptions:by-short-uuid-protected',
    'subscriptions:by-id',
    'subscriptions:raw',
    'subscriptions:connection-keys'
])

// Endpoint keys keep this preset bounded when unrelated API resources are added.
export const getUserManagementKeys = (resources: readonly Resource[]): string[] =>
    resources.flatMap((resource) =>
        resource.resource === 'users' || resource.resource === 'hwid-user-devices'
            ? resource.endpoints.map((endpoint) => endpoint.key)
            : resource.resource === 'internal-squads' || resource.resource === 'external-squads'
              ? resource.endpoints.filter((endpoint) => endpoint.kind === 'read').map((endpoint) => endpoint.key)
              : resource.resource === 'subscriptions'
                ? resource.endpoints.filter((endpoint) => endpoint.kind === 'read' && USER_SUBSCRIPTION_READ_KEYS.has(endpoint.key)).map((endpoint) => endpoint.key)
              : []
    )

export const SUBSCRIPTION_PAGE_SCOPES = [
    'subscription-page-configs:list',
    'subscription-page-configs:get',
    'subscriptions:subpage-config',
    'system:metadata'
]
