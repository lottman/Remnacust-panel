const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const traffic = load(path.join(__dirname, '../src/common/axios/profile-traffic.schema.ts'));
const snapshot = () => ({
    capability: 'remnacust-profile-traffic-v1',
    coreProcessId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    capturedAt: new Date().toISOString(),
    bindings: [{ bindingUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        uplink: '9223372036854775807', downlink: '0', available: true, retired: false }],
});

test('observation preserves int64 precision and strips unrelated node data', () => {
    const value = snapshot();
    const parsed = traffic.parseProfileTraffic({ ...value, privateConfig: 'must not escape' });
    assert.deepEqual(parsed, value);
});

test('missing, stale, future, duplicate and malformed observations are unavailable, not zero', () => {
    const value = snapshot();
    for (const candidate of [null, {},
        { ...value, capturedAt: new Date(Date.now() - 121000).toISOString() },
        { ...value, capturedAt: new Date(Date.now() + 31000).toISOString() },
        { ...value, bindings: [...value.bindings, ...value.bindings] },
        { ...value, bindings: [{ ...value.bindings[0], uplink: '9223372036854775808' }] },
        { ...value, bindings: [{ ...value.bindings[0], uplink: '1e8' }] },
    ]) assert.equal(traffic.parseProfileTraffic(candidate), null);
});

test('reading cached metrics never contacts a node and cache failure leaves the editor usable', async () => {
    const { NodePortPlansService } = load(path.join(__dirname, '../src/modules/nodes/node-port-plans.service.ts'), {
        '@common/database': {}, '@common/raw-cache': {},
        '@common/axios/profile-traffic.schema': traffic,
        '@common/helpers/xray-config/xray-config.validator': {},
        './profile-port-plan': {}, './port-plan-dispatch.service': {},
    });
    const value = snapshot();
    const node = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    for (const broken of [false, true]) {
        let reads = 0;
        const service = new NodePortPlansService({}, {}, {}, { get: async key => {
            reads++; assert.equal(key, traffic.nodeBindingTrafficKey(node));
            if (broken) throw Error('cache unavailable');
            return value;
        }});
        service.state = async () => ({ nodeUuid: node, revision: '7', lastRequestId: 'private', lastRequestHash: 'private', address: 'private', managementPort: 1234 });
        assert.deepEqual(await service.get(node), { nodeUuid: node, revision: '7', bindingTraffic: broken ? null : value });
        assert.equal(reads, 1);
    }
});
