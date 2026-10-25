import { RemnawaveInjectorSchema } from '@remnawave/backend-contract'
import { applyEdits, modify } from 'jsonc-parser'
import { parseDocument } from 'yaml'

import { connectionPool, type JsonObject } from './autoselect-model'

export type ClientFormat = 'XRAY_JSON' | 'SINGBOX' | 'MIHOMO' | 'STASH' | 'CLASH'
export const isYamlFormat = (format: ClientFormat) => ['MIHOMO', 'STASH', 'CLASH'].includes(format)

export function geofileEditorShapeError(root: JsonObject): string | null {
    const settings = root.remnacust
    if (settings === undefined) return null
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 'remnacust'
    const refs = settings.geofiles
    if (refs === undefined) return null
    if (!Array.isArray(refs)) return 'remnacust.geofiles'
    for (const [index, reference] of refs.entries()) {
        const path = `remnacust.geofiles.${index}`
        if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return path
        if (typeof reference.id !== 'string') return `${path}.id`
        if (reference.target !== undefined && typeof reference.target !== 'string')
            return `${path}.target`
        if (
            reference.categories !== undefined &&
            (!Array.isArray(reference.categories) ||
                reference.categories.some((item: unknown) => typeof item !== 'string'))
        )
            return `${path}.categories`
        if (
            reference.downloadToClient !== undefined &&
            typeof reference.downloadToClient !== 'boolean'
        )
            return `${path}.downloadToClient`
        if (
            reference.clientRefreshIntervalSeconds !== undefined &&
            (typeof reference.clientRefreshIntervalSeconds !== 'number' ||
                !Number.isFinite(reference.clientRefreshIntervalSeconds))
        )
            return `${path}.clientRefreshIntervalSeconds`
    }
    return null
}

export function readClientTemplate(text: string, format: ClientFormat): JsonObject {
    const doc = isYamlFormat(format) ? parseDocument(text, { uniqueKeys: true, merge: true }) : null
    if (doc?.errors.length) throw new Error('template-syntax')
    const root = doc ? doc.toJS({ maxAliasCount: 100 }) : JSON.parse(text)
    if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('root-object')
    return root
}

export function clientValidationPath(root: JsonObject, format: ClientFormat): string | null {
    if (format !== 'XRAY_JSON') {
        const key = nativeGroupPath(format)[0]
        if (root[key] !== undefined && !Array.isArray(root[key])) return key
        for (const [index, group] of (root[key] ?? []).entries()) {
            if (!group || typeof group !== 'object') return `${key}.${index}`
            if (group.remnawave?.pool !== undefined) {
                const pool = group.remnawave.pool
                const result = RemnawaveInjectorSchema.safeParse({ injectHosts: [pool] })
                if (!result.success || pool.selector?.type === 'sameTagAsRecipient')
                    return `${key}.${index}.remnawave.pool`
            }
        }
    }
    const refs = root.remnacust?.geofiles
    if (refs !== undefined) {
        if (!Array.isArray(refs) || refs.length > 32) return 'remnacust.geofiles'
        for (const [index, reference] of refs.entries()) {
            const target =
                reference?.target === undefined && reference?.downloadToClient === false
                    ? 'DIRECT'
                    : reference?.target
            if (
                typeof reference?.id !== 'string' ||
                typeof target !== 'string' ||
                !target.trim() ||
                target.length > 255 ||
                /[,\r\n\0]/.test(target) ||
                (reference.downloadToClient !== undefined &&
                    typeof reference.downloadToClient !== 'boolean') ||
                (reference.clientRefreshIntervalSeconds !== undefined &&
                    (!Number.isInteger(reference.clientRefreshIntervalSeconds) ||
                        reference.clientRefreshIntervalSeconds < 300 ||
                        reference.clientRefreshIntervalSeconds > 2592000)) ||
                (reference.categories !== undefined &&
                    (!Array.isArray(reference.categories) || !reference.categories.length))
            )
                return `remnacust.geofiles.${index}`
        }
    }
    return null
}

export function editClientTemplate(
    text: string,
    format: ClientFormat,
    path: (string | number)[],
    value: unknown
): string {
    readClientTemplate(text, format)
    if (!isYamlFormat(format))
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
    const doc = parseDocument(text, { merge: true })
    if (value === undefined) doc.deleteIn(path)
    else doc.setIn(path, value)
    return doc.toString()
}

export function nativeGroupPath(format: ClientFormat): string[] {
    return format === 'SINGBOX' ? ['outbounds'] : ['proxy-groups']
}

export function selectClientOnConnection(
    text: string,
    format: ClientFormat,
    index: number
): string {
    const key = nativeGroupPath(format)[0]
    const group = readClientTemplate(text, format)[key]?.[index]
    if (!group?.remnawave?.pool) throw new Error('pool-missing')
    let next = editClientTemplate(
        text,
        format,
        [key, index, 'remnawave', 'pool'],
        connectionPool(group.remnawave.pool)
    )
    if (group.type === 'selector' || group.type === 'select') {
        for (const [property, value] of Object.entries({
            type: format === 'SINGBOX' ? 'urltest' : 'url-test',
            url: group.url ?? 'https://www.gstatic.com/generate_204',
            interval: group.interval || (format === 'SINGBOX' ? '5m' : 300),
            tolerance: group.tolerance ?? 50
        }))
            next = editClientTemplate(next, format, [key, index, property], value)
    }
    return next
}

