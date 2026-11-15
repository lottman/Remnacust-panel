const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { load: yaml } = require('js-yaml');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const { pool, mocks, regex } = require('./client-pool-fixture.cjs');
const directory = path.join(__dirname, '../src/modules/subscription-template/generators');
const { XrayJsonGeneratorService } = source(
    'modules/subscription-template/generators/xray-json.generator.service.ts',
    {
        './inject-host-selection': source(
            'modules/subscription-template/generators/inject-host-selection.ts',
        ),
        '@common/utils/bounded-regex': regex,
        '@common/utils': { isNonEmptyObject: (value) => !!value && Object.keys(value).length > 0 },
        '../host-mapper': { applyHostMapper: (value) => value },
    },
);
const { materializePriority } = load(path.join(directory, 'priority-failover.ts'), {
    './client-pool': pool,
});
const { validateClientTemplate } = load(path.join(directory, 'validate-client-template.ts'), mocks);
const frontendDirectory = path.join(
    __dirname,
    '../../frontend/src/widgets/dashboard/templates/subscription-template-editor',
);
const frontend = load(path.join(frontendDirectory, 'autoselect-model.ts'));
const native = load(path.join(frontendDirectory, 'client-template-model.ts'));
const { setClientAutoselectStrategy } = load(
    path.join(frontendDirectory, 'client-autoselect-model.ts'),
);
test.after(() => regex.configuredRegex.close());
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function host(n, address = `2001:db8::${n + 1}`) {
    return {
        protocol: 'shadowsocks',
        address,
        port: 443,
        protocolOptions: { password: 'synthetic-only', method: 'aes-128-gcm' },
        transport: 'tcp',
        transportOptions: {},
        security: 'none',
        securityOptions: {},
        streamOverrides: {},
        mux: null,
        finalRemark: `server-${n}`,
        clientOverrides: { mapper: { xrayJson: null, mihomo: null, singbox: null } },
        metadata: {
            uuid: id(n),
            tags: ['pool'],
            isHidden: false,
            excludeFromSubscriptionTypes: [],
        },
    };
}
const members = [host(1), host(2), host(3, '192.0.2.3'), host(4)];
members[3].metadata.excludeFromSubscriptionTypes = [
    'XRAY_JSON',
    'MIHOMO',
    'CLASH',
    'STASH',
    'SINGBOX',
];
const entry = {
    mode: 'all',
    selectFrom: 'ALL',
    addressFamily: 'ipv6',
    tagPrefix: 'pool',
    selector: { type: 'uuids', values: [id(2), id(4), id(3), id(1), id(999)] },
};
function xrayTemplate() {
    return {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        dns: { servers: ['192.0.2.53'] },
        remnawave: { injectHosts: [entry] },
        routing: {
            balancers: [
                {
                    tag: 'auto',
                    selector: ['pool'],
                    strategy: { type: 'roundRobin', settings: { remnacustLoadBalance: true } },
                },
            ],
            rules: [
                { type: 'field', domain: ['domain:private.example'], outboundTag: 'direct' },
                { type: 'field', network: 'tcp,udp', balancerTag: 'auto' },
            ],
        },
    };
}
async function xray(template, options = {}) {
    return JSON.parse(
        await new XrayJsonGeneratorService({
            getCachedTemplateByType: async () => template,
        }).generateConfig({
            hosts: [
                host(0, '192.0.2.10'),
                ...members.map((member) => ({
                    ...member,
                    metadata: { ...member.metadata, isHidden: true },
                })),
            ],
            isExtendedClient: false,
            ...options,
        }),
    );
}

