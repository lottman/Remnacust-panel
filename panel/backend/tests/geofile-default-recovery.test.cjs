const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template');
const modules = { ...mocks, '../generators/client-pool': pool };
const { XrayGeofileDelivery } = load(path.join(root, 'geofiles/xray-geofile-delivery.ts'), modules);
const { stabilizeRoutingProfile } = load(path.join(root, 'geofiles/stabilize-routing-profile.ts'));
const { RenderTemplatesService } = load(path.join(root, 'render-templates.service.ts'), {
    ...modules,
    '@libs/contracts/constants': require('../libs/contract/build/backend/constants'),
    '@common/raw-cache': {},
    './constants/config-types': {
        SUBSCRIPTION_CONFIG_TYPES: { XRAY_JSON: { CONTENT_TYPE: 'application/json' } },
    },
    './generators/clash.generator.service': {},
    './generators/mihomo.generator.service': {},
    './generators/xray.generator.service': {},
    './generators/xray-json.generator.service': {},
    './generators/singbox.generator.service': {},
    './resolve-proxy/resolve-proxy-config.service': {},
});
const decode = (header) => JSON.parse(Buffer.from(header.split('/onadd/')[1], 'base64'));
const defaultUrl = (kind) =>
    `https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/${kind}.dat`;
const manual = JSON.stringify([
    {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        routing: {
            rules: [
                { type: 'field', domain: ['geosite:category-ru'], outboundTag: 'direct' },
                { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' },
            ],
        },
    },
]);

async function fixture(client, prior = true, inline = false) {
    const states = new Map();
    const revision = async (key, fingerprint, minimum) => {
        const old = states.get(key);
        if (old?.fingerprint === fingerprint) return old.revision;
        const value = Math.max(minimum, (old?.revision ?? 0) + 1);
        states.set(key, { fingerprint, revision: value });
        return value;
    };
    let original;
    if (prior) {
        const delivery = new XrayGeofileDelivery(client, 'remote', 'Provider');
        const values = delivery.register(
            'geosite',
            { id: '00' + 'a'.repeat(32), categories: ['example'], target: 'DIRECT' },
            async () => 'https://subscription.example.test/managed.dat',
        );
        original = await stabilizeRoutingProfile(
            await delivery.header(
                JSON.stringify([{ routing: { rules: [{ domain: values }] } }]),
                'user-key',
            ),
            24,
            revision,
            'device-key',
        );
        if (prior === 'cleared')
            original = await stabilizeRoutingProfile(
                delivery.retirementHeader('user-key'),
                0,
                revision,
                'device-key',
            );
    }
    const cache = {
        routingProfileRevision: revision,
        retireRoutingProfileRevision: async (...args) =>
            states.has(args[0]) ? revision(...args) : null,
    };
    const renderer = new RenderTemplatesService(
        { resolveProxyConfig: async () => [] },
        null,
        null,
        null,
        null,
        {
            generateConfig: async ({ geofileDelivery }) => {
                if (inline) geofileDelivery.registerInline();
                return manual;
            },
        },
        cache,
    );
    const run = async (serveJsonAtBaseSubscription, credential = 'device-key', headers) => {
        const context = {
            userAgent: `${client}/6.3.0`,
            matchedResponseType: 'XRAY_JSON',
            subscriptionSettings: { serveJsonAtBaseSubscription },
            ...(headers ? { headersToApply: headers } : {}),
        };
        const result = await renderer.generateSubscription({
            srrContext: context,
            user: { id: 42, vlessUuid: credential },
            hosts: [],
            profileTitle: 'Provider',
            profileKey: 'user-key',
        });
        assert.equal(result.subscription, manual);
        return context.headersToApply;
    };
    return { original, run, states };
}

for (const client of ['happ', 'incy']) {
    for (const jsonEnabled of [false, true]) {
        test(`${client}: removing all managed files restores standard DAT sources with JSON prerequisite ${jsonEnabled}`, async () => {
            const f = await fixture(client);
            const headers = await f.run(jsonEnabled);
            const restored = decode(headers.routing);
            assert.equal(restored.Name, decode(f.original).Name);
            assert(Number(restored.LastUpdated) > Number(decode(f.original).LastUpdated));
            assert.equal(restored.Geositeurl, defaultUrl('geosite'));
            assert.equal(restored.Geoipurl, defaultUrl('geoip'));
            assert.equal(restored[client === 'incy' ? 'useChunkFiles' : 'UseChunkFiles'], false);
            for (const field of [
                'DirectSites',
                'DirectIp',
                'ProxySites',
                'ProxyIp',
                'BlockSites',
                'BlockIp',
            ])
                assert.deepEqual(restored[field], []);
            assert(!headers.routing.includes('/routing/off'));
            if (client === 'incy') assert.equal(headers['routing-geo-update-interval'], '0');
            assert.deepEqual(await f.run(jsonEnabled), headers);
            assert.equal(await f.run(jsonEnabled, 'other-device'), undefined);
        });
    }

    test(`${client}: returning below the inline threshold repairs previously downloaded DAT`, async () => {
        const f = await fixture(client, true, true);
        const restored = decode((await f.run(true)).routing);
        assert.equal(restored.Geositeurl, defaultUrl('geosite'));
        assert.equal(restored.Geoipurl, defaultUrl('geoip'));
    });

    test(`${client}: upgrading a previously cleared empty-URL profile repairs its saved files once`, async () => {
        const f = await fixture(client, 'cleared');
        assert.equal(decode(f.original).Geositeurl, '');
        const headers = await f.run(false);
        const restored = decode(headers.routing);
        assert.equal(restored.Geositeurl, defaultUrl('geosite'));
        assert(Number(restored.LastUpdated) > Number(decode(f.original).LastUpdated));
        assert.deepEqual(await f.run(false), headers);
    });

    test(`${client}: a subscription still using any managed DAT never restores over that file`, async () => {
        const renderer = new RenderTemplatesService(
            { resolveProxyConfig: async () => [] },
            null,
            null,
            null,
            null,
            {
                generateConfig: async ({ geofileDelivery }) => {
                    const refs = geofileDelivery.register(
                        'geosite',
                        { id: '00' + 'b'.repeat(32), categories: ['example'], target: 'DIRECT' },
                        async () => 'https://subscription.example.test/still-managed.dat',
                    );
                    return JSON.stringify([{ routing: { rules: [{ domain: refs }] } }]);
                },
            },
            {
                routingProfileRevision: async (_key, _fingerprint, minimum) => minimum,
                retireRoutingProfileRevision: () => assert.fail('active managed DAT was retired'),
            },
        );
        const context = {
            userAgent: `${client}/6.3.0`,
            matchedResponseType: 'XRAY_JSON',
            subscriptionSettings: { serveJsonAtBaseSubscription: true },
        };
        const result = await renderer.generateSubscription({
            srrContext: context,
            user: { id: 42, vlessUuid: 'device-key' },
            hosts: [],
            profileTitle: 'Provider',
            profileKey: 'user-key',
        });
        assert.match(
            decode(context.headersToApply.routing).Geositeurl,
            /^https:\/\/subscription\.example\.test\/still-managed\.dat/,
        );
        assert.match(result.subscription, /geosite:r[a-f0-9]+_/);
        assert(!context.headersToApply.routing.includes('routing/off'));
    });

    test(`${client}: fresh disabled or inline subscriptions never download defaults or create routing history`, async () => {
        for (const inline of [false, true]) {
            const f = await fixture(client, false, inline);
            assert.equal(await f.run(inline), undefined);
            assert.equal(f.states.size, 0);
        }
    });

    test(`${client}: explicit administrator routing remains authoritative after managed downloads`, async () => {
        const f = await fixture(client);
        const headers = { Routing: `${client}://routing/off` };
        assert.deepEqual(await f.run(false, 'device-key', headers), headers);
    });
}
