const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const load = require('../../backend/tests/load-typescript.cjs')

const consumers = ['MonacoSetupFeature', 'MonacoSetupSnippetsFeature', 'MonacoSetupHostJsonFieldsFeature']
const snippets = [{ name: 'qa/direct', snippet: [{ protocol: 'freedom', tag: 'direct' }] }]
const tick = () => new Promise(resolve => setImmediate(resolve))

function harness() {
    const requests = []
    const downloads = []
    const registrations = []
    const errors = []
    const mode = load(path.join(__dirname, '../src/shared/api/hooks/xray-mode.ts'), {
        '@tanstack/react-query': {},
        '../axios': { instance: { get: (url, options) => {
            assert.equal(url, '/api/nodes/core-management/settings')
            assert.equal(options.timeout, 15000)
            return new Promise((resolve, reject) => requests.push({
                resolve: state => resolve({ data: { response: state } }), reject
            }))
        } } }
    })
    const config = load(path.join(__dirname, '../src/config.ts'), {
        './shared/api/hooks/xray-mode': mode
    }, { __EDITOR_ASSET_VERSIONS__: Object.fromEntries([
        'main.wasm', 'default.wasm', 'wasm_exec.js', 'xray.schema.json', 'xray.schema.cn.json',
        'xray.default.schema.json', 'xray.default.schema.cn.json'
    ].map(name => [name, 'fixture'])) })
    const schemaCache = load(path.join(__dirname, '../src/shared/utils/monaco/schema-cache.ts'), {}, {
        fetch: async url => {
            downloads.push(url)
            return {
                ok: true,
                json: async () => JSON.parse(fs.readFileSync(path.join(
                    __dirname, '../public/assets', path.basename(url.split('?')[0])
                ), 'utf8'))
            }
        }
    })
    const features = load(path.join(__dirname, '../src/features/dashboard/config-profiles/monaco-setup/monaco-setup.feature.tsx'), {
        'src/config': config,
        '@shared/api/hooks/xray-mode': mode,
        '@shared/i18n/interface-text': { translateUiText: key => key },
        '@shared/utils/monaco/json-schema-registry': { registerJsonSchema: value => registrations.push(value) },
        '@shared/utils/monaco/schema-cache': schemaCache,
        '@shared/utils/monaco/snippet-hover': { setSnippetHoverData() {} },
        consola: { error: (...args) => errors.push(args) }
    })
    return { mode, config, requests, downloads, registrations, errors,
        setup: (consumer, language = 'en') => features[consumer].setup(language, snippets)
    }
}

function assertFlavor(h, selected, language = 'en') {
    assert.equal(h.mode.selectedXrayMode(), selected)
    assert.deepEqual(h.errors, [])
    assert.deepEqual(h.downloads, [
        `/assets/xray${selected === 'default' ? '.default' : ''}.schema${language === 'zh' ? '.cn' : ''}.json?v=fixture`
    ])
    for (const { schema } of h.registrations) {
        assert.equal(Boolean(schema.definitions.XrayDefaultGeodataConfig), selected === 'default')
        assert.equal(Boolean(schema.definitions.GeodataObject), selected === 'custom')
    }
}

for (const consumer of consumers) {
    test(`${consumer} waits for validated mode before downloading or registering a localized schema`, async () => {
        for (const selected of ['default', 'custom']) {
            for (const language of ['en', 'ru', 'fa', 'zh']) {
                const h = harness()
                const pending = h.setup(consumer, language)
                await tick()
                assert.equal(h.requests.length, 1)
                assert.deepEqual(h.downloads, [])
                assert.deepEqual(h.registrations, [])
                h.requests[0].resolve({ mode: selected, revision: 1 })
                await pending
                assertFlavor(h, selected, language)
                assert.equal(h.registrations.length, consumer === 'MonacoSetupHostJsonFieldsFeature' ? 3 : 1)
            }
        }
    })
}

test('parallel profile, snippet and host setup share a pending mode refresh and the schema cache', async () => {
    const h = harness()
    const refresh = h.mode.loadXrayMode()
    assert.equal(refresh, h.mode.loadXrayMode())
    const pending = consumers.map(consumer => h.setup(consumer))
    await tick()
    assert.equal(h.requests.length, 1)
    assert.deepEqual(h.downloads, [])
    assert.deepEqual(h.registrations, [])
    h.requests[0].resolve({ mode: 'default', revision: 1 })
    await Promise.all([refresh, ...pending])
    assertFlavor(h, 'default')
    assert.equal(h.registrations.length, 5)
    const profile = h.registrations.find(item => item.fileMatch[0] === 'xray-config://*')
    const snippet = h.registrations.find(item => item.fileMatch[0] === 'snippet://*')
    assert(profile.schema.definitions.XrayDefaultOutboundDetourConfig.properties.snippet)
    assert.equal(snippet.schema.definitions.XrayDefaultOutboundDetourConfig.properties.snippet, undefined)
})

for (const failure of ['transport', 'invalid settings']) {
    test(`${failure} never registers the cached mode's schema and all consumers can retry`, async () => {
        const h = harness()
        const initial = h.mode.loadXrayMode()
        h.requests[0].resolve({ mode: 'custom', revision: 1 })
        await initial
        const pending = consumers.map(consumer => h.setup(consumer))
        await tick()
        assert.equal(h.requests.length, 2)
        assert.deepEqual(h.downloads, [])
        if (failure === 'transport') h.requests[1].reject(new Error('settings offline'))
        else h.requests[1].resolve({ mode: 'default', revision: -1 })
        await Promise.all(pending)
        assert.equal(h.mode.selectedXrayMode(), 'custom')
        assert.deepEqual(h.downloads, [])
        assert.deepEqual(h.registrations, [])
        assert.equal(h.errors.length, 3)
        h.errors.length = 0
        const retry = consumers.map(consumer => h.setup(consumer, 'zh'))
        await tick()
        assert.equal(h.requests.length, 3)
        h.requests[2].resolve({ mode: 'default', revision: 2 })
        await Promise.all(retry)
        assertFlavor(h, 'default', 'zh')
        assert.equal(h.registrations.length, 5)
    })
}
