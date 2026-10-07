const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src');
function source(name, overrides = {}) {
    const filename = path.join(root, name);
    const mocks = {};
    for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
        if (
            match[1].startsWith('@common/') ||
            match[1].startsWith('@modules/') ||
            match[1].startsWith('@libs/') ||
            match[1].startsWith('.')
        )
            mocks[match[1]] = {};
    }
    return load(filename, { ...mocks, ...overrides });
}
const cipher = source('common/helpers/xray-config/ss-cipher.ts');
const { XRayConfig } = source('common/helpers/xray-config/xray-config.validator.ts', {
    './ss-cipher': cipher,
});
const { ResolveProxyConfigService } = source(
    'modules/subscription-template/resolve-proxy/resolve-proxy-config.service.ts',
    { '@common/helpers/xray-config/ss-cipher': cipher },
);
const { XrayJsonGeneratorService } = source(
    'modules/subscription-template/generators/xray-json.generator.service.ts',
    {
        '../host-mapper': { applyHostMapper: (x) => x },
        '@common/utils': { isNonEmptyObject: (x) => x && Object.keys(x).length > 0 },
    },
);
const inbound = () => ({
    protocol: 'masque',
    tag: 'M',
    port: 443,
    settings: { address: ['10.99.0.1/24'], users: [{ email: 'old', pass: 'old-secret' }] },
    streamSettings: {
        network: 'masque',
        security: 'tls',
        masqueSettings: {
            path: '/ip/',
            headers: { Authorization: 'admin-secret', 'X-Route': 'public' },
        },
    },
});

test('MASQUE profile is managed, replaces static users and preserves scoped identity on restart', () => {
    const config = new XRayConfig({ inbounds: [inbound()], outbounds: [{ protocol: 'freedom' }] });
    assert.equal(config.getAllInbounds()[0].type, 'masque');
    config.cleanInboundClients(false);
    config.includeUserBatch(
        [{ id: '42~device~host', vlessUuid: 'device-secret', tags: ['M'] }],
        new Map(),
    );
    assert.deepEqual(config.getInbound('M').settings.clients, [
        { email: '42~device~host', pass: 'device-secret', level: 0 },
    ]);
    assert.equal(config.getInbound('M').settings.users, undefined);
});

