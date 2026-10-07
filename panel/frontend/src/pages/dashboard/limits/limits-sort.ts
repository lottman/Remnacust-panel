import type { Scope } from './limits.api'

export type ScopeSort =
    | 'position'
    | 'name'
    | 'usedBytes'
    | 'limitBytes'
    | 'speedLimitMbps'
    | 'totalSpeedLimitMbps'

export function sortLimitScopes(
    scopes: Scope[],
    sort: ScopeSort,
    direction: 'asc' | 'desc',
    locale: string
) {
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
    const compare = (a: bigint | number, b: bigint | number) => (a < b ? -1 : a > b ? 1 : 0)
    const value = (s: Scope) => {
        if (sort === 'position') return s.viewPosition ?? Number.MAX_SAFE_INTEGER
        if (sort === 'usedBytes') return s.usedBytes == null ? null : BigInt(s.usedBytes)
        if (sort === 'limitBytes') return BigInt(s.limitBytes) > 0n ? BigInt(s.limitBytes) : null
        if (sort === 'speedLimitMbps' || sort === 'totalSpeedLimitMbps') return s[sort] || null
        return null
    }
    return [...scopes].sort((a, b) => {
        let result = 0
        if (sort === 'name') result = collator.compare(a.name, b.name)
        else {
            const av = value(a),
                bv = value(b)
            // Unlimited values and unavailable usage go last in either direction.
            if (av === null && bv !== null) return 1
            if (bv === null && av !== null) return -1
            if (av !== null && bv !== null) result = compare(av, bv)
        }
        return (
            result * (direction === 'desc' ? -1 : 1) ||
            collator.compare(a.name, b.name) ||
            a.kind.localeCompare(b.kind) ||
            a.key.localeCompare(b.key)
        )
    })
}
