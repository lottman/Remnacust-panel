export const normalizeNodeAddress = (address: string): string => {
    const value = address.trim().toLowerCase()
    if (!value.includes(':')) return value

    try {
        return new URL(`http://[${value.replace(/^\[|\]$/g, '')}]/`).hostname
    } catch {
        return value
    }
}

export const getAdditionalNodeIps = <T extends { ip: string }>(
    ips: null | readonly T[] | undefined,
    address: null | string | undefined
): T[] => {
    const primary = normalizeNodeAddress(address ?? '')
    return (ips ?? []).filter((entry) => !primary || normalizeNodeAddress(entry.ip) !== primary)
}
