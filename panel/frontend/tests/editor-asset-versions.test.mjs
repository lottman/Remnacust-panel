import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { EDITOR_ASSETS, editorAssetVersions } from '../editor-assets.mjs'

const require = createRequire(import.meta.url)
const load = require('../../backend/tests/load-typescript.cjs')

test('changing an editor asset invalidates only that asset URL', () => {
    const read = (name) => Buffer.from(`fixture:${name}`)
    const first = editorAssetVersions(read)
    assert.deepEqual(first, editorAssetVersions(read))
    for (const changed of EDITOR_ASSETS) {
        const next = editorAssetVersions((name) =>
            name === changed ? Buffer.concat([read(name), Buffer.from('new')]) : read(name)
        )
        for (const name of EDITOR_ASSETS) {
            assert.match(next[name], /^[a-f0-9]{64}$/)
            assert.equal(next[name] === first[name], name !== changed)
        }
    }
})

test('all configured editor URLs use their asset content version', () => {
    const versions = editorAssetVersions((name) => Buffer.from(name))
    let mode = 'custom'
    const { app } = load(
        fileURLToPath(new URL('../src/config.ts', import.meta.url)),
        { './shared/api/hooks/xray-mode': { selectedXrayMode: () => mode } },
        {
            __EDITOR_ASSET_VERSIONS__: versions
        }
    )
    for (const [key, name] of Object.entries({
        wasmUrl: 'main.wasm',
        wasmJsUrl: 'wasm_exec.js',
        jsonSchemaUrl: 'xray.schema.json',
        jsonSchemaCnUrl: 'xray.schema.cn.json'
    })) {
        assert.equal(app.configEditor[key], `/assets/${name}?v=${versions[name]}`)
    }
    mode = 'default'
    for (const [key, name] of Object.entries({
        wasmUrl: 'default.wasm',
        wasmJsUrl: 'wasm_exec.js',
        jsonSchemaUrl: 'xray.default.schema.json',
        jsonSchemaCnUrl: 'xray.default.schema.cn.json'
    }))
        assert.equal(app.configEditor[key], `/assets/${name}?v=${versions[name]}`)
})
