const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const providers = new Map()
const api = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../src/shared/utils/monaco/host-hover.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: api, require(name) {
    if (name === 'monaco-editor/editor') return {
        languages: { registerHoverProvider(language, value) {
            assert(!providers.has(language))
            providers.set(language, value)
        } },
        Range: class { constructor(...values) { this.values = values } }
    }
    return require(name)
} })
const uuid = '6c08d928-abfd-465f-8dc5-673e8b57a032'
const host = { uuid, remark: 'Test server', address: 'edge.example.test', port: 443,
    sni: 'edge.example.test', path: null, host: null, tags: ['EU'], isHidden: true,
    isDisabled: false, inbound: { configProfileUuid: null, configProfileInboundUuid: null } }
const decode = (markdown) => JSON.parse(markdown.split('\n').slice(1, -1).join('\n'))
const at = (text, value = uuid, language = 'json') => api.hostReferenceAt(text, text.indexOf(value) + 12, language)

test('all assignment, selector, group and geofile references resolve on partial JSON drafts', () => {
    const values = [
        { remnawave: { assignTo: { hosts: [uuid] } } },
        { remnawave: { assignments: [{ hosts: [uuid], balancerTag: 'auto' }] } },
        { remnawave: { injectHosts: [{ selector: { type: 'uuids', values: [uuid] } }] } },
        { remnawave: { injectHosts: [{ selector: { groups: [[uuid]] } }] } },
        { remnawave: { injectHosts: [{ selector: { groups: { first: [uuid] } } }] } },
        { remnacust: { geofiles: [{ target: 'host:' + uuid }] } }
    ]
    for (const value of values) {
        const text = JSON.stringify(value)
        const reference = at(text)
        assert.equal(reference.uuid, uuid)
        assert.equal(JSON.parse(text.slice(reference.offset, reference.offset + reference.length)),
            text.includes('host:') ? 'host:' + uuid : uuid)
        assert.equal(at(text.slice(0, -2)).uuid, uuid)
    }
})

test('JSON keys, comments, embedded UUID prose and positions outside a string do not show host data', () => {
    for (const text of [`{"${uuid}":1}`, `// ${uuid}\n{}`, `{"note":"prefix ${uuid}"}`])
        assert.equal(at(text), undefined)
    const text = `{"hosts":["${uuid}"]}`
    assert.equal(api.hostReferenceAt(text, text.length, 'json'), undefined)
    assert.equal(api.hostReferenceAt(text, -1, 'json'), undefined)
    assert.equal(at(text, uuid, 'plaintext'), undefined)
})

test('YAML scalar references work in lists and flow collections without matching comments or keys', () => {
    for (const text of [`hosts:\n  - ${uuid}`, `hosts: ["${uuid}"]`, `target: host:${uuid}`]) {
        const reference = at(text, uuid, 'yaml')
        assert.equal(reference.uuid, uuid)
        assert(text.slice(reference.offset, reference.offset + reference.length).includes(uuid))
    }
    for (const text of [`# ${uuid}\nhosts: []`, `${uuid}: value`, `note: prefix ${uuid}`])
        assert.equal(at(text, uuid, 'yaml'), undefined)
    assert.equal(at('x: ['.repeat(1000) + uuid, uuid, 'yaml'), undefined)
})

test('previews include only bounded host configuration fields and cannot escape a fenced code block', () => {
    const markdown = api.hostHoverMarkdown({ ...host,
        remark: '```\n<img src=x onerror=alert(1)>\n[run](command:evil)',
        secretKey: 'never-display', password: 'never-display',
        inbound: { ...host.inbound, privateKey: 'never-display' } })
    assert(markdown.startsWith('````json\n'))
    assert(markdown.endsWith('\n````'))
    const value = decode(markdown)
    assert.equal(value.port, 443)
    assert.equal(value.isHidden, true)
    assert.equal(value.remark.includes('command:evil'), true)
    assert.equal(value.secretKey, undefined)
    assert(!markdown.includes('never-display'))
    const bounded = decode(api.hostHoverMarkdown({ ...host, remark: 'x'.repeat(10000),
        tags: Array(10000).fill('x'.repeat(10000)) }))
    assert.equal(bounded.remark.length, 512)
    assert.equal(bounded.tags.length, 32)
    assert.equal(bounded.tags[0].length, 128)
})

