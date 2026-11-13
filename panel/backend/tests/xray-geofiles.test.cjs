const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const fixture = require('./geofiles-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template');
const modules = { ...mocks, '../generators/client-pool': pool };
const revisionCache = {
    routingProfileRevision: async (_key, _fingerprint, minimum) => minimum,
    retireRoutingProfileRevision: async () => null,
};
const { XrayGeofileDelivery, XrayGeofileFallback, datCategory, xrayGeofileClient } = load(
    path.join(root, 'geofiles/xray-geofile-delivery.ts'),
    modules,
);
const { bundleDat } = load(path.join(root, 'geofiles/bundle-dat.ts'), modules);
const { materializeGeofiles } = load(path.join(root, 'geofiles/materialize-geofiles.ts'), modules);
const { compileDat } = load(path.join(root, 'geofiles/compile-dat.ts'), modules);
const { validateGeofile, geofileFields } = load(
    path.join(root, 'geofiles/validate-geofile.ts'),
    modules,
);
const { RenderTemplatesService } = load(path.join(root, 'render-templates.service.ts'), {
    ...modules,
    '@libs/contracts/constants': require('../libs/contract/build/backend/constants'),
    '@common/raw-cache': {},
    './constants/config-types': {
        SUBSCRIPTION_CONFIG_TYPES: { XRAY_JSON: { CONTENT_TYPE: 'application/json' } },
    },
    './geofiles/xray-geofile-delivery': {
        XrayGeofileDelivery,
        XrayGeofileFallback,
        xrayGeofileClient,
    },
    './generators/clash.generator.service': {},
    './generators/mihomo.generator.service': {},
    './generators/xray.generator.service': {},
    './generators/xray-json.generator.service': {},
    './generators/singbox.generator.service': {},
    './resolve-proxy/resolve-proxy-config.service': {},
});
const id = '00' + 'a'.repeat(32),
    other = '01' + 'b'.repeat(32);
const decode = (header) =>
    JSON.parse(Buffer.from(header.slice('happ://routing/onadd/'.length), 'base64').toString());

test('remote delivery resolves legacy references across profiles only to a unique registered category', async () => {
    const delivery = new XrayGeofileDelivery('happ', 'remote');
    const refs = delivery.register(
        'geosite',
        { id, categories: ['example@ads'], target: 'DIRECT' },
        async () => 'https://sub.test/site.dat',
    );
    const original = JSON.stringify([
        { routing: { rules: [{ domain: refs, outboundTag: 'direct' }] } },
        { routing: { rules: [{ domain: ['geosite:EXAMPLE@ads'], balancerTag: 'auto' }] } },
    ]);
    const resolved = delivery.resolveLegacyReferences(original);
    const profiles = JSON.parse(resolved);
    assert.deepEqual(profiles[1].routing.rules[0].domain, refs);
    assert.equal(profiles[1].routing.rules[0].balancerTag, 'auto');
    assert.match(original, /geosite:EXAMPLE@ads/);
    const header = decode(await delivery.header(resolved, 'user'));
    assert.equal(header.Geositeurl.split('?')[0], 'https://sub.test/site.dat');
    assert.deepEqual(header.DirectSites, []);
    assert.throws(
        () =>
            delivery.resolveLegacyReferences(
                JSON.stringify([{ routing: { rules: [{ domain: ['geosite:missing'] }] } }]),
            ),
        /existing-geodata/,
    );
    assert.throws(
        () =>
            delivery.resolveLegacyReferences(
                JSON.stringify([{ routing: { rules: [{ domain: ['geosite:example'] }] } }]),
            ),
        /existing-geodata/,
    );
    assert.throws(
        () => delivery.resolveLegacyReferences(JSON.stringify([{ geodata: {}, routing: {} }])),
        /existing-geodata/,
    );
    delivery.register(
        'geosite',
        { id: other, categories: ['example@ads'], target: 'DIRECT' },
        async () => 'https://sub.test/other.dat',
    );
    assert.throws(() => delivery.resolveLegacyReferences(original), /existing-geodata/);
});

