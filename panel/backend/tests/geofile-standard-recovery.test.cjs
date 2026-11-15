const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template');
const modules = { ...mocks, '../generators/client-pool': pool };
const { XrayGeofileDelivery } = load(path.join(root, 'geofiles/xray-geofile-delivery.ts'), modules);
const { RenderTemplatesService } = load(path.join(root, 'render-templates.service.ts'), {
    ...modules,
    '@common/raw-cache': {},
    '@libs/contracts/constants': require('../libs/contract/build/backend/constants'),
    './geofiles/geofiles.service': {},
    './constants/config-types': {
        SUBSCRIPTION_CONFIG_TYPES: {
            XRAY_JSON: { CONTENT_TYPE: 'application/json' },
            XRAY_BASE64: { CONTENT_TYPE: 'text/plain', isBase64: true },
        },
    },
    './generators/clash.generator.service': {},
    './generators/mihomo.generator.service': {},
    './generators/xray.generator.service': {},
    './generators/singbox.generator.service': {},
    './generators/xray-json.generator.service': {},
    './resolve-proxy/resolve-proxy-config.service': {},
});
const decode = (value) => JSON.parse(Buffer.from(value.split('/onadd/')[1], 'base64'));

function fixture(client) {
    const states = new Map(),
        checks = [];
    let sha = 'a'.repeat(64),
        reads = 0;
    const standards = () => ({
        geoip: {
            url: `https://sub.example.test/geofiles/geoip/latest.dat?revision=${sha}`,
            sha256: sha,
        },
        geosite: {
            url: `https://sub.example.test/geofiles/geosite/latest.dat?revision=${sha}`,
            sha256: sha,
        },
        intervalSeconds: 172800,
        validate: async (kind, categories) => {
            checks.push([kind, categories]);
            if (categories.some((category) => !['category-ru', 'private'].includes(category)))
                throw Error('missing standard category');
        },
    });
    let body = JSON.stringify([
        {
            outbounds: [{ tag: 'direct', protocol: 'freedom' }],
            routing: { rules: [{ domain: ['geosite:category-ru'], outboundTag: 'direct' }] },
        },
    ]);
    const cache = {
        routingProfileRevision: async (key, fingerprint, minimum) => {
            const old = states.get(key);
            const value =
                old?.fingerprint === fingerprint
                    ? old.value
                    : Math.max(minimum, (old?.value ?? 0) + 1);
            states.set(key, { fingerprint, value });
            return value;
        },
        retireRoutingProfileRevision: async () => null,
    };
    const renderer = new RenderTemplatesService(
        { resolveProxyConfig: async () => [] },
        null,
        null,
        { generateConfig: async () => 'encoded-subscription' },
        null,
        { generateConfig: async () => body },
        cache,
        {
            standardSources: async () => {
                reads++;
                return standards();
            },
        },
    );
    return {
        states,
        checks,
        standards,
        get reads() {
            return reads;
        },
        set sha(value) {
            sha = value;
        },
        set body(value) {
            body = value;
        },
        async run(options = {}) {
            const context = {
                userAgent: `${client}/6.3.0`,
                matchedResponseType: options.type ?? 'XRAY_JSON',
                subscriptionSettings: {
                    geofilesSystemEnabled: options.master ?? true,
                    serveJsonAtBaseSubscription: true,
                    geofilesEnabled: false,
                },
                ...(options.routing ? { headersToApply: { Routing: options.routing } } : {}),
            };
            const result = await renderer.generateSubscription({
                srrContext: context,
                user: {
                    id: 1,
                    vlessUuid: options.credential ?? 'device',
                    status: 'ACTIVE',
                    expireAt: new Date(Date.now() + 86400000),
                },
                hosts: [],
                profileTitle: 'Provider',
                profileKey: 'user',
            });
            assert.equal(
                result.subscription,
                options.type === 'XRAY_BASE64' ? 'encoded-subscription' : body,
            );
            return context.headersToApply;
        },
    };
}

