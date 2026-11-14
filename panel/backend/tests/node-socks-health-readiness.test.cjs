const test = require('node:test');
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const net = require('node:net');
const jwt = require('jsonwebtoken');
const load = require('./load-typescript.cjs');
const { nodeSource } = require('./component-paths.cjs');
const { GetNodeHealthCheckCommand, GetSystemStatsCommand } = require('@remnawave/node-contract');

const source = path.join(__dirname, '../src');
const certs = load(path.join(source, 'common/utils/certs/generate-certs.util.ts'));
const sni = load(path.join(source, 'common/utils/certs/generate-servername.util.ts'));
const { CACHE_KEYS, CACHE_KEYS_TTL } = load(
    path.join(__dirname, '../libs/contract/constants/cache-keys/cache-keys.constants.ts'),
);
const profileTraffic = load(path.join(source, 'common/axios/profile-traffic.schema.ts'));
const { getNodeHealth } = load(
    path.join(__dirname, '../../frontend/src/shared/utils/node-health.ts'),
);
const { GetNodeHealthCheckResponseModel } = load(
    path.join(nodeSource, 'src/modules/xray-core/models/get-node-health-check.model.ts'),
);
const { GetSystemStatsResponseModel } = load(
    path.join(nodeSource, 'src/modules/stats/models/get-system-stats.response.model.ts'),
);
const nodeErrors = {
    INTERNAL_SERVER_ERROR: { code: 'INTERNAL', message: 'internal' },
    NODE_ERROR_WITH_MSG: {
        code: 'NODE_ERROR',
        withMessage: (message) => ({ code: 'NODE_ERROR', message }),
    },
    NODE_ERROR_500_WITH_MSG: {
        code: 'NODE_500',
        withMessage: (message) => ({ code: 'NODE_500', message }),
    },
};
const { AxiosService } = load(path.join(source, 'common/axios/axios.service.ts'), {
    '@common/config/app-config/typed-config.service': {},
    '@common/raw-cache': {},
    '@common/utils/bytes': { prettyBytesUtil: String },
    '@common/utils/certs': sni,
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@common/utils/node-version': load(path.join(source, 'common/utils/node-version.ts')),
    '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
    '@contract/constants': { ERRORS: nodeErrors },
    '../types': {
        ok: (response) => ({ isOk: true, response }),
        fail: (error) => ({ isOk: false, ...error }),
    },
});

class UpdateNodeCommand {
    constructor(value) {
        this.value = value;
    }
}
class GetNodeByUuidQuery {
    constructor(uuid) {
        this.uuid = uuid;
    }
}
const processorFile = path.join(source, 'queue/_nodes/processors/node-health-check.processor.ts');
const processorMocks = {};
for (const match of fs.readFileSync(processorFile, 'utf8').matchAll(/from '([^']+)'/g))
    if (match[1].startsWith('@') || match[1].startsWith('.')) processorMocks[match[1]] = {};
const { NodeHealthCheckQueueProcessor } = load(processorFile, {
    ...processorMocks,
    '@nestjs/common': {
        Logger: class {
            log() {}
            warn() {}
            error() {}
        },
    },
    '@nestjs/bullmq': { Processor: () => (value) => value, WorkerHost: class {} },
    '@contract/constants': { ERRORS: nodeErrors },
    '@common/axios/profile-traffic.schema': profileTraffic,
    '@common/host-policy/sync-host-policy-for-start': {
        hostPolicyRetryKey: (uuid) => `retry:${uuid}`,
    },
    '@libs/contracts/constants': {
        CACHE_KEYS,
        CACHE_KEYS_TTL,
        EVENTS: { NODE: { CONNECTION_LOST: 'lost', CONNECTION_RESTORED: 'restored' } },
    },
    '@modules/nodes/commands/update-node': { UpdateNodeCommand },
    '@modules/nodes/queries/get-node-by-uuid': { GetNodeByUuidQuery },
    '@integration-modules/notifications/interfaces': { NodeEvent: class {} },
    '@queue/queue.enum': { QUEUES_NAMES: { NODES: { HEALTH_CHECK: 'health' } } },
    '../constants/nodes-job-name.constant': { NODES_JOB_NAMES: { NODE_HEALTH_CHECK: 'health' } },
});

