export function getUserExpirationState(
    value: Date | number | string | null | undefined,
    now = Date.now()
): 'expired' | 'soon' | 'valid' | 'unknown' {
    if (value === null || value === undefined || value === '') return 'unknown'
    const expiresAt = value instanceof Date ? value.getTime() : new Date(value).getTime()
    if (!Number.isFinite(expiresAt)) return 'unknown'
    const remaining = expiresAt - now
    if (remaining <= 0) return 'expired'
    return remaining <= 7 * 24 * 60 * 60 * 1000 ? 'soon' : 'valid'
}
