if (process.env.RC_DIAGNOSTIC_REDIS_FIXTURE === '1') {
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const original = Module._load;
    class Redis {
        constructor(options) { assert.equal(options.db, 1); assert.equal(options.keyPrefix, 'ioraw:'); this.values = new Map(); }
        on() {} async connect() {} async quit() {} disconnect() {}
        key(key) { assert.ok(key.startsWith('node-route:')); return 'ioraw:' + key; }
        async get(key) { const hit = this.values.get(this.key(key)); return hit && hit.until > Date.now() ? hit.value : null; }
        async set(key, value, ex, ttl) { this.values.set(this.key(key), { value, until: ex === 'EX' ? Date.now() + ttl * 1000 : Infinity }); }
        async ttl(key) { const hit = this.values.get(this.key(key)); return !hit ? -2 : hit.until === Infinity ? -1 : Math.floor((hit.until - Date.now()) / 1000); }
        async eval(script, count, key, ttl) { assert.equal(count, 1); assert.ok(script.includes("redis.call('INCR'")); const n = Number(await this.get(key) || 0) + 1; await this.set(key, String(n), 'EX', ttl); return n; }
    }
    Module._load = function(id, ...rest) { return id === 'ioredis' ? Redis : original.call(this, id, ...rest); };
    return;
}
require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const tls = require('node:tls');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src/common');
const certs = load(path.join(root, 'utils/certs/generate-certs.util.ts'));
const sni = load(path.join(root, 'utils/certs/generate-servername.util.ts'));
const { GetNodeHealthCheckCommand, GetSystemStatsCommand, StartXrayCommand } = require('@remnawave/node-contract');
const errors = {
    INTERNAL_SERVER_ERROR: { code: 'INTERNAL', message: 'internal' },
    NODE_ERROR_WITH_MSG: { withMessage: message => ({ code: 'NODE_ERROR', message }) },
    NODE_ERROR_500_WITH_MSG: { withMessage: message => ({ code: 'NODE_500', message }) },
};
const mocks = {
    '../constants/nodes/ip-statuses': load(path.join(__dirname,
        '../libs/contract/constants/nodes/ip-statuses/node-ip-statuses.constant.ts')),
    '@common/config/app-config/typed-config.service': {},
    '@common/raw-cache': {},
    '@common/database/prisma.service': {},
    '@common/utils/bytes': { prettyBytesUtil: String },
    '@common/utils/certs': sni,
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@common/utils/node-version': load(path.join(root, 'utils/node-version.ts')),
    '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
    '@contract/constants': { ERRORS: errors },
    '../types': load(path.join(root, 'types/result.type.ts')),
};
const { AxiosService } = load(path.join(root, 'axios/axios.service.ts'), mocks);
const { NodeRouteRegistryService } = load(path.join(root, 'axios/node-route-registry.service.ts'), mocks);

function cache() {
    const entries = new Map();
    return {
        async get(key) {
            const entry = entries.get(key);
            return entry && entry.until > Date.now() ? entry.value : null;
        },
        async set(key, value, ttl = 86400) {
            entries.set(key, { value, until: Date.now() + ttl * 1000 });
        },
        async incrementWithTtl(key, ttl) {
            const value = (await this.get(key) ?? 0) + 1;
            await this.set(key, value, ttl);
            return value;
        },
    };
}