test('subscription renderer omits unavailable protected hosts and never substitutes the parent key', async () => {
    const { ResolveProxyConfigService: Resolver } = source(
        'modules/subscription-template/resolve-proxy/resolve-proxy-config.service.ts',
        {
            '@modules/hosts/utils/host-traffic-limit': { isHostTrafficLimited: () => false },
            '@libs/contracts/constants': {
                USERS_STATUS: { ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', DISABLED: 'DISABLED' },
            },
            '@common/helpers/xray-config': {
                resolveInboundAndPublicKey: async () => new Map(),
                resolveInboundAndMlDsa65PublicKey: async () => new Map(),
                resolveEncryptionFromDecryption: async () => new Map(),
            },
            '@common/utils/templates/replace-templates-values': {
                TemplateEngine: { createUserValueMap: () => ({}), replace: (x) => x },
            },
        },
    );
    const user = {
        id: 1n,
        status: 'ACTIVE',
        expireAt: new Date('2099-01-01'),
        vlessUuid: 'parent',
    };
    const resolver = new Resolver(
        { getOrThrow: () => 'example.test' },
        {
            prepare: async () =>
                new Map([
                    ['offline', null],
                    ['online', { ...user, vlessUuid: 'scoped' }],
                ]),
        },
    );
    resolver.resolveEarlyExitRemarks = () => null;
    resolver.applyShuffle = (x) => x;
    resolver.applyHostOverrides = () => {};
    resolver.buildResolvedProxyConfig = ({ inputHost, user }) => ({
        host: inputHost.uuid,
        key: user.vlessUuid,
    });
    const hosts = ['offline', 'online', 'ordinary'].map((uuid) => ({
        uuid,
        remark: uuid,
        rawInbound: {},
    }));
    const configs = await resolver.resolveProxyConfig({ user, hosts, subscriptionSettings: {} });
    assert.deepEqual(configs, [
        { host: 'online', key: 'scoped' },
        { host: 'ordinary', key: 'parent' },
    ]);
});
test('panel rejects a protocol/transport mismatch and missing TLS before dispatching to nodes', () => {
    const wrong = inbound();
    wrong.protocol = 'vless';
    assert.throws(() => new XRayConfig({ inbounds: [wrong] }), /requires the masque protocol/);
    const unsafe = inbound();
    unsafe.streamSettings.security = 'none';
    assert.throws(() => new XRayConfig({ inbounds: [unsafe] }), /TLS/);
});
test('MASQUE subscription uses the device/host account, removes admin auth and leaves the profile untouched', () => {
    const resolver = new ResolveProxyConfigService({ getOrThrow: () => 'example.test' }, {});
    const raw = inbound();
    for (const username of [undefined, '42~device', '42~device~host']) {
        const user = {
            id: 42n,
            username: 'human-name',
            xrayUsername: username,
            vlessUuid: 'scoped-secret',
        };
        const protocol = resolver.resolveProtocolOptions({}, raw, user);
        const transport = resolver.resolveTransport(raw.streamSettings, {}, protocol, user);
        assert.equal(transport.transportOptions.settings.user, username ?? '42');
        assert.equal(transport.transportOptions.settings.pass, 'scoped-secret');
        assert.deepEqual(transport.transportOptions.settings.headers, { 'X-Route': 'public' });
    }
    assert.equal(raw.streamSettings.masqueSettings.headers.Authorization, 'admin-secret');
});
test('native JSON contains MASQUE settings and never injects unsupported mux', () => {
    const generator = new XrayJsonGeneratorService({});
    const host = {
        address: 'example.test',
        port: 443,
        protocol: 'masque',
        protocolOptions: { username: '42', password: 'secret', remoteDNS: ['1.1.1.1'] },
        transport: 'masque',
        transportOptions: { settings: { user: '42', pass: 'secret', path: '/ip/' } },
        security: 'tls',
        securityOptions: { serverName: 'example.test', alpn: 'h3,h2', fingerprint: '' },
        mux: { enabled: true },
        streamOverrides: { sockopt: null, finalMask: null },
        clientOverrides: { mapper: {} },
    };
    const outbound = generator.buildOutbound(host, 'proxy');
    assert.deepEqual(outbound.settings, {
        address: 'example.test',
        port: 443,
        remoteDNS: ['1.1.1.1'],
    });
    assert.equal(outbound.streamSettings.masqueSettings.pass, 'secret');
    assert.equal(outbound.mux, undefined);
});
test('XDRIVE parameters survive sorting and subscription generation', () => {
    const raw = {
        protocol: 'vless',
        tag: 'D',
        settings: { decryption: 'none', clients: [] },
        streamSettings: {
            network: 'xdrive',
            xdriveSettings: { service: 'local', remoteFolder: '/storage', flushIntervalMs: 70 },
        },
    };
    const profile = new XRayConfig({ inbounds: [raw] });
    assert.equal(
        profile.getSortedConfig().inbounds[0].streamSettings.xdriveSettings.flushIntervalMs,
        70,
    );
    const resolver = new ResolveProxyConfigService({ getOrThrow: () => 'example.test' }, {});
    const transport = resolver.resolveTransport(raw.streamSettings, {}, { protocol: 'vless' }, {});
    const generator = new XrayJsonGeneratorService({});
    assert.deepEqual(generator.buildTransportEntry(transport), {
        xdriveSettings: raw.streamSettings.xdriveSettings,
    });
});
test('unsupported client formats omit MASQUE and XDRIVE without forging other protocols', async () => {
    for (const [name, cls] of [
        ['clash', 'ClashGeneratorService'],
        ['mihomo', 'MihomoGeneratorService'],
        ['singbox', 'SingBoxGeneratorService'],
    ]) {
        const C = source(`modules/subscription-template/generators/${name}.generator.service.ts`)[
            cls
        ];
        const generator = new C({
            getCachedTemplateByType: async () => ({ proxies: [], outbounds: [] }),
        });
        const hosts = ['masque', 'xdrive'].map((transport) => ({
            transport,
            protocol: 'masque',
            metadata: { isHidden: false, excludeFromSubscriptionTypes: [] },
        }));
        const output = await generator.generateConfig(hosts);
        assert.notEqual(output, '', name);
        assert.ok(!output.includes('masque') && !output.includes('xdrive'), name);
    }
});

test('UDP hopping reads both legacy and current Finalmask and rejects lossy mappings', () => {
    const { getUdpHop } = source('modules/subscription-template/generators/udp-hop.ts');
    assert.deepEqual(
        getUdpHop({ quicParams: { udpHop: { ports: '443,5000-5010', interval: 30 } } }),
        { ports: '443,5000-5010', interval: 30 },
    );
    const settings = {
        mode: 'intervalRemote,perConnRemote',
        remotePorts: '443,5000-5010',
        interval: 30,
    };
    assert.deepEqual(getUdpHop({ udp: [{ type: 'udphop', settings }] }), {
        ports: '443,5000-5010',
        interval: 30,
    });
    assert.equal(
        getUdpHop({
            udp: [{ type: 'udphop', settings: { ...settings, remoteIPs: ['192.0.2.1'] } }],
        }),
        undefined,
    );
    assert.equal(
        getUdpHop({ udp: [{ type: 'udphop', settings: { ...settings, interval: '30-60' } }] }),
        undefined,
    );
});

test('SS2022 AES-128 and AES-256 keep restart credentials consistent with subscriptions', () => {
    const password = '12345678901234567890123456789012';
    const resolver = new ResolveProxyConfigService({ getOrThrow: () => 'example.test' }, {});
    for (const [method, bytes] of [
        ['2022-blake3-aes-128-gcm', 16],
        ['2022-blake3-aes-256-gcm', 32],
    ]) {
        const serverKey = Buffer.alloc(bytes, 7).toString('base64');
        const raw = {
            protocol: 'shadowsocks',
            tag: 'SS',
            port: 8388,
            settings: { method, password: serverKey, clients: [] },
        };
        const config = new XRayConfig({ inbounds: [raw] });
        config.includeUserBatch(
            [{ id: '42~device~host', vlessUuid: 'identity', ssPassword: password, tags: ['SS'] }],
            new Map(),
        );
        const userKey = (
            bytes === 16 ? createHash('sha256').update(password).digest() : Buffer.from(password)
        )
            .subarray(0, bytes)
            .toString('base64');
        assert.equal(config.getInbound('SS').settings.clients[0].password, userKey);
        const resolved = resolver.resolveProtocolOptions({}, raw, { ssPassword: password });
        assert.equal(resolved.protocolOptions.password, `${serverKey}:${userKey}`);
        assert.equal(Buffer.from(userKey, 'base64').length, bytes);
        const invalid = {
            ...raw,
            settings: {
                ...raw.settings,
                password: Buffer.alloc(bytes === 16 ? 32 : 16).toString('base64'),
            },
        };
        assert.throws(
            () => new XRayConfig({ inbounds: [invalid] }),
            new RegExp(`exactly ${bytes} bytes`),
        );
        const malformed = { ...raw, settings: { ...raw.settings, password: serverKey + '!' } };
        assert.throws(() => new XRayConfig({ inbounds: [malformed] }), /base64/);
    }
    assert.equal(cipher.getSsPassword(password, true), Buffer.from(password).toString('base64'));
    assert.equal(cipher.getSsPassword(password, false), password);
    assert.notEqual(
        cipher.getSsPassword(password, true, '2022-blake3-aes-128-gcm'),
        cipher.getSsPassword(
            password.slice(0, 16) + 'different-suffix',
            true,
            '2022-blake3-aes-128-gcm',
        ),
    );
    assert.throws(
        () => cipher.getSsPassword('too-short', true, '2022-blake3-aes-128-gcm'),
        /at least 16 bytes/,
    );
});
