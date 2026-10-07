type Snippet = { name: string; snippet: unknown }

export type XrayOutbound = {
    tag: string
    protocol: string
    destination?: string
    redirect?: string
    dialerProxy?: string
    finalRules: number
    finalRuleDetails: string[]
    response?: string
}
export type XrayBalancer = {
    tag: string
    selectors: string[]
    fallbackTag: string
    strategy: string
}
export type XrayRule = {
    inboundTag: string[]
    outboundTag: string
    domain: string[]
    ip: string[]
    port: string
    network: string
    protocol: string[]
    balancerTag: string
    ruleTag: string
    sourceIP: string[]
    localIP: string[]
    user: string[]
    process: string[]
    sourcePort: string
    localPort: string
    vlessRoute: string
    attrs: string[]
    fallback?: boolean
}

export function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null
}

export function strings(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : []
}

export function values(value: unknown): string[] {
    if (typeof value === 'string') return [value]
    return strings(value)
}

export function stringValue(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

export function xrayRouting(
    config: unknown,
    snippets: Snippet[]
): {
    outbounds: XrayOutbound[]
    rules: XrayRule[]
    balancers: XrayBalancer[]
    domainStrategy: string
    observation: string[]
    unresolvedSnippets: string[]
} {
    const input = record(config)
    const raw: Record<string, unknown> = { ...input }
    const snippetsByName = new Map(snippets.map((item) => [item.name, item.snippet]))
    const unresolvedSnippets = new Set<string>()
    // Match backend root snippets: explicit profile values win; later snippets win.
    const merged: Record<string, unknown> = Object.create(null)
    for (const name of strings(input?.snippets)) {
        const snippet = snippetsByName.get(name)
        if (snippet === undefined) unresolvedSnippets.add(name)
        for (const part of Array.isArray(snippet) ? snippet : [snippet]) {
            const body = record(part)
            if (body) Object.assign(merged, body)
        }
    }
    const protectedKeys = new Set([
        'api',
        'inbounds',
        'metrics',
        'snippets',
        'stats',
        '__proto__',
        'constructor',
        'prototype'
    ])
    for (const [key, value] of Object.entries(merged))
        if (!protectedKeys.has(key) && !(key in raw)) raw[key] = value
    const routing = record(raw.routing)
    const expand = (entries: unknown[], field: 'rules' | 'outbounds' | 'balancers'): unknown[] => {
        const expanded: unknown[] = []
        const visit = (value: unknown, seen: Set<string>) => {
            if (expanded.length >= 1000) {
                unresolvedSnippets.add(`${field}: >1000`)
                return
            }
            const name = record(value)?.snippet
            if (typeof name === 'string' && !seen.has(name) && seen.size < 5) {
                const snippet = snippetsByName.get(name)
                const body = record(snippet)
                const nested = Array.isArray(snippet)
                    ? snippet
                    : field === 'outbounds'
                      ? body?.outbounds
                      : (body?.[field] ?? record(body?.routing)?.[field])
                if (Array.isArray(nested)) {
                    const nextSeen = new Set([...seen, name])
                    for (const entry of nested) visit(entry, nextSeen)
                    return
                }
            }
            if (typeof name === 'string') unresolvedSnippets.add(name)
            expanded.push(value)
        }
        for (const entry of entries) visit(entry, new Set())
        return expanded
    }
    const outbounds = Array.isArray(raw?.outbounds)
        ? expand(raw.outbounds, 'outbounds').flatMap((value) => {
              const outbound = record(value)
              if (typeof outbound?.tag !== 'string' || typeof outbound.protocol !== 'string')
                  return []
              const settings = record(outbound.settings)
              const sockopt = record(record(outbound.streamSettings)?.sockopt)
              const finalRuleDetails = Array.isArray(settings?.finalRules)
                  ? settings.finalRules.flatMap((entry, index) => {
                        const finalRule = record(entry)
                        if (!finalRule) return []
                        const conditions = [
                            ...values(finalRule.ip).map((value) => `ip=${value}`),
                            stringValue(finalRule.network) &&
                                `network=${stringValue(finalRule.network)}`,
                            stringValue(finalRule.port) && `port=${stringValue(finalRule.port)}`
                        ].filter(Boolean)
                        return [
                            `#${index + 1} ${stringValue(finalRule.action) || 'unknown'}: ${conditions.join(', ') || 'all targets'}`
                        ]
                    })
                  : []
              const server = Array.isArray(settings?.servers) ? record(settings.servers[0]) : null
              const peer = Array.isArray(settings?.vnext) ? record(settings.vnext[0]) : null
              const destination = server?.address ?? peer?.address ?? settings?.address
              return [
                  {
                      tag: outbound.tag,
                      protocol: outbound.protocol,
                      destination: typeof destination === 'string' ? destination : undefined,
                      redirect: stringValue(settings?.redirect) || undefined,
                      dialerProxy: stringValue(sockopt?.dialerProxy) || undefined,
                      finalRules: Array.isArray(settings?.finalRules)
                          ? settings.finalRules.length
                          : 0,
                      finalRuleDetails,
                      response: stringValue(record(settings?.response)?.type) || undefined
                  }
              ]
          })
        : []
    const rules = Array.isArray(routing?.rules)
        ? expand(routing.rules, 'rules').flatMap((value) => {
              const rule = record(value)
              if (
                  !rule ||
                  (typeof rule.outboundTag !== 'string' && typeof rule.balancerTag !== 'string')
              )
                  return []
              return [
                  {
                      inboundTag: values(rule.inboundTag),
                      outboundTag: typeof rule.outboundTag === 'string' ? rule.outboundTag : '',
                      domain: values(rule.domain),
                      ip: values(rule.ip),
                      port: stringValue(rule.port),
                      network: stringValue(rule.network),
                      protocol: values(rule.protocol),
                      balancerTag: stringValue(rule.balancerTag),
                      ruleTag: stringValue(rule.ruleTag),
                      sourceIP: values(rule.sourceIP ?? rule.source),
                      localIP: values(rule.localIP),
                      user: values(rule.user),
                      process: values(rule.process),
                      sourcePort: stringValue(rule.sourcePort),
                      localPort: stringValue(rule.localPort),
                      vlessRoute: stringValue(rule.vlessRoute),
                      attrs: Object.entries(record(rule.attrs) ?? {}).map(
                          ([key, value]) => `${key}: ${stringValue(value)}`
                      )
                  }
              ]
          })
        : []
    const balancers = Array.isArray(routing?.balancers)
        ? expand(routing.balancers, 'balancers').flatMap((value) => {
              const balancer = record(value)
              return typeof balancer?.tag === 'string'
                  ? [
                        {
                            tag: balancer.tag,
                            selectors: strings(balancer.selector),
                            fallbackTag: stringValue(balancer.fallbackTag),
                            strategy: stringValue(record(balancer.strategy)?.type) || 'random'
                        }
                    ]
                  : []
          })
        : []
    const observation = ['observatory', 'burstObservatory'].flatMap((kind) => {
        const observer = record(raw[kind])
        if (!observer) return []
        const ping = record(observer.pingConfig)
        return [
            `${kind}: selector=${strings(observer.subjectSelector).join(', ') || '—'}`,
            ...Object.entries({
                destination: observer.probeURL ?? ping?.destination,
                interval: observer.probeInterval ?? ping?.interval,
                timeout: ping?.timeout
            }).flatMap(([key, value]) =>
                stringValue(value) ? [`${kind}.${key}: ${stringValue(value)}`] : []
            )
        ]
    })
    return {
        outbounds,
        rules,
        balancers,
        observation,
        unresolvedSnippets: [...unresolvedSnippets],
        domainStrategy: stringValue(routing?.domainStrategy) || 'AsIs'
    }
}