function memoryCache() {
    const values = new Map();
    return {
        async get(key) {
            const entry = values.get(key);
            return entry && entry.until > Date.now() ? entry.value : null;
        },
        async getString(key) {
            return this.get(key);
        },
        async set(key, value, ttl = 60) {
            values.set(key, { value, until: Date.now() + ttl * 1000 });
        },
        async incrementWithTtl(key, ttl) {
            const next = ((await this.get(key)) ?? 0) + 1;
            await this.set(key, next, ttl);
            return next;
        },
        async setMany(entries) {
            for (const entry of entries) await this.set(entry.key, entry.value, entry.ttlSeconds);
        },
        async delMany(keys) {
            for (const key of keys) values.delete(key);
        },
        async observeNodeIncident(_uuid, _at, healthy, muted, previouslyConnected) {
            return muted
                ? 0
                : healthy
                  ? Number(!previouslyConnected) * 2
                  : Number(previouslyConnected);
        },
        async acknowledgeNodeIncident() {},
    };
}

async function listen(server, host) {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, host, resolve);
    });
    return server.address().port;
}

async function close(server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
}

async function bounded(promise) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('local socket cleanup timed out')), 2000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function fixture(t, address, credentials) {
    const { master, cert, keys, token } = credentials;
    const originSockets = new Set();
    const proxySockets = new Set();
    const healthReplies = [];
    const requests = [];
    let coreReady = true;
    let rejectProxy = false;
    let tunnels = 0;
    let originConnections = 0;
    let proxyConnections = 0;
    let proxy;
    let axios;
    const expectedSni = sni.deriveSni(master.caCertPem, keys.publicKey);
    const uuid = '11111111-1111-4111-8111-111111111111';
    const binding = {
        capability: 'remnacust-profile-traffic-v1',
        coreProcessId: '22222222-2222-4222-8222-222222222222',
        capturedAt: new Date().toISOString(),
        bindings: [],
    };
    const systemStats = { memoryUsed: 16, memoryFree: 48, loadAvg: [0.05, 0, 0], interface: null };
    const origin = https.createServer(
        {
            key: cert.nodeKeyPem,
            cert: cert.nodeCertPem,
            ca: master.caCertPem,
            requestCert: true,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.3',
        },
        (req, res) => {
            assert.equal(req.socket.authorized, true);
            assert.equal(req.socket.servername, expectedSni);
            const claims = jwt.verify(req.headers.authorization.slice(7), keys.publicKey, {
                algorithms: ['RS256'],
            });
            assert.equal(claims.fixture, 'local-socks-readiness');
            requests.push(req.url);
            res.setHeader('Content-Type', 'application/json');
            if (req.url === GetNodeHealthCheckCommand.url) {
                const body = {
                    response: new GetNodeHealthCheckResponseModel(
                        true,
                        coreReady,
                        '26.11.9',
                        '1.1.34',
                    ),
                };
                GetNodeHealthCheckCommand.ResponseSchema.parse(body);
                healthReplies.push(body.response.xrayInternalStatusCached);
                res.end(JSON.stringify(body));
            } else if (req.url === GetSystemStatsCommand.url && coreReady) {
                const xray = {
                    numGoroutine: 1,
                    numGC: 0,
                    alloc: 1,
                    totalAlloc: 1,
                    sys: 1,
                    mallocs: 1,
                    frees: 0,
                    liveObjects: 1,
                    pauseTotalNs: 0,
                    uptime: 321,
                };
                res.end(
                    JSON.stringify({
                        response: new GetSystemStatsResponseModel(
                            xray,
                            { torrentBlocker: { reportsCount: 0 } },
                            systemStats,
                            true,
                            binding,
                        ),
                    }),
                );
            } else {
                assert.equal(req.url, GetSystemStatsCommand.url);
                res.writeHead(503);
                res.end(JSON.stringify({ message: 'Core is not ready' }));
            }
        },
    );
    origin.on('connection', (socket) => {
        originConnections++;
        originSockets.add(socket);
        socket.on('close', () => originSockets.delete(socket));
    });
    origin.on('tlsClientError', () => {});
    t.after(async () => {
        axios?.axiosInstance.defaults.httpsAgent?.destroy();
        for (const agent of axios?.socksAgentCache.values() ?? []) agent.destroy();
        for (const socket of proxySockets) socket.destroy();
        for (const socket of originSockets) socket.destroy();
        if (proxy) await close(proxy);
        await close(origin);
    });
    const port = await listen(origin, address);
    if (address === '::1') {
        try {
            await new Promise((resolve, reject) => {
                const probe = net.connect({ host: address, port });
                probe.setTimeout(1000, () => {
                    probe.destroy();
                    reject(new Error('IPv6 loopback probe timed out'));
                });
                probe.once('connect', () => {
                    probe.destroy();
                    resolve();
                });
                probe.once('error', (error) => {
                    probe.destroy();
                    reject(error);
                });
            });
        } catch (error) {
            if (
                process.platform === 'win32' &&
                error.code === 'EACCES' &&
                process.env.REMNACUST_REQUIRE_IPV6_TESTS !== '1'
            ) {
                t.skip('Windows denies even a raw TCP connection to IPv6 loopback');
                return null;
            }
            throw error;
        }
    }
    proxy = net.createServer((socket) => {
        proxyConnections++;
        proxySockets.add(socket);
        socket.on('close', () => proxySockets.delete(socket));
        socket.on('error', () => {});
        let buffer = Buffer.alloc(0);
        let stage = 0;
        const receive = (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            if (stage === 0) {
                if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
                assert.equal(buffer[0], 5);
                if (rejectProxy) {
                    socket.end(Buffer.from([5, 255]));
                    return;
                }
                buffer = buffer.subarray(2 + buffer[1]);
                stage = 1;
                socket.write(Buffer.from([5, 0]));
            }
            const addressLength = address === '::1' ? 16 : 4;
            const requestLength = 4 + addressLength + 2;
            if (stage !== 1 || buffer.length < requestLength) return;
            assert.deepEqual([...buffer.subarray(0, 4)], [5, 1, 0, addressLength === 16 ? 4 : 1]);
            const expectedAddress =
                addressLength === 16
                    ? Buffer.concat([Buffer.alloc(15), Buffer.from([1])])
                    : Buffer.from([127, 0, 0, 1]);
            assert.deepEqual(buffer.subarray(4, 4 + addressLength), expectedAddress);
            assert.equal(buffer.readUInt16BE(4 + addressLength), port);
            stage = 2;
            socket.off('data', receive);
            const upstream = net.connect(port, address, () => {
                tunnels++;
                socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
                if (buffer.length > requestLength) upstream.write(buffer.subarray(requestLength));
                socket.pipe(upstream).pipe(socket);
            });
            proxySockets.add(upstream);
            upstream.on('close', () => {
                proxySockets.delete(upstream);
                socket.destroy();
            });
            upstream.on('error', () => socket.destroy());
            socket.on('close', () => upstream.destroy());
        };
        socket.on('data', receive);
    });
    const proxyPort = await listen(proxy, '127.0.0.1');
    const config = { uuid, address, port, proxyUrl: `socks5://127.0.0.1:${proxyPort}`, ips: [] };
    const cache = memoryCache();
    axios = new AxiosService(
        {
            execute: async () => ({
                isOk: true,
                response: {
                    jwtToken: token,
                    jwtPublicKey: keys.publicKey,
                    caCert: master.caCertPem,
                    clientCert: master.clientCertPem,
                    clientKey: master.clientKeyPem,
                },
            }),
        },
        cache,
        { getOrThrow: () => true },
        { get: async () => config, isCurrent: async () => true },
    );
    axios.logger = { log() {}, error() {}, warn() {} };
    const state = { uuid, isConnected: true, isConnecting: false, isDisabled: false };
    const starts = [];
    const processor = new NodeHealthCheckQueueProcessor(
        {
            execute: async (command) => {
                assert(command instanceof UpdateNodeCommand);
                Object.assign(state, command.value);
                return { isOk: true, response: { ...state } };
            },
        },
        { emitAsync: async () => {} },
        axios,
        { startNode: async (value) => starts.push(value) },
        cache,
        { record: async () => {} },
        {
            execute: async (query) => {
                assert(query instanceof GetNodeByUuidQuery);
                return { isOk: true, response: { ...state } };
            },
        },
    );
    const info = { memoryTotal: 64, cpus: 1 };
    await cache.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), info);
    return {
        axios,
        cache,
        state,
        starts,
        healthReplies,
        requests,
        config,
        setCoreReady(value) {
            coreReady = value;
        },
        async poll() {
            await processor.process({
                timestamp: Date.now(),
                data: {
                    nodeUuid: uuid,
                    isConnected: state.isConnected,
                    connectionOpts: config,
                },
            });
        },
        async cardHealth() {
            const stats = await cache.get(CACHE_KEYS.NODE_SYSTEM_STATS(uuid));
            return getNodeHealth({
                ...state,
                xrayUptime: (await cache.get(CACHE_KEYS.NODE_XRAY_UPTIME(uuid))) ?? 0,
                configProfile: { activeConfigProfileUuid: uuid, activeInbounds: ['fixture'] },
                system: stats ? { info, stats } : null,
            });
        },
        counts() {
            return { tunnels, originConnections, proxyConnections };
        },
        async loseTunnelAndRejectProxy() {
            const agent = [...axios.socksAgentCache.values()][0];
            const pooled = [
                ...Object.values(agent.freeSockets),
                ...Object.values(agent.sockets),
            ].flat();
            assert.equal(
                pooled.length,
                1,
                'health polls must reuse one authenticated SOCKS tunnel',
            );
            const closed = pooled.map(
                (socket) => new Promise((resolve) => socket.once('close', resolve)),
            );
            rejectProxy = true;
            for (const socket of originSockets) socket.destroy();
            await bounded(Promise.all(closed));
        },
        async stopProxy() {
            for (const socket of proxySockets) socket.destroy();
            await close(proxy);
            proxy = undefined;
        },
    };
}