export function addClientGroup(
    text: string,
    format: ClientFormat,
    hostUuids: readonly string[] = []
): string {
    const config = readClientTemplate(text, format)
    const key = nativeGroupPath(format)[0]
    const list: JsonObject[] = config[key] ?? []
    if (!Array.isArray(list)) throw new Error('groups-array')
    const used = new Set([
        ...list.map((item) => item.tag ?? item.name),
        ...(config.proxies ?? []).map((item: JsonObject) => item.name)
    ])
    let name = 'auto'
    for (let i = 2; used.has(name); i++) name = `auto-${i}`
    const sing = format === 'SINGBOX'
    const group = {
        ...(sing
            ? { tag: name, type: 'urltest', outbounds: [] }
            : { name, type: 'url-test', proxies: [] }),
        url: 'https://www.gstatic.com/generate_204',
        interval: sing ? '5m' : 300,
        tolerance: 50,
        remnawave: {
            pool: {
                mode: 'all',
                selectFrom: 'NOT_HIDDEN',
                selector: { type: 'uuids', values: [...hostUuids] }
            }
        }
    }
    let next = editClientTemplate(text, format, [key], [...list, group])
    // Preserve existing routing. Only provide a default when the template has none.
    if (sing && !config.route?.final)
        next = editClientTemplate(next, format, ['route', 'final'], name)
    if (!sing && !config.rules?.length)
        next = editClientTemplate(next, format, ['rules'], [`MATCH,${name}`])
    return next
}

function remapGeofileTargets(
    text: string,
    format: ClientFormat,
    old: string,
    name: string
): string {
    const refs = readClientTemplate(text, format).remnacust?.geofiles
    if (!Array.isArray(refs)) return text
    let next = text
    for (const [i, ref] of refs.entries())
        if (ref?.target === old)
            next = editClientTemplate(next, format, ['remnacust', 'geofiles', i, 'target'], name)
    return next
}

export function removeClientGroup(text: string, format: ClientFormat, index: number): string {
    const config = readClientTemplate(text, format)
    const key = nativeGroupPath(format)[0]
    const list: JsonObject[] = config[key] ?? []
    const name = list[index]?.tag ?? list[index]?.name
    if (!name) throw new Error('group-not-found')
    // Delete generated references, preserving unrelated rules and groups.
    const remaining = list
        .filter((_, i) => i !== index)
        .map((group) => {
            const field = format === 'SINGBOX' ? 'outbounds' : 'proxies'
            return Array.isArray(group[field])
                ? { ...group, [field]: group[field].filter((value: string) => value !== name) }
                : group
        })
    let next = editClientTemplate(text, format, [key], remaining)
    if (format === 'SINGBOX') {
        if (config.route?.final === name)
            next = editClientTemplate(next, format, ['route', 'final'], undefined)
        if (Array.isArray(config.route?.rules))
            next = editClientTemplate(
                next,
                format,
                ['route', 'rules'],
                config.route.rules.filter((rule: JsonObject) => rule.outbound !== name)
            )
    } else if (Array.isArray(config.rules)) {
        next = editClientTemplate(
            next,
            format,
            ['rules'],
            config.rules.filter(
                (rule: unknown) =>
                    typeof rule !== 'string' ||
                    rule
                        .split(',')
                        .map((value) => value.trim())
                        .filter((value) => value !== 'no-resolve')
                        .at(-1) !== name
            )
        )
    }
    return remapGeofileTargets(next, format, name, '')
}

export function renameClientGroup(
    text: string,
    format: ClientFormat,
    index: number,
    name: string
): string {
    if (!name.trim() || name.includes(',') || /[\r\n\0]/.test(name)) throw new Error('group-name')
    const config = readClientTemplate(text, format)
    const key = nativeGroupPath(format)[0]
    const list: JsonObject[] = config[key] ?? []
    const old = list[index]?.tag ?? list[index]?.name
    if (
        list.some((group, i) => i !== index && (group.tag ?? group.name) === name) ||
        (format !== 'SINGBOX' && config.proxies?.some((proxy: JsonObject) => proxy.name === name))
    )
        throw new Error('group-name')
    const field = format === 'SINGBOX' ? 'outbounds' : 'proxies'
    let next = editClientTemplate(
        text,
        format,
        [key],
        list.map((group, i) => ({
            ...group,
            ...(i === index ? { [format === 'SINGBOX' ? 'tag' : 'name']: name } : {}),
            ...(Array.isArray(group[field])
                ? { [field]: group[field].map((value: string) => (value === old ? name : value)) }
                : {})
        }))
    )
    if (format === 'SINGBOX') {
        if (config.route?.final === old)
            next = editClientTemplate(next, format, ['route', 'final'], name)
        if (Array.isArray(config.route?.rules))
            next = editClientTemplate(
                next,
                format,
                ['route', 'rules'],
                config.route.rules.map((rule: JsonObject) =>
                    rule.outbound === old ? { ...rule, outbound: name } : rule
                )
            )
    } else if (Array.isArray(config.rules))
        next = editClientTemplate(
            next,
            format,
            ['rules'],
            config.rules.map((rule: unknown) => {
                if (typeof rule !== 'string') return rule
                const parts = rule.split(',')
                const at =
                    parts.at(-1)?.trim() === 'no-resolve' ? parts.length - 2 : parts.length - 1
                if (parts[at]?.trim() === old) parts[at] = name
                return parts.join(',')
            })
        )
    return remapGeofileTargets(next, format, old, name)
}
