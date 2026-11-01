import { REQUEST_TEMPLATE_TYPE_VALUES } from '@remnawave/backend-contract'

const keyPattern = /^[A-Za-z0-9_-]{8,64}$/
const devicePattern = /^[A-Za-z0-9_-]{14,86}\.[A-Za-z0-9_-]{43}$/
const formats: ReadonlySet<string> = new Set(REQUEST_TEMPLATE_TYPE_VALUES)

// Conversion stays in the administrator's browser. The source URL never becomes
// a network destination; the output authority always comes from the registry.
export function cdnSubscriptionLink(base: string, input: string): string | null {
    const value = input.trim()
    if (!value || value.length > 4096) return null
    if (keyPattern.test(value)) return `${base}/${value}`
    try {
        if (/[\\%]/.test(value)) return null
        const url = new URL(value)
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
            return null
        const parts = url.pathname.split('/').filter(Boolean)
        const format = formats.has(parts.at(-1) ?? '') ? parts.pop() : undefined
        let device: string | undefined
        if (parts.at(-2) === 'device') {
            device = parts.pop()
            parts.pop()
            if (!devicePattern.test(device ?? '')) return null
        }
        const key = parts.pop()
        if (!key || !keyPattern.test(key)) return null
        return `${base}/${key}${device ? `/device/${device}` : ''}${format ? `/${format}` : ''}`
    } catch {
        return null
    }
}
