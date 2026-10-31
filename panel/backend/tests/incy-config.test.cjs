const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { pool } = require('./client-pool-fixture.cjs');
const { compactIncySubscription, xrayProfileFormattedBytes, xrayProfilesFit, INCY_FORMATTED_CONFIG_BUDGET } = load(
    path.join(__dirname, '../src/modules/subscription-template/geofiles/incy-config.ts'),
    { '../generators/client-pool': pool },
);
const networks = Array.from({ length: 26000 }, (_, i) => `100.${i >> 8}.${i & 255}.0/24`);

test('wire compaction preserves entries but cannot hide an oversized expanded profile', () => {
    const original = {
        inbounds: [],
        outbounds: [{ tag: 'proxy', protocol: 'freedom' }],
        routing: { rules: [{ type: 'field', ip: networks, outboundTag: 'proxy' }] },
        remarks: 'Тест فارسی 中文',
        meta: { preserved: true },
    };
    assert.ok(Buffer.byteLength(JSON.stringify(original, null, 4)) > 900_000);
    assert.throws(() => compactIncySubscription(JSON.stringify([original])), /incy-configuration-size-limit/);
    const compacted = compactIncySubscription(JSON.stringify([original]), false);
    assert.equal(xrayProfilesFit(compacted), false);
    const result = JSON.parse(compacted)[0];
    assert.ok(Buffer.byteLength(JSON.stringify(result, null, 4)) < 500_000);
    assert.deepEqual(result.routing.rules[0].ip.split(','), networks);
    result.routing.rules[0].ip = result.routing.rules[0].ip.split(',');
    assert.deepEqual(result, original);
});

test('StringList compaction preserves rule order, conditions, regex commas and small/empty lists', () => {
    const domains = Array.from({ length: 100 }, (_, i) => `domain:host${i}.example`);
    const source = [
        {
            routing: {
                rules: [
                    { domain: domains, ip: ['geoip:private'], outboundTag: 'direct' },
                    { domain: [...domains, 'regexp:^a{1,3}\\.example$'], balancerTag: 'pool' },
                    { ip: [], sourceIP: networks.slice(0, 100), outboundTag: 'block' },
                ],
            },
            custom: { ip: networks, domain: domains },
        },
    ];
    const output = JSON.parse(compactIncySubscription(JSON.stringify(source)));
    assert.equal(output[0].routing.rules[0].domain, domains.join(','));
    assert.deepEqual(output[0].routing.rules[0].ip, ['geoip:private']);
    assert.deepEqual(output[0].routing.rules[1], source[0].routing.rules[1]);
    assert.deepEqual(output[0].routing.rules[2].ip, []);
    assert.deepEqual(output[0].routing.rules[2].sourceIP.split(','), networks.slice(0, 100));
    assert.deepEqual(output[0].custom, source[0].custom);
    assert.equal(compactIncySubscription(JSON.stringify(output)), JSON.stringify(output));
});

test('oversized uncompactable configs fail explicitly without dropping rules or switching on downloads', () => {
    const source = JSON.stringify([{ custom: 'Ж'.repeat(INCY_FORMATTED_CONFIG_BUDGET) }]);
    assert.throws(() => compactIncySubscription(source), /incy-configuration-size-limit/);
    assert.throws(() => compactIncySubscription('{}'), /incy-configuration-format/);
    assert.throws(() => compactIncySubscription('[null]'), /incy-configuration-format/);
    assert.equal(compactIncySubscription(''), '');
    assert.equal(compactIncySubscription('[{}]'), '[{}]');
});

test('semantic size matches real StringList expansion without allocating expanded arrays', () => {
    for (const values of [['domain:a.test'], ['domain:пример.рф','regexp:^a{1,3}\\.test$','full:two.test'], Array(1000).fill('10.0.0.0/8')]) {
        const compact = {routing:{rules:[{domain:values.join(','),ip:'geoip:private'}]}};
        const expanded = structuredClone(compact);
        for (const rule of expanded.routing.rules) for (const key of ['domain','ip']) rule[key] = rule[key].split(',');
        assert.equal(xrayProfileFormattedBytes(compact), Buffer.byteLength(JSON.stringify(expanded, null, 4)));
    }
});
