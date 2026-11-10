const test = require('node:test'),
    assert = require('node:assert/strict'),
    path = require('node:path');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const fixture = require('./geofiles-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = { ...mocks, '../generators/client-pool': pool };
const { automaticXrayDelivery } = load(path.join(root, 'automatic-xray-delivery.ts'), modules);
const { materializeGeofiles } = load(path.join(root, 'materialize-geofiles.ts'), modules);
const { compileDat } = load(path.join(root, 'compile-dat.ts'), modules);
const { XrayGeofileDelivery } = load(path.join(root, 'xray-geofile-delivery.ts'), modules);
const { xrayProfilesFit, xrayRuleEntries, GEOFILE_INLINE_RULE_LIMIT } = load(
    path.join(root, 'incy-config.ts'),
    modules,
);
const source = (n) => String(n).padStart(2, '0') + 'a'.repeat(32);
const decode = (h) => JSON.parse(Buffer.from(h.split('/onadd/')[1], 'base64'));

function setup({
    rules = fixture.geosite,
    refs = 1,
    profiles = 1,
    extra = '',
    bundleFails = false,
    sha256,
} = {}) {
    const calls = [];
    const config = {
        inbounds: [],
        outbounds: [],
        routing: { rules: [] },
        extra,
        remnacust: {
            geofiles: Array.from({ length: refs }, (_, i) => ({
                id: source(i),
                categories: ['example'],
                target: i % 2 ? 'REJECT' : 'DIRECT',
                downloadToClient: i % 2 === 0,
            })),
        },
    };
    const generate = async (delivery) => {
        calls.push(delivery?.mode ?? 'none');
        const resolved = await materializeGeofiles(
            config,
            'XRAY_JSON',
            async (id) => ({ id, kind: 'geosite', sha256 }),
            async (_, cats) => compileDat(rules, 'geosite', cats),
            {
                read: async () => rules,
                validateDat: async (_, cats) => {
                    compileDat(rules, 'geosite', cats, true);
                },
                datUrl: () => '',
                datBundleUrl: async () => {
                    if (bundleFails) throw Error('unavailable');
                    return 'https://subscription.test/combined.dat';
                },
            },
            delivery,
        );
        return JSON.stringify(Array.from({ length: profiles }, () => resolved));
    };
    return { calls, generate, config };
}
const render = (fixture, more = {}) =>
    automaticXrayDelivery({
        client: 'incy',
        manualRouting: false,
        title: 'base64:' + Buffer.from('Первый VPN').toString('base64'),
        profileKey: 'provider/user',
        generate: fixture.generate,
        ...more,
    });

test('small geofiles become inline rules regardless of legacy per-file switches', async () => {
    for (const client of ['happ', 'incy']) {
        const f = setup({ refs: 2 });
        const r = await render(f, { client });
        const p = decode(r.header);
        assert.deepEqual(f.calls, ['inline']);
        assert.equal(r.inline, true);
        assert.equal(r.intervalHours, 0);
        assert.equal(p.Geoipurl, '');
        assert.equal(p.Geositeurl, '');
        assert.match(p.Name, /^Первый VPN · [a-f0-9]{8}$/);
        assert(!p.Name.includes('Remnacust'));
        const rules = JSON.parse(r.subscription)[0].routing.rules;
        assert.equal(rules.length, 2);
        assert.equal(rules[0].outboundTag, 'geo-freedom');
        assert.equal(rules[1].outboundTag, 'geo-blackhole');
    }
});
test('host profiles are measured separately, never as the sum of the subscription', async () => {
    const f = setup({ profiles: 60, extra: 'x'.repeat(20000) });
    const r = await render(f);
    assert(Buffer.byteLength(r.subscription) > 900000);
    assert.equal(r.inline, true);
    assert.deepEqual(f.calls, ['inline']);
    assert(xrayProfilesFit(r.subscription));
});
test('per-profile boundaries count UTF-8 bytes and include formatted JSON overhead', () => {
    const profile = { remarks: 'Подписка 中文', outbounds: [], routing: { rules: [] } };
    const bytes = Buffer.byteLength(JSON.stringify(profile, null, 4));
    const body = JSON.stringify([profile, profile]);
    assert(xrayProfilesFit(body, bytes));
    assert.equal(xrayProfilesFit(body, bytes - 1), false);
});

test('20,000 rule conditions are counted per profile, including comma lists and combined IP/domain rules', () => {
    const config = {
        routing: { rules: [{ domain: Array(10000).fill('x') }, { ip: Array(10000).fill('1') }] },
    };
    assert.equal(GEOFILE_INLINE_RULE_LIMIT, 20000);
    assert.equal(xrayRuleEntries(config), 20000);
    assert(xrayProfilesFit(JSON.stringify([config, config]), Infinity, 20000));
    config.routing.rules.push({ domain: 'one,two' });
    assert.equal(xrayRuleEntries(config, Infinity), 20002);
    assert.equal(xrayProfilesFit(JSON.stringify([config]), Infinity, 20000), false);
    assert.equal(xrayRuleEntries({ routing: { rules: [{ domain: 'a,b,c' }] } }, 2), 3);
});

test('many valid host profiles do not share a routing-header complexity budget', async () => {
    const records = Array.from({ length: 2100 }, (_, i) =>
        fixture.bytes(2, fixture.domain(1, `x${i},x`)),
    );
    const rules = fixture.bytes(1, Buffer.concat([fixture.bytes(1, 'EXAMPLE'), ...records]));
    for (const client of ['incy', 'happ']) {
        const f = setup({ rules, profiles: 100 });
        const result = await render(f, { client });
        assert.equal(result.inline, true);
        assert.deepEqual(f.calls, ['inline']);
        assert(Buffer.byteLength(result.subscription) < 16 * 1024 * 1024);
        assert(xrayProfilesFit(result.subscription, 900000));
        assert.equal(JSON.parse(result.subscription)[99].routing.rules[0].domain.length, 2100);
    }
});

test('an inline header complexity failure retries DAT without leaking the abandoned header', async () => {
    const calls = [];
    const f = {
        generate: async (delivery) => {
            calls.push(delivery.mode);
            if (delivery.mode === 'inline') {
                delivery.registerInline();
                return JSON.stringify([{ routing: { rules: [] }, extra: Array(210000).fill(0) }]);
            }
            const refs = delivery.register(
                'geosite',
                { id: source(0), categories: ['example'], target: 'DIRECT' },
                async () => 'https://subscription.test/combined.dat',
            );
            return JSON.stringify([
                { routing: { rules: [{ type: 'field', domain: refs, outboundTag: 'direct' }] } },
            ]);
        },
    };
    const result = await render(f, { client: 'happ' });
    assert.equal(result.inline, false);
    assert.deepEqual(calls, ['inline', 'remote']);
    assert.equal(
        decode(result.header).Geositeurl.startsWith('https://subscription.test/combined.dat'),
        true,
    );
});
test('the independent transport cap is not misclassified as a per-host geofile limit', async () => {
    const f = setup({ profiles: 110, extra: 'x'.repeat(160000) });
    await assert.rejects(render(f), /subscription-size-limit/);
    assert.deepEqual(f.calls, ['inline']);
});
test('two individually small files can exceed the complete profile budget and trigger one DAT bundle', async () => {
    const records = Array.from({ length: 10000 }, (_, i) =>
        fixture.bytes(2, fixture.domain(2, `host-${i}.example.test`)),
    );
    const rules = fixture.bytes(1, Buffer.concat([fixture.bytes(1, 'EXAMPLE'), ...records]));
    const small = setup({ rules });
    assert.equal((await render(small)).inline, true);
    const f = setup({ rules, refs: 2, profiles: 3 });
    const r = await render(f);
    const p = decode(r.header);
    assert.deepEqual(f.calls, ['inline', 'remote']);
    assert.equal(r.inline, false);
    assert.equal(p.Geositeurl, 'https://subscription.test/combined.dat');
    assert(xrayProfilesFit(r.subscription));
    const routes = JSON.parse(r.subscription)[0].routing.rules;
    assert(routes[0].domain[0].startsWith('geosite:'));
    assert.equal(routes.length, 2);
    assert.notEqual(routes[0].domain[0], routes[1].domain[0]);
    assert.equal(routes[1].outboundTag, 'geo-blackhole');
});
test('large single files can be validated for native download without allocating all inline matchers', async () => {
    const data = fixture.bytes(
        1,
        Buffer.concat([
            fixture.bytes(1, 'EXAMPLE'),
            ...Array.from({ length: 50001 }, (_, i) =>
                fixture.bytes(2, fixture.domain(2, `domain-${i}.test`)),
            ),
        ]),
    );
    assert.throws(() => compileDat(data, 'geosite', ['example']), /inline-limit/);
    assert.deepEqual(compileDat(data, 'geosite', ['example'], true), { ips: [], domains: [] });
    assert.throws(() => compileDat(data, 'geosite', ['missing'], true), /empty/);
    const f = setup({ rules: data });
    const r = await render(f);
    assert.equal(r.inline, false);
    assert.deepEqual(f.calls, ['inline', 'remote']);
});
test('StringList wire compaction cannot keep an iOS-sized profile in inline delivery', async () => {
    for (const client of ['incy', 'happ']) {
        const calls = [];
        const networks = Array.from({ length: 26000 }, (_, i) => `100.${i >> 8}.${i & 255}.0/24`);
        const r = await automaticXrayDelivery({
            client,
            manualRouting: false,
            title: 'Test',
            profileKey: 'id',
            generate: async (d) => {
                calls.push(d.mode);
                if (d.mode === 'inline') {
                    d.registerInline();
                    return JSON.stringify([
                        {
                            inbounds: [],
                            outbounds: [],
                            routing: { rules: [{ ip: networks, outboundTag: 'direct' }] },
                        },
                    ]);
                }
                const refs = d.register(
                    'geoip',
                    { id: source(0), categories: ['example'], target: 'DIRECT' },
                    async () => 'https://subscription.test/combined.dat',
                );
                return JSON.stringify([
                    {
                        inbounds: [],
                        outbounds: [],
                        routing: { rules: [{ ip: refs, outboundTag: 'direct' }] },
                    },
                ]);
            },
        });
        assert.deepEqual(calls, ['inline', 'remote']);
        assert.equal(r.inline, false);
        assert.equal(
            decode(r.header).Geoipurl.startsWith('https://subscription.test/combined.dat'),
            true,
        );
        assert(JSON.parse(r.subscription)[0].routing.rules[0].ip[0].startsWith('geoip:'));
    }
});

test('bundle failure, unrelated oversized data and manual routing conflicts fail without returning broken configurations', async () => {
    const records = Array.from({ length: 40000 }, (_, i) =>
        fixture.bytes(2, fixture.domain(2, `host-${i}.example.test`)),
    );
    const rules = fixture.bytes(1, Buffer.concat([fixture.bytes(1, 'EXAMPLE'), ...records]));
    await assert.rejects(
        render(setup({ rules, bundleFails: true })),
        /geofile-auto-delivery-unavailable/,
    );
    await assert.rejects(render(setup({ extra: 'x'.repeat(950000) })), /size-limit/);
    await assert.rejects(
        render(setup({ rules }), { manualRouting: true }),
        /size-limit|inline-limit/,
    );
    const f = setup();
    await assert.rejects(
        render({
            ...f,
            generate: async () => {
                throw Error('geofile-category-empty');
            },
        }),
        /category-empty/,
    );
});
test('profile identity is stable across automatic delivery transitions, sanitized and provider-scoped', async () => {
    const inline = new XrayGeofileDelivery('incy', 'inline', 'Project\r\nInjected: value');
    inline.registerInline();
    const a = decode(await inline.header('[{}]', 'provider/a', 1793204000000));
    const remote = new XrayGeofileDelivery('incy', 'remote', 'Project\r\nInjected: value');
    const values = remote.register(
        'geosite',
        { id: source(0), target: 'DIRECT', categories: ['example'] },
        async () => 'https://sub.test/rules.dat',
    );
    const b = decode(
        await remote.header(
            JSON.stringify([{ routing: { rules: [{ domain: values }] } }]),
            'provider/a',
            1793204001000,
        ),
    );
    assert.equal(a.Name, b.Name);
    assert(!/[\r\n]/.test(a.Name));
    assert(Number(b.LastUpdated) > Number(a.LastUpdated));
    assert.notEqual(
        b.Name,
        decode(
            await remote.header(
                JSON.stringify([{ routing: { rules: [{ domain: values }] } }]),
                'provider/b',
            ),
        ).Name,
    );
});

test('automatic DAT fallback forwards active file hashes while keeping stable download URLs', async () => {
    const records = Array.from({ length: 10000 }, (_, i) =>
        fixture.bytes(2, fixture.domain(2, `host-${i}.example.test`)),
    );
    const rules = fixture.bytes(1, Buffer.concat([fixture.bytes(1, 'EXAMPLE'), ...records]));
    for (const client of ['happ', 'incy']) {
        const first = await render(setup({ rules, refs: 2, sha256: 'a'.repeat(64) }), { client });
        const changed = await render(setup({ rules, refs: 2, sha256: 'b'.repeat(64) }), { client });
        const same = await render(setup({ rules, refs: 2, sha256: 'b'.repeat(64) }), { client });
        assert.equal(first.inline, false);
        assert.equal(changed.inline, false);
        assert.match(first.sourceRevision, /^[a-f0-9]{64}$/);
        assert.notEqual(changed.sourceRevision, first.sourceRevision);
        assert.equal(same.sourceRevision, changed.sourceRevision);
        assert.equal(decode(first.header).Geositeurl, decode(changed.header).Geositeurl);
    }
});

test('configured inline threshold is inclusive and changes both directions without cached routing state', async () => {
    for (const client of ['happ', 'incy']) {
        const records = Array.from({ length: 8 }, (_, i) =>
            fixture.bytes(2, fixture.domain(2, `x${i}.test`)),
        );
        const rules = fixture.bytes(1, Buffer.concat([fixture.bytes(1, 'EXAMPLE'), ...records]));
        const f = setup({ rules });
        for (const [limit, inline] of [
            [8, true],
            [7, false],
            [9, true],
            [1, false],
        ]) {
            const result = await render(f, { client, inlineRuleLimit: limit });
            assert.equal(result.inline, inline);
            const config = JSON.parse(result.subscription)[0];
            if (inline) assert.equal(config.routing.rules[0].domain.length, 8);
            else assert(config.routing.rules[0].domain[0].startsWith('geosite:'));
        }
        assert.deepEqual(f.calls, ['inline', 'inline', 'remote', 'inline', 'inline', 'remote']);
    }
});

test('invalid configured thresholds fail before template or file processing', async () => {
    for (const value of [0, -1, 250001, 1.1, NaN, Infinity, null, '20', true]) {
        let calls = 0;
        await assert.rejects(
            automaticXrayDelivery({
                inlineRuleLimit: value,
                manualRouting: false,
                title: 'Test',
                profileKey: 'test',
                generate: async () => {
                    calls++;
                    return '[]';
                },
            }),
            /geofile-inline-rule-limit/,
        );
        assert.equal(calls, 0);
    }
});

test('configured count never removes byte caps or forces unsupported Xray clients to use DAT', async () => {
    const rules = fixture.bytes(
        1,
        Buffer.concat([
            fixture.bytes(1, 'EXAMPLE'),
            ...Array.from({ length: 1000 }, (_, i) =>
                fixture.bytes(2, fixture.domain(2, `domain-${i}.example.test`)),
            ),
        ]),
    );
    const f = setup({ rules, refs: 2, extra: 'x'.repeat(850000) });
    assert.equal((await render(f, { inlineRuleLimit: 250000 })).inline, false);
    const generic = await render(setup({ rules }), { client: undefined, inlineRuleLimit: 1 });
    assert.equal(generic.header, undefined);
    assert.equal(JSON.parse(generic.subscription)[0].routing.rules[0].domain.length, 1000);
});

test('non-Xray templates use the same threshold and keep raw assignments unchanged', async () => {
    const f = setup();
    const input = structuredClone(f.config);
    const file = async (id) => ({ id, kind: 'geosite' });
    const rules = async () => ({
        domains: [
            { type: 2, value: 'a.test' },
            { type: 2, value: 'b.test' },
        ],
        ips: [],
    });
    const resources = {
        read: async () => Buffer.alloc(0),
        datUrl: () => 'https://subscription.test/rules.json',
    };
    const inline = await materializeGeofiles(
        input,
        'SINGBOX',
        file,
        rules,
        resources,
        undefined,
        undefined,
        2,
    );
    assert.equal(inline.route.rules[0].domain_suffix.length, 2);
    const remote = await materializeGeofiles(
        input,
        'SINGBOX',
        file,
        rules,
        resources,
        undefined,
        undefined,
        1,
    );
    assert.equal(remote.route.rule_set[0].url, 'https://subscription.test/rules.json');
    assert.deepEqual(input, f.config);
});

test('API threshold contract accepts exact integer bounds and rejects coercion or unsafe values', () => {
    const {
        UpdateSubscriptionSettingsCommand,
    } = require('../libs/contract/build/backend/commands/subscription-settings/update-subscription-settings.command');
    const {
        SubscriptionSettingsSchema,
    } = require('../libs/contract/build/backend/models/subscription-settings.schema');
    const uuid = '00000000-0000-4000-8000-000000000001';
    for (const value of [1, 20000, 50000, 50001, 250000])
        assert.equal(
            UpdateSubscriptionSettingsCommand.RequestBodySchema.parse({
                uuid,
                geofilesInlineRuleLimit: value,
            }).geofilesInlineRuleLimit,
            value,
        );
    for (const value of [0, -1, 250001, 1.5, null, '20000', true, NaN, Infinity])
        assert.equal(
            UpdateSubscriptionSettingsCommand.RequestBodySchema.safeParse({
                uuid,
                geofilesInlineRuleLimit: value,
            }).success,
            false,
        );
    assert.equal(
        Object.hasOwn(
            UpdateSubscriptionSettingsCommand.RequestBodySchema.parse({ uuid }),
            'geofilesInlineRuleLimit',
        ),
        false,
    );
    assert.equal(SubscriptionSettingsSchema.shape.geofilesInlineRuleLimit.parse(undefined), 20000);
});
