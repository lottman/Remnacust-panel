import { connectionPool } from './autoselect-model'
import {
    editClientTemplate,
    nativeGroupPath,
    readClientTemplate,
    type ClientFormat
} from './client-template-model'

export function setClientAutoselectStrategy(
    text: string,
    format: ClientFormat,
    index: number,
    strategy: string
): string {
    const key = nativeGroupPath(format)[0]
    const group = readClientTemplate(text, format)[key]?.[index]
    if (!group) throw new Error('group-not-found')
    const sing = format === 'SINGBOX'
    const distribute = strategy === 'loadBalance'
    const type = distribute ? (sing ? 'urltest' : 'load-balance') : strategy
    const allowed = sing
        ? ['urltest', 'selector']
        : ['url-test', 'fallback', 'load-balance', 'select']
    if (!allowed.includes(type)) throw new Error('group-type')
    const next = { ...group, type }
    if (distribute) {
        next.remnawave = {
            ...group.remnawave,
            loadBalance: true,
            ...(group.remnawave?.pool ? { pool: connectionPool(group.remnawave.pool) } : {})
        }
        if (!sing) next.strategy = 'round-robin'
    } else if (group.remnawave?.loadBalance !== undefined) {
        next.remnawave = { ...group.remnawave }
        delete next.remnawave.loadBalance
    }
    if (type !== 'load-balance') delete next.strategy
    if (['select', 'selector'].includes(type)) {
        delete next.url
        delete next.interval
        delete next.tolerance
    } else {
        next.url = group.url ?? 'https://www.gstatic.com/generate_204'
        next.interval = group.interval ?? (sing ? '5m' : 300)
        if (distribute && !sing) delete next.tolerance
        else next.tolerance = group.tolerance ?? 50
    }
    if (type === 'fallback' && group.lazy === undefined) next.lazy = false
    let result = text
    for (const property of new Set([...Object.keys(group), ...Object.keys(next)])) {
        if (group[property] === next[property]) continue
        if (property === 'remnawave') {
            for (const field of ['loadBalance', 'pool'])
                if (group.remnawave?.[field] !== next.remnawave?.[field])
                    result = editClientTemplate(
                        result,
                        format,
                        [key, index, 'remnawave', field],
                        next.remnawave?.[field]
                    )
        } else result = editClientTemplate(result, format, [key, index, property], next[property])
    }
    return result
}
