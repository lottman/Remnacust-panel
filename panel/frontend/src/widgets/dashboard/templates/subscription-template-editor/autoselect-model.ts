import { RemnawaveInjectorSchema } from '@remnawave/backend-contract'
import { applyEdits, modify } from 'jsonc-parser'

// The editor preserves arbitrary legacy Xray fields; known containers are checked in parseTemplate.
// oxlint-disable-next-line typescript/no-explicit-any
export type JsonObject = Record<string, any>
export type Pool = JsonObject & {
    selector: JsonObject
    mode?: 'all' | 'random' | 'group'
    tagPrefix?: string
}
export type Change = {
    path: string
    kind: 'added' | 'changed' | 'removed'
    before?: unknown
    after?: unknown
}

export function parseTemplate(text: string): JsonObject {
    const config = JSON.parse(text)
    if (!config || typeof config !== 'object' || Array.isArray(config))
        throw new Error('root-object')
    if (
        config.remnawave !== undefined &&
        (!config.remnawave ||
            typeof config.remnawave !== 'object' ||
            Array.isArray(config.remnawave))
    )
        throw new Error('injector-object')
    if (config.outbounds !== undefined && !Array.isArray(config.outbounds))
        throw new Error('outbounds-array')
    if (
        config.routing !== undefined &&
        (!config.routing || typeof config.routing !== 'object' || Array.isArray(config.routing))
    )
        throw new Error('routing-object')
    for (const key of ['rules', 'balancers'])
        if (config.routing?.[key] !== undefined && !Array.isArray(config.routing[key]))
            throw new Error('routing-array')
    if (config.remnawave?.assignTo !== undefined) {
        const assignment = config.remnawave.assignTo
        if (
            !assignment ||
            typeof assignment !== 'object' ||
            ['hosts', 'tags'].some(
                (key) =>
                    assignment[key] !== undefined &&
                    (!Array.isArray(assignment[key]) ||
                        assignment[key].some((item: unknown) => typeof item !== 'string'))
            )
        )
            throw new Error('assignment-object')
    }
    for (const pool of config.remnawave?.injectHosts ?? []) {
        if (
            !pool ||
            typeof pool !== 'object' ||
            !pool.selector ||
            typeof pool.selector !== 'object'
        )
            throw new Error('pool-object')
        if (
            pool.selector.values !== undefined &&
            (!Array.isArray(pool.selector.values) ||
                pool.selector.values.some((value: unknown) => typeof value !== 'string'))
        )
            throw new Error('pool-values')
        if (
            pool.selector.groups !== undefined &&
            (!pool.selector.groups ||
                typeof pool.selector.groups !== 'object' ||
                Object.values(pool.selector.groups).some(
                    (value) =>
                        !Array.isArray(value) || value.some((member) => typeof member !== 'string')
                ))
        )
            throw new Error('pool-groups')
    }
    for (const balance of config.routing?.balancers ?? []) {
        if (
            !balance ||
            typeof balance !== 'object' ||
            (balance.selector !== undefined &&
                (!Array.isArray(balance.selector) ||
                    balance.selector.some((value: unknown) => typeof value !== 'string')))
        )
            throw new Error('balancer-object')
        const settings = balance.strategy?.settings
        if (balance.strategy?.type === 'leastLoad' && settings !== undefined) {
            if (!settings || typeof settings !== 'object' || Array.isArray(settings))
                throw new Error('balancer-settings-object')
            if (
                ['expected', 'tolerance'].some(
                    (key) => settings[key] !== undefined && typeof settings[key] !== 'number'
                ) ||
                (settings.maxRTT !== undefined && typeof settings.maxRTT !== 'string') ||
                (settings.baselines !== undefined &&
                    (!Array.isArray(settings.baselines) ||
                        settings.baselines.some((value: unknown) => typeof value !== 'string')))
            )
                throw new Error('balancer-settings-fields')
        }
    }
    return config
}

export function poolsOf(config: JsonObject): Pool[] {
    if (config.remnawave?.injectHosts === undefined) return []
    if (!Array.isArray(config.remnawave.injectHosts)) throw new Error('inject-array')
    return config.remnawave.injectHosts
}