test('automatic oversized delivery remaps a legacy profile before creating its DAT header', async () => {
    const { automaticXrayDelivery } = load(path.join(root, 'geofiles/automatic-xray-delivery.ts'), {
        ...modules,
        './xray-geofile-delivery': { XrayGeofileDelivery, XrayGeofileFallback },
    });
    for (const client of ['happ', 'incy']) {
        const result = await automaticXrayDelivery({
            client,
            manualRouting: false,
            title: 'Fixture',
            profileKey: 'user',
            generate: async (delivery) => {
                if (delivery.mode === 'inline') {
                    delivery.registerInline();
                    throw new pool.ClientPoolError('geofile-inline-limit');
                }
                const domain = delivery.register(
                    'geosite',
                    { id, categories: ['example'], target: 'DIRECT' },
                    async () => 'https://sub.test/site.dat',
                );
                return JSON.stringify([
                    { routing: { rules: [{ domain, outboundTag: 'direct' }] } },
                    { routing: { rules: [{ domain: ['geosite:example'], balancerTag: 'auto' }] } },
                ]);
            },
        });
        assert.equal(result.inline, false);
        assert.ok(result.header.startsWith(client + '://routing/onadd/'));
        assert.doesNotMatch(result.subscription, /geosite:example/);
        assert.equal(JSON.parse(result.subscription)[1].routing.rules[0].balancerTag, 'auto');
    }
});

test('switching automatically to inline delivery embeds rules and clears URLs on the same provider profile', async () => {
    const clock = 1793204000000;
    const previous = new XrayGeofileDelivery('incy');
    const refs = previous.register(
        'geosite',
        { id, categories: ['example'], target: 'DIRECT', downloadToClient: true },
        async () => 'https://sub.test/geosite.dat',
    );
    const remote = JSON.parse(
        Buffer.from(
            (
                await previous.header(
                    JSON.stringify([{ routing: { rules: [{ domain: refs }] } }]),
                    'user',
                    clock,
                )
            ).split('/onadd/')[1],
            'base64',
        ),
    );
    const delivery = new XrayGeofileDelivery('incy', 'inline');
    const native = await materializeGeofiles(
        {
            remnacust: {
                geofiles: [
                    { id, categories: ['example'], target: 'DIRECT', downloadToClient: false },
                ],
            },
            outbounds: [],
        },
        'XRAY_JSON',
        async () => ({ id, kind: 'geosite' }),
        async (_, categories) => compileDat(fixture.geosite, 'geosite', categories),
        undefined,
        delivery,
    );
    const body = JSON.stringify([native]);
    const header = await delivery.header(body, 'user', clock + 1000);
    const inline = JSON.parse(Buffer.from(header.split('/onadd/')[1], 'base64'));
    assert.equal(inline.Name, remote.Name);
    assert.ok(Number(inline.LastUpdated) > Number(remote.LastUpdated));
    assert.equal(inline.Geositeurl, '');
    assert.equal(inline.Geoipurl, '');
    assert.equal(delivery.intervalHours, 0);
    assert.equal(delivery.inlineOnly, true);
    assert.match(body, /example\.com/);
    assert.doesNotMatch(body, /https:\/\/.*\.dat|geosite:r[a-f0-9]/);
    assert.equal(
        await new XrayGeofileDelivery('incy').header(body, 'other-user'),
        undefined,
        'Unrelated configurations do not override client profiles',
    );
    assert.equal(
        await delivery.header(JSON.stringify([{ geodata: { custom: true } }]), 'user'),
        undefined,
        'Manual geodata stays under operator control',
    );
    const active = delivery.register(
        'geosite',
        { id, categories: ['example'], target: 'DIRECT', downloadToClient: true },
        async () => 'https://sub.test/geosite.dat',
    );
    const enabledHeader = await delivery.header(
        JSON.stringify([{ routing: { rules: [{ domain: active }] } }]),
        'user',
        clock + 2000,
    );
    const enabled = JSON.parse(Buffer.from(enabledHeader.split('/onadd/')[1], 'base64'));
    assert.equal(enabled.Name, inline.Name);
    assert.ok(
        Number(enabled.LastUpdated) > Number(inline.LastUpdated),
        'INCY accepts the re-enabled profile in the same refresh window',
    );
    assert.equal(
        enabled.Geositeurl,
        remote.Geositeurl,
        'Checksum URL stays stable across mode changes',
    );
    assert.equal(delivery.inlineOnly, false, 'Re-enabling delivery resets inline mode');
    assert.ok(delivery.intervalHours > 0);
});

