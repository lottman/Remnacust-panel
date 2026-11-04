const test = require('node:test');
const assert = require('node:assert/strict');
const { source } = require('./upstream-filter-fixture.cjs');
const { createHash } = require('node:crypto');

function fixture() {
    const rows = [{ uuid: 'native', address: '127.0.0.1', port: 2222, proxyUrl: null, inbounds: ['shared', 'native-only'] },
        { uuid: 'custom', address: '127.0.0.2', port: 2222, proxyUrl: null, inbounds: ['shared', 'modern-only'] }];
    const data = new Map([['node_versions:native', { node: '3.4.3' }], ['node_versions:custom', { node: '1.1.22-remnacust' }]]);
    let reads = 0;
    const sql = () => ({ execute: async () => { reads++; return { rows }; } });
    const { HostPolicyService } = source('common/host-policy/host-policy.service.ts', {
        kysely: { sql }, '../utils/bounded-work-queue': source('common/utils/bounded-work-queue.ts'),
    });
    const service = new HostPolicyService({ kysely: {} }, {}, { get: async key => data.get(key) },
        { getOrThrow: () => 'synthetic-test' }, {});
    const capabilityKey = node => 'xera:host-policy:capabilities:v2:' + node.uuid + ':' +
        createHash('sha256').update(JSON.stringify([node.address,node.port,node.proxyUrl])).digest('hex');
    return { service, data, rows, capabilityKey, reads: () => reads };
}

test('shared inbounds use native compatibility while isolated custom inbounds keep extensions', async () => {
    const f = fixture();
    f.data.set(f.capabilityKey(f.rows[0]), { native: true, supported: false });
    const results = await Promise.all(Array.from({ length: 40 }, () => f.service.legacyInbounds()));
    assert.equal(f.reads(), 1);
    for (const result of results) assert.deepEqual([...result].sort(), ['native-only', 'shared']);
    f.data.set(f.capabilityKey(f.rows[0]), { supported: true, version: 'xera-host-policy-v2' });
    f.service.legacyInventory.until = 0;
    assert.deepEqual([...await f.service.legacyInbounds()], []);
    f.rows[0].address = '127.0.0.9';
    f.service.legacyInventory.until = 0;
    assert.deepEqual([...await f.service.legacyInbounds()], [], 'a version cached for another address cannot disable restrictions');
});

test('missing versions never disable restrictions; an authenticated native capability is explicit proof', async () => {
    const f = fixture();
    f.data.clear();
    assert.deepEqual([...await f.service.legacyInbounds()], []);
    f.data.set(f.capabilityKey(f.rows[1]), { native: true, supported: false });
    f.service.legacyInventory.until = 0;
    assert.deepEqual([...await f.service.legacyInbounds()].sort(), ['modern-only', 'shared']);
});

test('an older custom core disables only routed accounting on its inbounds', async () => {
    const f = fixture();
    f.data.set(f.capabilityKey(f.rows[1]), { version: 'xera-host-policy-v2', supported: true });
    assert.deepEqual([...await f.service.legacyInbounds()], []);
    assert.deepEqual([...f.service.legacyInventory.routed].sort(), ['modern-only', 'shared']);
});