function model(text, language = 'json') {
    let value = text, version = 1, reads = 0, currentLanguage = language
    return { isDisposed: () => false, getValue: () => { reads++; return value },
        getOffsetAt: () => value.indexOf(uuid) + 12,
        getPositionAt: offset => ({ lineNumber: 1, column: offset + 1 }),
        getLanguageId: () => currentLanguage, getVersionId: () => version,
        setLanguage(next) { currentLanguage = next },
        replace(next) { value = next; version++ }, get reads() { return reads } }
}

test('one provider per language works on ordinary and diff models and releases data on editor unmount', () => {
    api.installHostHoverProvider()
    api.installHostHoverProvider()
    assert.equal(providers.size, 2)
    const dispose = api.registerHostHoverData([host])
    try {
        for (const [language, text] of [['json', `{"hosts":["${uuid}"]}`], ['yaml', `hosts: [${uuid}]`]]) {
            const result = providers.get(language).provideHover(model(text, language), {}, {})
            assert.equal(decode(result.contents[0].value).remark, 'Test server')
            assert.equal(result.contents[0].isTrusted, false)
            assert.equal(result.contents[0].supportHtml, false)
            assert.equal(result.range.values[2], 1)
        }
    } finally { dispose() }
    assert.equal(providers.get('json').provideHover(model(`{"hosts":["${uuid}"]}`), {}, {}), undefined)
})

test('same-version hover reuses parsing but updates metadata and rejects stale edits and canceled models', () => {
    const original = api.registerHostHoverData([host])
    const provider = providers.get('json')
    const value = model(`{"hosts":["${uuid}"]}`)
    let replacement
    try {
        assert.equal(decode(provider.provideHover(value, {}, {}).contents[0].value).remark, host.remark)
        provider.provideHover(value, {}, {})
        assert.equal(value.reads, 1)
        replacement = api.registerHostHoverData([{ ...host, remark: 'Updated server' }])
        original()
        assert.equal(decode(provider.provideHover(value, {}, {}).contents[0].value).remark, 'Updated server')
        assert.equal(provider.provideHover(value, {}, { isCancellationRequested: true }), undefined)
        assert.equal(provider.provideHover({ ...value, isDisposed: () => true }, {}, {}), undefined)
        value.replace(`{"note":"not a host ${uuid}"}`)
        assert.equal(provider.provideHover(value, {}, {}), undefined)
        assert.equal(value.reads, 2)
    } finally { original(); replacement?.() }
})

test('large documents skip parsing and unknown UUIDs do not expose another host', () => {
    assert.equal(at(' '.repeat(2 * 1024 * 1024) + `"${uuid}"`), undefined)
    const dispose = api.registerHostHoverData([{ ...host, uuid: 'b'.repeat(36) }])
    try {
        assert.equal(providers.get('json').provideHover(model(`{"hosts":["${uuid}"]}`), {}, {}), undefined)
    } finally { dispose() }
})

test('changing the model language invalidates hover parsing even without a text version change', () => {
    const dispose = api.registerHostHoverData([host])
    const provider = providers.get('json')
    const value = model(`{"hosts":["${uuid}"]}`, 'plaintext')
    try {
        assert.equal(provider.provideHover(value, {}, {}), undefined)
        value.setLanguage('json')
        assert.equal(decode(provider.provideHover(value, {}, {}).contents[0].value).uuid, uuid)
        assert.equal(value.reads, 2)
    } finally { dispose() }
})

