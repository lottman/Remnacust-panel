const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const { NodeControlRouteResolver, routeCandidates, routeRevision } = load(path.join(__dirname, '../src/common/axios/node-control-route.ts'));
const { SocksProxyUrlSchema } = load(path.join(__dirname, '../libs/contract/models/socks-proxy.schema.ts'));
const base = { uuid: '11111111-1111-4111-8111-111111111111', address: 'primary.invalid', port: 2222,
    proxyUrl: null, ips: [{ ip: '192.0.2.1', status: 'MANAGEMENT' }, { ip: '2001:db8::1', status: 'RESERVE' }] };
class Cache {
    rows = new Map();
    async get(key) { const row = this.rows.get(key); return row && row.until > Date.now() ? row.value : null; }
    async set(key, value, seconds) { this.rows.set(key, { value, until: Date.now() + seconds * 1000 }); }
    async incrementWithTtl(key, seconds) { const n = (await this.get(key) ?? 0) + 1; await this.set(key, n, seconds); return n; }
}
test('SOCKS contracts validate port, IPv6, encoded credentials and bounded RFC1929 fields', () => {
    for (const value of ['socks5://proxy.invalid:1080', 'socks5://u:p@[2001:db8::1]:65535',
        'socks5://u:p%40ss@127.0.0.1:1', `socks5://${'é'.repeat(127)}:p@proxy.invalid:1080`])
        assert.equal(SocksProxyUrlSchema.safeParse(value).success, true, value.slice(0, 80));
    for (const value of ['socks5://proxy.invalid:0', 'socks5://proxy.invalid:99999', 'socks5://proxy.invalid',
        'http://proxy.invalid:1080', 'socks5://2001:db8::1:1080', 'socks5://proxy.invalid:1080/path',
        'socks5://u:%00@proxy.invalid:1080', 'socks5://u:%0d%0a@proxy.invalid:1080',
        `socks5://${'é'.repeat(128)}:p@proxy.invalid:1080`, `socks5://u:${'p'.repeat(256)}@proxy.invalid:1080`,
        `socks5://${'x'.repeat(2049)}:1080`])
        assert.equal(SocksProxyUrlSchema.safeParse(value).success, false, value.slice(0, 80));
});
test('private Docker aliases remain valid while URL and credential injection are rejected', () => {
    const { normalizeNodeAddress } = load(path.join(__dirname, '../src/common/axios/node-control-route.ts'));
    assert.equal(normalizeNodeAddress('node_service'), 'node_service');
    assert.equal(SocksProxyUrlSchema.safeParse('socks5://u:p@socks_proxy:1080').success, true);
    for (const value of ['https://node_service', 'u:p@node_service', 'node_service/path', 'node_service\n'])
        assert.equal(normalizeNodeAddress(value), null);
    assert.equal(SocksProxyUrlSchema.safeParse('socks5://socks_proxy:1080/path').success, false);
});
test('candidate order permits only management/reserve and normalizes duplicate IPv6', () => {
    assert.deepEqual(routeCandidates({ ...base, address: '[2001:db8::1]', ips: [
        ...base.ips, { ip: '192.0.2.9', status: 'OUTBOUND' }, { ip: '192.0.2.10', status: 'BLOCKED' },
        { ip: 'evil.invalid/path', status: 'MANAGEMENT' },
    ] }), ['2001:db8::1', '192.0.2.1']);
    assert.notEqual(routeRevision(base), routeRevision({ ...base, uuid: 'another' }));
    assert.notEqual(routeRevision(base), routeRevision({ ...base, proxyUrl: 'socks5://secret@proxy.invalid:1080' }));
});
test('authenticated fallback preserves fixed proxy/port, singleflight and fresh route evidence', async () => {
    const cache = new Cache(), resolver = new NodeControlRouteResolver(cache), calls = [];
    const config = { ...base, proxyUrl: 'socks5://private:password@proxy.invalid:1080' };
    const probe = async (opts, timeout) => { calls.push(opts); assert(timeout <= 2000);
        await new Promise(r => setImmediate(r)); return { healthy: opts.address !== base.address, code: 'refused' }; };
    const results = await Promise.all(Array.from({ length: 12 }, () => resolver.select(config, probe)));
    assert.equal(calls.length, 2); assert(results.every(r => r.address === '192.0.2.1'));
    assert(calls.every(r => r.proxyUrl === config.proxyUrl && r.port === 2222));
    await resolver.select(config, probe); assert.equal(calls.length, 2);
    const dto = resolver.diagnostics(config); assert.equal(dto.status, 'authenticated');
    assert.equal(dto.activeAddress, '192.0.2.1'); assert.equal(dto.viaProxy, true);
    assert(!JSON.stringify(dto).includes('password')); assert(!JSON.stringify(dto).includes('private'));
});
test('shared cursor eventually reaches candidates after the first three failures', async t => {
    let now = 100000; t.mock.method(Date, 'now', () => now);
    const cache = new Cache(), resolver = new NodeControlRouteResolver(cache);
    const config = { ...base, ips: Array.from({ length: 8 }, (_, i) => ({ ip: `192.0.2.${i + 1}`, status: 'MANAGEMENT' })) };
    const calls = [], probe = async opts => { calls.push(opts.address); return { healthy: opts.address === '192.0.2.6', code: 'timeout' }; };
    await assert.rejects(resolver.select(config, probe)); assert.equal(calls.length, 3);
    now += 11000;
    await assert.rejects(new NodeControlRouteResolver(cache).select(config, probe)); assert.equal(calls.length, 6);
    now += 11000;
    const selected = await new NodeControlRouteResolver(cache).select(config, probe);
    assert.equal(selected.address, '192.0.2.6'); assert.equal(calls.length, 7);
});
test('route cache is isolated by UUID and changed configuration', async () => {
    const cache = new Cache(), resolver = new NodeControlRouteResolver(cache); let calls = 0;
    const probe = async () => { calls++; return { healthy: true }; };
    await resolver.select(base, probe);
    await resolver.select({ ...base, uuid: 'another' }, probe);
    await resolver.select({ ...base, revision: 'edit-1' }, probe);
    assert.equal(calls, 3);
    assert.equal(resolver.diagnostics({ ...base, revision: 'edit-2' }).status, 'unverified');
});
test('in-flight probe limit is retained until actual probes settle', async () => {
    const cache = new Cache(), resolver = new NodeControlRouteResolver(cache), release = [];
    const probe = async () => new Promise(resolve => release.push(() => resolve({ healthy: true })));
    const pending = Array.from({ length: 8 }, (_, i) => resolver.select({ ...base, uuid: `node-${i}` }, probe));
    while (release.length !== 8) await new Promise(r => setImmediate(r));
    const overflow = resolver.select({ ...base, uuid: 'overflow' }, probe, 10);
    await assert.rejects(overflow, error => error.code === 'NODE_ROUTE_BUSY');
    release.forEach(fn => fn()); await Promise.all(pending);
});

