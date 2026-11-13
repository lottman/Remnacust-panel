const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { load: yaml } = require('js-yaml');
const { pool, mocks, schema, regex } = require('./client-pool-fixture.cjs');
const { host } = require('./subscription-delivery-fixture.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const directory = path.join(__dirname, '../src/modules/subscription-template/generators');
const { selectInjectHosts } = load(path.join(directory, 'inject-host-selection.ts'));
after(() => regex.configuredRegex.close());

const addresses = ['192.0.2.1', '2001:db8::1', 'example.test', '[2001:db8::2]', '198.51.100.2'];
const hosts = addresses.map((address, index) => ({
    ...host(index + 1),
    address,
    protocol: 'vless',
    protocolOptions: { id: '20000000-0000-4000-8000-000000000001', encryption: 'none', flow: '' },
    security: 'tls',
    securityOptions: { serverName: 'tls.example.test' },
}));
const ids = hosts.map((item) => item.metadata.uuid);
const entry = (family) => ({
    mode: 'all',
    addressFamily: family,
    selector: { type: 'uuids', values: ids },
    selectFrom: 'ALL',
    tagPrefix: 'pool',
});

test('host resolution normalizes IPv6 brackets before every subscription generator', () => {
    const { ResolveProxyConfigService } = source(
        'modules/subscription-template/resolve-proxy/resolve-proxy-config.service.ts',
        {
            './utils': {
                override: (a, b) => a ?? b ?? null,
                toNonEmptyRecord: (value) => (value && Object.keys(value).length ? value : null),
            },
        },
    );
    const service = Object.create(ResolveProxyConfigService.prototype);
    service.resolveProtocolOptions = () => ({
        protocol: 'vless',
        protocolOptions: hosts[0].protocolOptions,
    });
    service.resolveTransport = () => ({ transport: 'tcp', transportOptions: {} });
    service.resolveSecurity = () => ({
        security: 'tls',
        securityOptions: hosts[0].securityOptions,
    });
    service.withSpeedLimit = (value) => value;
    for (const [address, expected] of [
        ['[2001:db8::2]', '2001:db8::2'],
        ['2001:db8::1', '2001:db8::1'],
        ['192.0.2.1', '192.0.2.1'],
        ['example.test', 'example.test'],
    ]) {
        const result = service.buildResolvedProxyConfig({
            inputHost: { ...hosts[0].metadata, address },
            inbound: { tag: 'test' },
            user: {},
            finalRemark: 'test',
            encryptionMap: new Map(),
            publicKeyMap: new Map(),
            mldsa65PublicKeyMap: new Map(),
        });
        assert.equal(result.address, expected);
        assert.equal(
            result.metadata.sourceAddressFamily,
            address === 'example.test' ? 'dynamic' : address.includes(':') ? 'ipv6' : 'ipv4',
        );
        assert.equal(result.securityOptions.serverName, 'tls.example.test');
    }
});

test('comma-separated and wildcard source addresses cannot enter strict pools by a random resolution', () => {
    const { ResolveProxyConfigService } = source(
        'modules/subscription-template/resolve-proxy/resolve-proxy-config.service.ts',
    );
    const service = Object.create(ResolveProxyConfigService.prototype);
    for (const address of [
        '192.0.2.1,2001:db8::1',
        '*.example.test',
        'server.example.test',
        '[192.0.2.1]',
        'fe80::1%eth0',
    ]) {
        const family = service.sourceAddressFamily(address);
        assert.equal(family, 'dynamic');
        const candidate = {
            ...hosts[1],
            metadata: { ...hosts[1].metadata, sourceAddressFamily: family },
        };
        assert.deepEqual(selectInjectHosts(entry('ipv6'), [candidate]), []);
        assert.deepEqual(selectInjectHosts(entry('any'), [candidate]), [candidate]);
    }
});

test('family filters precede order, random sampling and group choice without mutating inputs', () => {
    const before = structuredClone(hosts);
    assert.deepEqual(selectInjectHosts(entry('any'), hosts), hosts);
    assert.deepEqual(selectInjectHosts(entry('ipv4'), hosts), [hosts[0], hosts[4]]);
    assert.deepEqual(selectInjectHosts(entry('ipv6'), hosts), [hosts[1], hosts[3]]);
    const reverse = { ...entry('ipv6'), selector: { type: 'uuids', values: [...ids].reverse() } };
    assert.deepEqual(selectInjectHosts(reverse, hosts), [hosts[3], hosts[1]]);
    assert.deepEqual(
        selectInjectHosts(
            { ...entry('ipv6'), mode: 'random', selector: { ...entry().selector, expected: 1 } },
            hosts,
            () => 0,
        ),
        [hosts[1]],
    );
    assert.deepEqual(
        selectInjectHosts(
            {
                ...entry('ipv6'),
                mode: 'group',
                selector: { type: 'uuids', groups: [[ids[0]], [ids[1], ids[3]]] },
            },
            hosts,
            () => 0,
        ),
        [hosts[1], hosts[3]],
    );
    assert.deepEqual(hosts, before);
});

test('contract rejects unknown families and browser/backend classification agrees on negative inputs', () => {
    assert.equal(schema.InjectHostsEntrySchema.safeParse(entry('ipv7')).success, false);
    assert.equal(schema.InjectHostsEntrySchema.parse(entry('ipv6')).addressFamily, 'ipv6');
    for (const address of [
        ...addresses,
        undefined,
        '',
        ' 2001:db8::1',
        '2001:db8::1:443',
        'fe80::1%eth0',
        '[::1]:443',
        '127.000.0.1',
        '[192.0.2.1]',
        'https://[::1]',
        '192.0.2.0/24',
        '::ffff:192.0.2.1',
    ])
        for (const family of ['any', 'ipv4', 'ipv6']) {
            const candidate = { address, metadata: { uuid: ids[0], tags: [] } };
            const selected = selectInjectHosts(
                { ...entry(family), selector: { type: 'uuids', values: [ids[0]] } },
                [candidate],
            );
            assert.equal(
                schema.poolAddressMatches(address, family),
                selected.length === 1,
                `${address}:${family}`,
            );
        }
});

test('native pool references select only the requested family and do not silently fall back', async () => {
    const candidates = hosts.map((item, index) => ({ host: item, name: `node-${index}` }));
    assert.deepEqual(await pool.clientPoolMembers(entry('ipv6'), candidates, Date.now() + 1000), [
        'node-1',
        'node-3',
    ]);
    await assert.rejects(
        pool.renderClientGroups(
            [{ name: 'auto', remnawave: { pool: entry('ipv6') } }],
            [candidates[0]],
            () => ['direct'],
            false,
            { appendMember() {} },
        ),
        pool.ClientPoolError,
    );
});

function generator(config) {
    const { XrayJsonGeneratorService } = load(
        path.join(directory, 'xray-json.generator.service.ts'),
        {
            ...mocks,
            './client-pool': pool,
            '@common/utils': {
                isNonEmptyObject: (value) => !!value && Object.keys(value).length > 0,
            },
            '../host-mapper': { applyHostMapper: (value) => value },
        },
    );
    const result = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => config });
    result.logger = { error() {}, warn() {} };
    return result;
}

