const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = { ...mocks, '../generators/client-pool': pool };
const { materializeGeofiles } = load(path.join(root, 'materialize-geofiles.ts'), modules);
const { automaticXrayDelivery } = load(path.join(root, 'automatic-xray-delivery.ts'), modules);
const { XrayGeofileDelivery } = load(path.join(root, 'xray-geofile-delivery.ts'), modules);
const { isJsonSubscriptionFallbackSupported, isExtendedClient } = load(
    path.join(root, '../constants/extended-clients.ts'),
    modules,
);
const id = '00' + 'a'.repeat(32);

test('v2rayTun accepts base JSON without being granted custom extension or DAT capabilities', () => {
    const { xrayGeofileClient } = load(path.join(root, 'xray-geofile-delivery.ts'), modules);
    for (const agent of [
        'v2RayTun/2.0',
        'v2raytun/3.10.15/Windows',
        'V2RAYTUN/2.5.0',
        'v2raytun/android',
        'v2raytun/ios',
        'v2raytun/windows',
        'v2raytun/macos',
        'v2raytun/linux',
    ]) {
        assert.equal(isJsonSubscriptionFallbackSupported(agent), true);
        assert.equal(isExtendedClient(agent), false);
        assert.equal(xrayGeofileClient(agent), undefined);
    }
    for (const agent of [
        'Mozilla/5.0',
        'fake-v2raytun/2.0',
        'v2raytun',
        'v2raytun/broken',
        'v2raytun/ios-fake',
    ]) {
        assert.equal(isJsonSubscriptionFallbackSupported(agent), false);
    }
});

function fixture(count) {
    const domains = Array.from({ length: count }, (_, i) => ({
        type: i % 4,
        value: `site-${i}.example.test`,
    }));
    const config = {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        routing: {
            rules: [
                { type: 'field', domain: ['full:manual.test'], outboundTag: 'direct' },
                { type: 'field', network: 'tcp,udp', outboundTag: 'direct' },
            ],
        },
        remnacust: { geofiles: [{ id, categories: ['example'], target: 'REJECT' }] },
    };
    const prepare = (delivery) =>
        materializeGeofiles(
            config,
            'XRAY_JSON',
            async () => ({ id, kind: 'geosite' }),
            async () => ({ ips: [], domains }),
            undefined,
            delivery,
        );
    return { config, domains, prepare };
}

test('generic Xray preserves a dataset above the DAT switch threshold without client-specific headers', async () => {
    const f = fixture(20001);
    const before = structuredClone(f.config);
    const output = await automaticXrayDelivery({
        manualRouting: false,
        title: 'Test',
        profileKey: 'fixture',
        generate: async (delivery) => JSON.stringify([await f.prepare(delivery)]),
    });
    const [profile] = JSON.parse(output.subscription);
    assert.equal(output.header, undefined);
    assert.equal(output.inline, true);
    assert.equal(profile.routing.rules[0].domain[0], 'full:manual.test');
    assert.equal(profile.routing.rules[1].domain.length, 20001);
    assert.deepEqual(profile.routing.rules[1].domain.slice(0, 4), [
        'site-0.example.test',
        'regexp:site-1.example.test',
        'domain:site-2.example.test',
        'full:site-3.example.test',
    ]);
    assert.equal(
        profile.outbounds.find((x) => x.tag === profile.routing.rules[1].outboundTag).protocol,
        'blackhole',
    );
    assert.equal(profile.routing.rules[2].network, 'tcp,udp');
    assert.deepEqual(f.config, before);
    assert.doesNotMatch(output.subscription, /geosite:r[a-f0-9]|happ:\/\/|incy:\/\//);
});

test('Happ and INCY retain their 20,000-condition automatic DAT threshold', async () => {
    for (const client of ['happ', 'incy']) {
        const f = fixture(20001);
        await assert.rejects(
            f.prepare(new XrayGeofileDelivery(client, 'inline')),
            /geofile-inline-limit/,
        );
    }
});

test('manual routing remains untouched while generic clients receive inline geofile rules', async () => {
    const f = fixture(20001);
    const output = await automaticXrayDelivery({
        manualRouting: true,
        title: 'Test',
        profileKey: 'fixture',
        generate: async (delivery) => JSON.stringify([await f.prepare(delivery)]),
    });
    assert.equal(output.header, undefined);
    assert.equal(JSON.parse(output.subscription)[0].routing.rules[1].domain.length, 20001);
});

test('generic compatibility is bounded across files and never truncates selected rules', async () => {
    const f = fixture(50001);
    await assert.rejects(f.prepare(), /geofile-inline-limit/);
    const aggregate = fixture(25001);
    aggregate.config.remnacust.geofiles.push({ id, categories: ['example'], target: 'DIRECT' });
    await assert.rejects(aggregate.prepare(), /geofile-inline-limit/);
    const bytes = fixture(1);
    bytes.domains[0].value = 'x'.repeat(4 * 1024 * 1024 + 1);
    await assert.rejects(bytes.prepare(), /geofile-inline-limit/);
});
