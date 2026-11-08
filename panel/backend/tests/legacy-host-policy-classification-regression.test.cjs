require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src/common/host-policy');
const sql = () => { throw new Error('Discovery must not query the fixture database'); };
sql.join = values => values;
const { HostPolicyService } = load(path.join(root, 'host-policy.service.ts'), {
    kysely: { sql },
    '@common/database': {}, '@common/axios': {}, '@common/raw-cache': {},
    '@common/config/app-config/typed-config.service': {},
    '@common/utils/host-identity': load(path.join(root, '../utils/host-identity.ts')),
    './host-policy-scopes': load(path.join(root, 'host-policy-scopes.ts')),
    './quota-policy': load(path.join(root, 'quota-policy.ts'), { kysely: { sql } }),
    './destination-rule': load(path.join(root, 'destination-rule.ts')),
});
const node = { uuid: '11111111-1111-4111-8111-111111111111', address: 'fixture.invalid',
    port: 2222, proxyUrl: null };
function fixture(health, policy = { isOk: false, code: 'ECONNRESET' }) {
    const values = new Map(), calls = [];
    const service = new HostPolicyService({ kysely: {} }, {
        getNodeHealth: async () => { calls.push('health'); return typeof health === 'function' ? health() : health; },
        hostPolicy: async () => { calls.push('policy'); return policy; },
    }, { get: async key => values.get(key) ?? null,
        set: async (key, value) => { values.set(key, value); } },
    { getOrThrow: () => 'synthetic-test-secret' }, { isTransactionActive: () => false });
    return { service, calls, values, run: () => service.discoverCapabilities(node) };
}
const health = version => ({ isOk: true, response: { isAlive: true,
    xrayInternalStatusCached: false, xrayVersion: null, nodeVersion: version } });

test('authenticated known native releases bypass the absent custom endpoint before it can reset the route', async () => {
    for (const version of ['2.5.1', '3.4.1', '3.4.2', '3.4.3', 'v3.4.3']) {
      for (const isAlive of [true, false]) {
        const reply = health(version);
        reply.response.isAlive = isAlive;
        const f = fixture(reply);
        const caps = await f.run();
        assert.equal(caps.native, true, version);
        assert.equal(caps.supported, false, version);
        assert.deepEqual(f.calls, ['health'], version);
        assert.ok([...f.values.values()].some(value => value.native === true));
      }
    }
});

test('custom and unknown versions never become native because a capability request resets or returns 404', async () => {
    for (const version of ['1.1.11', '1.1.11-remnacust', '3.4.3-remnacust',
        '3.4.3+remnacust', '3.4.3-custom', '3.4.3+unknown', '3.4.3-rc.1',
        'unknown', '', null, 343]) {
        for (const code of ['ECONNRESET', 'NODE_HTTP_404']) {
            const f = fixture(health(version), { isOk: false, code });
            await assert.rejects(f.run(), undefined, `${String(version)} ${code}`);
            assert.equal([...f.values.values()].some(value => value?.native === true), false);
        }
    }
});

test('failed or malformed health cannot identify a native node', async () => {
    for (const reply of [{ isOk: false, code: 'NODE_HTTP_401' },
        { isOk: false, code: 'CERT_HAS_EXPIRED' }, { isOk: false, code: 'ECONNRESET' },
        { isOk: true, response: null },
        { isOk: true, response: { nodeVersion: '3.4.3', isAlive: 'true' } },
        { isOk: true, response: { nodeVersion: '3.4.3' } }]) {
        const f = fixture(reply);
        await assert.rejects(f.run());
        assert.equal([...f.values.values()].some(value => value?.native === true), false);
    }
});

test('custom nodes retain positively advertised capabilities even when their version is unsuffixed', async () => {
    for (const version of ['1.1.11', '1.1.11-remnacust', '3.4.3-remnacust']) {
        const f = fixture(health(version), { isOk: true, response: {
            version: 'xera-host-policy-v2', supported: true, quotaReservesSupported: true,
        } });
        const caps = await f.run();
        assert.equal(caps.native, false);
        assert.equal(caps.supported, true);
        assert.equal(caps.quotaReservesSupported, true);
        assert.equal(f.calls.filter(call => call === 'policy').length, 1);
    }
});

test('positive custom capabilities survive failed or throwing health discovery', async () => {
    for (const reply of [{ isOk: false, code: 'ECONNRESET' },
        { isOk: false, code: 'NODE_HTTP_401' }, () => { throw new Error('synthetic health failure'); }]) {
        const f = fixture(reply, { isOk: true, response: {
            version: 'xera-host-policy-v2', supported: true, quotaReservesSupported: true,
        } });
        const caps = await f.run();
        assert.equal(caps.native, false);
        assert.equal(caps.supported, true);
        assert.equal(caps.quotaReservesSupported, true);
        assert.deepEqual(f.calls, ['health', 'policy']);
    }
});
