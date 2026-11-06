export const SCOPE_READ_DEPENDENCIES = [
    { scope: 'users:update', requiredScope: 'users:by-id' },
    { scope: 'users:enable', requiredScope: 'users:by-id' },
    { scope: 'users:disable', requiredScope: 'users:by-id' },
    { scope: 'users:reset-traffic', requiredScope: 'users:by-id' },
    { scope: 'users:extend', requiredScope: 'users:by-id' },
    { scope: 'users:revoke-subscription', requiredScope: 'users:by-id' },
    { scope: 'external-squads:update', requiredScope: 'external-squads:get' },
    { scope: 'external-squads:reorder', requiredScope: 'external-squads:list' },
    { scope: 'config-profiles:update', requiredScope: 'config-profiles:get' },
    { scope: 'subscription-template:update', requiredScope: 'subscription-template:get' }
] as const

function grantsEndpoint(scopes: ReadonlySet<string>, endpoint: string, kind: 'read' | 'write') {
    const resource = endpoint.slice(0, endpoint.indexOf(':'))
    return (
        scopes.has('*') ||
        scopes.has(`${resource}:*`) ||
        scopes.has(`${resource}:${kind}`) ||
        scopes.has(endpoint)
    )
}

export function getMissingReadRequirements(scopes: readonly string[]) {
    const grants = new Set(scopes)
    return SCOPE_READ_DEPENDENCIES.filter(
        ({ scope, requiredScope }) =>
            grantsEndpoint(grants, scope, 'write') && !grantsEndpoint(grants, requiredScope, 'read')
    )
}
