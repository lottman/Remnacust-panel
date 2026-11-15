import type { editor } from 'monaco-editor'

import {
    applyEdits,
    findNodeAtLocation,
    getNodeValue,
    modify,
    Node,
    parseTree,
    ParseError
} from 'jsonc-parser'

export const XERA_ADAPTIVE_MODES = ['balanced', 'low-latency', 'unstable-network'] as const
export type XeraAdaptiveMode = (typeof XERA_ADAPTIVE_MODES)[number]

export interface XeraAdaptiveSettings {
    mode: XeraAdaptiveMode
    minStreams: number
    maxStreams: number
}

export type XeraSettingsIssue =
    | 'invalid-json'
    | 'invalid-shape'
    | 'duplicate-keys'
    | 'invalid-adaptive'
    | 'invalid-bounds'
    | 'target-changed'

export class XeraSettingsError extends Error {
    constructor(public readonly code: XeraSettingsIssue) {
        super(code)
    }
}

export interface XeraSettingsTarget {
    id: string
    kind: 'inbounds' | 'outbounds'
    index: number
    tag: string | null
    adaptivePath: (string | number)[]
    adaptive: XeraAdaptiveSettings | null
    issue: XeraSettingsIssue | null
}

export interface XeraSettingsDocument {
    issue: XeraSettingsIssue | null
    targets: XeraSettingsTarget[]
}

export function newXeraAdaptiveSettings(): XeraAdaptiveSettings {
    return { mode: 'balanced', minStreams: 4, maxStreams: 32 }
}

export function validateXeraAdaptiveSettings(value: unknown): value is XeraAdaptiveSettings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const input = value as Record<string, unknown>
    return (
        XERA_ADAPTIVE_MODES.includes(input.mode as XeraAdaptiveMode) &&
        typeof input.minStreams === 'number' &&
        Number.isInteger(input.minStreams) &&
        typeof input.maxStreams === 'number' &&
        Number.isInteger(input.maxStreams) &&
        input.minStreams >= 1 &&
        input.minStreams <= input.maxStreams &&
        input.maxStreams <= 32
    )
}

function readTree(text: string): Node {
    const errors: ParseError[] = []
    const root = parseTree(text, errors, {
        allowTrailingComma: false,
        disallowComments: false,
        allowEmptyContent: false
    })
    if (errors.length || !root) throw new XeraSettingsError('invalid-json')
    if (root.type !== 'object') throw new XeraSettingsError('invalid-shape')
    const pending = [root]
    while (pending.length) {
        const node = pending.pop()!
        if (node.type === 'object') {
            const keys = new Set<string>()
            for (const property of node.children ?? []) {
                const key = property.children?.[0]?.value as string
                if (keys.has(key)) throw new XeraSettingsError('duplicate-keys')
                keys.add(key)
            }
        }
        for (const child of node.children ?? []) pending.push(child)
    }
    return root
}

function readTargets(root: Node): XeraSettingsTarget[] {
    const targets: XeraSettingsTarget[] = []
    for (const kind of ['inbounds', 'outbounds'] as const) {
        const entries = findNodeAtLocation(root, [kind])
        if (entries && entries.type !== 'array') throw new XeraSettingsError('invalid-shape')
        for (const [index, entry] of (entries?.children ?? []).entries()) {
            const stream = findNodeAtLocation(entry, ['streamSettings'])
            if (
                stream?.type !== 'object' ||
                findNodeAtLocation(stream, ['network'])?.value !== 'xera-http'
            )
                continue
            const settingsPath = [kind, index, 'streamSettings', 'xeraHttpSettings']
            const settings = findNodeAtLocation(root, settingsPath)
            const extra = settings && findNodeAtLocation(settings, ['extra'])
            const adaptivePath = [...settingsPath, ...(extra ? ['extra'] : []), 'adaptive']
            const tagValue = findNodeAtLocation(entry, ['tag'])
            const tag = tagValue?.type === 'string' ? (tagValue.value as string) : null
            const malformed =
                (settings !== undefined && settings.type !== 'object') ||
                (extra !== undefined && extra.type !== 'object')
            const adaptiveNode = !malformed ? findNodeAtLocation(root, adaptivePath) : undefined
            const adaptiveValue: unknown = adaptiveNode ? getNodeValue(adaptiveNode) : undefined
            const adaptive = validateXeraAdaptiveSettings(adaptiveValue)
                ? {
                      mode: adaptiveValue.mode,
                      minStreams: adaptiveValue.minStreams,
                      maxStreams: adaptiveValue.maxStreams
                  }
                : null
            targets.push({
                id: JSON.stringify([kind, index, tag]),
                kind,
                index,
                tag,
                adaptivePath,
                adaptive,
                issue: malformed
                    ? 'invalid-shape'
                    : adaptiveNode && adaptiveNode.type !== 'null' && !adaptive
                      ? 'invalid-adaptive'
                      : null
            })
        }
    }
    return targets
}

export function readXeraSettings(text: string): XeraSettingsDocument {
    try {
        return { issue: null, targets: readTargets(readTree(text)) }
    } catch (error) {
        if (error instanceof XeraSettingsError) return { issue: error.code, targets: [] }
        if (error instanceof RangeError) return { issue: 'invalid-json', targets: [] }
        throw error
    }
}

export function applyXeraAdaptiveSettings(
    text: string,
    targetId: string,
    settings: XeraAdaptiveSettings
): string {
    if (!validateXeraAdaptiveSettings(settings)) throw new XeraSettingsError('invalid-bounds')
    const target = readTargets(readTree(text)).find((entry) => entry.id === targetId)
    if (!target) throw new XeraSettingsError('target-changed')
    if (target.issue) throw new XeraSettingsError(target.issue)
    const options = {
        formattingOptions: {
            insertSpaces: true,
            tabSize: 2,
            eol: text.includes('\r\n') ? '\r\n' : '\n'
        }
    }
    let next = text
    if (target.adaptive === null) {
        next = applyEdits(next, modify(next, target.adaptivePath, {}, options))
    }
    for (const key of ['mode', 'minStreams', 'maxStreams'] as const) {
        next = applyEdits(next, modify(next, [...target.adaptivePath, key], settings[key], options))
    }
    readTree(next)
    return next
}

export function applyXeraSettingsToEditor(
    instance: editor.IStandaloneCodeEditor | null,
    source: string,
    next: string
): boolean {
    const model = instance?.getModel()
    if (!instance || !model || model.isDisposed() || model.getValue() !== source) return false
    if (next === source) return true
    instance.pushUndoStop()
    const applied = instance.executeEdits('xera-adaptive-settings', [
        { range: model.getFullModelRange(), text: next }
    ])
    instance.pushUndoStop()
    return applied
}
