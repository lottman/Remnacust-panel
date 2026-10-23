type HostSource = {
    uuid: string
    isDisabled?: boolean
    isHidden?: boolean
    excludeFromSubscriptionTypes?: readonly string[]
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