export function editTemplate(text: string, path: (string | number)[], value: unknown): string {
    parseTemplate(text)
    return applyEdits(
        text,
        modify(text, path, value, {
            formattingOptions: {
                insertSpaces: true,
                tabSize: 2,
                eol: text.includes('\r\n') ? '\r\n' : '\n'
            }
        })
    )
}

function append(text: string, path: string[], value: unknown): string {
    const root = parseTemplate(text)
    let current: unknown = root
    for (const key of path)
        current =
            current && typeof current === 'object'
                ? (current as Record<string, unknown>)[key]
                : undefined
    if (current !== undefined && !Array.isArray(current))
        throw new Error('array-required:' + path.join('.'))
    return editTemplate(text, current ? [...path, -1] : path, current ? value : [value])
}

export function newPrefix(config: JsonObject): string {
    const used = new Set([
        ...poolsOf(config).map((pool) => pool.tagPrefix),
        ...(Array.isArray(config.outbounds)
            ? config.outbounds.map((item: JsonObject) => item.tag)
            : [])
    ])
    const families = ['auto', 'select', 'choice', 'route', 'pool']
    for (let index = 0; index < 1000; index++) {
        const prefix = index === 0 ? 'auto' : `${families[index % families.length]}-${index}`
        if (
            ![...used].some(
                (value) =>
                    typeof value === 'string' &&
                    (value.startsWith(prefix) || prefix.startsWith(value))
            )
        )
            return prefix
    }
    throw new Error('prefix-collision')
}

export function observerFor(text: string, prefixes: string[], strategy: string): string {
    if (!['leastPing', 'leastLoad'].includes(strategy)) return text
    const config = parseTemplate(text)
    const key =
        config.observatory !== undefined
            ? 'observatory'
            : config.burstObservatory !== undefined
              ? 'burstObservatory'
              : strategy === 'leastLoad'
                ? 'burstObservatory'
                : 'observatory'
    const existing = config[key]
    if (
        existing !== undefined &&
        (!existing || typeof existing !== 'object' || Array.isArray(existing))
    )
        throw new Error('observer-object')
    if (!existing)
        return editTemplate(
            text,
            [key],
            key === 'observatory'
                ? {
                      subjectSelector: prefixes,
                      probeUrl: 'https://www.gstatic.com/generate_204',
                      probeInterval: '30s',
                      enableConcurrency: true
                  }
                : {
                      subjectSelector: prefixes,
                      pingConfig: {
                          destination: 'https://www.gstatic.com/generate_204',
                          interval: '30s',
                          timeout: '5s',
                          sampling: 2
                      }
                  }
        )
    if (existing.subjectSelector !== undefined && !Array.isArray(existing.subjectSelector))
        throw new Error('observer-selector')
    let next = text
    const selected: string[] = existing.subjectSelector ?? []
    for (const prefix of prefixes)
        if (!selected.some((value) => prefix.startsWith(value)))
            next = append(next, [key, 'subjectSelector'], prefix)
    return next
}

export const needsProbes = (strategy: string) => ['leastPing', 'leastLoad'].includes(strategy)

export function setBalancerStrategy(text: string, index: number, strategy: string): string {
    const before = parseTemplate(text)
    const oldSelectors: string[] = before.routing.balancers[index].selector ?? []
    let next = editTemplate(text, ['routing', 'balancers', index, 'strategy', 'type'], strategy)
    if (needsProbes(strategy)) return observerFor(next, oldSelectors, strategy)
    const after = parseTemplate(next)
    const required: string[] = (after.routing.balancers ?? [])
        .filter((balance: JsonObject) => needsProbes(balance.strategy?.type))
        .flatMap((balance: JsonObject) => balance.selector ?? [])
    for (const key of ['observatory', 'burstObservatory']) {
        const selected = after[key]?.subjectSelector
        if (!Array.isArray(selected)) continue
        // Remove only selectors belonging to this balancer, preserving other probes and settings.
        const retained = selected.filter(
            (prefix: string) =>
                !oldSelectors.includes(prefix) || required.some((value) => value.startsWith(prefix))
        )
        if (retained.length !== selected.length)
            next = editTemplate(
                next,
                retained.length ? [key, 'subjectSelector'] : [key],
                retained.length ? retained : undefined
            )
    }
    return next
}

