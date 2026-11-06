import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { TextDocument } from '../node_modules/monaco-editor/esm/external/vscode-languageserver-textdocument/lib/esm/main.js'
import {
    editorDocument,
    editorService,
    verifyXeraEditorSchemas
} from './helpers/xera-editor-contract.mjs'

const require = createRequire(import.meta.url)
const load = require('../../backend/tests/load-typescript.cjs')
const fixtures = JSON.parse(
    readFileSync(new URL('./xray-config-fixtures.json', import.meta.url), 'utf8')
)
const setupPath = fileURLToPath(
    new URL(
        '../src/widgets/dashboard/templates/subscription-template-editor/utils/setup-template-monaco.tsx',
        import.meta.url
    )
)
const app = {
    configEditor: { jsonSchemaUrl: '/en.json', jsonSchemaCnUrl: '/zh.json' },
    templateEditor: { singboxJsonSchemaUrl: '/singbox.json' }
}

function harness(language = 'en') {
    const registrations = []
    const requests = []
    const providers = []
    const errors = []
    const setup = load(setupPath, {
        '@remnawave/backend-contract': {
            SUBSCRIPTION_TEMPLATE_TYPE: { XRAY_JSON: 'XRAY_JSON', SINGBOX: 'SINGBOX' }
        },
        'src/config': { app },
        '@shared/i18n/interface-text': { translateUiText: (value) => value },
        '@shared/utils/monaco/json-schema-registry': {
            registerJsonSchema: (value) => registrations.push(value)
        },
        '@shared/utils/monaco/schema-cache': {
            loadEditorSchema: async (url) => {
                requests.push(url)
                return JSON.parse(
                    readFileSync(
                        new URL(
                            `../public/assets/xray.schema${url === '/zh.json' ? '.cn' : ''}.json`,
                            import.meta.url
                        ),
                        'utf8'
                    )
                )
            }
        },
        i18next: { language, t: (value) => value },
        consola: { error: (...args) => errors.push(args) },
        'monaco-yaml': {},
        axios: { get: async () => ({ data: { type: 'object' } }) }
    })
    const monaco = {
        languages: {
            CompletionItemKind: { EnumMember: 20 },
            registerCompletionItemProvider: (_language, provider) => {
                providers.push(provider)
                return { dispose() {} }
            }
        }
    }
    return { setup, monaco, registrations, requests, providers, errors }
}

async function labels(service, marked, uri) {
    const offset = marked.indexOf('|')
    assert.notEqual(offset, -1)
    const document = TextDocument.create(uri, 'json', 1, marked.replace('|', ''))
    const result = await service.doComplete(
        document,
        document.positionAt(offset),
        service.parseJSONDocument(document)
    )
    return result.items.map((item) => item.label.replace(/^"|"$/g, ''))
}

test('both localized schemas validate the shared native/WASM editor contract cases', async () => {
    const count = Object.values(fixtures)
        .flat()
        .filter((fixture) => fixture.editorContract).length
    assert.ok(count > 0)
    assert.equal(await verifyXeraEditorSchemas(fixtures), count * 2)
})

