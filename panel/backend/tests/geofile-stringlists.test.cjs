const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const { XrayGeofileDelivery } = load(
    path.join(__dirname, '../src/modules/subscription-template/geofiles/xray-geofile-delivery.ts'),
    { ...mocks, '../generators/client-pool': pool },
);
const id = 'a'.repeat(34);
const make = () => {
    const calls = [];
    const delivery = new XrayGeofileDelivery('incy', 'remote');
    const [reference] = delivery.register(
        'geosite',
        { id, categories: ['example'], target: 'DIRECT' },
        async (...args) => {
            calls.push(args);
            return 'https://sub.example.test/selected.dat';
        },
    );
    return { delivery, reference, calls };
};

test('mixed routing and DNS StringLists resolve legacy categories before DAT delivery', async () => {
    for (const field of ['domain', 'domains']) {
        const { delivery, reference, calls } = make();
        const raw = JSON.stringify([
            {
                routing: {
                    rules: [{ [field]: 'full:manual.test,geosite:EXAMPLE', outboundTag: 'direct' }],
                },
                dns: {
                    servers: [
                        { address: '1.1.1.1', domains: 'domain:manual.test,geosite:example' },
                    ],
                },
            },
        ]);
        const resolved = delivery.resolveLegacyReferences(raw);
        const [config] = JSON.parse(resolved);
        assert.equal(config.routing.rules[0][field], 'full:manual.test,' + reference);
        assert.equal(config.dns.servers[0].domains, 'domain:manual.test,' + reference);
        assert.match(raw, /geosite:EXAMPLE/);
        const header = await delivery.header(resolved, 'fixture');
        assert.match(header, /^incy:\/\/routing\/onadd\//);
        assert.deepEqual(calls, [['geosite', [id], { [id]: ['example'] }]]);
    }
});

test('header collects namespaced references inside mixed StringLists and rejects unknown categories', async () => {
    const { delivery, reference, calls } = make();
    await delivery.header(
        JSON.stringify([
            {
                routing: {
                    rules: [{ domain: 'full:manual.test,' + reference, outboundTag: 'direct' }],
                },
            },
        ]),
        'fixture',
    );
    assert.equal(calls.length, 1);
    for (const domain of ['full:manual.test,geosite:missing', reference + ',geosite:missing']) {
        await assert.rejects(
            delivery.header(
                JSON.stringify([
                    {
                        routing: {
                            rules: [
                                { domain, outboundTag: 'direct' },
                                { domain: [reference], outboundTag: 'direct' },
                            ],
                        },
                    },
                ]),
                'fixture',
            ),
            /existing-geodata/,
        );
        assert.throws(
            () =>
                delivery.resolveLegacyReferences(
                    JSON.stringify([
                        {
                            routing: { rules: [{ domain, outboundTag: 'direct' }] },
                        },
                    ]),
                ),
            /existing-geodata/,
        );
    }
});

test('IP StringLists use the same alias and header checks in routing and DNS', async () => {
    for (const field of [
        'ip',
        'source',
        'sourceIP',
        'localIP',
        'expectedIPs',
        'expectIPs',
        'unexpectedIPs',
    ]) {
        const delivery = new XrayGeofileDelivery('happ', 'remote');
        const [reference] = delivery.register(
            'geoip',
            { id, categories: ['ru'], target: 'DIRECT' },
            async () => 'https://sub.example.test/ip.dat',
        );
        const source = JSON.stringify([{ [field]: '203.0.113.0/24,geoip:RU' }]);
        const resolved = delivery.resolveLegacyReferences(source);
        assert.equal(JSON.parse(resolved)[0][field], '203.0.113.0/24,' + reference);
        assert.match(await delivery.header(resolved, 'fixture'), /^happ:\/\/routing\/onadd\//);
    }
});

test('array elements and non-list strings keep literal commas and regex contents unchanged', async () => {
    const { delivery, reference } = make();
    const raw = JSON.stringify([
        {
            remarks: 'manual,geosite:missing',
            routing: {
                rules: [
                    {
                        domain: [
                            'regexp:foo,geosite:missing',
                            'full:literal,geosite:missing',
                            reference,
                        ],
                        outboundTag: 'direct',
                    },
                ],
            },
        },
    ]);
    assert.equal(delivery.resolveLegacyReferences(raw), raw);
    assert.match(await delivery.header(raw, 'fixture'), /^incy:\/\/routing\/onadd\//);
});

test('unknown categories in another profile fail the complete response instead of missing DAT sections', () => {
    const { delivery, reference } = make();
    assert.throws(
        () =>
            delivery.resolveLegacyReferences(
                JSON.stringify([
                    { routing: { rules: [{ domain: [reference], outboundTag: 'direct' }] } },
                    { dns: { servers: [{ domains: 'domain:manual.test,geosite:missing' }] } },
                ]),
            ),
        /existing-geodata/,
    );
});

test('StringList complexity is bounded before expansion and is independent for each profile', async () => {
    const { delivery, reference } = make();
    const huge = JSON.stringify([{ domain: ','.repeat(200001) + reference }]);
    assert.throws(() => delivery.resolveLegacyReferences(huge), /geofile-xray-size/);
    await assert.rejects(delivery.header(huge, 'fixture'), /geofile-xray-size/);
    const manageable = Array(110000).fill('').join(',') + ',' + reference;
    const raw = JSON.stringify([{ domain: manageable }, { domain: manageable }]);
    assert.equal(delivery.resolveLegacyReferences(raw), raw);
    assert.match(await delivery.header(raw, 'fixture'), /^incy:\/\/routing\/onadd\//);
});
