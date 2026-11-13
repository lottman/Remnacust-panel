import { poolAddressMatches, type TPoolAddressFamily } from '@remnawave/backend-contract'

export function autoselectHostOption(host: {
    uuid: string
    remark: string
    address?: string
    port: number
}) {
    const rawAddress = host.address ?? ''
    const address =
        rawAddress.includes(':') && !rawAddress.startsWith('[') ? `[${rawAddress}]` : rawAddress
    return { value: host.uuid, label: `${host.remark} · ${address}:${host.port}` }
}

type HostSource = {
    uuid: string
    address?: string
    isDisabled?: boolean
    isHidden?: boolean
    excludeFromSubscriptionTypes?: readonly string[]
    tags?: readonly string[]
}

type PreviewPool = {
    addressFamily?: TPoolAddressFamily
    selectFrom?: string
    mode?: string
    selector?: {
        type?: string
        values?: string[]
        groups?: Record<string, string[]> | string[][]
    }
}

function poolPreview(
    pool: PreviewPool,
    hosts: readonly HostSource[],
    format: string,
    defaultVisibility: string
): number | null {
    const selector = pool.selector
    if (!selector || !['uuids', 'tags'].includes(selector.type ?? '')) return null
    const values = new Set(
        pool.mode === 'group'
            ? Object.values(selector.groups ?? {}).flat()
            : (selector.values ?? [])
    )
    const visibility = pool.selectFrom ?? defaultVisibility
    return new Set(
        hosts
            .filter(
                (host) =>
                    !host.isDisabled &&
                    !host.excludeFromSubscriptionTypes?.includes(format) &&
                    poolAddressMatches(host.address, pool.addressFamily) &&
                    (visibility !== 'HIDDEN' || host.isHidden) &&
                    (visibility !== 'NOT_HIDDEN' || !host.isHidden) &&
                    (selector.type === 'uuids'
                        ? values.has(host.uuid)
                        : host.tags?.some((tag) => values.has(tag)))
            )
            .map((host) => host.uuid)
    ).size
}

export function xrayPoolPreview(pool: PreviewPool, hosts: readonly HostSource[]): number | null {
    return poolPreview(pool, hosts, 'XRAY_JSON', 'HIDDEN')
}

export function clientPoolPreview(
    pool: PreviewPool,
    hosts: readonly HostSource[],
    format: string
): number | null {
    return poolPreview(pool, hosts, format, 'NOT_HIDDEN')
}

export function defaultAutoselectSources(hosts: readonly HostSource[], format: string): string[] {
    return [
        ...new Set(
            hosts
                .filter(
                    (host) =>
                        !host.isDisabled &&
                        (format === 'XRAY_JSON' || !host.isHidden) &&
                        !host.excludeFromSubscriptionTypes?.includes(format)
                )
                .map((host) => host.uuid)
        )
    ]
}