export function removeUnusedProbes(text: string): string {
    const config = parseTemplate(text)
    if (
        (config.routing?.balancers ?? []).some((balance: JsonObject) =>
            needsProbes(balance.strategy?.type)
        )
    )
        return text
    return editTemplate(
        editTemplate(text, ['observatory'], undefined),
        ['burstObservatory'],
        undefined
    )
}

export function addBalancer(text: string, prefix: string, strategy = 'leastPing'): string {
    const config = parseTemplate(text)
    if (
        config.routing !== undefined &&
        (!config.routing || typeof config.routing !== 'object' || Array.isArray(config.routing))
    )
        throw new Error('routing-object')
    const existing = config.routing?.balancers ?? []
    if (!Array.isArray(existing)) throw new Error('balancers-array')
    let tag = 'balance-' + prefix
    for (let index = 2; existing.some((item: JsonObject) => item.tag === tag); index++)
        tag = `balance-${prefix}-${index}`
    let next = append(text, ['routing', 'balancers'], {
        tag,
        selector: [prefix],
        fallbackTag: prefix,
        strategy: { type: strategy }
    })
    const rules = config.routing?.rules ?? []
    if (!Array.isArray(rules)) throw new Error('rules-array')
    // Preserve explicit routing restrictions. Insert before a broad existing catch-all,
    // leaving that rule as a fallback rather than deleting or replacing it.
    const matchKeys = [
        'domain',
        'ip',
        'port',
        'sourcePort',
        'source',
        'user',
        'inboundTag',
        'protocol',
        'attrs'
    ]
    const catchAll = rules.findIndex(
        (rule: JsonObject) =>
            !matchKeys.some((key) => rule[key] !== undefined) &&
            (!rule.network || rule.network === 'tcp,udp')
    )
    const rule = { type: 'field', network: 'tcp,udp', balancerTag: tag }
    next =
        rules.length === 0
            ? append(next, ['routing', 'rules'], rule)
            : applyEdits(
                  next,
                  modify(next, ['routing', 'rules', catchAll < 0 ? rules.length : catchAll], rule, {
                      isArrayInsertion: true,
                      formattingOptions: { insertSpaces: true, tabSize: 2 }
                  })
              )
    return observerFor(next, [prefix], strategy)
}

export function addPool(text: string): string {
    const prefix = newPrefix(parseTemplate(text))
    return addBalancer(
        append(text, ['remnawave', 'injectHosts'], {
            selector: { type: 'uuids', values: [], expected: 3 },
            mode: 'random',
            selectFrom: 'ALL',
            tagPrefix: prefix
        }),
        prefix
    )
}

export function updatePool(
    text: string,
    index: number,
    path: (string | number)[],
    value: unknown
): string {
    return editTemplate(text, ['remnawave', 'injectHosts', index, ...path], value)
}

export function renamePoolPrefix(text: string, index: number, prefix: string): string {
    const config = parseTemplate(text)
    const previous = poolsOf(config)[index].tagPrefix
    let next = updatePool(text, index, ['tagPrefix'], prefix)
    if (!previous || previous === prefix) return next
    for (const [balanceIndex, balance] of (config.routing?.balancers ?? []).entries()) {
        for (const [selectorIndex, selector] of (balance.selector ?? []).entries())
            if (selector === previous)
                next = editTemplate(
                    next,
                    ['routing', 'balancers', balanceIndex, 'selector', selectorIndex],
                    prefix
                )
        if (balance.fallbackTag === previous)
            next = editTemplate(next, ['routing', 'balancers', balanceIndex, 'fallbackTag'], prefix)
    }
    for (const observer of ['observatory', 'burstObservatory'])
        for (const [selectorIndex, selector] of (config[observer]?.subjectSelector ?? []).entries())
            if (selector === previous)
                next = editTemplate(next, [observer, 'subjectSelector', selectorIndex], prefix)
    return remapGeofileTargets(next, previous, prefix)
}

function remapGeofileTargets(text: string, old: string, name: string): string {
    let next = text
    for (const [i, ref] of (parseTemplate(text).remnacust?.geofiles ?? []).entries())
        if (ref?.target === old)
            next = editTemplate(next, ['remnacust', 'geofiles', i, 'target'], name)
    return next
}

