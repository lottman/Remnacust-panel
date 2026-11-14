import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { verifyDefaultEditorProvenance } from '../verify-default-editor-assets.mjs'

const asset = (name) => readFileSync(new URL(`../public/assets/${name}`, import.meta.url))

function altered(change) {
    const provenance = JSON.parse(asset('xray.default.provenance.json'))
    change(provenance)
    return (name) => name === 'xray.default.provenance.json' ? JSON.stringify(provenance) : asset(name)
}

function rehashManifest(provenance) {
    const { manifestSha256, ...manifest } = provenance.dependencySecurityUpdates
    provenance.dependencySecurityUpdates.manifestSha256 = createHash('sha256')
        .update(JSON.stringify(manifest, null, 2) + '\n')
        .digest('hex')
}

test('default retains the reviewed original builders and exact security override manifest', () => {
    const provenance = verifyDefaultEditorProvenance()
    assert.equal(provenance.dependencySecurityUpdates.goModSha256,
        'e13b98fb2a7c05cc9e2126451353d4ac5b1ca734174dbd2b416fef6d8ab7ef40')
    assert.equal(provenance.dependencySecurityUpdates.goSumSha256,
        'd53d7e8f770513935d5ab87c9e6692eb565f996cdaff5500f2c14ddd2dea05f4')
    for (const name of ['xray.default.schema.json', 'xray.default.schema.cn.json']) {
        const schema = JSON.parse(asset(name))
        assert.equal(schema.definitions.XrayDefaultXeraHTTPConfig, undefined)
        assert.equal(schema.definitions.XrayDefaultStreamConfig.properties.xeraHttpSettings, undefined)
        assert(!schema.definitions.XrayDefaultStreamConfig.properties.network.enum.includes('xera-http'))
        assert(!schema.definitions.XrayDefaultOutboundDetourConfig.properties.protocol.enum.includes('olcrtc'))
    }
})

test('unpatched official assets cannot pass using only their valid asset hashes', () => {
    assert.throws(() => verifyDefaultEditorProvenance(altered((value) => {
        delete value.dependencySecurityUpdates
    })), /security dependency manifest/)
})

test('rehashed custom builders, downgraded modules and altered locks cannot replace the reviewed baseline', () => {
    for (const change of [
        (value) => {
            value.configurationSourceSha256 = 'a'.repeat(64)
            value.dependencySecurityUpdates.configurationSourceSha256 = value.configurationSourceSha256
        },
        (value) => { value.dependencySecurityUpdates.dependencyOverrides[0].version = 'v1.20.1' },
        (value) => { value.dependencySecurityUpdates.goModSha256 = 'b'.repeat(64) },
        (value) => { value.dependencySecurityUpdates.goSumSha256 = 'c'.repeat(64) },
        (value) => { value.dependencySecurityUpdates.policy = 'pristine' }
    ]) {
        assert.throws(() => verifyDefaultEditorProvenance(altered((value) => {
            change(value)
            rehashManifest(value)
        })), /provenance|manifest/)
    }
})

test('default asset tampering still fails independently of source and dependency provenance', () => {
    for (const name of ['default.wasm', 'xray.default.schema.json', 'xray.default.schema.cn.json']) {
        assert.throws(() => verifyDefaultEditorProvenance((requested) =>
            requested === name ? Buffer.concat([asset(requested), Buffer.from(' ')]) : asset(requested)),
        /asset integrity mismatch/)
    }
})

test('recomputed file hashes cannot authorize replacement assets with the unchanged trusted security manifest', () => {
    for (const name of ['default.wasm', 'xray.default.schema.json', 'xray.default.schema.cn.json']) {
        const provenance = JSON.parse(asset('xray.default.provenance.json'))
        const trustedManifest = structuredClone(provenance.dependencySecurityUpdates)
        const replacement = Buffer.concat([
            asset(name),
            name === 'default.wasm' ? Buffer.from([0, 1, 0]) : Buffer.from('\n')
        ])
        if (name === 'default.wasm') assert(WebAssembly.validate(replacement))
        provenance.files[name] = createHash('sha256').update(replacement).digest('hex')
        assert.deepEqual(provenance.dependencySecurityUpdates, trustedManifest)
        assert.throws(() => verifyDefaultEditorProvenance((requested) => {
            if (requested === 'xray.default.provenance.json') return JSON.stringify(provenance)
            return requested === name ? replacement : asset(requested)
        }), /asset integrity mismatch/)
    }
})

test('the reviewed default artifact set cannot be extended or truncated through provenance', () => {
    for (const change of [
        (value) => { value.files['unreviewed.wasm'] = 'a'.repeat(64) },
        (value) => { delete value.files['xray.default.schema.cn.json'] }
    ]) {
        assert.throws(() => verifyDefaultEditorProvenance(altered(change)), /asset integrity mismatch/)
    }
})