test('DAT bundles namespace overlapping categories and preserve attributes, IPv6 and reverse-CIDR flags', () => {
    const second = fixture.bytes(
        1,
        Buffer.concat([
            fixture.bytes(1, 'EXAMPLE'),
            fixture.bytes(2, fixture.domain(3, 'other.test', 'ads')),
        ]),
    );
    const bundle = bundleDat([
        { id, data: fixture.geosite },
        { id: other, data: second },
    ]);
    validateGeofile(bundle, 'geosite');
    assert.throws(
        () => bundleDat([{ id, data: Buffer.concat([fixture.geosite, fixture.geosite]) }]),
        /duplicate-category/,
    );
    assert.deepEqual(compileDat(bundle, 'geosite', [datCategory(id, 'example@ads')]).domains, [
        { type: 3, value: 'ads.example.com' },
    ]);
    assert.deepEqual(compileDat(bundle, 'geosite', [datCategory(other, 'example@ads')]).domains, [
        { type: 3, value: 'other.test' },
    ]);
    const reverse = fixture.bytes(
        1,
        Buffer.concat([
            fixture.bytes(1, 'REVERSE'),
            fixture.bytes(
                2,
                Buffer.concat([fixture.bytes(1, Buffer.alloc(16)), fixture.number(2, 64)]),
            ),
            fixture.number(3, 1),
        ]),
    );
    const ips = bundleDat([{ id, data: reverse }]);
    validateGeofile(ips, 'geoip');
    assert.throws(() => compileDat(ips, 'geoip', [datCategory(id, 'reverse')]), /reverse-cidr/);
    assert.equal(
        [...geofileFields([...geofileFields(ips)][0].value)].find((field) => field.field === 3)
            .value,
        1,
    );
});

test('Happ receives native references and one stable profile; generic Xray receives usable inline rules', async () => {
    const reference = {
        id,
        categories: ['example@ads'],
        target: 'REJECT',
        downloadToClient: true,
        clientRefreshIntervalSeconds: 1800,
    };
    const source = { remnacust: { geofiles: [reference] } };
    const delivery = new XrayGeofileDelivery();
    const prepare = (context) =>
        materializeGeofiles(
            source,
            'XRAY_JSON',
            async () => ({ id, kind: 'geosite' }),
            async (_, categories) => compileDat(fixture.geosite, 'geosite', categories),
            {
                datBundleUrl: async (kind, ids) => `https://sub.test/${kind}/${ids.join('-')}`,
                read: async () => fixture.geosite,
                datUrl: () => '',
            },
            context,
        );
    const native = await prepare(delivery);
    assert.deepEqual(native.routing.rules[0].domain, ['geosite:' + datCategory(id, 'example@ads')]);
    assert.equal(native.outbounds[0].protocol, 'blackhole');
    const first = await delivery.header(JSON.stringify([native]), 'same-user', 3_600_000);
    assert.equal(first, await delivery.header(JSON.stringify([native]), 'same-user', 3_601_000));
    assert.notEqual(first, await delivery.header(JSON.stringify([native]), 'same-user', 5_400_000));
    const profile = decode(first);
    assert.equal(profile.LastUpdated, '3601');
    assert.match(profile.Geositeurl, /revision=3601$/);
    assert.equal(profile.Geoipurl, '');
    assert.deepEqual(profile.BlockSites, native.routing.rules[0].domain);
    const inline = await prepare();
    assert.deepEqual(inline.routing.rules[0].domain, ['full:ads.example.com']);
    assert.equal(source.remnacust.geofiles[0].target, 'REJECT');
    await assert.rejects(
        () =>
            delivery.header(
                JSON.stringify([{ ...native, dns: { servers: ['geosite:cn'] } }]),
                'user',
            ),
        /existing-geodata/,
    );
    await assert.rejects(
        () => delivery.header(JSON.stringify([{ ...native, geodata: { assets: [] } }]), 'user'),
        /existing-geodata/,
    );
});

