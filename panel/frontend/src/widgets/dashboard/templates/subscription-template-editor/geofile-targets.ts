import type { ClientFormat } from './client-template-model'

type ObjectValue = Record<string, unknown>
const isObject = (value: unknown): value is ObjectValue =>
    !!value && typeof value === 'object' && !Array.isArray(value)
const object = (value: unknown): ObjectValue => (isObject(value) ? value : {})
const items = (value: unknown): ObjectValue[] =>
    Array.isArray(value) ? value.filter(isObject) : []

export type AddressRuleTarget =
    | { kind: 'action'; name: 'DIRECT' | 'REJECT' }
    | { kind: 'outbound' | 'balancer' | 'route'; name: string }

// Select values carry both namespace and name; a literal tag may itself be DIRECT.
export const addressRuleTargetKey = (target: AddressRuleTarget): string =>
    JSON.stringify([target.kind, target.name])

export function addressRuleTargets(config: ObjectValue, format: ClientFormat): AddressRuleTarget[] {
    const routing = object(config.routing)
    const remnawave = object(config.remnawave)
    const targets: AddressRuleTarget[] = []
    const add = (kind: 'outbound' | 'balancer' | 'route', name: unknown) => {
        if (
            typeof name === 'string' &&
            name &&
            (format === 'XRAY_JSON' || format === 'SINGBOX' || !/[,\r\n\0]/.test(name))
        )
            targets.push({ kind, name })
    }
    if (format === 'XRAY_JSON') {
        if (!remnawave.injectHosts || remnawave.addVirtualHostAsOutbound) add('outbound', 'proxy')
        for (const entry of items(routing.balancers)) add('balancer', entry.tag)
        for (const entry of items(remnawave.injectHosts))
            if (!entry.useHostRemarkAsTag && !entry.useHostTagAsTag)
                add('outbound', entry.tagPrefix)
        for (const entry of items(config.outbounds)) add('outbound', entry.tag)
    } else if (format === 'SINGBOX') {
        for (const entry of items(config.outbounds)) add('outbound', entry.tag)
    } else {
        for (const entry of items(config['proxy-groups'])) add('route', entry.name)
        for (const entry of items(config.proxies)) add('route', entry.name)
    }
    const named = new Set(targets.map((target) => target.name))
    const actions: AddressRuleTarget[] = []
    for (const name of ['DIRECT', 'REJECT'] as const) {
        // YAML has one native destination namespace. A shadowed action cannot
        // be expressed independently of the literal route with the same name.
        if (format === 'XRAY_JSON' || format === 'SINGBOX' || !named.has(name))
            actions.push({ kind: 'action', name })
    }
    return [
        ...new Map(
            [...actions, ...targets].map((target) => [addressRuleTargetKey(target), target])
        ).values()
    ]
}

export function geofileTargetAliases(
    config: ObjectValue,
    format: ClientFormat
): Record<string, string> {
    const aliases: Record<string, string> = Object.create(null)
    const routing = object(config.routing)
    const remnawave = object(config.remnawave)
    const groups = new Set([
        ...items(routing.balancers).map((item) => item.tag),
        ...items(remnawave.injectHosts).map((item) => item.tagPrefix)
    ])
    for (const outbound of items(config.outbounds)) {
        if (!outbound || typeof outbound.tag !== 'string' || groups.has(outbound.tag)) continue
        if (
            format === 'XRAY_JSON' &&
            Object.keys(outbound).every((key) => ['tag', 'protocol', 'settings'].includes(key)) &&
            (outbound.settings == null ||
                (isObject(outbound.settings) && Object.keys(outbound.settings).length === 0))
        ) {
            if (outbound.protocol === 'freedom') aliases[outbound.tag] = 'DIRECT'
            if (outbound.protocol === 'blackhole') aliases[outbound.tag] = 'REJECT'
        }
        if (
            format === 'SINGBOX' &&
            outbound.type === 'direct' &&
            Object.keys(outbound).every((key) => ['tag', 'type'].includes(key))
        )
            aliases[outbound.tag] = 'DIRECT'
    }
    return aliases
}

export function geofileTargets(config: ObjectValue, format: ClientFormat): string[] {
    const aliases = geofileTargetAliases(config, format)
    const routing = object(config.routing)
    const remnawave = object(config.remnawave)
    const custom =
        format === 'XRAY_JSON'
            ? [
                  ...(!remnawave.injectHosts || remnawave.addVirtualHostAsOutbound
                      ? ['proxy']
                      : []),
                  ...items(routing.balancers).map((item) => item.tag),
                  ...items(remnawave.injectHosts)
                      .filter((item) => !item.useHostRemarkAsTag && !item.useHostTagAsTag)
                      .map((item) => item.tagPrefix),
                  ...items(config.outbounds).map((item) => item.tag)
              ]
            : format === 'SINGBOX'
              ? items(config.outbounds).map((item) => item.tag)
              : [
                    ...items(config['proxy-groups']).map((item) => item.name),
                    ...items(config.proxies).map((item) => item.name)
                ]
    return [...new Set(['DIRECT', 'REJECT', ...custom])].filter(
        (value): value is string =>
            typeof value === 'string' &&
            !!value &&
            (value === 'DIRECT' || value === 'REJECT' || !aliases[value])
    )
}