for (const language of ['en', 'zh']) {
    test(`XRAY_JSON registers transport schemas and injector completions (${language})`, async () => {
        const h = harness(language)
        const host = {
            uuid: '00000000-0000-4000-8000-000000000001',
            remark: 'Synthetic host',
            tags: [],
            address: 'example.test',
            port: 443,
            inbound: {}
        }
        await h.setup.configureMonaco(h.monaco, 'json', [host], 'XRAY_JSON')
        assert.deepEqual(h.errors, [])
        assert.deepEqual(h.requests, [language === 'zh' ? '/zh.json' : '/en.json'])
        const registration = h.registrations.find((item) => item.uri.includes('xray-schema'))
        assert.ok(registration)
        assert.deepEqual(registration.fileMatch, [
            'subscription-template://xray_json',
            'subscription-template://xray_json/*'
        ])
        const service = editorService(h.registrations)
        const uri = 'subscription-template://xray_json/synthetic-template'
        const prefix = '{"outbounds":[{"protocol":"freedom","streamSettings":'
        const suffix = '}}]}'
        const stream = await labels(service, `${prefix}{|}${suffix}`, uri)
        assert.ok(stream.includes('xeraHttpSettings'))
        const fields = await labels(
            service,
            `${prefix}{"network":"xera-http","xeraHttpSettings":{|}}${suffix}`,
            uri
        )
        const expected = Object.keys(
            registration.schema.definitions.RemnacustCoreXeraHTTPConfig.properties
        )
        for (const field of expected) assert.ok(fields.includes(field), `Missing ${field}`)
        const extra = await labels(
            service,
            `${prefix}{"network":"xera-http","xeraHttpSettings":{"extra":{|}}}${suffix}`,
            uri
        )
        for (const field of ['customDownlinkPadding', 'downloadSettings', 'h2Params', 'xmux'])
            assert.ok(extra.includes(field), `Missing extra.${field}`)
        for (const placement of ['', '"extra":{']) {
            const tail = placement ? '}' : ''
            const h2 = await labels(
                service,
                `${prefix}{"network":"xera-http","xeraHttpSettings":{${placement}"h2Params":{|}${tail}}}${suffix}`,
                uri
            )
            for (const field of ['MaxConcurrentStreams', 'MaxReadFrameSize', 'SendPingTimeout'])
                assert.ok(h2.includes(field), `Missing ${placement}h2Params.${field}`)
            const padding = await labels(
                service,
                `${prefix}{"network":"xera-http","xeraHttpSettings":{${placement}"customDownlinkPadding":{|}${tail}}}${suffix}`,
                uri
            )
            for (const field of [
                'header',
                'token',
                'bytes',
                'blockBytes',
                'budgetPercent',
                'burstBytes',
                'uplink'
            ])
                assert.ok(padding.includes(field), `Missing padding.${field}`)
        }
        const injectorText = '{"remnawave":{"assignTo":{"hosts":[""]}}}'
        const offset = injectorText.indexOf('["') + 2
        const injector = h.providers[0].provideCompletionItems(
            {
                uri: { toString: () => uri },
                getValue: () => injectorText,
                getOffsetAt: () => offset,
                getPositionAt: (position) => ({ lineNumber: 1, column: position + 1 })
            },
            { lineNumber: 1, column: offset + 1 }
        )
        assert.ok(injector.suggestions.some((item) => item.label === host.uuid))
        const valid = editorDocument(
            { ...fixtures.valid.find((fixture) => fixture.editorContract).config, remnawave: {} },
            uri
        )
        assert.deepEqual(await service.doValidation(valid, service.parseJSONDocument(valid)), [])
        const invalid = editorDocument(
            fixtures.invalid.find((fixture) => fixture.editorContract).config,
            uri
        )
        assert.ok((await service.doValidation(invalid, service.parseJSONDocument(invalid))).length)
    })
}

test('non-Xray JSON editors do not load or register the Xray transport schema', async () => {
    const h = harness()
    await h.setup.configureMonaco(h.monaco, 'json', [], 'SINGBOX')
    assert.deepEqual(h.errors, [])
    assert.deepEqual(h.requests, [])
    assert.ok(h.registrations.some((item) => item.uri === 'https://singbox-schema.json'))
    assert.ok(!h.registrations.some((item) => item.uri.includes('xray-schema')))
})

test('planned runtime keepalive and header limits are reflected in direct and extra schemas', async () => {
    const schema = JSON.parse(
        readFileSync(new URL('../public/assets/xray.schema.json', import.meta.url), 'utf8')
    )
    const service = editorService([
        { uri: 'https://contract/runtime-bounds', fileMatch: ['xray-config://*'], schema }
    ])
    for (const settings of [
        { xmux: { hKeepAlivePeriod: -2 } },
        { xmux: { hKeepAlivePeriod: 604801 } },
        { headers: { Host: 'example.test' } },
        { headers: { 'bad name': 'value' } },
        { headers: { 'X-Research': 'value\r\nInjected: true' } }
    ]) {
        for (const extra of [false, true]) {
            const document = editorDocument({
                outbounds: [
                    {
                        protocol: 'freedom',
                        streamSettings: {
                            network: 'xera-http',
                            xeraHttpSettings: extra ? { extra: settings } : settings
                        }
                    }
                ]
            })
            assert.ok(
                (await service.doValidation(document, service.parseJSONDocument(document))).length
            )
        }
    }
})
