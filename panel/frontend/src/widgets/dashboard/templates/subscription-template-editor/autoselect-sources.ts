type HostSource = {
    uuid: string
    isDisabled?: boolean
    isHidden?: boolean
    excludeFromSubscriptionTypes?: readonly string[]
    tags?: readonly string[]
}

export function xrayPoolPreview(
    pool: {
        selectFrom?: string
        mode?: string
        selector?: {
            type?: string
            values?: string[]
            groups?: Record<string, string[]> | string[][]
        }
    },
    hosts: readonly HostSource[]
): number | null {
    const selector = pool.selector
    if (!selector || !['uuids', 'tags'].includes(selector.type ?? '')) return null
    const values = new Set(
        pool.mode === 'group'
            ? Object.values(selector.groups ?? {}).flat()
            : (selector.values ?? [])
    )
    const visibility = pool.selectFrom ?? 'HIDDEN'
    return new Set(
        hosts
            .filter(
                (host) =>
                    !host.isDisabled &&
                    !host.excludeFromSubscriptionTypes?.includes('XRAY_JSON') &&
                    (visibility !== 'HIDDEN' || host.isHidden) &&
                    (visibility !== 'NOT_HIDDEN' || !host.isHidden) &&
                    (selector.type === 'uuids'
                        ? values.has(host.uuid)
                        : host.tags?.some((tag) => values.has(tag)))
            )
            .map((host) => host.uuid)
    ).size
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
