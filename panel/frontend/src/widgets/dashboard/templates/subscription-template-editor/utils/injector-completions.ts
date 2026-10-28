import { getLocation, parse } from 'jsonc-parser'

export interface CompletionHost {
    uuid: string
    remark: string
    tags: string[]
}

// Read the path from partial JSON, so completion still works before a selector is valid.
export function injectorCompletionValues(text: string, offset: number, hosts: CompletionHost[]) {
    const location = getLocation(text, offset)
    const path = location.path
    if (location.isAtPropertyKey || path[0] !== 'remnawave') return []
    const fieldOptions = (key: string) => key === 'hosts'
        ? hosts.map((host) => ({ value: host.uuid, detail: host.remark }))
        : key === 'tags' ? [...new Set(hosts.flatMap((host) => host.tags))].sort().map((value) => ({ value, detail: value })) : []
    if (path[1] === 'assignTo') return fieldOptions(String(path[2]))
    if (path[1] === 'assignments') return fieldOptions(String(path[3]))
    if (path[1] !== 'injectHosts') return []
    const field = path[3]
    if (field === 'mode') return ['all', 'random', 'group'].map((value) => ({ value, detail: value }))
    if (field === 'selectFrom') return ['ALL', 'HIDDEN', 'NOT_HIDDEN'].map((value) => ({ value, detail: value }))
    if (field !== 'selector') return []
    if (!['values', 'groups'].includes(String(path[4]))) return []
    const config = parse(text)
    const type = config?.remnawave?.injectHosts?.[Number(path[2])]?.selector?.type
    if (type === 'tags')
        return [...new Set(hosts.flatMap((host) => host.tags))]
            .sort()
            .map((value) => ({ value, detail: value }))
    if (type !== 'uuids' && path[4] !== 'groups') return []
    return hosts.map((host) => ({ value: host.uuid, detail: host.remark }))
}