test('request-local renderer delivers Happ and INCY profiles, preserves manual headers and retries atomically', async () => {
    let failure = false;
    const generator = {
        async generateConfig({ geofileDelivery }) {
            if (geofileDelivery?.mode === 'remote') {
                const [value] = geofileDelivery.register(
                    'geosite',
                    {
                        id,
                        categories: ['example'],
                        target: 'DIRECT',
                        clientRefreshIntervalSeconds: 300,
                    },
                    async () => {
                        if (failure) throw new Error('source failed');
                        return 'https://sub.test/rules.dat';
                    },
                );
                return JSON.stringify([
                    { routing: { rules: [{ domain: [value], outboundTag: 'direct' }] } },
                ]);
            }
            geofileDelivery?.registerInline();
            return JSON.stringify([
                { routing: { rules: [{ domain: ['domain:example.com'], outboundTag: 'direct' }] } },
            ]);
        },
    };
    const renderer = new RenderTemplatesService(
        { resolveProxyConfig: async () => [] },
        null,
        null,
        null,
        null,
        generator,
        revisionCache,
    );
    const context = (ua) => ({
        userAgent: ua,
        matchedResponseType: 'XRAY_JSON',
        isExtendedClient: true,
        subscriptionSettings: {
            geofilesSystemEnabled: true,
            geofilesEnabled: true,
            serveJsonAtBaseSubscription: true,
        },
    });
    const run = (ctx) =>
        renderer.generateSubscription({ srrContext: ctx, user: { id: 42 }, hosts: [] });
    const happ = context('Happ/4.0.0');
    await run(happ);
    assert.equal(happ.headersToApply, undefined);
    const incy = context('INCY/2.4.0 (Android)');
    await run(incy);
    assert.equal(incy.headersToApply, undefined);
    for (const where of ['customResponseHeaders', 'headersToApply']) {
        const manualInterval = context('INCY/2.4.0');
        if (where === 'customResponseHeaders')
            manualInterval.subscriptionSettings.customResponseHeaders = {
                'Routing-Geo-Update-Interval': '0',
            };
        else manualInterval.headersToApply = { 'Routing-Geo-Update-Interval': '12' };
        await run(manualInterval);
        assert.deepEqual(
            manualInterval.headersToApply,
            where === 'customResponseHeaders' ? undefined : { 'Routing-Geo-Update-Interval': '12' },
        );
    }
    for (const ua of [
        'v2rayNG/1.10.0',
        'v2rayN/7.0.0',
        'Mozilla/5.0 Happ/4.0.0',
        'Happ/not-a-version',
        'Mozilla/5.0 INCY/2.4.0',
        'INCY/not-a-version',
    ]) {
        const ctx = context(ua);
        const result = await run(ctx);
        assert.equal(ctx.headersToApply, undefined);
        assert.match(result.subscription, /domain:example.com/);
    }
    const explicit = context('Happ/4.0.0');
    explicit.headersToApply = { Routing: 'happ://routing/off' };
    await run(explicit);
    assert.deepEqual(explicit.headersToApply, { Routing: 'happ://routing/off' });
    const settings = context('Happ/4.0.0');
    settings.subscriptionSettings.customResponseHeaders = { ROUTING: 'happ://routing/off' };
    const manual = await run(settings);
    assert.equal(settings.headersToApply, undefined);
    assert.match(manual.subscription, /domain:example.com/);
    const incyManual = context('INCY/2.4.0');
    incyManual.headersToApply = { Routing: 'off' };
    const incyInline = await run(incyManual);
    assert.deepEqual(incyManual.headersToApply, { Routing: 'off' });
    assert.match(incyInline.subscription, /domain:example.com/);
    failure = true;
    const fallback = context('Happ/4.0.0');
    const result = await run(fallback);
    assert.match(result.subscription, /domain:example.com/);
    assert.equal(fallback.headersToApply, undefined, 'Fresh inline rules never request a bundle');
    failure = false;
    const later = context('Happ/4.0.0');
    await run(later);
    assert.equal(later.headersToApply, undefined);
});

