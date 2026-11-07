import type { JsonObject } from './autoselect-model'

import { editClientTemplate, readClientTemplate, type ClientFormat } from './client-template-model'
import {
    addressRuleTargetKey,
    addressRuleTargets,
    geofileTargetAliases,
    type AddressRuleTarget
} from './geofile-targets'

export const MAX_ADDRESS_RULES = 20_000
export const MAX_ADDRESS_RULE_TEXT_BYTES = 2 * 1024 * 1024
const encoder = new TextEncoder()

type AddressType = 'domain' | 'full' | 'keyword' | 'regexp' | 'ip'
interface Address {
    type: AddressType
    value: string
}
export interface AddressRuleGroup {
    start: number
    count: number
    fingerprint: string
    target: AddressRuleTarget
    addresses: string[]
    noResolve: boolean
    textBytes: number
    oversized: boolean
}
const singFields: Record<AddressType, string> = {
    domain: 'domain_suffix',
    full: 'domain',
    keyword: 'domain_keyword',
    regexp: 'domain_regex',
    ip: 'ip_cidr'
}
const clashFields: Record<AddressType, string> = {
    domain: 'DOMAIN-SUFFIX',
    full: 'DOMAIN',
    keyword: 'DOMAIN-KEYWORD',
    regexp: 'DOMAIN-REGEX',
    ip: 'IP-CIDR'
}
const record = (value: unknown): value is JsonObject =>
    !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')
const label = (address: Address) =>
    address.type === 'ip' ? address.value : `${address.type}:${address.value}`
const rulesPath = (format: ClientFormat) =>
    format === 'XRAY_JSON'
        ? ['routing', 'rules']
        : format === 'SINGBOX'
          ? ['route', 'rules']
          : ['rules']
const rulesOf = (root: JsonObject, format: ClientFormat): unknown[] => {
    const rules =
        format === 'XRAY_JSON'
            ? root.routing?.rules
            : format === 'SINGBOX'
              ? root.route?.rules
              : root.rules
    if (rules !== undefined && !Array.isArray(rules)) throw new Error('address-rules-shape')
    return rules ?? []
}

function ipAddress(value: string): { value: string; bits: number } | undefined {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
        const parts = value.split('.')
        if (parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255))
            return { value: parts.join('.'), bits: 32 }
        throw new Error('address-rule-input')
    }
    if (value.includes(':')) {
        try {
            if (value.includes('%') || value.includes('[') || value.includes(']')) throw new Error()
            const host = new URL(`http://[${value}]/`).hostname
            return { value: host.slice(1, -1), bits: 128 }
        } catch {
            throw new Error('address-rule-input')
        }
    }
    return undefined
}