test(
    'SOCKS keep-alive propagates Core-down into node health and stays closed after tunnel loss',
    { timeout: 20000 },
    async (t) => {
        const master = await certs.generateMasterCerts();
        const cert = await certs.generateNodeCert(master.caCertPem, master.caKeyPem);
        const keys = await certs.generateJwtKeypair();
        const token = jwt.sign({ fixture: 'local-socks-readiness' }, keys.privateKey, {
            algorithm: 'RS256',
            expiresIn: '5m',
        });
        for (const address of ['127.0.0.1', '::1']) {
            await t.test(address, { timeout: 8000 }, async (subtest) => {
                const f = await fixture(subtest, address, { master, cert, keys, token });
                if (!f) return;
                const ready = await f.axios.getNodeHealth(f.config);
                assert.equal(ready.isOk, true);
                assert.equal(ready.response.xrayInternalStatusCached, true);
                await f.poll();
                assert.equal(await f.cache.get(CACHE_KEYS.NODE_XRAY_UPTIME(f.state.uuid)), 321);
                assert.equal((await f.cardHealth()).level, 'healthy');
                await f.cache.set(CACHE_KEYS.NODE_USERS_ONLINE(f.state.uuid), 7);
                assert.ok(await f.cache.get(profileTraffic.nodeBindingTrafficKey(f.state.uuid)));

                f.setCoreReady(false);
                await f.poll();
                assert.deepEqual(f.healthReplies, [true, false]);
                assert.equal(
                    f.counts().tunnels,
                    1,
                    'Core-down must arrive over the existing keep-alive tunnel',
                );
                assert.deepEqual(f.requests, [
                    GetNodeHealthCheckCommand.url,
                    GetSystemStatsCommand.url,
                    GetSystemStatsCommand.url,
                    GetNodeHealthCheckCommand.url,
                ]);
                for (const key of [
                    CACHE_KEYS.NODE_SYSTEM_STATS(f.state.uuid),
                    CACHE_KEYS.NODE_XRAY_UPTIME(f.state.uuid),
                    CACHE_KEYS.NODE_USERS_ONLINE(f.state.uuid),
                    profileTraffic.nodeBindingTrafficKey(f.state.uuid),
                ]) {
                    assert.equal(
                        await f.cache.get(key),
                        null,
                        `confirmed Core-down retained ${key}`,
                    );
                }
                assert.equal(f.state.isConnected, false);
                const down = await f.cardHealth();
                assert.notEqual(down.level, 'healthy');
                assert.equal(down.score, 0);
                assert.equal(f.starts.length, 1);

                await new Promise(setImmediate);
                await f.loseTunnelAndRejectProxy();
                const before = f.counts();
                const requestCount = f.requests.length;
                const failed = await f.axios.getNodeHealth(f.config);
                assert.equal(failed.isOk, false);
                assert.ok(f.counts().proxyConnections > before.proxyConnections);
                assert.equal(
                    f.counts().originConnections,
                    before.originConnections,
                    'a failed proxy opened a direct connection',
                );
                assert.equal(
                    f.requests.length,
                    requestCount,
                    'a failed proxy sent a direct authenticated request',
                );
                assert.notEqual((await f.cardHealth()).level, 'healthy');

                await f.stopProxy();
                const offline = f.counts();
                assert.equal((await f.axios.getNodeHealth(f.config)).isOk, false);
                assert.equal(f.counts().proxyConnections, offline.proxyConnections);
                assert.equal(
                    f.counts().originConnections,
                    offline.originConnections,
                    'an offline proxy fell back to a direct connection',
                );
                assert.equal(f.requests.length, requestCount);
            });
        }
    },
);
