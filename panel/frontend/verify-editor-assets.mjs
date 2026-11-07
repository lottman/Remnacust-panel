import { execFile } from 'node:child_process'
import { createHash, webcrypto } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { runInThisContext } from 'node:vm'

import { EDITOR_ASSETS } from './editor-assets.mjs'
import {
    editorDocument,
    editorService,
    verifyXeraEditorSchemas
} from './tests/helpers/xera-editor-contract.mjs'

const asset = (name) => new URL(`./public/assets/${name}`, import.meta.url)
const stock = process.argv.includes('--default')

for (const name of EDITOR_ASSETS) {
    if (statSync(asset(name)).size === 0) throw new Error(`Empty editor asset: ${name}`)
}
const provenance = JSON.parse(readFileSync(asset('xray.default.provenance.json'), 'utf8'))
if (
    provenance.flavor !== 'default' ||
    provenance.upstreamVersion !== 'v26.10.31' ||
    provenance.upstreamCommit !== 'a4a3dff5b20c2faae567b742c172c7b95e75c083' ||
    provenance.sourceArchiveSha256 !==
        'dcaec8dbf4520883c63544f48c972807cc2445f2a932b8fe63867361ef32084c'
)
    throw new Error('Stale default editor provenance')
for (const name of ['default.wasm', 'xray.default.schema.json', 'xray.default.schema.cn.json']) {
    const sha = createHash('sha256')
        .update(readFileSync(asset(name)))
        .digest('hex')
    if (provenance.files?.[name] !== sha)
        throw new Error(`Default editor asset integrity mismatch: ${name}`)
}
if (!stock) {
    const result = await promisify(execFile)(
        process.execPath,
        [fileURLToPath(import.meta.url), '--default'],
        { timeout: 30_000, maxBuffer: 128 * 1024 }
    )
    process.stdout.write(result.stdout)
}
for (const name of ['xray.schema.json', 'xray.schema.cn.json']) {
    const schema = JSON.parse(readFileSync(asset(name), 'utf8'))
    if (schema.definitions.TLSObject.properties.allowInsecure) throw new Error('Stale TLS schema')
    if (
        schema['x-remnacust-upstream']?.version !== 'v26.10.31' ||
        schema['x-remnacust-upstream']?.commit !== 'a4a3dff5b20c2faae567b742c172c7b95e75c083' ||
        schema['x-remnacust-upstream']?.patchCommit !== null ||
        schema['x-remnacust-upstream']?.coreVersion !== '1.1.16'
    )
        throw new Error('Stale config schema')
}

globalThis.crypto ??= webcrypto
runInThisContext(readFileSync(asset('wasm_exec.js'), 'utf8'), {
    filename: 'wasm_exec.js'
})

const go = new Go()
let timeout
const initialized = new Promise((resolve, reject) => {
    globalThis.onWasmInitialized = resolve
    timeout = setTimeout(() => reject(new Error('Xray WASM initialization timed out')), 15000)
})

const wasm = await WebAssembly.instantiate(
    readFileSync(asset(stock ? 'default.wasm' : 'main.wasm')),
    go.importObject
)
void go.run(wasm.instance)
await initialized
clearTimeout(timeout)

if (typeof globalThis.XrayParseConfig !== 'function') {
    throw new Error('Xray WASM did not export XrayParseConfig')
}

const valid = { outbounds: [{ protocol: 'freedom', tag: 'DIRECT' }] }
if (globalThis.XrayParseConfig(JSON.stringify(valid))) {
    throw new Error('Xray WASM rejected a valid config')
}
if (!globalThis.XrayParseConfig('{invalid json')) {
    throw new Error('Xray WASM accepted invalid JSON')
}

if (globalThis.XrayGetVersion() !== (stock ? '26.10.31' : '1.1.16')) {
    throw new Error(`Stale editor core: ${globalThis.XrayGetVersion()}`)
}
if (stock) {
    const xhttp = {
        inbounds: [
            {
                protocol: 'vless',
                port: 1080,
                settings: { clients: [], decryption: 'none' },
                streamSettings: { network: 'xhttp', xhttpSettings: { path: '/test' } }
            }
        ],
        outbounds: [{ tag: 'direct', protocol: 'freedom' }]
    }
    const geo = {
        ...valid,
        routing: { rules: [{ type: 'field', ip: ['geoip:private'], outboundTag: 'DIRECT' }] }
    }
    const xera = structuredClone(xhttp)
    xera.inbounds[0].streamSettings = { network: 'xera-http', xeraHttpSettings: {} }
    const olc = { outbounds: [{ protocol: 'olcrtc', settings: {} }] }
    for (const config of [valid, xhttp, geo])
        if (globalThis.XrayParseConfig(JSON.stringify(config)))
            throw new Error('Default editor rejected a stock configuration')
    for (const config of [xera, olc])
        if (!globalThis.XrayParseConfig(JSON.stringify(config)))
            throw new Error('Default editor accepted a custom-only protocol')
    for (const filename of ['xray.default.schema.json', 'xray.default.schema.cn.json']) {
        const schema = JSON.parse(readFileSync(asset(filename), 'utf8'))
        if (!schema.definitions?.XrayDefaultConfig || schema.definitions.XrayDefaultXeraHTTPConfig)
            throw new Error('Default editor schema contains the wrong source definitions')
        const service = editorService([
            { uri: `https://contract/${filename}`, fileMatch: ['xray-config://*'], schema }
        ])
        for (const [expected, configs] of [
            [true, [valid, xhttp, geo]],
            [
                false,
                [
                    xera,
                    olc,
                    { ...valid, remnacustUserQuotaRequired: true },
                    {
                        ...valid,
                        routing: {
                            rules: [
                                {
                                    type: 'field',
                                    domain: ['example.test'],
                                    outboundTag: 'DIRECT',
                                    webhook: {}
                                }
                            ]
                        }
                    }
                ]
            ]
        ]) {
            for (const config of configs) {
                const document = editorDocument(config)
                const diagnostics = await service.doValidation(
                    document,
                    service.parseJSONDocument(document)
                )
                if ((diagnostics.length === 0) !== expected)
                    throw new Error(
                        `Default schema ${filename} disagrees with the stock contract: ${diagnostics.map((item) => item.message).join('; ')}`
                    )
            }
        }
    }
    console.log(
        'Default editor upstream 26.10.31, source provenance, 5 WASM fixtures and 14 Monaco schema cases verified'
    )
    process.exit(0)
}
const fixtures = JSON.parse(
    readFileSync(new URL('./tests/xray-config-fixtures.json', import.meta.url), 'utf8')
)
for (const fixture of fixtures.valid) {
    const error = globalThis.XrayParseConfig(JSON.stringify(fixture.config))
    if (error) throw new Error(`Editor rejected ${fixture.name}: ${error}`)
}
for (const fixture of fixtures.invalid) {
    if (!globalThis.XrayParseConfig(JSON.stringify(fixture.config))) {
        throw new Error(`Editor accepted ${fixture.name}`)
    }
}
const schemaCases = await verifyXeraEditorSchemas(fixtures)

console.log(
    `Editor core 1.1.16 (upstream 26.10.31), ${fixtures.valid.length + fixtures.invalid.length} configuration fixtures and ${schemaCases} Monaco schema cases verified`
)
process.exit(0)
