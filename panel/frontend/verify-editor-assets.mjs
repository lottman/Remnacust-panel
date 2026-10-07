import { webcrypto } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { runInThisContext } from 'node:vm'

const asset = (name) => new URL(`./public/assets/${name}`, import.meta.url)

for (const name of ['main.wasm', 'wasm_exec.js', 'xray.schema.json', 'xray.schema.cn.json']) {
    if (statSync(asset(name)).size === 0) throw new Error(`Empty editor asset: ${name}`)
}
for (const name of ['xray.schema.json', 'xray.schema.cn.json']) {
    const schema = JSON.parse(readFileSync(asset(name), 'utf8'))
    if (schema.definitions.TLSObject.properties.allowInsecure) throw new Error('Stale TLS schema')
    if (schema['x-remnacust-upstream']?.version !== 'v26.9.30') throw new Error('Stale config schema')
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

const wasm = await WebAssembly.instantiate(readFileSync(asset('main.wasm')), go.importObject)
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

if (globalThis.XrayGetVersion() !== '1.1.1') {
    throw new Error(`Stale editor core: ${globalThis.XrayGetVersion()}`)
}
const fixtures = JSON.parse(readFileSync(new URL('./tests/xray-config-fixtures.json', import.meta.url), 'utf8'))
for (const fixture of fixtures.valid) {
    const error = globalThis.XrayParseConfig(JSON.stringify(fixture.config))
    if (error) throw new Error(`Editor rejected ${fixture.name}: ${error}`)
}
for (const fixture of fixtures.invalid) {
    if (!globalThis.XrayParseConfig(JSON.stringify(fixture.config))) {
        throw new Error(`Editor accepted ${fixture.name}`)
    }
}

console.log(`Editor core 1.1.1 (upstream 26.9.30) and ${fixtures.valid.length + fixtures.invalid.length} configuration fixtures verified`)
process.exit(0)