test('exact published AxiosService discovers stock legacy nodes with strict mTLS/JWT/SNI', async t => {
    const master = await certs.generateMasterCerts();
    const keys = await certs.generateJwtKeypair();
    const token = jwt.sign({ fixture: 'legacy-regression' }, keys.privateKey,
        { algorithm: 'RS256', expiresIn: '5m' });
    const expectedSni = sni.deriveSni(master.caCertPem, keys.publicKey);
    const services = [];
    const servers = [];
    let version = '3.4.3';
    let delayMs = 0;
    let alive = true;
    let policyHttpStatus = null;
    let policyEnabled = false;
    let policyExpiry = 0;
    let retainedCore = false;
    let rejectedStart = null;
    let missingCoreStats = false;
    let missingHealthRoute = false;
    const requests = [];
    const stats = { xrayInfo: { uptime: 123 }, plugins: { torrentBlocker: { reportsCount: 0 } },
        system: { stats: {} } };
    async function node() {
        const leaf = await certs.generateNodeCert(master.caCertPem, master.caKeyPem);
        const context = tls.createSecureContext({ key: leaf.nodeKeyPem, cert: leaf.nodeCertPem,
            ca: master.caCertPem, minVersion: 'TLSv1.3' });
        const server = https.createServer({ key: leaf.nodeKeyPem, cert: leaf.nodeCertPem,
            ca: master.caCertPem, requestCert: true, rejectUnauthorized: true,
            minVersion: 'TLSv1.3', SNICallback(name, callback) {
                callback(name === expectedSni ? null : new Error('unknown sni'), context);
            } }, (req, res) => {
            assert.equal(req.socket.authorized, true);
            assert.equal(req.socket.servername, expectedSni);
            const decoded = jwt.verify(req.headers.authorization.slice(7), keys.publicKey,
                { algorithms: ['RS256'] });
            assert.ok(decoded.fixture === 'legacy-regression' ||
                (decoded.role === 'API' && decoded.uuid === null && decoded.username === null));
            requests.push(req.url);
            if (missingHealthRoute && req.url === GetNodeHealthCheckCommand.url) {
                req.socket.destroy();
                return;
            }
            if (req.url === '/node/xray/host-policy' && policyHttpStatus !== null) {
                res.writeHead(policyHttpStatus, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'fixture authorization rejection' }));
                return;
            }
            if (rejectedStart && req.url === StartXrayCommand.url) {
                req.resume();
                req.once('end', () => res.end(JSON.stringify({ response: rejectedStart })));
                return;
            }
            if (policyEnabled && req.url === '/node/xray/host-policy') {
                if (req.method === 'POST') {
                    req.resume();
                    req.once('end', () => {
                        policyExpiry = Date.now() + 90_000;
                        res.end(JSON.stringify({ response: { applied: true } }));
                    });
                } else res.end(JSON.stringify({ response: { supported: true, version: 'xera-host-policy-v2' } }));
                return;
            }
            if (![GetNodeHealthCheckCommand.url, GetSystemStatsCommand.url].includes(req.url)) {
                req.socket.destroy();
                return;
            }
            const response = req.url === GetNodeHealthCheckCommand.url
                ? { isAlive: alive, xrayInternalStatusCached: retainedCore, xrayVersion: retainedCore ? 'fixture-core' : null, nodeVersion: version }
                : { ...stats, xrayInfo: missingCoreStats ? null : stats.xrayInfo };
            const send = () => { if (!res.destroyed) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ response }));
            } };
            if (req.url === GetNodeHealthCheckCommand.url && delayMs) {
                const timer = setTimeout(send, delayMs);
                res.on('close', () => clearTimeout(timer));
            } else send();
        });
        server.on('tlsClientError', () => {});
        await new Promise((resolve, reject) => {
            server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
        });
        servers.push(server);
        return { uuid: '11111111-1111-4111-8111-111111111111', address: '127.0.0.1',
            port: server.address().port, proxyUrl: null, ips: [], isDisabled: false };
    }
    function client(row) {
        const memory = cache();
        const registry = new NodeRouteRegistryService({ nodes: {
            findMany: async () => [structuredClone(row)],
        } }, memory);
        let initialized = 0;
        const service = new AxiosService({ execute: async () => {
            initialized++;
            return { isOk: true, response: { jwtToken: token, jwtPublicKey: keys.publicKey,
                caCert: master.caCertPem, clientCert: master.clientCertPem, clientKey: master.clientKeyPem } };
        } }, memory, { getOrThrow: () => true }, registry);
        services.push(service);
        return { service, registry, memory, initialized: () => initialized };
    }
    try {
        const row = await node();
        await t.test('legacy versions need no custom capability or identity response, including a stopped core', async () => {
            for (version of ['3.4.1', '3.4.2', '3.4.3', '1.1.11']) {
                const { service, initialized } = client(row);
                const before = requests.length;
                const result = await service.getSystemStats(row);
                assert.equal(result.isOk, true, JSON.stringify(await service.connectionRoute(row)));
                assert.equal(result.response.xrayInfo.uptime, 123);
                assert.deepEqual(requests.slice(before), [GetSystemStatsCommand.url]);
                assert.equal(initialized(), 1, 'routeProbe must not recurse or reinitialize');
                assert.equal((await service.getNodeHealth(row)).response.xrayInternalStatusCached, false);
            }
        });
        await t.test('one actual service agent reaches different node certificates, and a wrong-route reset does not prevent fresh discovery', async () => {
            const other = await node();
            const { service } = client(row);
            const options = { httpsAgent: undefined, proxy: false, timeout: 4000, maxRedirects: 0 };
            await service.setJwt();
            options.httpsAgent = service.axiosInstance.defaults.httpsAgent;
            for (const target of [row, other, row]) {
                const base = `https://${target.address}:${target.port}`;
                assert.equal((await service.axiosInstance.get(base + GetNodeHealthCheckCommand.url, options)).data.response.isAlive, true);
                await assert.rejects(service.axiosInstance.get(base + '/node/xray/status', options),
                    error => error.code === 'ECONNRESET');
                assert.equal((await service.probeRoute(target, 2000)).healthy, true);
            }
        });
        await t.test('absent read-only diagnostics do not poison authenticated management routing', async () => {
            for (const [label, path] of [['HOST POLICY', '/node/xray/host-policy'],
                ['NODE RUNTIME', '/node/stats/runtime'], ['MANAGED CORE', '/node/xray/managed-core'],
                ['GET NODE XRAY LOGS', '/node/xray/logs']]) {
                const { service } = client(row);
                assert.equal((await service.getSystemStats(row)).isOk, true);
                const before = requests.length;
                const probe = await service.request({ label, opts: row, path, method: 'get', logAxiosError: false });
                assert.equal(probe.isOk, false);
                const result = await service.getSystemStats(row);
                const route = await service.connectionRoute(row);
                assert.equal(result.isOk, true, JSON.stringify({ result, route, dispatchedPaths: requests.slice(before) }));
            }
        });
        await t.test('repeated unsupported diagnostics cannot starve authenticated policy lease renewal', async sub => {
            let now = Date.now();
            sub.mock.method(Date, 'now', () => now);
            const { service } = client(row);
            policyEnabled = true;
            try {
                assert.equal((await service.hostPolicy(row, { revision: 'initial' })).isOk, true);
                for (let tick = 1; tick <= 12; tick++) {
                    now += 10_000;
                    assert(now < policyExpiry);
                    assert.equal((await service.nodeRuntime(row)).isOk, false);
                    assert.equal((await service.hostPolicy(row, { revision: String(tick) })).isOk, true);
                    assert.equal(policyExpiry, now + 90_000);
                    assert.equal((await service.getSystemStats(row)).isOk, true);
                }
            } finally {
                policyEnabled = false;
            }
        });
        await t.test('a refused live global update does not hide a positively verified retained core or publish new inbound tags', async () => {
            const previousVersion = version;
            version = '1.1.11-remnacust';
            retainedCore = true;
            try {
                for (const missing of [false, true]) {
                    missingCoreStats = missing;
                    rejectedStart = { isStarted: false, version: null,
                        error: 'runtime apply failed: rpc error: code = FailedPrecondition desc = Global core settings changed; preserve current sessions and apply this change during an explicit maintenance restart',
                        nodeInformation: { version } };
                    const { service, memory } = client(row);
                    let tagWrites = 0;
                    memory.setMany = async () => { tagWrites++; };
                    const before = requests.length;
                    const result = await service.startXray({ xrayConfig: { inbounds: [{ tag: 'new-unapplied' }], outbounds: [] },
                        internals: { forceRestart: false, hashes: { emptyConfig: 'fixture', inbounds: [] } } }, row);
                    assert.equal(result.isOk, true);
                    assert.equal(result.response.isStarted, !missing);
                    assert.match(result.response.error, /Global core settings changed/);
                    assert.equal(tagWrites, 0);
                    assert.equal(requests.slice(before).filter(p => p === StartXrayCommand.url).length, 1);
                }
            } finally {
                version = previousVersion;
                retainedCore = false;
                rejectedStart = null;
                missingCoreStats = false;
            }
        });
        await t.test('route failures retain a meaningful error instead of serializing Error as an empty object', async () => {
            const { service } = client(row);
            service.routeRegistry.get = async () => { throw new Error('Node route selection is cooling down'); };
            const result = await service.getSystemStats(row);
            assert.equal(result.isOk, false);
            assert.equal(result.message, 'Node route selection is cooling down');
            assert.notEqual(result.message, '{}');
        });
        await t.test('failed commands remain failures without quarantining a separately authenticated primary request', async () => {
            for (const status of [401, 403, null]) {
                const { service } = client(row);
                assert.equal((await service.getSystemStats(row)).isOk, true);
                policyHttpStatus = status;
                try {
                    const policy = await service.hostPolicy(row, status === null ? { fixture: true } : undefined);
                    assert.equal(policy.isOk, false);
                    assert.equal(policy.code, status === null ? 'ECONNRESET' : `NODE_HTTP_${status}`);
                    assert.equal((await service.connectionRoute(row)).status, 'unavailable');
                    assert.equal((await service.getSystemStats(row)).isOk, true);
                    assert.equal((await service.connectionRoute(row)).status, 'authenticated');
                } finally { policyHttpStatus = null; }
            }
        });
        await t.test('a sole registered legacy address needs no health preflight and ignores stale route cooldowns', async () => {
            const { service, memory } = client(row);
            const current = await service.routeRegistry.get(row);
            const { routeRevision } = load(path.join(root, 'axios/node-control-route.ts'));
            const revision = routeRevision(current);
            await memory.set(`node-route:round-failure:${revision}`, true, 30);
            await memory.set(`node-route:failure:${revision}:${row.address}`, true, 30);
            const before = requests.length;
            missingHealthRoute = true;
            try {
                for (let index = 0; index < 5; index++)
                    assert.equal((await service.getSystemStats(row)).isOk, true);
                assert.deepEqual(requests.slice(before), Array(5).fill(GetSystemStatsCommand.url));
                assert.equal((await service.connectionRoute(row)).status, 'authenticated');
            } finally { missingHealthRoute = false; }
        });
        if (process.env.RC_LIVE_DIAGNOSTIC) await t.test('standalone diagnostic uses actual registry with memory/Redis adapters and emits no supplied secret', async () => {
            const other = await node();
            other.uuid = '22222222-2222-4222-8222-222222222222';
            const { spawn } = require('node:child_process');
            const input = { keys: { privKey: keys.privateKey, pubKey: keys.publicKey,
                caCert: master.caCertPem, clientCert: master.clientCertPem, clientKey: master.clientKeyPem },
                nodes: [row, other], registryRows: [row, other] };
            for (const redisMode of [false, true]) {
            const args = redisMode ? ['--require', __filename, process.env.RC_LIVE_DIAGNOSTIC] : [process.env.RC_LIVE_DIAGNOSTIC];
            const child = spawn(process.execPath, args, {
                cwd: path.join(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, ...(redisMode ? { RC_DIAGNOSTIC_REDIS_FIXTURE: '1' } : {}) },
            });
            let output = '', stderr = '';
            child.stdout.on('data', chunk => { output += chunk; });
            child.stderr.on('data', chunk => { stderr += chunk; });
            const exited = new Promise((resolve, reject) => {
                child.once('error', reject); child.once('close', resolve);
            });
            child.stdin.end(JSON.stringify({ ...input, ...(redisMode ? { redisSocket: '/synthetic/valkey.sock' } : {}) }));
            assert.equal(await exited, 0, stderr);
            const records = output.trim().split('\n').map(line => JSON.parse(line));
            assert.equal(records.length, 4);
            assert.ok(records.every(record => record.isOk && record.probes.every(probe => probe.healthy)));
            assert.ok(records.every(record => record.registryMode === 'actual-source' &&
                record.registry.length > 0 && record.registry.every(event => event.ok && event.revisionPresent)));
            if (redisMode) {
                assert.ok(records.every(record => record.cacheMode === 'redis' && record.redisDb === 1 && record.sourceCachePrefix === 'ioraw:'));
                assert.ok(records.some(record => record.cache.some(event => event.operation === 'increment')));
                assert.ok(records.some(record => record.cache.some(event => event.kind === 'active' && event.hit && event.ttlPositive)));
            }
            assert.ok(records.every(record => record.wire.every(event =>
                event.tlsVerification && event.sniMatches && event.bearerPresent)));
            for (const secret of [...Object.values(input.keys), token, expectedSni])
                assert.ok(!output.includes(secret) && !stderr.includes(secret), 'diagnostic exposed a supplied secret');
            }
        });
        await t.test('a valid authenticated health reply at 2200ms fits the 15000ms stats request budget', async () => {
            delayMs = 2200;
            const { service } = client(row);
            const result = await service.getSystemStats(row);
            const route = await service.connectionRoute(row);
            assert.equal(result.isOk, true, JSON.stringify({ result, route }));
            assert.equal(route.status, 'authenticated');
        });
    } finally {
        for (const service of services) {
            service.axiosInstance.defaults.httpsAgent?.destroy();
            for (const agent of service.socksAgentCache.values()) agent.destroy();
        }
        await Promise.all(servers.map(server => new Promise(resolve => {
            server.closeAllConnections(); server.close(resolve);
        })));
    }
});
