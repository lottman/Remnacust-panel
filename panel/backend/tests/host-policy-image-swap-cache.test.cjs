const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { zstdDecompressSync } = require('node:zlib');
const contract = require('@remnawave/node-contract');
const load = require('./load-typescript.cjs');
const { fixture: policyFixture } = require('./host-policy-startup-isolation.test.cjs');

const source = path.join(__dirname, '../src/common');
const { AxiosService } = load(path.join(source, 'axios/axios.service.ts'), {
    '@common/config/app-config/typed-config.service': {},
    '@common/raw-cache': {},
    '@common/xray-mode/xray-mode.service': {},
    '@common/utils/bytes': { prettyBytesUtil: String },
    '@common/utils/certs': { deriveSni: () => 'fixture.invalid' },
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@common/utils/node-version': load(path.join(source, 'utils/node-version.ts')),
    '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
    '../types': load(path.join(source, 'types/result.type.ts')),
    '@contract/constants': {
        ERRORS: {
            NODE_ERROR_WITH_MSG: { withMessage: (message) => ({ code: 'NODE_ERROR', message }) },
            NODE_ERROR_500_WITH_MSG: { withMessage: (message) => ({ code: 'NODE_500', message }) },
        },
    },
});

async function fixture(t) {
    const f = policyFixture();
    const calls = [];
    let version = '3.4.6';
    const server = http.createServer(async (req, res) => {
        try {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            let buffer = Buffer.concat(chunks);
            if (req.headers['content-encoding'] === 'zstd') buffer = zstdDecompressSync(buffer);
            const body = buffer.length ? JSON.parse(buffer.toString()) : null;
            calls.push({
                path: req.url,
                method: req.method,
                encoding: req.headers['content-encoding'],
                body,
            });
            res.setHeader('content-type', 'application/json');
            let response;
            if (req.url === contract.GetNodeHealthCheckCommand.url)
                response = {
                    isAlive: true,
                    xrayInternalStatusCached: false,
                    nodeVersion: version,
                    pluginSyncAckSupported: true,
                };
            else if (req.url === contract.GetSystemStatsCommand.url)
                response = { xrayInfo: null, nodeInformation: { version } };
            else if (req.url === contract.SyncCommand.url) response = { accepted: true };
            else if (req.url === '/node/xray/host-policy') {
                assert.equal(
                    version,
                    '1.1.38-remnacust',
                    'stock proof must come from actual health',
                );
                if (req.method === 'POST') {
                    f.posts.push({ uuid: f.node.uuid, body });
                    response = { version: 'xera-host-policy-v2', applied: false, staged: true };
                } else
                    response = {
                        ...f.state.caps,
                        offlineReserves: null,
                        coreProcessId: null,
                        quotaReservesSupported: true,
                    };
            } else if (req.url === contract.StartXrayCommand.url) {
                f.starts.push({ body });
                response = {
                    isStarted: true,
                    error: null,
                    version: '1.1.22',
                    nodeInformation: { version },
                    system: null,
                };
            } else throw Error('Unexpected fixture endpoint');
            res.end(JSON.stringify({ response }));
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    Object.assign(f.node, {
        address: '127.0.0.1',
        port,
        controlAddresses: [{ address: '127.0.0.1', enabled: true }],
        ips: [],
    });
    Object.assign(f.inventory[0], f.node);
    f.inventory.splice(1);
    f.host.boundNodes = [f.node.uuid];
    const originalRevision = f.node.controlRevision;
    const allowlist = process.env.REMNACUST_LEGACY_HTTP_NODES;
    process.env.REMNACUST_LEGACY_HTTP_NODES = `127.0.0.1:${port}`;
    t.after(async () => {
        if (allowlist === undefined) delete process.env.REMNACUST_LEGACY_HTTP_NODES;
        else process.env.REMNACUST_LEGACY_HTTP_NODES = allowlist;
        service.axiosInstance.defaults.httpsAgent?.destroy?.();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    const registry = {
        get: async () => ({ ...f.node, revision: f.node.controlRevision }),
        isCurrent: async () => true,
    };
    const cache = f.policies.cache;
    cache.incrementWithTtl = async (key) => {
        const next = (f.values.get(key) ?? 0) + 1;
        f.values.set(key, next);
        return next;
    };
    const service = new AxiosService({}, cache, {}, registry);
    service.mtlsOptions = {};
    service.logger = { log() {}, warn() {}, error() {} };
    f.policies.axios = service;
    f.configuration.axios = service;
    const nativeProof = () =>
        [...f.values.entries()].find(([key]) =>
            key.startsWith('xera:host-policy:capabilities:v2:' + f.node.uuid + ':'),
        )?.[1];
    return {
        ...f,
        service,
        calls,
        nativeProof,
        originalRevision,
        swap: () => {
            version = '1.1.38-remnacust';
        },
        restoreStock: () => {
            version = '3.4.6';
        },
        expireProof: () => {
            nativeProof().checkedAt = Date.now() - 60_001;
        },
        warm: async () => {
            assert.equal((await service.getNodeHealth(f.node)).response.nodeVersion, '3.4.6');
            await f.policies.withCompatibilitySnapshot([f.node.uuid], async () => {});
            assert.equal(nativeProof().native, true);
        },
    };
}

test('same-revision image swap: system stats retain old version, explicit health refreshes it', async (t) => {
    const f = await fixture(t);
    await f.warm();
    f.swap();
    assert.equal((await f.service.getSystemStats(f.node)).isOk, true);
    assert.equal((await f.service.getNodeVersion(f.node)).response, '3.4.6');
    assert.equal((await f.service.getNodeHealth(f.node)).response.nodeVersion, '1.1.38-remnacust');
    assert.equal((await f.service.getNodeVersion(f.node)).response, '1.1.38-remnacust');
    assert.equal(
        f.nativeProof().native,
        true,
        'health does not invalidate independent policy proof',
    );
    assert.equal(f.node.controlRevision, f.originalRevision);
});

test('same-revision native-to-custom startup refreshes the target proof and stages policy before START', async (t) => {
    const f = await fixture(t);
    await f.warm();
    f.swap();
    await f.run();
    assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    assert.equal(f.posts.length, 1);
    const policy = f.calls.findIndex(
        (call) => call.path === '/node/xray/host-policy' && call.method === 'POST',
    );
    assert.ok(policy >= 0);
    assert.ok(policy < f.calls.findIndex((call) => call.path === contract.StartXrayCommand.url));
    assert.equal((await f.service.getNodeVersion(f.node)).response, '1.1.38-remnacust');
    const start = f.calls.find((call) => call.path === contract.StartXrayCommand.url);
    assert.equal(start.encoding, 'zstd');
    assert(start.body.xrayConfig);
    assert(start.body.internals);
    assert.equal(f.node.controlRevision, f.originalRevision);
    assert.equal(f.nativeProof().native, false);
    assert.equal(f.values.get(`remnacust:node-compatibility:${f.node.uuid}`), null);
});

test('same-revision native-to-custom startup closes missing-statistics quota on the first attempt', async (t) => {
    const f = await fixture(t);
    f.host.userLimit = '1024';
    await f.warm();
    f.swap();
    await f.run();
    assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    assert.equal(f.posts.length, 1);
    assert.equal(f.posts[0].body.groups[`host:${f.host.uuid}`].blockAll, true);
    assert.equal(Object.hasOwn(f.posts[0].body, 'offlineReserves'), false);
});

test('same-revision rollback to stock refreshes the target proof before sending configuration', async (t) => {
    const f = await fixture(t);
    f.swap();
    await f.run();
    assert.equal(f.nativeProof().native, false);
    f.restoreStock();
    await f.run();
    assert.equal(f.starts.length, 2, f.node.lastStatusMessage);
    assert.equal(f.posts.length, 1);
    assert.equal(f.nativeProof().native, true);
    assert.equal(f.node.controlRevision, f.originalRevision);
});

test('a second image change during startup still fails closed and recovers on retry', async (t) => {
    const f = await fixture(t);
    await f.warm();
    f.swap();
    const health = f.service.getNodeHealth.bind(f.service);
    let expire = true;
    f.service.getNodeHealth = async (...args) => {
        const result = await health(...args);
        if (expire && f.nativeProof()?.native === false) {
            expire = false;
            f.expireProof();
            f.restoreStock();
        }
        return result;
    };
    const failures = [];
    const sync = f.policies.syncNode.bind(f.policies);
    f.policies.syncNode = async (...args) => {
        try {
            return await sync(...args);
        } catch (error) {
            failures.push(error);
            throw error;
        }
    };
    await f.run();
    assert.equal(f.starts.length, 0);
    assert.equal(f.posts.length, 0);
    assert.equal(f.node.isConnected, false);
    assert.match(f.node.lastStatusMessage, /^\[HOST_POLICY_PENDING\]/);
    assert.equal(failures.length, 1);
    assert.match(failures[0].message, /host policy compatibility changed after discovery/);
    await f.run();
    assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    assert.equal(f.posts.length, 0);
    assert.equal(f.nativeProof().native, true);
});