test('actual Xray generator emits IPv6 candidate with original TLS/credentials and preserves balancing strategy', async () => {
    const config = {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        remnawave: { injectHosts: [entry('ipv6')] },
        routing: {
            balancers: [{ tag: 'auto', selector: ['pool'], strategy: { type: 'leastPing' } }],
            rules: [{ type: 'field', network: 'tcp,udp', balancerTag: 'auto' }],
        },
    };
    const candidates = hosts.filter((item) => !item.address.startsWith('['));
    for (const candidate of candidates) candidate.metadata.isHidden = true;
    const before = structuredClone(config);
    const [rendered] = JSON.parse(
        await generator(config).generateConfig({
            hosts: [host(0), ...candidates],
            isExtendedClient: false,
        }),
    );
    const output = rendered.outbounds.find((item) => item.tag === 'pool');
    assert.equal(output.settings.vnext[0].address, '2001:db8::1');
    assert.equal(output.settings.vnext[0].users[0].id, hosts[1].protocolOptions.id);
    assert.equal(output.streamSettings.tlsSettings.serverName, hosts[1].securityOptions.serverName);
    assert.equal(rendered.routing.balancers[0].strategy.type, 'leastPing');
    assert.deepEqual(config, before);
});

test('explicit strict family with no members omits the Xray profile even when legacy mode is absent', async () => {
    const strict = entry('ipv6');
    delete strict.mode;
    const config = {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        remnawave: { injectHosts: [strict] },
    };
    assert.deepEqual(
        JSON.parse(
            await generator(config).generateConfig({ hosts: [host(0)], isExtendedClient: false }),
        ),
        [],
    );
});

