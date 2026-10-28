const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

let provider, workerCalls = 0
const defaults = { modeConfiguration: { hovers: true, completionItems: true },
    setModeConfiguration(value) { this.modeConfiguration = value } }
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../src/shared/utils/monaco/snippet-hover.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: exportsObject, require(name) {
    if (name === 'monaco-editor/editor') return {
        languages: { registerHoverProvider(language, value) { provider = value } },
        Range: class { constructor(...args) { this.values = args } }
    }
    if (name === 'monaco-editor/languages/features/json/register') return {
        jsonDefaults: defaults,
        getWorker: async () => async () => ({ doHover: async () => {
            workerCalls++
            return { contents: { kind: 'markdown', value: 'Normal schema help' } }
        } })
    }
    return require(name)
} })
const { setSnippetHoverData, snippetHoverAt, installSnippetHoverProvider } = exportsObject
const snippet = [{ domain: ['domain:example.org'], balancerTag: 'auto' }, { network: 'tcp,udp' }]
setSnippetHoverData([{ name: 'ROUTING-LTE', snippet }])

test('snippet preview preserves the complete JSON array without explanatory prose', () => {
    for (const text of ['{"routing":{"rules":[{"snippet":"ROUTING-LTE"}]}}',
        '{"snippets":["ROUTING-LTE"]}']) {
        const result = snippetHoverAt(text, text.indexOf('ROUTING-LTE') + 2)
        assert.deepEqual(JSON.parse(result.markdown.split('\n').slice(1, -1).join('\n')), snippet)
        assert.equal(result.length, '"ROUTING-LTE"'.length)
    }
})

test('unrelated strings, property keys, unknown references and cursor outside value are ignored', () => {
    for (const text of ['{"name":"ROUTING-LTE"}', '{"snippet":"unknown"}', '{"ROUTING-LTE":1}'])
        assert.equal(snippetHoverAt(text, text.indexOf('"') + 2), undefined)
    assert.equal(snippetHoverAt('{"snippet":"ROUTING-LTE"   }', 26), undefined)
})

test('fences inside a JSON string cannot break out of the code preview', () => {
    setSnippetHoverData([{ name: 'nested', snippet: [{ text: '``` <img src=x>' }] }])
    const result = snippetHoverAt('{"snippet":"nested"}', 14)
    assert.ok(result.markdown.startsWith('````json\n'))
    assert.ok(result.markdown.endsWith('\n````'))
})

test('provider registration is idempotent and retains normal JSON schema help', async () => {
    installSnippetHoverProvider()
    const first = provider
    installSnippetHoverProvider()
    assert.equal(provider, first)
    assert.equal(defaults.modeConfiguration.hovers, false)
    assert.equal(defaults.modeConfiguration.completionItems, true)
    const model = { uri: { scheme: 'file', toString: () => 'file:///config.json' },
        getVersionId: () => 1, isDisposed: () => false }
    const result = await provider.provideHover(model, { lineNumber: 1, column: 2 }, {})
    assert.equal(result.contents[0].value, 'Normal schema help')
    assert.equal(workerCalls, 1)
    assert.equal(await provider.provideHover(model, {}, { isCancellationRequested: true }), undefined)
    assert.equal(workerCalls, 1)
})

test('snippet provider bypasses schema prose and stale worker responses are discarded', async () => {
    setSnippetHoverData([{ name: 'ROUTING-LTE', snippet }])
    const text = '{"snippet":"ROUTING-LTE"}'
    const model = { uri: { scheme: 'xray-config', toString: () => 'xray-config://test' },
        getValue: () => text, getOffsetAt: () => text.indexOf('ROUTING-LTE') + 1,
        getPositionAt: offset => ({ lineNumber: 1, column: offset + 1 }),
        isDisposed: () => false }
    const before = workerCalls
    const result = await provider.provideHover(model, {}, {})
    assert.deepEqual(JSON.parse(result.contents[0].value.split('\n').slice(1, -1).join('\n')), snippet)
    assert.equal(workerCalls, before)
    let version = 0
    const changed = { ...model, uri: { scheme: 'file', toString: () => 'file:///test' },
        getVersionId: () => ++version }
    assert.equal(await provider.provideHover(changed, {lineNumber:1,column:1}, {}), undefined)
})