export function parseAddressRules(text: string): Address[] {
    if (encoder.encode(text).length > MAX_ADDRESS_RULE_TEXT_BYTES)
        throw new Error('address-rule-limit')
    const result: Address[] = [],
        seen = new Set<string>()
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        if (
            line.length > 4096 ||
            [...line].some(
                (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
            )
        )
            throw new Error('address-rule-input')
        const typed = /^(domain|full|keyword|regexp):(.+)$/i.exec(line)
        let address: Address
        if (typed && ['keyword', 'regexp'].includes(typed[1].toLowerCase())) {
            address = { type: typed[1].toLowerCase() as AddressType, value: typed[2] }
        } else {
            const value = typed ? typed[2] : line
            const cidr = !typed && /^(.+)\/(\d{1,3})$/.exec(value)
            const ip = !typed && ipAddress(cidr ? cidr[1] : value)
            if (ip) {
                const prefix = cidr ? Number(cidr[2]) : ip.bits
                if (prefix > ip.bits) throw new Error('address-rule-input')
                address = { type: 'ip', value: `${ip.value}/${prefix}` }
            } else {
                if (/[\s/:?#@[\]]/.test(value)) throw new Error('address-rule-input')
                let host: string
                try {
                    host = new URL('http://' + value).hostname.toLowerCase().replace(/\.$/, '')
                } catch {
                    throw new Error('address-rule-input')
                }
                if (
                    host.length > 253 ||
                    host
                        .split('.')
                        .some((part) => !/^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(part))
                )
                    throw new Error('address-rule-input')
                address = {
                    type: (typed?.[1].toLowerCase() ?? 'domain') as AddressType,
                    value: host
                }
            }
        }
        const key = label(address)
        if (!seen.has(key)) {
            seen.add(key)
            result.push(address)
        }
        if (result.length > MAX_ADDRESS_RULES) throw new Error('address-rule-limit')
    }
    if (!result.length) throw new Error('address-rule-input')
    return result
}

export interface ImportedAddressRule {
    addresses: Address[]
    target?: AddressRuleTarget
}

export function parseAddressRuleImport(text: string): ImportedAddressRule[] {
    if (encoder.encode(text).length > MAX_ADDRESS_RULE_TEXT_BYTES)
        throw new Error('address-rule-limit')
    const source = text.trim().replace(/,\s*$/, '')
    let parsed: unknown
    try {
        parsed = JSON.parse(source)
    } catch {
        try {
            parsed = JSON.parse(`[${source}]`)
        } catch {
            throw new Error('address-rule-import-json')
        }
    }
    const rows: unknown[] = Array.isArray(parsed) ? parsed : [parsed]
    if (!rows.length) throw new Error('address-rule-import-json')
    if (rows.length > MAX_ADDRESS_RULES) throw new Error('address-rule-limit')
    let count = 0
    return rows.map((row) => {
        if (!record(row)) throw new Error('address-rule-import-json')
        if (
            Object.keys(row).some(
                (key) => !['type', 'domain', 'ip', 'outboundTag', 'balancerTag'].includes(key)
            ) ||
            (row.type !== undefined && row.type !== 'field') ||
            (row.domain !== undefined && row.ip !== undefined)
        )
            throw new Error('address-rule-import-conditions')
        const values = row.domain ?? row.ip
        if (!strings(values)) throw new Error('address-rule-import-json')
        count += values.length
        if (count > MAX_ADDRESS_RULES) throw new Error('address-rule-limit')
        if (row.outboundTag !== undefined && row.balancerTag !== undefined)
            throw new Error('address-rule-import-json')
        const name: unknown = row.outboundTag ?? row.balancerTag
        if (
            name !== undefined &&
            (typeof name !== 'string' || !name.trim() || name.length > 255 || /[\r\n\0]/.test(name))
        )
            throw new Error('address-rule-import-json')
        const addresses = values.map((value) => {
            if (
                !value ||
                value.length > 4096 ||
                [...value].some(
                    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
                )
            )
                throw new Error('address-rule-import-json')
            if (row.domain && /^(geosite|ext|ext-domain|ext-site|dotless):/.test(value))
                throw new Error('address-rule-import-conditions')
            const input =
                row.domain && !/^(domain|full|keyword|regexp):/.test(value)
                    ? `keyword:${value}`
                    : value
            const [address] = parseAddressRules(input)
            if ((address.type === 'ip') !== (row.ip !== undefined))
                throw new Error('address-rule-import-json')
            return address
        })
        return {
            addresses,
            ...(typeof name === 'string'
                ? {
                      target: {
                          kind: row.balancerTag !== undefined ? 'balancer' : 'outbound',
                          name
                      } as AddressRuleTarget
                  }
                : {})
        }
    })
}

export function importAddressRules(
    text: string,
    format: ClientFormat,
    source: string,
    override?: AddressRuleTarget
): string {
    const imported = parseAddressRuleImport(source)
    const root = readClientTemplate(text, format)
    const current = rulesOf(root, format)
    const rules: unknown[] = []
    for (const row of imported) {
        if (format === 'CLASH' && row.addresses.some((address) => address.type === 'regexp'))
            throw new Error('address-rule-import-format')
        const target =
            override ??
            (row.target &&
                ({
                    kind:
                        format === 'XRAY_JSON'
                            ? row.target.kind
                            : format === 'SINGBOX'
                              ? 'outbound'
                              : 'route',
                    name: row.target.name
                } as AddressRuleTarget))
        for (const rule of nativeRules(root, format, row.addresses, target, false)) rules.push(rule)
    }
    return writeAddressRules(text, root, format, [...rules, ...current], rules)
}

function readRule(
    rule: unknown,
    format: ClientFormat,
    yamlRoutes: Set<string>
): { target: AddressRuleTarget; addresses: string[]; noResolve: boolean } | undefined {
    if (format === 'XRAY_JSON') {
        if (
            !record(rule) ||
            Object.keys(rule).some(
                (key) => !['type', 'domain', 'ip', 'outboundTag', 'balancerTag'].includes(key)
            ) ||
            (rule.type !== undefined && rule.type !== 'field')
        )
            return
        if (!!rule.domain === !!rule.ip || !!rule.outboundTag === !!rule.balancerTag) return
        const values = rule.domain ?? rule.ip
        if (
            !strings(values) ||
            (rule.ip &&
                values.some((value) => {
                    const parts = value.split('/')
                    try {
                        const ip = ipAddress(parts[0])
                        return (
                            !ip ||
                            parts.length > 2 ||
                            (parts.length === 2 &&
                                (!/^\d{1,3}$/.test(parts[1]) || Number(parts[1]) > ip.bits))
                        )
                    } catch {
                        return true
                    }
                })) ||
            (rule.domain &&
                values.some((value) => /^(geosite|ext|ext-domain|ext-site|dotless):/.test(value)))
        )
            return
        const target = rule.balancerTag ?? rule.outboundTag
        if (typeof target !== 'string') return
        return {
            target: { kind: rule.balancerTag ? 'balancer' : 'outbound', name: target },
            noResolve: false,
            addresses: rule.ip
                ? values
                : values.map((value) =>
                      /^(domain|full|keyword|regexp):/.test(value) ? value : 'keyword:' + value
                  )
        }
    }
    if (format === 'SINGBOX') {
        if (
            !record(rule) ||
            Object.keys(rule).some(
                (key) => !['action', 'outbound', ...Object.values(singFields)].includes(key)
            ) ||
            (rule.action !== undefined && !['route', 'reject'].includes(rule.action))
        )
            return
        const fields = Object.entries(singFields).filter(([, key]) => rule[key] !== undefined)
        if (
            fields.length !== 1 ||
            !strings(rule[fields[0][1]]) ||
            (rule.action === 'reject' && rule.outbound !== undefined)
        )
            return
        const type = fields[0][0] as AddressType
        const target = rule.action === 'reject' ? 'REJECT' : rule.outbound
        if (typeof target !== 'string') return
        return {
            target:
                rule.action === 'reject'
                    ? { kind: 'action', name: 'REJECT' }
                    : { kind: 'outbound', name: target },
            noResolve: false,
            addresses: rule[fields[0][1]].map((value: string) => label({ type, value }))
        }
    }
    if (typeof rule !== 'string') return
    const match =
        /^(DOMAIN-SUFFIX|DOMAIN-KEYWORD|DOMAIN-REGEX|DOMAIN|IP-CIDR6?),([^,\r\n]+),([^,\r\n]+)(,no-resolve)?$/.exec(
            rule
        )
    if (!match) return
    const type = match[1].startsWith('IP-CIDR')
        ? 'ip'
        : (Object.entries(clashFields).find(([, value]) => value === match[1])?.[0] as AddressType)
    const target: AddressRuleTarget =
        !yamlRoutes.has(match[3]) && (match[3] === 'DIRECT' || match[3] === 'REJECT')
            ? { kind: 'action', name: match[3] }
            : { kind: 'route', name: match[3] }
    return { target, addresses: [label({ type, value: match[2] })], noResolve: !!match[4] }
}

export function addressRuleGroups(root: JsonObject, format: ClientFormat): AddressRuleGroup[] {
    const rules = rulesOf(root, format),
        groups: AddressRuleGroup[] = []
    const yamlRoutes = new Set(
        addressRuleTargets(root, format)
            .filter((target) => target.kind === 'route')
            .map((target) => target.name)
    )
    for (let index = 0; index < rules.length; index++) {
        const row = readRule(rules[index], format, yamlRoutes)
        if (!row) continue
        const previous = groups.at(-1)
        if (
            previous &&
            previous.start + previous.count === index &&
            previous.target.kind === row.target.kind &&
            previous.target.name === row.target.name &&
            previous.noResolve === row.noResolve
        ) {
            previous.count++
        } else
            groups.push({
                start: index,
                count: 1,
                fingerprint: '',
                ...row,
                addresses: [],
                textBytes: 0,
                oversized: false
            })
        const group = groups[groups.length - 1]
        for (const address of row.addresses) {
            group.textBytes += encoder.encode(address).length + (group.addresses.length ? 1 : 0)
            group.addresses.push(address)
        }
        group.oversized =
            group.addresses.length > MAX_ADDRESS_RULES ||
            group.textBytes > MAX_ADDRESS_RULE_TEXT_BYTES
    }
    for (const group of groups)
        group.fingerprint = JSON.stringify(rules.slice(group.start, group.start + group.count))
    return groups
}

function nativeRules(
    root: JsonObject,
    format: ClientFormat,
    addresses: Address[],
    requestedTarget: AddressRuleTarget | undefined,
    noResolve: boolean
): unknown[] {
    if (
        !requestedTarget ||
        !addressRuleTargets(root, format).some(
            (target) => addressRuleTargetKey(target) === addressRuleTargetKey(requestedTarget)
        )
    )
        throw new Error('address-rule-target')
    let target = requestedTarget.name
    const action = requestedTarget.kind === 'action'
    if (format === 'XRAY_JSON' && action) {
        const protocol = target === 'DIRECT' ? 'freedom' : 'blackhole'
        root.outbounds ??= []
        const existing = Object.entries(geofileTargetAliases(root, format)).find(
            ([, alias]) => alias === target
        )
        if (existing) target = existing[0]
        else {
            const used = new Set([
                ...(root.outbounds ?? []).map((item: JsonObject) => item.tag),
                ...(root.routing?.balancers ?? []).map((item: JsonObject) => item.tag),
                ...(root.remnawave?.injectHosts ?? []).map((item: JsonObject) => item.tagPrefix)
            ])
            target = protocol === 'freedom' ? 'direct' : 'block'
            for (let n = 2; used.has(target); n++)
                target = `${protocol === 'freedom' ? 'direct' : 'block'}-${n}`
            root.outbounds.push({ tag: target, protocol })
        }
    }
    if (format === 'SINGBOX' && action && target === 'DIRECT') {
        root.outbounds ??= []
        const existing = Object.entries(geofileTargetAliases(root, format)).find(
            ([, alias]) => alias === target
        )
        if (existing) target = existing[0]
        else {
            const used = new Set(root.outbounds.map((item: JsonObject) => item.tag))
            target = 'direct'
            for (let n = 2; used.has(target); n++) target = `direct-${n}`
            root.outbounds.push({ tag: target, type: 'direct' })
        }
    }
    if (format === 'XRAY_JSON') {
        const route =
            requestedTarget.kind === 'balancer' ? { balancerTag: target } : { outboundTag: target }
        return [false, true].flatMap((ip) => {
            const values = addresses
                .filter((item) => (item.type === 'ip') === ip)
                .map((item) => (ip ? item.value : label(item)))
            return values.length
                ? [{ type: 'field', ...route, [ip ? 'ip' : 'domain']: values }]
                : []
        })
    }
    if (format === 'SINGBOX')
        return Object.entries(singFields).flatMap(([type, field]) => {
            const values = addresses.filter((item) => item.type === type).map((item) => item.value)
            return values.length
                ? [
                      {
                          ...(action && requestedTarget.name === 'REJECT'
                              ? { action: 'reject' }
                              : { action: 'route', outbound: target }),
                          [field]: values
                      }
                  ]
                : []
        })
    return addresses.map((item) => {
        if (item.value.includes(',')) throw new Error('address-rule-input')
        const field =
            item.type === 'ip' && item.value.includes(':') ? 'IP-CIDR6' : clashFields[item.type]
        return `${field},${item.value},${target}${noResolve ? ',no-resolve' : ''}`
    })
}

export function changeAddressRule(
    text: string,
    format: ClientFormat,
    previous: AddressRuleGroup | undefined,
    addresses?: string,
    target?: AddressRuleTarget
): string {
    const root = readClientTemplate(text, format),
        rules = [...rulesOf(root, format)]
    if (
        previous &&
        JSON.stringify(rules.slice(previous.start, previous.start + previous.count)) !==
            previous.fingerprint
    )
        throw new Error('address-rule-stale')
    if (!previous && addresses === undefined) throw new Error('address-rule-input')
    if (previous?.oversized && addresses !== undefined) throw new Error('address-rule-limit')
    const replacements =
        addresses === undefined
            ? []
            : nativeRules(
                  root,
                  format,
                  parseAddressRules(addresses),
                  target,
                  previous?.noResolve ?? false
              )
    rules.splice(previous?.start ?? 0, previous?.count ?? 0, ...replacements)
    return writeAddressRules(text, root, format, rules, replacements)
}

function writeAddressRules(
    text: string,
    root: JsonObject,
    format: ClientFormat,
    rules: unknown[],
    replacements: unknown[]
): string {
    let next = text
    if (format === 'XRAY_JSON' || format === 'SINGBOX') {
        if (root.outbounds) next = editClientTemplate(next, format, ['outbounds'], root.outbounds)
        if (format === 'XRAY_JSON' && replacements.some((rule) => record(rule) && rule.ip))
            next = editClientTemplate(next, format, ['routing', 'domainStrategy'], 'IPOnDemand')
    }
    return editClientTemplate(next, format, rulesPath(format), rules)
}
