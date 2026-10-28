import { getLocation } from 'jsonc-parser'
import * as monaco from 'monaco-editor/editor'
import { getWorker, jsonDefaults } from 'monaco-editor/languages/features/json/register'

let snippets = new Map<string, unknown>()
let installed = false

type HoverEntry =
    | string
    | { kind: 'markdown' | 'plaintext'; value: string }
    | { language: string; value: string }
// Monaco 0.56's worker implements doHover, but its IJSONWorker declaration omits it.
interface JsonHoverWorker {
    doHover(
        uri: string,
        position: { line: number; character: number }
    ): Promise<{
        contents: HoverEntry | HoverEntry[]
        range?: {
            start: { line: number; character: number }
            end: { line: number; character: number }
        }
    } | null>
}

export function setSnippetHoverData(values: { name: string; snippet: unknown }[]) {
    snippets = new Map(values.map(({ name, snippet }) => [name, snippet]))
}

export function snippetHoverAt(text: string, offset: number) {
    const location = getLocation(text, offset)
    const node = location.previousNode
    const path = location.path
    const isReference =
        path.at(-1) === 'snippet' ||
        (path.length === 2 && path[0] === 'snippets' && typeof path[1] === 'number')
    if (
        !isReference ||
        location.isAtPropertyKey ||
        node?.type !== 'string' ||
        offset < node.offset ||
        offset > node.offset + node.length ||
        !snippets.has(node.value)
    ) {
        return undefined
    }
    const code = JSON.stringify(snippets.get(node.value), null, 2)
    if (code === undefined) return undefined
    // A snippet may itself contain Markdown fences inside a JSON string.
    let fenceLength = 3
    for (const [run] of code.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, run.length + 1)
    const fence = '`'.repeat(fenceLength)
    return { offset: node.offset, length: node.length, markdown: `${fence}json\n${code}\n${fence}` }
}

export function installSnippetHoverProvider() {
    if (installed) return
    installed = true
    // One provider delegates ordinary JSON documentation to the original worker.
    // Snippet references return only code, so Monaco's copy button copies only JSON.
    jsonDefaults.setModeConfiguration({ ...jsonDefaults.modeConfiguration, hovers: false })
    monaco.languages.registerHoverProvider('json', {
        async provideHover(model, position, token) {
            if (token.isCancellationRequested || model.isDisposed()) return
            if (model.uri.scheme === 'xray-config') {
                const snippet = snippetHoverAt(model.getValue(), model.getOffsetAt(position))
                if (snippet) {
                    const start = model.getPositionAt(snippet.offset)
                    const end = model.getPositionAt(snippet.offset + snippet.length)
                    return {
                        range: new monaco.Range(
                            start.lineNumber,
                            start.column,
                            end.lineNumber,
                            end.column
                        ),
                        contents: [{ value: snippet.markdown }]
                    }
                }
            }
            const version = model.getVersionId()
            const worker = (await (await getWorker())(model.uri)) as unknown as JsonHoverWorker
            const info = await worker.doHover(model.uri.toString(), {
                line: position.lineNumber - 1,
                character: position.column - 1
            })
            if (
                !info ||
                token.isCancellationRequested ||
                model.isDisposed() ||
                model.getVersionId() !== version
            )
                return
            const entries = Array.isArray(info.contents) ? info.contents : [info.contents]
            const contents = entries.map((entry) => {
                if (typeof entry === 'string') return { value: entry }
                if ('kind' in entry)
                    return {
                        value:
                            entry.kind === 'plaintext'
                                ? entry.value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&')
                                : entry.value
                    }
                return { value: `\`\`\`${entry.language}\n${entry.value}\n\`\`\`` }
            })
            const range = info.range
            return {
                contents,
                range: range
                    ? new monaco.Range(
                          range.start.line + 1,
                          range.start.character + 1,
                          range.end.line + 1,
                          range.end.character + 1
                      )
                    : undefined
            }
        }
    })
}
