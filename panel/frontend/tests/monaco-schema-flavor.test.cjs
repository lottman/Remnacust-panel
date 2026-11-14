const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const filename = path.join(__dirname, '../src/features/dashboard/config-profiles/monaco-setup/monaco-setup.feature.tsx')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText
const snippets = [{ name: 'qa/direct', snippet: [{ protocol: 'freedom', tag: 'direct' }] }]
const contract = import('./helpers/xera-editor-contract.mjs')

function setup(asset, prepare = () => {}) {
    const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/assets', asset), 'utf8'))
    prepare(source)
    const registered = []
    const errors = []
    const exports = {}
    const urls = []
    vm.runInNewContext(compiled, { exports, require(name) {
        if (name === 'src/config') return { app: { configEditor: { jsonSchemaUrl: 'fixture-json', jsonSchemaCnUrl: 'fixture-cn' } } }
        if (name === '@shared/api/hooks/xray-mode') return { loadXrayMode: async () => ({ mode: 'custom', revision: 0 }) }
        if (name === 'consola') return { error: (...args) => errors.push(args.join(' ')) }
        if (name === '@shared/i18n/interface-text') return { translateUiText: key => key }
        if (name === '@shared/utils/monaco/json-schema-registry') return { registerJsonSchema: schema => registered.push(schema) }
        if (name === '@shared/utils/monaco/schema-cache') return { loadEditorSchema: async url => {
            urls.push(url)
            return structuredClone(source)
        } }
        if (name === '@shared/utils/monaco/snippet-hover') return { setSnippetHoverData() {} }
        return require(name)
    } })
    return { features: exports, registered, errors, urls }
}

test('the root schema reference selects the flavor when both naming families are present', async () => {
    for (const isDefault of [false, true]) {
        const result = setup(isDefault ? 'xray.default.schema.json' : 'xray.schema.json', schema => {
            const unrelated = isDefault ? 'OutboundObject' : 'XrayDefaultOutboundDetourConfig'
            schema.definitions[unrelated] = { type: 'object', properties: { unrelated: { type: 'string' } } }
        })
        await result.features.MonacoSetupFeature.setup('en', snippets)
        assert.deepEqual(result.errors, [])
        const config = result.registered[0]
        assert((await complete(config, { outbounds: [{ snippet: '' }] }, '""')).includes('qa/direct'))
        const unrelated = isDefault ? 'OutboundObject' : 'XrayDefaultOutboundDetourConfig'
        assert.equal(config.schema.definitions[unrelated].properties.snippet, undefined)
    }
})

test('default schema enrichment preserves the existing custom transport and webhook restrictions', async () => {
    const result = setup('xray.default.schema.json')
    await result.features.MonacoSetupFeature.setup('en', snippets)
    const { editorService, editorDocument } = await contract
    for (const config of [
        { inbounds: [{ protocol: 'olcrtc' }] },
        { outbounds: [{ protocol: 'freedom', streamSettings: { network: 'xera-http' } }] },
        { routing: { rules: [{ webhook: { url: 'http://127.0.0.1/test' }, outboundTag: 'direct' }] } },
        { remnacustUserQuotaRequired: true }
    ]) {
        const registration = structuredClone(result.registered[0])
        const service = editorService([registration])
        const document = editorDocument(config)
        const diagnostics = await service.doValidation(document, service.parseJSONDocument(document))
        assert(diagnostics.length > 0, JSON.stringify(config))
    }
})

async function complete(registration, value, needle) {
    const { editorService, editorDocument } = await contract
    const uri = registration.fileMatch[0].replace('*', 'contract')
    const document = editorDocument(value, uri)
    const service = editorService([structuredClone(registration)])
    const offset = document.getText().lastIndexOf(needle) + 1
    assert(offset > 0)
    const result = await service.doComplete(document, document.positionAt(offset), service.parseJSONDocument(document))
    return result.items.map(item => item.label.replaceAll('"', ''))
}

