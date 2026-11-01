const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const { materializeGeofiles } = load(path.join(__dirname, '../src/modules/subscription-template/geofiles/materialize-geofiles.ts'), { ...mocks, '../generators/client-pool': pool });
const id = '00' + 'a'.repeat(32);
const catchAll = { type: 'field', network: 'tcp,udp', balancerTag: 'auto' };
const reference = target => ({ id, categories: ['example'], target });
const input = (strategy, target = 'DIRECT') => ({
    routing: { ...(strategy ? { domainStrategy: strategy } : {}), balancers: [{ tag: 'auto', selector: ['proxy'] }],
        rules: [{ type: 'field', domain: ['full:manual.test'], outboundTag: 'manual' }, catchAll] },
    outbounds: [{ tag: 'manual', protocol: 'freedom' }],
    remnacust: { geofiles: [reference(target)] },
});
const render = (config, kind, delivery) => materializeGeofiles(config, 'XRAY_JSON', async () => ({ id, kind }),
    async () => ({ ips: ['203.0.113.0/24'], domains: [{ type: 3, value: 'example.test' }] }),
    delivery ? { read: async () => Buffer.alloc(0), validateDat: async () => {}, datUrl: () => '', datBundleUrl: async () => 'https://sub.example.test/bundle.dat' } : undefined,
    delivery);

test('generated GeoIP resolves domains before a catch-all, for DIRECT, blocking and balancers', async () => {
    for (const strategy of [undefined, 'AsIs', 'IPIfNonMatch', 'IPOnDemand']) {
        for (const target of ['DIRECT', 'REJECT', 'auto']) {
            const config = input(strategy, target), original = structuredClone(config);
            const result = await render(config, 'geoip');
            assert.equal(result.routing.domainStrategy, 'IPOnDemand');
            assert.equal(result.routing.rules[0].domain[0], 'full:manual.test', 'manual rule priority is preserved');
            assert.deepEqual(result.routing.rules[1].ip, ['203.0.113.0/24']);
            assert.deepEqual(result.routing.rules[2], catchAll);
            if (target === 'auto') assert.equal(result.routing.rules[1].balancerTag, 'auto');
            else assert.equal(result.routing.rules[1].outboundTag, target === 'DIRECT' ? 'geo-freedom' : 'geo-blackhole');
            assert.deepEqual(config, original, 'the cached template must remain unchanged');
        }
    }
});

test('downloaded GeoIP bundles use the same domain-resolution strategy', async () => {
    const registered = [];
    const result = await render(input('IPIfNonMatch'), 'geoip', { mode: 'remote',
        register(kind) { registered.push(kind); return ['geoip:fixture_category']; },
    });
    assert.deepEqual(registered, ['geoip']);
    assert.equal(result.routing.domainStrategy, 'IPOnDemand');
    assert.deepEqual(result.routing.rules[1].ip, ['geoip:fixture_category']);
});

test('domain-only geofiles and templates without references preserve the original strategy', async () => {
    for (const strategy of [undefined, 'AsIs', 'IPIfNonMatch', 'IPOnDemand']) {
        assert.equal((await render(input(strategy), 'geosite')).routing.domainStrategy, strategy);
        const config = input(strategy); config.remnacust.geofiles = [];
        assert.equal((await render(config, 'geoip')).routing.domainStrategy, strategy);
    }
});