test('INCY compaction runs after geofile collection, including manual routing and bundle fallback', async () => {
    const networks = Array.from({ length: 1000 }, (_, i) => `100.${i >> 8}.${i & 255}.0/24`);
    let failBundle = false;
    const generator = {
        async generateConfig({ geofileDelivery }) {
            geofileDelivery?.registerInline();
            const domain =
                geofileDelivery?.mode === 'remote'
                    ? geofileDelivery.register(
                          'geosite',
                          { id, categories: ['example'], target: 'DIRECT', downloadToClient: true },
                          async () => {
                              if (failBundle) throw Error('bundle');
                              return 'https://sub.test/rules.dat';
                          },
                      )
                    : ['domain:example.com'];
            return JSON.stringify([
                {
                    inbounds: [],
                    outbounds: [],
                    routing: {
                        rules: [
                            { ip: networks, outboundTag: 'direct' },
                            { domain, outboundTag: 'direct' },
                        ],
                    },
                },
            ]);
        },
    };
    const renderer = new RenderTemplatesService(
        { resolveProxyConfig: async () => [] },
        null,
        null,
        null,
        null,
        generator,
        revisionCache,
    );
    for (const mode of ['download', 'manual', 'settings', 'fallback', 'other-client']) {
        failBundle = mode === 'fallback';
        const context = {
            userAgent: mode === 'other-client' ? 'Happ/4.0.0' : 'INCY/2.6.2/iOS',
            matchedResponseType: 'XRAY_JSON',
            isExtendedClient: true,
            subscriptionSettings: {
                geofilesSystemEnabled: true,
                geofilesEnabled: true,
                serveJsonAtBaseSubscription: true,
            },
        };
        if (mode === 'manual') context.headersToApply = { Routing: 'off' };
        if (mode === 'settings')
            context.subscriptionSettings.customResponseHeaders = { routing: 'off' };
        const output = await renderer.generateSubscription({
            srrContext: context,
            user: { id: 42 },
            hosts: [],
        });
        const config = JSON.parse(output.subscription)[0];
        if (mode === 'other-client') {
            assert.deepEqual(config.routing.rules[0].ip, networks);
            continue;
        }
        assert.deepEqual(config.routing.rules[0].ip.split(','), networks, mode);
        assert.ok(Buffer.byteLength(JSON.stringify(config, null, 4)) < 500_000, mode);
        if (mode === 'download') assert.equal(context.headersToApply, undefined);
        if (mode === 'manual') assert.deepEqual(context.headersToApply, { Routing: 'off' });
        if (mode === 'fallback') {
            assert.equal(context.headersToApply, undefined);
        }
    }
});

test('oversized unmanaged StringLists are rejected instead of disguised by wire compaction', async () => {
    const networks = Array.from({ length: 26000 }, (_, i) => `100.${i >> 8}.${i & 255}.0/24`);
    const generator = {
        async generateConfig() {
            return JSON.stringify([
                {
                    inbounds: [],
                    outbounds: [],
                    routing: { rules: [{ ip: networks, outboundTag: 'direct' }] },
                },
            ]);
        },
    };
    const renderer = new RenderTemplatesService(
        { resolveProxyConfig: async () => [] },
        null,
        null,
        null,
        null,
        generator,
        revisionCache,
    );
    for (const client of ['INCY/2.6.2/iOS', 'Happ/6.2.0'])
        for (const manual of [false, true]) {
            const context = {
                userAgent: client,
                matchedResponseType: 'XRAY_JSON',
                isExtendedClient: true,
                subscriptionSettings: {
                    geofilesSystemEnabled: true,
                    geofilesEnabled: true,
                    serveJsonAtBaseSubscription: true,
                },
            };
            if (manual) context.headersToApply = { Routing: 'off' };
            await assert.rejects(
                renderer.generateSubscription({ srrContext: context, user: { id: 42 }, hosts: [] }),
                /geofile-client-config-size-limit/,
            );
            if (manual) assert.deepEqual(context.headersToApply, { Routing: 'off' });
        }
});

