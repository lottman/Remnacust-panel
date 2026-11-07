const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('../../backend/tests/load-typescript.cjs');
const base = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor');
const { replaceLibraryGeofile, geofileCatalog } = load(path.join(base, 'geofile-library-model.ts'));
const { readClientTemplate } = load(path.join(base, 'client-template-model.ts'));
const { geofilePresets } = load(path.join(base, 'geofile-presets.ts'));

test('copy replaces only the source reference in the latest draft and preserves settings', () => {
    const draft = { dns: { servers: ['localhost'] }, remnacust: { geofiles: [
        { id: 'source', categories: ['ru'], target: 'balancer', clientRefreshIntervalSeconds: 600 },
        { id: 'other', categories: ['private'], target: 'DIRECT' }
    ] } };
    const output = JSON.parse(replaceLibraryGeofile(JSON.stringify(draft), 'XRAY_JSON', 'source', { id: 'copy', kind: 'geosite', name: 'Copy', size: 100, categories: ['ru'] }));
    assert.deepEqual(output.dns, draft.dns);
    assert.deepEqual(output.remnacust.geofiles, [{ ...draft.remnacust.geofiles[0], id: 'copy' }, draft.remnacust.geofiles[1]]);
    assert.equal(draft.remnacust.geofiles[0].id, 'source');
});

test('an asynchronous copy does not reattach a source removed while editing', () => {
    const draft = '{"dns":{"servers":["localhost"]},"remnacust":{"geofiles":[]}}';
    assert.equal(replaceLibraryGeofile(draft, 'XRAY_JSON', 'source', { id: 'copy', kind: 'geoip', name: 'Copy', size: 100 }), draft);
    assert.throws(() => replaceLibraryGeofile(draft, 'XRAY_JSON', 'source', { id: 'copy', kind: 'singbox-srs', name: 'Copy', size: 100 }), /incompatible/);
});

test('YAML reference replacement preserves routing and categories', () => {
    const text = 'rules:\n  - MATCH,PROXY\nremnacust:\n  geofiles:\n    - id: source\n      target: REJECT\n      categories: [ads]\n';
    const output = readClientTemplate(replaceLibraryGeofile(text, 'MIHOMO', 'source', { id: 'copy', kind: 'geosite', name: 'Copy', size: 100, categories: ['ads'] }), 'MIHOMO');
    assert.deepEqual(output.rules, ['MATCH,PROXY']);
    assert.deepEqual(output.remnacust.geofiles, [{ id: 'copy', target: 'REJECT', categories: ['ads'] }]);
});

test('edited uploads without a source remain in the common library', () => {
    const file = { id: 'copy', name: 'My rules', kind: 'geosite', size: 200, refresh: { enabled: false } };
    const catalog = geofileCatalog([file]);
    assert.equal(catalog[0].items[0].value, 'file:copy');
    assert.equal(catalog.flatMap(group => group.items).filter(item => item.value.startsWith('preset:')).length, geofilePresets.length);
});

test('replacement cannot silently switch the draft to a file without its selected category', () => {
    const draft = JSON.stringify({ remnacust: { geofiles: [{ id: 'source', categories: ['ru@ads'], target: 'DIRECT' }] } });
    assert.throws(() => replaceLibraryGeofile(draft, 'XRAY_JSON', 'source', { id: 'copy', kind: 'geosite', name: 'Copy', size: 100, categories: ['us'] }), /geofile-copy-selection/);
    assert.throws(() => replaceLibraryGeofile(draft, 'XRAY_JSON', 'source', { id: 'copy', kind: 'geosite', name: 'Copy', size: 100, categories: ['RU'] }), /geofile-copy-selection/);
    const result = JSON.parse(replaceLibraryGeofile(draft, 'XRAY_JSON', 'source', { id: 'copy', kind: 'geosite', name: 'Copy', size: 100, categories: ['RU'] }, [['ru@ads']]));
    assert.equal(result.remnacust.geofiles[0].id, 'copy');
});

test('a concurrent category edit cannot be replaced using an older validated selection', () => {
    const draft = JSON.stringify({ remnacust: { geofiles: [{ id: 'source', categories: ['ru@new'], target: 'DIRECT' }] } });
    assert.throws(() => replaceLibraryGeofile(draft, 'XRAY_JSON', 'source', { id: 'copy', kind: 'geosite', name: 'Copy', size: 100, categories: ['ru'] }, [['ru@ads']]), /geofile-copy-selection/);
});

test('editor serializes deletions without record values or display-only attributes', () => {
    const { geofileRecordPatch } = load(path.join(base, 'geofile-edit-model.ts'));
    assert.deepEqual(geofileRecordPatch({ 0: { index: 0, type: 'domain', value: 'example.com', attributeCount: 2, remove: true }, 1: { index: 1, type: 'full', value: 'login.example.com', attributeCount: 1 } }, 'extra.example.com', 'geosite'), {
        changes: [{ index: 0, remove: true }, { index: 1, type: 'full', value: 'login.example.com' }], additions: [{ type: 'domain', value: 'extra.example.com' }]
    });
    const thousand = Array.from({ length: 1000 }, (_, i) => `host${i}.example.com`).join('\n');
    assert.equal(geofileRecordPatch({}, thousand, 'geosite').additions.length, 1000);
    assert.throws(() => geofileRecordPatch({ 1: { index: 1, type: 'domain', value: 'example.com' } }, thousand, 'geosite'), /geofile-edit-batch/);
    assert.throws(() => geofileRecordPatch({}, '192.0.2.0/24', 'geosite'), /geofile-edit-batch/);
});