export function renameBalancer(text: string, index: number, name: string): string {
    const config = parseTemplate(text)
    const old = config.routing.balancers[index].tag
    let next = editTemplate(text, ['routing', 'balancers', index, 'tag'], name)
    for (const [ruleIndex, rule] of (config.routing.rules ?? []).entries())
        if (rule.balancerTag === old)
            next = editTemplate(next, ['routing', 'rules', ruleIndex, 'balancerTag'], name)
    return remapGeofileTargets(next, old, name)
}

export function removeBalancer(text: string, index: number): string {
    const config = parseTemplate(text)
    const tag = config.routing.balancers[index].tag
    let next = editTemplate(text, ['routing', 'balancers', index], undefined)
    for (let rule = (config.routing?.rules?.length ?? 0) - 1; rule >= 0; rule--)
        if (config.routing.rules[rule].balancerTag === tag)
            next = editTemplate(next, ['routing', 'rules', rule], undefined)
    return remapGeofileTargets(next, tag, '')
}

export function removePool(text: string, index: number): string {
    const config = parseTemplate(text)
    const prefix = poolsOf(config)[index].tagPrefix
    let next = editTemplate(text, ['remnawave', 'injectHosts', index], undefined)
    if (!prefix) return next
    const remaining = parseTemplate(next)
    const available: string[] = [
        ...poolsOf(remaining)
            .map((pool) => pool.tagPrefix)
            .filter(Boolean),
        ...(remaining.outbounds ?? []).map((outbound: JsonObject) => outbound.tag).filter(Boolean)
    ]
    // A pool and its generated balancer are one reversible draft operation.
    // Shared selectors retain their other pools and manually authored outbounds.
    for (let i = (config.routing?.balancers?.length ?? 0) - 1; i >= 0; i--) {
        const balance = config.routing.balancers[i]
        const selected: string[] = balance.selector ?? []
        const retained = selected.filter(
            (selector) =>
                !prefix.startsWith(selector) || available.some((tag) => tag.startsWith(selector))
        )
        if (retained.length === selected.length) {
            if (balance.fallbackTag === prefix)
                next = editTemplate(
                    next,
                    ['routing', 'balancers', i, 'fallbackTag'],
                    available.find((tag) => retained.some((selector) => tag.startsWith(selector)))
                )
            continue
        }
        if (!retained.length) next = removeBalancer(next, i)
        else {
            next = editTemplate(next, ['routing', 'balancers', i, 'selector'], retained)
            if (balance.fallbackTag === prefix)
                next = editTemplate(
                    next,
                    ['routing', 'balancers', i, 'fallbackTag'],
                    available.find((tag) => retained.some((selector) => tag.startsWith(selector)))
                )
        }
    }
    for (const observer of ['observatory', 'burstObservatory']) {
        const selected = parseTemplate(next)[observer]?.subjectSelector
        if (!Array.isArray(selected)) continue
        const retained = selected.filter(
            (selector: string) =>
                !prefix.startsWith(selector) || available.some((tag) => tag.startsWith(selector))
        )
        if (retained.length !== selected.length)
            next = editTemplate(
                next,
                retained.length ? [observer, 'subjectSelector'] : [observer],
                retained.length ? retained : undefined
            )
    }
    if (!poolsOf(parseTemplate(next)).length)
        next = editTemplate(next, ['remnawave', 'injectHosts'], undefined)
    const after = parseTemplate(next)
    if (after.remnawave && Object.keys(after.remnawave).length === 0)
        next = editTemplate(next, ['remnawave'], undefined)
    for (const key of ['balancers', 'rules'])
        if (parseTemplate(next).routing?.[key]?.length === 0)
            next = editTemplate(next, ['routing', key], undefined)
    const routing = parseTemplate(next).routing
    if (routing && Object.keys(routing).length === 0)
        next = editTemplate(next, ['routing'], undefined)
    return next
}

