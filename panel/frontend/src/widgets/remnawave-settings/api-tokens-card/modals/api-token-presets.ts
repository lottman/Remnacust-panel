type Resource = { resource: string; endpoints: { key: string; kind: string }[] }

export const USER_MANAGEMENT_SCOPES = [
    'users:subscription-links',
    'users:subscription-links-primary',
    'users:subscription-links-cdn',
    'users:bulk-delete-by-status',
    'users:bulk-delete',
    'users:bulk-revoke-subscription',
    'users:bulk-reset-traffic',
    'users:bulk-update-users',
    'users:bulk-update-squads',
    'users:bulk-extend-expiration-date',
    'users:bulk-all-update-users',
    'users:bulk-all-reset-traffic',
    'users:bulk-all-extend-expiration-date',
    'users:create',
    'users:update',
    'users:delete',
    'users:list',
    'users:stream',
    'users:list-tags',
    'users:accessible-nodes',
    'users:subscription-request-history',
    'users:by-short-uuid',
    'users:by-id',
    'users:by-username',
    'users:revoke-subscription',
    'users:disable',
    'users:enable',
    'users:reset-traffic',
    'users:extend',
    'users:resolve'
] as const

export const getUserManagementKeys = (resources: readonly Resource[]): string[] => {
    const available = new Set(
        resources.flatMap((resource) => resource.endpoints.map(({ key }) => key))
    )
    return USER_MANAGEMENT_SCOPES.filter((scope) => available.has(scope))
}

export const SUBSCRIPTION_PAGE_SCOPES = [
    'subscription-page-configs:list',
    'subscription-page-configs:get',
    'subscriptions:subpage-config',
    'system:metadata'
]

const DOMAIN_LINK_KEYS = {
    all: 'users:subscription-links',
    primary: 'users:subscription-links-primary',
    cdn: 'users:subscription-links-cdn'
} as const

export function getDomainLinkKeys(
    resources: readonly Resource[],
    kind: keyof typeof DOMAIN_LINK_KEYS
): string[] {
    return resources
        .flatMap((resource) => resource.endpoints)
        .filter((endpoint) => endpoint.key === DOMAIN_LINK_KEYS[kind])
        .map((endpoint) => endpoint.key)
}

export function domainLinkScopeLabel(
    key: string
):
    | 'user-domain-links.scope-all'
    | 'user-domain-links.scope-primary'
    | 'user-domain-links.scope-cdn'
    | 'subscription-domains.scope-credentials'
    | undefined {
    if (key === 'subscription-domains:credentials') return 'subscription-domains.scope-credentials'
    if (key === DOMAIN_LINK_KEYS.all) return 'user-domain-links.scope-all'
    if (key === DOMAIN_LINK_KEYS.primary) return 'user-domain-links.scope-primary'
    if (key === DOMAIN_LINK_KEYS.cdn) return 'user-domain-links.scope-cdn'
    return undefined
}
