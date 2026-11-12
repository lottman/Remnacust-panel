import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { EDITOR_ASSETS, editorAssetVersions } from '../editor-assets.mjs'
import { editorDocument, editorService } from './helpers/xera-editor-contract.mjs'

const asset = (name) => new URL(`../public/assets/${name}`, import.meta.url)
const provenance = JSON.parse(readFileSync(asset('template-schemas.provenance.json'), 'utf8'))

function references(value, root) {
    if (Array.isArray(value)) return value.forEach((item) => references(item, root))
    if (!value || typeof value !== 'object') return
    if ('$ref' in value) {
        assert.match(value.$ref, /^#\//)
        let target = root
        for (const part of value.$ref.slice(2).split('/'))
            target = target?.[decodeURIComponent(part).replaceAll('~1', '/').replaceAll('~0', '~')]
        assert.notEqual(target, undefined, `Unresolved local schema reference ${value.$ref}`)
    }
    Object.values(value).forEach((item) => references(item, root))
}

for (const [name, valid, invalid] of [
    ['mihomo.schema.json', { 'mixed-port': 7890, mode: 'rule' }, { 'mixed-port': 'invalid-port' }],
    [
        'singbox.schema.json',
        { log: { level: 'info' }, outbounds: [{ type: 'direct', tag: 'direct' }] },
        { log: { level: 123 } }
    ]
]) {
    test(`${name} validates and completes through the real Monaco JSON language service`, async () => {
        const schema = JSON.parse(readFileSync(asset(name), 'utf8'))
        const service = editorService([
            { uri: `https://contract/${name}`, fileMatch: ['template-schema://*'], schema }
        ])
        const good = editorDocument(valid, 'template-schema://valid')
        const errors = await service.doValidation(good, service.parseJSONDocument(good))
        assert.deepEqual(
            errors.map((error) => error.message),
            []
        )
        const bad = editorDocument(invalid, 'template-schema://invalid')
        assert((await service.doValidation(bad, service.parseJSONDocument(bad))).length > 0)
        const empty = editorDocument({}, 'template-schema://completion')
        const suggestions = await service.doComplete(
            empty,
            { line: 0, character: 1 },
            service.parseJSONDocument(empty)
        )
        assert(suggestions.items.length > 10)
    })
}

for (const name of ['mihomo.schema.json', 'singbox.schema.json']) {
    test(`${name} ships a complete local schema, license and immutable provenance`, () => {
        const bytes = readFileSync(asset(name))
        const source = provenance.files[name]
        assert(EDITOR_ASSETS.includes(name))
        assert(bytes.length > 10_000 && bytes.length < 4 * 1024 * 1024)
        assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256)
        assert.equal(editorAssetVersions()[name], source.sha256)
        assert.match(source.url, /^https:\/\/(registry\.npmjs\.org|raw\.githubusercontent\.com)\//)
        assert.match(source.license, /^schema-licenses\/[\w.-]+\.txt$/)
        assert(readFileSync(asset(source.license)).length > 500)
        const schema = JSON.parse(bytes)
        assert.equal(schema.type, 'object')
        assert(schema.properties || schema.allOf)
        references(schema, schema)
    })
}