test('INCY rounds the longest requested interval up to supported whole hours', async () => {
    const delivery = new XrayGeofileDelivery('incy');
    const values = [1800, 7201].flatMap((interval, index) =>
        delivery.register(
            'geosite',
            {
                id: index ? other : id,
                categories: ['example'],
                target: 'DIRECT',
                clientRefreshIntervalSeconds: interval,
            },
            async () => 'https://sub.test/geosite.dat',
        ),
    );
    await delivery.header(JSON.stringify([{ routing: { rules: [{ domain: values }] } }]), 'user');
    assert.equal(delivery.intervalHours, 3);
});

test('a normal combination of GeoSite and GeoIP categories fits a default proxy header budget', async () => {
    const delivery = new XrayGeofileDelivery();
    const values = [];
    for (const [kind, source, count] of [
        ['geosite', id, 24],
        ['geoip', other, 4],
    ]) {
        values.push(
            ...delivery.register(
                kind,
                {
                    id: source,
                    categories: Array.from({ length: count }, (_, i) => 'category-' + i),
                    target: 'DIRECT',
                },
                async (kind, ids) => {
                    const payload = Buffer.from(
                        JSON.stringify({ kind, ids, namespace: 2 }),
                    ).toString('base64url');
                    return `https://sub.example.test/geofiles/${source}/bundle-${'a'.repeat(64)}.dat?selection=${payload}`;
                },
            ),
        );
    }
    const header = await delivery.header(
        JSON.stringify([
            {
                routing: {
                    rules: [
                        {
                            domain: values.filter((v) => v.startsWith('geosite:')),
                            ip: values.filter((v) => v.startsWith('geoip:')),
                        },
                    ],
                },
            },
        ]),
        'user',
    );
    assert.ok(Buffer.byteLength(header) <= 3000);
    const profile = decode(header);
    assert.equal(profile.DirectSites.length, 24);
    assert.equal(profile.DirectIp.length, 4);
});

test('unused resources do not emit a profile and large tag mirrors keep full JSON rules out of HTTP headers', async () => {
    const empty = new XrayGeofileDelivery();
    assert.equal(
        await empty.header(
            JSON.stringify([
                { geodata: { assets: [] }, routing: { rules: [{ domain: ['geosite:cn'] }] } },
            ]),
            'user',
        ),
        undefined,
    );
    const delivery = new XrayGeofileDelivery();
    const values = [];
    for (const source of [id, other])
        values.push(
            ...delivery.register(
                'geosite',
                {
                    id: source,
                    categories: Array.from({ length: 32 }, (_, i) => 'category-' + i),
                    target: 'DIRECT',
                    clientRefreshIntervalSeconds: 1800,
                },
                async () => 'https://sub.test/file.dat',
            ),
        );
    assert.equal(
        await delivery.header(
            JSON.stringify([{ routing: { rules: [{ domain: ['domain:manual.test'] }] } }]),
            'user',
        ),
        undefined,
    );
    const body = JSON.stringify([{ routing: { rules: [{ domain: values }] } }]);
    const header = await delivery.header(body, 'user');
    assert(Buffer.byteLength(header) <= 3000);
    assert.equal(decode(header).Geositeurl.split('?')[0], 'https://sub.test/file.dat');
    assert.deepEqual(decode(header).DirectSites, []);
    assert.deepEqual(JSON.parse(body)[0].routing.rules[0].domain, values);
});