test('real Xray load distribution keeps all authorized IPv6 members, standard strategy, checks and a closed fallback', async () => {
    const template = xrayTemplate(),
        original = structuredClone(template);
    const profiles = await xray(template);
    assert.deepEqual(
        profiles,
        await xray(
            frontend.parseTemplate(
                frontend.setBalancerStrategy(JSON.stringify(template), 0, 'loadBalance'),
            ),
        ),
    );
    assert.equal(profiles.length, 1);
    for (const config of profiles) {
        const balance = config.routing.balancers[0];
        assert.deepEqual(balance.strategy, { type: 'roundRobin' });
        assert.equal(
            config.outbounds.find((o) => o.tag === balance.fallbackTag).protocol,
            'blackhole',
        );
        assert.deepEqual(config.observatory.subjectSelector, ['pool']);
        assert.equal(config.observatory.probeInterval, '30s');
        assert.deepEqual(
            config.outbounds
                .filter((o) => o.tag === 'pool' || o.tag === 'pool-2')
                .map((o) => o.settings.servers[0].address),
            ['2001:db8::3', '2001:db8::2'],
        );
        assert.equal(
            config.outbounds.find((o) => o.tag === 'pool').settings.servers[0].password,
            'synthetic-only',
        );
        assert.deepEqual(config.dns, template.dns);
        assert.deepEqual(config.routing.rules, template.routing.rules);
        assert.equal(config.remnawave, undefined);
    }
    assert.deepEqual(template, original);
});

test('real Xray load distribution retains explicit fallback and burst HTTP settings without widening the pool', async () => {
    const template = xrayTemplate();
    template.routing.balancers[0].fallbackTag = 'direct';
    template.burstObservatory = {
        subjectSelector: ['other'],
        pingConfig: {
            destination: 'https://probe.example.test/204',
            interval: '71s',
            httpMethod: 'GET',
        },
    };
    const [config] = await xray(template);
    assert.equal(config.routing.balancers[0].fallbackTag, 'direct');
    assert.equal(
        config.outbounds.some((o) => o.protocol === 'blackhole'),
        false,
    );
    assert.deepEqual(config.burstObservatory.subjectSelector, ['other', 'pool']);
    assert.equal(config.burstObservatory.pingConfig.destination, 'https://probe.example.test/204');
    assert.equal(config.burstObservatory.pingConfig.interval, '71s');
    assert.equal(config.burstObservatory.pingConfig.httpMethod, 'GET');
});

test('distribution rejects invalid intent and empty pools and does not reinterpret ordinary strategies', () => {
    const original = {
        outbounds: [{ tag: 'pool', protocol: 'shadowsocks' }],
        routing: {
            balancers: [
                {
                    tag: 'auto',
                    selector: ['pool'],
                    strategy: { type: 'leastLoad', settings: { expected: 1 } },
                },
            ],
        },
    };
    assert.equal(materializePriority(original), original);
    for (const marker of ['true', 1, null]) {
        const input = structuredClone(original);
        input.routing.balancers[0].strategy = {
            type: 'roundRobin',
            settings: { remnacustLoadBalance: marker },
        };
        assert.throws(() => materializePriority(input), /load-balance-strategy/);
    }
    const empty = { ...xrayTemplate(), outbounds: [] };
    assert.throws(() => materializePriority(empty), /load-balance-selector/);
    const scripted = structuredClone(original);
    scripted.routing.script = '/test/route.lua';
    scripted.routing.balancers[0].strategy = {
        type: 'roundRobin',
        settings: { remnacustLoadBalance: true },
    };
    assert.throws(() => materializePriority(scripted), /load-balance-routing-script/);
    for (const format of ['MIHOMO', 'CLASH', 'STASH', 'SINGBOX']) {
        const key = format === 'SINGBOX' ? 'outbounds' : 'proxy-groups';
        for (const custom of [{ loadBalance: 'true' }, { loadBalance: true }])
            assert.throws(
                () =>
                    validateClientTemplate(
                        { [key]: [{ type: 'select', remnawave: custom }] },
                        format,
                    ),
                /load-balance-strategy/,
            );
    }
});