for (const client of ['happ', 'incy']) {
    test(`${client}: per-host inline-to-DAT fallback retains the verified standard source context`, async () => {
        const f = fixture(client);
        const modes = [];
        const delivery = new XrayGeofileDelivery(
            client,
            'inline',
            'Provider',
            1,
            true,
            f.standards(),
        );
        const body = await delivery.renderProfile(async (child) => {
            modes.push(child.mode);
            if (child.mode === 'inline') throw Error('geofile-inline-limit');
            const custom = child.register(
                'geosite',
                { id: '00' + 'c'.repeat(32), categories: ['custom'], target: 'DIRECT' },
                async () => 'https://sub.example.test/custom-bundle.dat',
            );
            return JSON.stringify({
                routing: { rules: [{ domain: custom }, { domain: ['geosite:category-ru'] }] },
            });
        });
        assert.deepEqual(modes, ['inline', 'remote']);
        assert.match(body, /geosite:category-ru/);
        assert.match(
            decode(await delivery.header(`[${body}]`, 'user')).Geositeurl,
            /custom-bundle/,
        );
        assert.deepEqual(f.checks, [['geosite', ['category-ru']]]);
    });

    test(`${client}: full mirrors repair a fresh or Redis-evicted profile with master on and compiled off`, async () => {
        const f = fixture(client);
        const first = await f.run();
        assert.match(
            decode(first.routing).Geositeurl,
            /sub\.example\.test\/geofiles\/geosite\/latest.dat\?revision=a{64}$/,
        );
        assert.match(decode(first.routing).Geoipurl, /sub\.example\.test/);
        f.states.clear();
        f.sha = 'b'.repeat(64);
        const second = await f.run();
        assert.match(decode(second.routing).Geositeurl, /revision=b{64}$/);
        assert.notEqual(second.routing, first.routing);
        assert.deepEqual(await f.run(), second);
        assert.ok((await f.run({ credential: 'rotated-credential' })).routing);
        if (client === 'incy') assert.equal(second['routing-geo-update-interval'], '48');
    });

    test(`${client}: master off, explicit Routing and explicit geodata preserve administrator control`, async () => {
        const f = fixture(client);
        assert.equal(await f.run({ master: false }), undefined);
        assert.equal(f.reads, 0);
        assert.deepEqual(await f.run({ routing: `${client}://routing/off` }), {
            Routing: `${client}://routing/off`,
        });
        assert.equal(f.reads, 0);
        f.body = JSON.stringify([
            {
                geodata: { geosite: 'https://admin.example/test.dat' },
                routing: { rules: [{ domain: ['ext:private.dat:custom'], outboundTag: 'direct' }] },
            },
        ]);
        assert.equal(await f.run(), undefined);
    });

    test(`${client}: native standard rules can coexist with custom hashed rules without bypassing unknown-category checks`, async () => {
        const f = fixture(client);
        const delivery = new XrayGeofileDelivery(
            client,
            'remote',
            'Provider',
            undefined,
            false,
            f.standards(),
        );
        const custom = delivery.register(
            'geosite',
            { id: '00' + 'c'.repeat(32), categories: ['custom'], target: 'DIRECT' },
            async () => 'https://sub.example.test/custom-bundle.dat',
        );
        const body = JSON.stringify([
            {
                routing: {
                    rules: [
                        { domain: custom },
                        { domain: ['geosite:category-ru', 'ext:other.dat:custom'] },
                        { ip: ['geoip:private'] },
                    ],
                },
            },
        ]);
        assert.equal(delivery.resolveLegacyReferences(body), body);
        const header = decode(await delivery.header(body, 'user'));
        assert.match(header.Geositeurl, /custom-bundle/);
        assert.match(header.Geoipurl, /geoip\/latest\.dat/);
        assert.deepEqual(f.checks.sort(), [
            ['geoip', ['private']],
            ['geosite', ['category-ru']],
        ]);
        await assert.rejects(
            delivery.header(body.replace('category-ru', 'missing-standard'), 'user'),
            /existing-geodata/,
        );
        assert.throws(
            () =>
                delivery.resolveLegacyReferences(
                    JSON.stringify([{ geodata: {}, routing: { rules: [{ domain: custom }] } }]),
                ),
            /existing-geodata/,
        );
    });
}