test('family is checked again after quota credential rebinding without resampling or losing credentials', async () => {
    const config = {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        remnawave: { injectHosts: [entry('ipv6')] },
    };
    const candidate = { ...hosts[1], metadata: { ...hosts[1].metadata, isHidden: true } };
    for (const address of ['192.0.2.99', '2001:db8::99']) {
        let bindings = 0;
        const params = {
            hosts: [host(0), candidate],
            isExtendedClient: false,
            bindAutoselect: async (recipient, sources) => {
                bindings++;
                assert.equal(recipient, host(0).metadata.uuid);
                assert.deepEqual(sources, [candidate.metadata.uuid]);
                return [
                    {
                        ...candidate,
                        address,
                        protocolOptions: {
                            ...candidate.protocolOptions,
                            id: '30000000-0000-4000-8000-000000000001',
                        },
                    },
                ];
            },
        };
        const rendered = JSON.parse(await generator(config).generateConfig(params));
        assert.equal(bindings, 1);
        if (address.startsWith('192.')) assert.deepEqual(rendered, []);
        else {
            const outbound = rendered[0].outbounds.find((item) => item.tag === 'pool');
            assert.equal(outbound.settings.vnext[0].address, address);
            assert.equal(
                outbound.settings.vnext[0].users[0].id,
                '30000000-0000-4000-8000-000000000001',
            );
        }
    }
});

for (const [file, name] of [
    ['mihomo', 'MihomoGeneratorService'],
    ['clash', 'ClashGeneratorService'],
    ['singbox', 'SingBoxGeneratorService'],
]) {
    test(`${file} real generator keeps IPv6 pool membership separate from balancing strategy`, async () => {
        const sing = file === 'singbox';
        const group = {
            ...(sing
                ? { tag: 'auto', type: 'urltest', outbounds: [] }
                : { name: 'auto', type: 'url-test', proxies: [] }),
            url: 'https://example.test/204',
            interval: sing ? '5m' : 300,
            remnawave: { pool: entry('ipv6') },
        };
        const config = sing
            ? { outbounds: [group, { type: 'direct', tag: 'direct' }], route: { final: 'auto' } }
            : { 'proxy-groups': [group], rules: ['MATCH,auto'] };
        const exports = load(path.join(directory, file + '.generator.service.ts'), {
            ...mocks,
            './client-pool': pool,
            '@common/utils': {
                isNonEmptyObject: (value) => !!value && Object.keys(value).length > 0,
                parseIntRangeUtil: (value) => [Number(value)],
            },
            '@libs/contracts/constants': { FINGERPRINTS: [] },
            '../host-mapper': { applyHostMapper: (value) => value },
        });
        const service = new exports[name]({
            getCachedTemplateByType: async () => structuredClone(config),
        });
        const output = await service.generateConfig(
            hosts
                .filter((item) => !item.address.startsWith('['))
                .map((item) =>
                    file === 'clash'
                        ? {
                              ...item,
                              protocol: 'shadowsocks',
                              protocolOptions: {
                                  password: 'synthetic-fixture',
                                  method: 'aes-128-gcm',
                              },
                          }
                        : item,
                ),
        );
        const rendered = sing ? JSON.parse(output) : yaml(output);
        const result = sing
            ? rendered.outbounds.find((item) => item.tag === 'auto')
            : rendered['proxy-groups'][0];
        assert.deepEqual(result[sing ? 'outbounds' : 'proxies'], [hosts[1].finalRemark]);
        assert.equal(result.type, sing ? 'urltest' : 'url-test');
        const candidate = sing
            ? rendered.outbounds.find((item) => item.tag === hosts[1].finalRemark)
            : rendered.proxies.find((item) => item.name === hosts[1].finalRemark);
        assert.equal(candidate.server, '2001:db8::1');
    });
}
