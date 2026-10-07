export type HostStatusFilter = 'all' | 'enabled' | 'disabled' | 'visible' | 'hidden'

export function matchesHostStatus(host: { isDisabled: boolean; isHidden: boolean }, status: HostStatusFilter): boolean {
    if (status === 'enabled') return !host.isDisabled
    if (status === 'disabled') return host.isDisabled
    if (status === 'visible') return !host.isHidden
    if (status === 'hidden') return host.isHidden
    return true
}