test('real Xray distribution requires recipient credentials for quota-limited sources and respects denied binding', async () => {
    const owner = host(0, '192.0.2.10');
    const sources = members.slice(0, 2).map((member) => ({
        ...member,
        protocol: 'vless',
        protocolOptions: { id: id(700), flow: '' },
        transport: 'xhttp',
        transportOptions: { host: 'cdn.example.test', path: '/tunnel', mode: 'packet-up' },
        security: 'tls',
        securityOptions: { serverName: 'tls.example.test', fingerprint: 'firefox' },
        clientOverrides: { ...member.clientOverrides, selectionOnly: true },
        metadata: { ...member.metadata, isHidden: true },
    }));
    const template = xrayTemplate();
    const options = {
        hosts: [owner],
        autoselectCandidates: async () => sources,
        autoselectSelections: new Map(),
        bindAutoselect: async (uuid, ids) => {
            assert.equal(uuid, owner.metadata.uuid);
            assert.deepEqual(ids, [id(2), id(1)]);
            return sources.map((source) => ({
                ...source,
                protocolOptions: { ...source.protocolOptions, id: id(701) },
                clientOverrides: { ...source.clientOverrides, selectionOnly: undefined },
            }));
        },
    };
    for (let attempt = 0; attempt < 2; attempt++) {
        const [config] = await xray(template, options);
        const outbound = config.outbounds.find((o) => o.tag === 'pool');
        assert.equal(outbound.settings.vnext[0].users[0].id, id(701));
        assert.equal(outbound.streamSettings.tlsSettings.serverName, 'tls.example.test');
        assert.equal(outbound.streamSettings.xhttpSettings.path, '/tunnel');
        assert.deepEqual(config.routing.balancers[0].strategy, { type: 'roundRobin' });
    }
    await assert.rejects(
        xray(template, { ...options, bindAutoselect: undefined }),
        /unbound-autoselect-source/,
    );
    assert.deepEqual(await xray(template, { ...options, bindAutoselect: async () => [] }), []);
});

for (const format of ['MIHOMO', 'CLASH', 'STASH', 'SINGBOX']) {
    test(`${format}: actual generator lowers opted-in distribution to supported native strategy and retains membership`, async () => {
        const sing = format === 'SINGBOX',
            key = sing ? 'outbounds' : 'proxy-groups';
        const group = {
            ...(sing
                ? { tag: 'auto', type: 'urltest', outbounds: [] }
                : { name: 'auto', type: 'load-balance', proxies: [] }),
            url: 'https://probe.example.test/204',
            interval: sing ? '71s' : 71,
            remnawave: { loadBalance: true, pool: entry },
        };
        if (sing) group.tolerance = 50;
        const template = {
            [key]: [group],
            ...(sing ? { route: { final: 'auto' } } : { rules: ['MATCH,auto'] }),
            dns: { servers: ['192.0.2.53'] },
        };
        const before = structuredClone(template);
        const file = sing ? 'singbox' : format === 'MIHOMO' ? 'mihomo' : 'clash';
        const name = sing
            ? 'SingBoxGeneratorService'
            : format === 'MIHOMO'
              ? 'MihomoGeneratorService'
              : 'ClashGeneratorService';
        const exports = load(path.join(directory, `${file}.generator.service.ts`), {
            ...mocks,
            './client-pool': pool,
            '@common/utils': {
                isNonEmptyObject: (v) => !!v && Object.keys(v).length > 0,
                parseIntRangeUtil: (v) => [Number(v)],
            },
            '@libs/contracts/constants': { FINGERPRINTS: [] },
            '../host-mapper': { applyHostMapper: (v) => v },
        });
        const output = await new exports[name]({
            getCachedTemplateByType: async () => template,
        }).generateConfig(members);
        const gui = native.readClientTemplate(
            setClientAutoselectStrategy(JSON.stringify(template), format, 0, 'loadBalance'),
            format,
        );
        const guiOutput = await new exports[name]({
            getCachedTemplateByType: async () => gui,
        }).generateConfig(members);
        const rendered = sing ? JSON.parse(output) : yaml(output);
        assert.deepEqual(rendered, sing ? JSON.parse(guiOutput) : yaml(guiOutput));
        const actual = sing ? rendered.outbounds.find((o) => o.tag === 'auto') : rendered[key][0];
        assert.equal(actual.type, sing ? 'urltest' : 'load-balance');
        assert.equal(actual.strategy, sing ? undefined : 'round-robin');
        assert.deepEqual(actual[sing ? 'outbounds' : 'proxies'], ['server-2', 'server-1']);
        assert.equal(actual.url, group.url);
        assert.equal(actual.interval, group.interval);
        assert.equal(actual.remnawave, undefined);
        assert.deepEqual(template, before);
    });
}