export function validationPath(config: JsonObject): string | null {
    if (config.remnawave !== undefined) {
        const result = RemnawaveInjectorSchema.safeParse(config.remnawave)
        if (!result.success) return ['remnawave', ...result.error.issues[0].path].join('.')
    }
    const prefixes = poolsOf(config)
        .map((pool) => pool.tagPrefix)
        .filter(Boolean) as string[]
    for (const [index, pool] of poolsOf(config).entries()) {
        if (!pool.tagPrefix && !pool.useHostRemarkAsTag && !pool.useHostTagAsTag)
            return `remnawave.injectHosts.${index}.tagPrefix`
    }
    const staticTags = (config.outbounds ?? [])
        .map((outbound: JsonObject) => outbound.tag)
        .filter(Boolean)
    if (
        prefixes.some(
            (prefix, index) =>
                staticTags.includes(prefix) ||
                prefixes.some(
                    (other, otherIndex) =>
                        index !== otherIndex &&
                        (prefix === other || prefix.startsWith(other) || other.startsWith(prefix))
                )
        )
    )
        return 'remnawave.injectHosts.tagPrefix'
    for (const [index, pool] of poolsOf(config).entries()) {
        if (['tagRegex', 'remarkRegex'].includes(pool.selector.type)) {
            try {
                new RegExp(pool.selector.pattern)
            } catch {
                return `remnawave.injectHosts.${index}.selector.pattern`
            }
        }
    }
    const balanceTags = new Set<string>()
    for (const [index, balancer] of (config.routing?.balancers ?? []).entries()) {
        if (balanceTags.has(balancer.tag)) return `routing.balancers.${index}.tag`
        balanceTags.add(balancer.tag)
        if (!balancer.tag || !Array.isArray(balancer.selector) || !balancer.selector.length)
            return `routing.balancers.${index}`
        if (balancer.strategy?.type === 'leastLoad' && balancer.strategy.settings !== undefined) {
            const settings = balancer.strategy.settings
            const path = `routing.balancers.${index}.strategy.settings`
            if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return path
            if (
                settings.expected !== undefined &&
                (!Number.isInteger(settings.expected) ||
                    settings.expected < 0 ||
                    settings.expected > 2147483647)
            )
                return `${path}.expected`
            if (
                settings.tolerance !== undefined &&
                (typeof settings.tolerance !== 'number' ||
                    settings.tolerance < 0 ||
                    settings.tolerance > 1)
            )
                return `${path}.tolerance`
            const duration = (value: unknown) =>
                typeof value === 'string' &&
                /^(?:0|(?:(?:\d+(?:\.\d*)?|\.\d+)(?:ns|us|µs|μs|ms|s|m|h))+)$/.test(value)
            if (settings.maxRTT !== undefined && !duration(settings.maxRTT)) return `${path}.maxRTT`
            if (
                settings.baselines !== undefined &&
                (!Array.isArray(settings.baselines) || !settings.baselines.every(duration))
            )
                return `${path}.baselines`
        }
    }
    return null
}

export function templateChanges(before: JsonObject, after: JsonObject): Change[] {
    const result: Change[] = []
    const walk = (left: unknown, right: unknown, path: string) => {
        if (JSON.stringify(left) === JSON.stringify(right)) return
        if (left === undefined || right === undefined) {
            result.push({
                path,
                kind: left === undefined ? 'added' : 'removed',
                before: left,
                after: right
            })
            return
        }
        if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) {
            // Recognize pure insertion/deletion before comparing indices: a moved
            // catch-all rule must not be reported as deleted when it is preserved.
            const shorter = left.length < right.length ? left : right
            const longer = left.length < right.length ? right : left
            const serialized = shorter.map((item) => JSON.stringify(item))
            const unmatched: number[] = []
            let cursor = 0
            longer.forEach((item, index) => {
                if (cursor < serialized.length && JSON.stringify(item) === serialized[cursor])
                    cursor++
                else unmatched.push(index)
            })
            if (cursor === shorter.length) {
                for (const index of unmatched)
                    result.push({
                        path: `${path}.${index}`,
                        kind: left.length < right.length ? 'added' : 'removed',
                        ...(left.length < right.length
                            ? { after: longer[index] }
                            : { before: longer[index] })
                    })
                return
            }
        }
        if (
            left &&
            right &&
            typeof left === 'object' &&
            typeof right === 'object' &&
            Array.isArray(left) === Array.isArray(right)
        ) {
            const keys = new Set([...Object.keys(left), ...Object.keys(right)])
            for (const key of keys)
                walk(
                    (left as Record<string, unknown>)[key],
                    (right as Record<string, unknown>)[key],
                    path ? `${path}.${key}` : key
                )
        } else result.push({ path, kind: 'changed', before: left, after: right })
    }
    walk(before, after, '')
    return result
}
