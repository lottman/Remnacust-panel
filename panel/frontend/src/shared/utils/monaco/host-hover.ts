import type { GetHostsCommand } from '@remnawave/backend-contract'

import i18next from 'i18next'
import { getLocation } from 'jsonc-parser'
import * as monaco from 'monaco-editor/editor'
import { parseDocument, visit } from 'yaml'

type Host = GetHostsCommand.Response['response'][number]
type HostPreview = Pick<
    Host,
    | 'uuid'
    | 'remark'
    | 'address'
    | 'port'
    | 'sni'
    | 'path'
    | 'host'
    | 'tags'
    | 'isHidden'
    | 'isDisabled'
    | 'inbound'
>

const registrations = new Map<symbol, Map<string, HostPreview>>()
const UUID = /(?:host:)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi
let installed = false

function preview(host: HostPreview): HostPreview {
    const text = (value: string | null) => (value === null ? null : value.slice(0, 512))
    return {
        uuid: host.uuid,
        remark: text(host.remark)!,
        address: text(host.address)!,
        port: host.port,
        sni: text(host.sni),
        path: text(host.path),
        host: text(host.host),
        tags: host.tags.slice(0, 32).map((tag) => tag.slice(0, 128)),
        isHidden: host.isHidden,
        isDisabled: host.isDisabled,
        inbound: {
            configProfileUuid: host.inbound.configProfileUuid,
            configProfileInboundUuid: host.inbound.configProfileInboundUuid
        }
    }
}

export function hostHoverMarkdown(host: HostPreview): string {
    const value = preview(host)
    const escape = (text: string) =>
        text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&')
            .replace(/[\r\n\t]/g, ' ')
    const row = (label: string, text: string | number | null) =>
        `- **${escape(label)}:** ${escape(String(text || i18next.t('editor-host-preview.not-set')))}`
    return [
        `**${escape(value.remark)}**`,
        '',
        row(i18next.t('editor-host-preview.address'), value.address),
        row(i18next.t('editor-host-preview.port'), value.port),
        row('SNI', value.sni),
        row('Host', value.host),
        row(i18next.t('editor-host-preview.path'), value.path),
        row(i18next.t('editor-host-preview.tags'), value.tags.join(', ')),
        row(
            i18next.t('editor-host-preview.visibility'),
            i18next.t(value.isHidden ? 'editor-host-preview.hidden' : 'editor-host-preview.visible')
        ),
        row(
            i18next.t('editor-host-preview.status'),
            i18next.t(
                value.isDisabled ? 'editor-host-preview.disabled' : 'editor-host-preview.enabled'
            )
        )
    ].join('\n')
}

export function registerHostHoverData(hosts: readonly HostPreview[]): () => void {
    const key = Symbol()
    registrations.set(key, new Map(hosts.map((host) => [host.uuid.toLowerCase(), preview(host)])))
    return () => {
        registrations.delete(key)
    }
}

export function hostReferenceAt(text: string, offset: number, language: string) {
    if (text.length > 2 * 1024 * 1024 || offset < 0 || offset > text.length) return
    const start = Math.max(0, offset - 42)
    const candidate = [...text.slice(start, offset + 42).matchAll(UUID)].find(
        (match) => start + match.index <= offset && offset < start + match.index + match[0].length
    )
    if (!candidate) return
    const reference = /^(?:host:)?([a-f0-9-]{36})$/i
    const result = (value: unknown, nodeOffset: number, length: number) => {
        const match = typeof value === 'string' && reference.exec(value)
        return match ? { uuid: match[1].toLowerCase(), offset: nodeOffset, length } : undefined
    }
    if (language === 'json') {
        const location = getLocation(text, offset)
        const node = location.previousNode
        if (
            location.isAtPropertyKey ||
            node?.type !== 'string' ||
            offset < node.offset ||
            offset >= node.offset + node.length
        )
            return
        return result(node.value, node.offset, node.length)
    }
    if (language !== 'yaml') return
    let found: ReturnType<typeof result>
    try {
        visit(parseDocument(text), {
            Scalar(key, node) {
                const range = node.range
                if (key === 'key' || !range || offset < range[0] || offset >= range[1]) return
                found = result(node.value, range[0], range[1] - range[0])
                return visit.BREAK
            }
        })
    } catch {
        return
    }
    return found
}

export function installHostHoverProvider() {
    if (installed) return
    installed = true
    const references = new WeakMap<
        monaco.editor.ITextModel,
        {
            version: number
            offset: number
            language: string
            reference: ReturnType<typeof hostReferenceAt>
        }
    >()
    const provider: monaco.languages.HoverProvider = {
        provideHover(model, position, token) {
            if (!registrations.size || token.isCancellationRequested || model.isDisposed()) return
            const offset = model.getOffsetAt(position)
            const version = model.getVersionId()
            const language = model.getLanguageId()
            let cached = references.get(model)
            if (
                !cached ||
                cached.version !== version ||
                cached.offset !== offset ||
                cached.language !== language
            ) {
                cached = {
                    version,
                    offset,
                    language,
                    reference: hostReferenceAt(model.getValue(), offset, language)
                }
                references.set(model, cached)
            }
            const reference = cached.reference
            if (!reference || token.isCancellationRequested || model.isDisposed()) return
            let host: HostPreview | undefined
            for (const values of registrations.values()) host = values.get(reference.uuid) ?? host
            if (!host) return
            const start = model.getPositionAt(reference.offset)
            const end = model.getPositionAt(reference.offset + reference.length)
            return {
                range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
                contents: [{ value: hostHoverMarkdown(host), isTrusted: false, supportHtml: false }]
            }
        }
    }
    monaco.languages.registerHoverProvider('json', provider)
    monaco.languages.registerHoverProvider('yaml', provider)
}
