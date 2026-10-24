const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const load = require('../../backend/tests/load-typescript.cjs')
const root = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor')
const { geofilePresets } = load(path.join(root, 'geofile-presets.ts'))
const { geofileCatalog, compatibleGeofile } = load(path.join(root, 'geofile-library-model.ts'), {
    './geofile-presets': { geofilePresets }
})

test('one catalog exposes every uploaded file alongside built-in datasets', () => {
    const files = [
        { id: 'dat', name: 'Sites', kind: 'geosite', size: 1024 },
        { id: 'srs', name: 'Binary', kind: 'singbox-srs', size: 4096 },
        { id: 'yaml', name: 'Domains', kind: 'mihomo-domain', size: 2048 }
    ]
    const catalog = geofileCatalog(files)
    assert.deepEqual(catalog[0].items.map((item) => item.value), ['file:dat', 'file:srs', 'file:yaml'])
    assert.equal(catalog.flatMap((group) => group.items).filter((item) => item.value.startsWith('preset:')).length, 6)
    assert.equal(compatibleGeofile('singbox-srs', 'XRAY_JSON'), false)
    assert.equal(compatibleGeofile('singbox-srs', 'SINGBOX'), true)
    for (const format of ['XRAY_JSON', 'SINGBOX', 'MIHOMO', 'CLASH', 'STASH'])
        assert.equal(compatibleGeofile('geosite', format), true)
})

test('an imported preset becomes the shared library entry instead of appearing twice', () => {
    const preset = geofilePresets[0]
    const file = {id:'stored', name:preset.name, kind:preset.kind, size:400, refresh:{sourceUrl:preset.url}}
    const values = geofileCatalog([file]).flatMap((group) => group.items).map((item) => item.value)
    assert.ok(values.includes('file:stored'))
    assert.ok(!values.includes('preset:' + preset.id))
    const afterDelete = geofileCatalog([]).flatMap((group) => group.items).map((item) => item.value)
    assert.ok(afterDelete.includes('preset:' + preset.id), 'The built-in source can be imported again')
    assert.ok(!afterDelete.includes('file:stored'))
})