for (const asset of ['xray.schema.json', 'xray.schema.cn.json', 'xray.default.schema.json', 'xray.default.schema.cn.json']) {
    const isDefault = asset.includes('.default.')
    const language = asset.includes('.cn.') ? 'zh' : 'en'

    test(`${asset}: config completion uses its flavor for snippets, geodata and protocols`, async () => {
        const result = setup(asset)
        await result.features.MonacoSetupFeature.setup(language, snippets)
        assert.deepEqual(result.errors, [])
        assert.deepEqual(result.urls, [language === 'zh' ? 'fixture-cn' : 'fixture-json'])
        const registration = result.registered.find(item => item.fileMatch[0] === 'xray-config://*')
        assert(registration)
        for (const config of [
            { snippets: [''] },
            { outbounds: [{ snippet: '' }] },
            { routing: { rules: [{ snippet: '' }] } },
            { routing: { balancers: [{ snippet: '' }] } }
        ]) assert((await complete(registration, config, '""')).includes('qa/direct'))
        const geodata = await complete(registration, { geodata: {} }, '{}')
        assert.equal(geodata.includes('core'), !isDefault)
        assert(geodata.includes('assets'))
        const protocols = await complete(registration, { outbounds: [{ protocol: '' }] }, '""')
        assert(protocols.includes('freedom'))
        const inboundProtocols = await complete(registration, { inbounds: [{ protocol: '' }] }, '""')
        if (isDefault) assert.equal(inboundProtocols.includes('olcrtc'), false)
        assert.equal(Boolean(registration.schema.definitions.GeodataObject), !isDefault)
    })

    test(`${asset}: snippet editor validates stock outbound, rule, balancer and root sections`, async () => {
        const result = setup(asset)
        const schema = await result.features.MonacoSetupSnippetsFeature.setup(language)
        assert(schema)
        assert.deepEqual(result.errors, [])
        const { editorService, editorDocument } = await contract
        const registration = result.registered[0]
        const service = editorService([structuredClone(registration)])
        for (const value of [
            [{ protocol: 'freedom', tag: 'direct' }],
            [{ ip: ['geoip:private'], outboundTag: 'direct' }],
            [{ tag: 'balanced', selector: ['direct'], strategy: { type: 'random' } }],
            [{ log: { loglevel: 'warning' } }]
        ]) {
            const document = editorDocument(value, 'snippet://contract')
            const diagnostics = await service.doValidation(document, service.parseJSONDocument(document))
            assert.deepEqual(diagnostics.map(item => item.message), [], JSON.stringify(value))
        }
        const geodata = schema.definitions[isDefault ? 'XrayDefaultGeodataConfig' : 'GeodataObject']
        assert.equal(Boolean(geodata.properties.core), !isDefault)
    })

    test(`${asset}: host JSON fields use the active flavor's mux, socket and mask definitions`, async () => {
        const result = setup(asset)
        await result.features.MonacoSetupHostJsonFieldsFeature.setup(language)
        assert.deepEqual(result.errors, [])
        assert.equal(result.registered.length, 3)
        const { editorService, editorDocument } = await contract
        for (const [pattern, config, field] of [
            ['host-mux://*', { enabled: false, concurrency: 8 }, 'enabled'],
            ['host-sockopt://*', { domainStrategy: 'AsIs', mark: 1 }, 'domainStrategy'],
            ['host-final-mask://*', { tcp: [], udp: [] }, 'tcp']
        ]) {
            const registration = result.registered.find(item => item.fileMatch[0] === pattern)
            assert(registration)
            assert(registration.schema.properties[field])
            const service = editorService([structuredClone(registration)])
            const document = editorDocument(config, pattern.replace('*', 'contract'))
            assert.deepEqual((await service.doValidation(document, service.parseJSONDocument(document))).map(item => item.message), [])
        }
        const mask = result.registered.find(item => item.fileMatch[0] === 'host-final-mask://*').schema
        assert.equal(mask.properties.tcp.items.$ref, isDefault ? '#/definitions/XrayDefaultMask' : '#/definitions/TCPMask')
    })
}