test('removing the last custom geofile clears only a previously issued provider profile and preserves manual routing rules', async () => {
    const { stabilizeRoutingProfile } = load(
        path.join(root, 'geofiles/stabilize-routing-profile.ts'),
    );
    for (const client of ['happ', 'incy']) {
        const states = new Map();
        const revision = async (key, fingerprint, minimum) => {
            const old = states.get(key);
            if (old?.fingerprint === fingerprint) return old.revision;
            const value = Math.max(minimum, (old?.revision ?? 0) + 1);
            states.set(key, { fingerprint, revision: value });
            return value;
        };
        const cache = {
            routingProfileRevision: revision,
            retireRoutingProfileRevision: async (...args) =>
                states.has(args[0]) ? revision(...args) : null,
        };
        const previous = new XrayGeofileDelivery(client, 'remote', 'Provider');
        const domains = previous.register(
            'geosite',
            { id, categories: ['example'], target: 'DIRECT' },
            async () => 'https://sub.example.test/old.dat',
        );
        const original = await stabilizeRoutingProfile(
            await previous.header(
                JSON.stringify([{ routing: { rules: [{ domain: domains }] } }]),
                'provider-key',
            ),
            24,
            revision,
            'device-key',
        );
        const manual = JSON.stringify([
            {
                routing: {
                    rules: [
                        { type: 'field', domain: ['geosite:category-ru'], outboundTag: 'direct' },
                    ],
                },
                outbounds: [{ tag: 'direct', protocol: 'freedom' }],
            },
        ]);
        let body = manual;
        const renderer = new RenderTemplatesService(
            { resolveProxyConfig: async () => [] },
            null,
            null,
            null,
            null,
            { generateConfig: async () => body },
            cache,
        );
        const context = () => ({
            userAgent: client === 'happ' ? 'Happ/6.3.0' : 'INCY/3.9.7',
            matchedResponseType: 'XRAY_JSON',
            isExtendedClient: true,
            subscriptionSettings: {
                geofilesSystemEnabled: true,
                geofilesEnabled: true,
                serveJsonAtBaseSubscription: true,
            },
        });
        const run = (ctx, credential = 'device-key') =>
            renderer.generateSubscription({
                srrContext: ctx,
                user: { id: 42, vlessUuid: credential },
                hosts: [],
                profileTitle: 'Provider',
                profileKey: 'provider-key',
            });
        const ctx = context();
        const output = await run(ctx);
        const cleared = decode(ctx.headersToApply.routing);
        assert.equal(cleared.Name, decode(original).Name);
        assert(Number(cleared.LastUpdated) > Number(decode(original).LastUpdated));
        assert.equal(
            cleared.Geositeurl,
            'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat',
        );
        assert.equal(
            cleared.Geoipurl,
            'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat',
        );
        for (const key of [
            'DirectSites',
            'DirectIp',
            'ProxySites',
            'ProxyIp',
            'BlockSites',
            'BlockIp',
        ])
            assert.deepEqual(cleared[key], []);
        assert.deepEqual(JSON.parse(output.subscription), JSON.parse(manual));
        assert.equal(ctx.headersToApply.routing.includes('/routing/off'), false);
        if (client === 'incy') assert.equal(ctx.headersToApply['routing-geo-update-interval'], '0');
        const again = context();
        await run(again);
        assert.equal(again.headersToApply.routing, ctx.headersToApply.routing);
        const fresh = context();
        await run(fresh, 'unrelated-device');
        assert.equal(fresh.headersToApply, undefined);
        assert.equal(states.size, 1, 'no cleanup profile is created for unrelated devices');
        const explicit = context();
        explicit.headersToApply = { Routing: client + '://routing/off' };
        await run(explicit);
        assert.deepEqual(explicit.headersToApply, { Routing: client + '://routing/off' });
        body = JSON.stringify([{ geodata: { assets: [] }, routing: { rules: [] } }]);
        const manualGeo = context();
        await run(manualGeo);
        assert.equal(manualGeo.headersToApply, undefined);
    }
});