const axios = require('axios');
const errors = { NODE_ERROR_WITH_MSG: { withMessage: message => ({ message }) },
    NODE_ERROR_500_WITH_MSG: { withMessage: message => ({ message }) }, INTERNAL_SERVER_ERROR: {} };
const { AxiosService } = load(path.join(__dirname, '../src/common/axios/axios.service.ts'), {
    '@nestjs/common': { Injectable: () => x => x, Logger: class { log() {} error() {} } },
    '@common/config/app-config/typed-config.service': {}, '@common/raw-cache': {},
    '@common/utils/bytes': { prettyBytesUtil: String }, '@common/utils/certs': { deriveSni: () => 'panel.invalid' },
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@common/utils/node-version': { nodeSupportsCompression: () => false },
    '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
    '@contract/constants': { ERRORS: errors },
    '../types': { ok: response => ({ isOk: true, response }), fail: error => ({ isOk: false, ...error }) },
});
function service(config = base) {
    const cache = new Cache(), registry = { get: async () => config, isCurrent: async () => true };
    const client = new AxiosService({ execute: async () => ({ isOk: true, response: { jwtToken: 'synthetic', caCert: '', clientCert: '', clientKey: '', jwtPublicKey: '' } }) }, cache, { getOrThrow: () => false }, registry);
    return { client, cache, registry };
}
test('health false/malformed are rejected; same-candidate legacy 404/405 status fallback remains', async () => {
    for (const health of [{ isAlive: false }, { isAlive: 'true' }, null, {}]) {
        const { client } = service(); let dispatched = 0;
        client.axiosInstance.get = async () => ({ data: { response: health } });
        client.axiosInstance.post = async () => { dispatched++; return { data: { response: {} } }; };
        const result = await client.request({ label: 'WRITE', opts: base, path: '/write' });
        assert.equal(result.isOk, false); assert.equal(dispatched, 0);
    }
    for (const status of [404, 405]) {
        const { client } = service(); const urls = [];
        client.axiosInstance.get = async url => {
            urls.push(url);
            if (!url.endsWith('/node/xray/status')) throw new axios.AxiosError('legacy', '', {}, {}, { status });
            return { data: { response: { isRunning: false } } };
        };
        client.axiosInstance.post = async () => ({ data: { response: {} } });
        assert.equal((await client.request({ label: 'WRITE', opts: base, path: '/write' })).isOk, true);
        assert.equal(new URL(urls[0]).hostname, new URL(urls[1]).hostname);
    }
});
test('POST and destructive GET dispatch once after ambiguous timeout; valid app errors keep route healthy', async () => {
    for (const method of ['post', 'get']) for (const status of [undefined, 500, 404, 401]) {
        const { client } = service(); let calls = 0;
        const dispatch = async (url, _body, config) => {
            if (!url.endsWith('/destructive')) return { data: { response: { isAlive: true } } };
            calls++; const options = method === 'get' ? _body : config;
            assert.equal(options.proxy, false); assert.equal(options.maxRedirects, 0); assert(options.signal);
            throw new axios.AxiosError('synthetic', 'ECONNABORTED', {}, {}, status ? { status } : undefined);
        };
        client.axiosInstance.get = dispatch; client.axiosInstance.post = dispatch;
        const result = await client.request({ label: 'CONTROL', opts: base, path: '/destructive', method });
        assert.equal(result.isOk, false); assert.equal(calls, 1);
        assert.equal((await client.connectionRoute(base)).status, status === 500 || status === 404 ? 'authenticated' : 'unavailable');
    }
});
test('edit detected before dispatch does not quarantine a healthy selected route', async () => {
    const { client, registry } = service(); registry.isCurrent = async () => false;
    client.axiosInstance.get = async () => ({ data: { response: { isAlive: true } } });
    let writes = 0; client.axiosInstance.post = async () => { writes++; };
    assert.equal((await client.request({ label: 'WRITE', opts: base, path: '/write' })).isOk, false);
    assert.equal(writes, 0); assert.equal((await client.connectionRoute(base)).status, 'authenticated');
});
test('SOCKS agent cache hashes keys, bounds size and destroys rotated/evicted agents', () => {
    const { client } = service();
    const first = client.resolveAgent('socks5://u:old@proxy.invalid:1080', 'owner'); let destroyed = 0;
    first.destroy = () => { destroyed++; };
    client.resolveAgent('socks5://u:new@proxy.invalid:1080', 'owner'); assert.equal(destroyed, 1);
    for (let i = 0; i < 140; i++) client.resolveAgent('socks5://u:p@proxy.invalid:1080', `node-${i}`);
    assert.equal(client.socksAgentCache.size, 128); assert.equal(client.nodeProxyAgents.size, 128);
    assert([...client.socksAgentCache.keys()].every(key => /^[a-f0-9]{64}$/.test(key)));
    client.socksAgentCache.forEach(agent => agent.destroy());
});
test('explicit legacy HTTP authority normalizes case while preserving exact port', t => {
    const previous = process.env.REMNACUST_LEGACY_HTTP_NODES;
    t.after(() => { if (previous === undefined) delete process.env.REMNACUST_LEGACY_HTTP_NODES; else process.env.REMNACUST_LEGACY_HTTP_NODES = previous; });
    process.env.REMNACUST_LEGACY_HTTP_NODES = 'LEGACY.EXAMPLE:2222,[2001:DB8::1]:2222';
    const { client } = service();
    assert.equal(client.getNodeUrl('LEGACY.EXAMPLE', '/health', 2222), 'http://legacy.example:2222/health');
    assert.equal(client.getNodeUrl('legacy.example', '/health', 2223), 'https://legacy.example:2223/health');
    assert.equal(client.getNodeUrl('2001:db8::1', '/health', 2222), 'http://[2001:db8::1]:2222/health');
});
test('disabled config never reads active cache or probes and retains disabled evidence', async () => {
    const cache = new Cache(), resolver = new NodeControlRouteResolver(cache); let reads = 0, probes = 0;
    cache.get = async () => { reads++; return null; };
    const config = { ...base, isDisabled: true };
    await assert.rejects(resolver.select(config, async () => { probes++; return { healthy: true }; }), /disabled/);
    assert.equal(reads, 0); assert.equal(probes, 0); assert.equal(resolver.diagnostics(config).status, 'disabled');
});
test('whole-selection cooldown covers fixed-window boundary while shared cursor survives', async t => {
    let now = 9999; t.mock.method(Date, 'now', () => now);
    const cache = new Cache(), resolver = new NodeControlRouteResolver(cache); let probes = 0;
    const config = { ...base, ips: Array.from({ length: 7 }, (_, i) => ({ ip: `192.0.2.${i + 1}`, status: 'RESERVE' })) };
    const probe = async () => { probes++; return { healthy: false, code: 'refused' }; };
    await assert.rejects(resolver.select(config, probe)); assert.equal(probes, 3);
    now = 10000;
    await assert.rejects(new NodeControlRouteResolver(cache).select(config, probe), /cooling down/);
    assert.equal(probes, 3);
});
test('forty distinct healthy nodes receive bounded fair admission without false failure', async () => {
    const cache = new Cache(), resolver = new NodeControlRouteResolver(cache); let active = 0, peak = 0;
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => resolver.select({ ...base, uuid: `fleet-${i}` }, async () => {
        active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--;
        return { healthy: true };
    })));
    assert.equal(results.length, 40); assert(peak <= 8);
});
test('explicit disabled-node STOP uses authenticated reserve once; other disabled commands perform no I/O', async () => {
    const config = { ...base, isDisabled: true }, { client, registry } = service(config);
    let reads = 0, stops = 0;
    const stop = require('@remnawave/node-contract').StopXrayCommand.url;
    registry.isCurrent = async (_, allowDisabled) => allowDisabled === true;
    client.axiosInstance.get = async url => {
        reads++;
        if (new URL(url).hostname === config.address) throw new axios.AxiosError('refused', 'ECONNREFUSED');
        if (new URL(url).pathname === stop) { stops++; return { data: { response: {} } }; }
        return { data: { response: { isAlive: true } } };
    };
    assert.equal((await client.managedCore(config)).isOk, false); assert.equal(reads, 0);
    assert.equal((await client.stopXray(config)).isOk, true); assert.equal(stops, 1); assert.equal(reads, 3);
});
test('expired queued admission rejects as local busy without a network probe or failure cooldown', async t => {
    let now = 0; t.mock.method(Date, 'now', () => now);
    const cache = new Cache(), resolver = new NodeControlRouteResolver(cache), releases = [];
    const pending = Array.from({ length: 8 }, (_, i) => resolver.select({ ...base, uuid: `held-${i}` },
        async () => new Promise(resolve => releases.push(() => resolve({ healthy: true })))));
    while (releases.length !== 8) await new Promise(r => setImmediate(r));
    let probes = 0;
    const ninth = resolver.select({ ...base, uuid: 'expired' }, async () => { probes++; return { healthy: true }; }, 1000);
    const rejected = assert.rejects(ninth, error => error.code === 'NODE_ROUTE_BUSY');
    while (!resolver.waiting.length) await new Promise(r => setImmediate(r));
    now = 1001; releases[0](); await rejected;
    releases.slice(1).forEach(fn => fn()); await Promise.all(pending);
    assert.equal(probes, 0);
    assert(![...cache.rows.keys()].some(key => key.startsWith('node-route:round-failure:')));
});
test('diagnostics distinguish local capacity from a node outage', async () => {
    const { NodeDiagnosticsService } = load(path.join(__dirname, '../src/modules/nodes/node-diagnostics.service.ts'), {
        '@common/axios': {}, '@common/raw-cache': {},
        '@common/helpers/error-handler.helper': { errorHandler: result => result.response },
        './node-port-plans.service': {}, './queries/get-node-by-uuid/get-node-by-uuid.query': { GetNodeByUuidQuery: class {} },
    });
    const diagnostics = new NodeDiagnosticsService({ execute: async () => ({ response: base }) }, {
        getSystemStats: async () => ({ isOk: false, code: 'NODE_ROUTE_BUSY' }),
        connectionRoute: async () => ({ status: 'authenticated', activeAddress: base.address, attempts: [] }),
    }, { incrementWithTtl: async () => 1, get: async () => null }, { get: async () => ({ status: 'APPLIED' }) });
    const report = await diagnostics.inspect(base.uuid);
    assert.deepEqual(report.checks[0], { id: 'connection', status: 'warning', code: 'busy' });
    assert.equal(report.connectionRoute.status, 'unverified'); assert.equal(report.connectionRoute.activeAddress, null);
});
