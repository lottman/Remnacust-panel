import DOMPurify from 'dompurify'

export function safeHtml(value: string | undefined): string {
    return DOMPurify.sanitize(value ?? '', { USE_PROFILES: { html: true } })
}

export function safeSvg(value: string | undefined): string {
    return DOMPurify.sanitize(value ?? '', { USE_PROFILES: { svg: true } })
}
