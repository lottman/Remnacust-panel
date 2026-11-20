const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const { zstdDecompressSync } = require('node:zlib');
const contract = require('@remnawave/node-contract');
const load = require('./load-typescript.cjs');

const source = path.join(__dirname, '../src/common');
const routes = load(path.join(source, 'axios/node-control-route.ts'));
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
    './node-control-route': routes,
    '@contract/constants': {
        ERRORS: {
            NODE_ERROR_WITH_MSG: { withMessage: (message) => ({ code: 'NODE_ERROR', message }) },
            NODE_ERROR_500_WITH_MSG: { withMessage: (message) => ({ code: 'NODE_500', message }) },
        },
    },
});
const { NodeRouteRegistryService } = load(
    path.join(source, 'axios/node-route-registry.service.ts'),
    {
        './node-route-inventory.service': {},
        './node-control-route': routes,
        '../constants/nodes/ip-statuses': load(
            path.join(__dirname, '../libs/contract/constants/nodes/ip-statuses/index.ts'),
        ),
    },
);

function deferred() {
    let resolve;
    const promise = new Promise((complete) => {
        resolve = complete;
    });
    return { promise, resolve };
}

test(
    'evicting transient records during plugin dispatch cannot weaken an already learned strict ACK',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        const getVersion = f.service.getNodeVersion.bind(f.service);
        f.service.getNodeVersion = async (opts) => {
            const result = await getVersion(opts);
            f.service.nodeVersions.clear();
            return result;
        };
        const result = await f.service.syncNodePlugins({ plugin: null }, f.opts);
        assert.equal(result.isOk, false);
        assert.equal(f.members[0].calls.at(-1).path, contract.SyncCommand.url);
    },
);

test(
    'different UUIDs cannot share version evidence even when their row revision and legacy endpoint match',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        await f.service.getNodeVersion(f.opts);
        const uuid = randomUUID();
        f.commit(f.members[1], { uuid, controlRevision: f.revision() });
        const second = await f.service.getNodeVersion({ ...f.opts, uuid });
        assert.equal(second.response, '2.2.0');
        assert.equal(f.healthCalls(), 2);
    },
);

test(
    'a public health fallback cannot infer legacy capabilities on a node registered after the native failure',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        f.members[0].healthStatus = 404;
        f.members[0].healthHook = () => f.commit(f.members[1]);
        const health = await f.service.getNodeHealth(f.opts);
        assert.equal(health.code, 'NODE_ROUTE_BUSY');
        assert.equal(f.members[1].calls.length, 0);
        assert.equal(f.service.nodeVersions.size, 0);
    },
);

test(
    'queued revision hints cannot override the authoritative version context',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        const staleRevision = f.revision();
        await f.service.getNodeVersion(f.opts);
        const currentRevision = f.commit(f.members[1]);
        const result = await f.service.getNodeVersion({
            ...f.opts,
            controlRevision: staleRevision,
            nodeControlRevision: staleRevision,
        });
        assert.equal(result.response, '2.2.0');
        assert.equal(result.nodeControlRevision, currentRevision);
    },
);

test('a legacy inventory socket reset is classified only after a current authenticated health reply', async (t) => {
    const f = await fixture(t);
    const node = f.members[0];
    const scan = () => f.service.getNodeNetworkAddresses(f.opts, f.revision());
    node.version = '3.4.2';

    const data = await scan();
    assert.deepEqual(data.response, { addresses: ['192.0.2.1', '2001:db8::1'], complete: true });
    assert.deepEqual(
        node.calls.map(({ path }) => path),
        [contract.GetNetworkAddressesCommand.url],
    );

    node.inventoryReset = true;
    const unsupported = await scan();
    assert.equal(unsupported.code, 'NODE_NETWORK_ADDRESSES_UNSUPPORTED');
    assert.equal(node.calls.at(-1).path, contract.GetNodeHealthCheckCommand.url);

    node.version = '1.1.39-remnacust';
    assert.equal((await scan()).code, 'ECONNRESET');
    node.version = '1.1.39';
    assert.equal((await scan()).code, 'ECONNRESET');
    node.version = '3.4.7';
    assert.equal((await scan()).code, 'ECONNRESET');
    node.version = '3.4.2-custom';
    assert.equal((await scan()).code, 'ECONNRESET');
    node.version = '3.4.2+custom';
    assert.equal((await scan()).code, 'ECONNRESET');
    node.version = '1.1.37-remnacust';
    assert.equal((await scan()).code, 'NODE_NETWORK_ADDRESSES_UNSUPPORTED');

    node.version = '3.4.2';
    node.healthStatus = 401;
    assert.equal((await scan()).code, 'ECONNRESET');
});

test('a reset cannot be classified using a different control revision or node', async (t) => {
    const f = await fixture(t);
    const originalRevision = f.revision();
    f.members[0].inventoryReset = true;
    f.members[0].inventoryHook = () => f.commit(f.members[1]);
    const result = await f.service.getNodeNetworkAddresses(f.opts, originalRevision);
    assert.equal(result.code, 'NODE_ROUTE_BUSY');
    assert.equal(f.members[1].calls.length, 0);
});

async function fixture(t) {
    const members = ['127.0.0.1', '127.0.0.2'].map((address) => ({
        address,
        version: address === '127.0.0.1' ? '3.4.1' : '2.2.0',
        strict: address === '127.0.0.1',
        healthStatus: 200,
        calls: [],
        healthHook: undefined,
        inventoryHook: undefined,
        inventoryReset: false,
    }));
    const servers = [];
    let port;
    for (const member of members) {
        const server = http.createServer(async (req, res) => {
            try {
                const buffers = [];
                for await (const buffer of req) buffers.push(buffer);
                let body = Buffer.concat(buffers);
                if (req.headers['content-encoding'] === 'zstd') body = zstdDecompressSync(body);
                const call = {
                    path: req.url,
                    method: req.method,
                    headers: req.headers,
                    body: body.length ? JSON.parse(body.toString()) : null,
                };
                member.calls.push(call);
                res.setHeader('content-type', 'application/json');
                if (req.url === contract.GetNodeHealthCheckCommand.url) {
                    const response = {
                        isAlive: true,
                        nodeVersion: member.version,
                        pluginSyncAckSupported: member.strict,
                        nodeControlRevision: 'untrusted-body-revision',
                    };
                    await member.healthHook?.();
                    res.statusCode = member.healthStatus;
                    res.end(JSON.stringify({ response }));
                } else if (req.url === contract.GetNetworkAddressesCommand.url) {
                    member.inventoryHook?.();
                    if (member.inventoryReset) {
                        req.socket.destroy();
                        return;
                    }
                    res.end(
                        JSON.stringify({
                            response: { addresses: ['192.0.2.1', '2001:db8::1'], complete: true },
                        }),
                    );
                } else if (req.url === '/node/xray/status') {
                    res.end(
                        JSON.stringify({ response: { isRunning: true, version: 'fixture-core' } }),
                    );
                } else if (req.url === contract.SyncCommand.url) {
                    res.end(JSON.stringify({ response: { accepted: false } }));
                } else if (req.url === contract.StartXrayCommand.url) {
                    res.end(
                        JSON.stringify({
                            response: {
                                isStarted: true,
                                error: null,
                                nodeInformation: { version: member.version },
                                system: null,
                            },
                        }),
                    );
                } else {
                    res.end(JSON.stringify({ response: { success: true } }));
                }
            } catch (error) {
                if (!res.destroyed) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: String(error) }));
                }
            }
        });
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port ?? 0, member.address, resolve);
        });
        servers.push(server);
        port ??= server.address().port;
    }
    const priorAllowlist = process.env.REMNACUST_LEGACY_HTTP_NODES;
    process.env.REMNACUST_LEGACY_HTTP_NODES = members
        .map((member) => `${member.address}:${port}`)
        .join(',');
    t.after(async () => {
        if (priorAllowlist === undefined) delete process.env.REMNACUST_LEGACY_HTTP_NODES;
        else process.env.REMNACUST_LEGACY_HTTP_NODES = priorAllowlist;
        await Promise.all(
            servers.map(
                (server) =>
                    new Promise((resolve) => {
                        server.closeAllConnections();
                        server.close(resolve);
                    }),
            ),
        );
    });
    let epoch = randomUUID(),
        revisionReads = 0,
        unavailable = false;
    let row = {
        uuid: randomUUID(),
        address: 'unchanged-anchor.invalid',
        port,
        proxyUrl: null,
        controlRevision: randomUUID(),
        isDisabled: false,
        ips: [],
        controlAddresses: [{ address: members[0].address, enabled: true }],
    };
    const inventory = {
        readRevision: async () => {
            revisionReads++;
            if (unavailable) throw Error('fixture DB unavailable');
            return epoch;
        },
        nodes: {
            findMany: async ({ select }) => [
                Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])),
            ],
        },
    };
    const registry = new NodeRouteRegistryService(inventory);
    const values = new Map();
    const cache = {
        get: async (key) => values.get(key) ?? null,
        set: async (key, value) => {
            values.set(key, value);
        },
        setMany: async (entries) => {
            for (const entry of entries) values.set(entry.key, entry.value);
        },
        incrementWithTtl: async (key) => {
            const value = (values.get(key) ?? 0) + 1;
            values.set(key, value);
            return value;
        },
    };
    const service = new AxiosService({}, cache, {}, registry);
    service.mtlsOptions = {};
    service.logger = { log() {}, warn() {}, error() {} };
    const opts = { uuid: row.uuid, address: row.address, port, proxyUrl: null };
    function commit(member, patch = {}) {
        row = {
            ...row,
            ...patch,
            controlRevision: randomUUID(),
            controlAddresses: [{ address: member.address, enabled: true }],
            ...patch,
        };
        epoch = randomUUID();
        return row.controlRevision;
    }
    return {
        service,
        registry,
        members,
        opts,
        commit,
        cache,
        revision: () => row.controlRevision,
        reads: () => revisionReads,
        unavailable: (value) => {
            unavailable = value;
        },
        healthCalls: () =>
            members.reduce(
                (sum, member) =>
                    sum +
                    member.calls.filter(
                        (call) => call.path === contract.GetNodeHealthCheckCommand.url,
                    ).length,
                0,
            ),
    };
}

test(
    'stable version cache checks the authoritative epoch without another health RPC and retains its TTL',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        const first = await f.service.getNodeVersion(f.opts);
        assert.equal(first.response, '3.4.1');
        const reads = f.reads();
        const second = await f.service.getNodeVersion(f.opts);
        assert.equal(second.response, first.response);
        assert.equal(f.reads(), reads + 1);
        assert.equal(f.healthCalls(), 1);
        for (const record of f.service.nodeVersions.values()) record.expires = Date.now() - 1;
        assert.equal((await f.service.getNodeVersion(f.opts)).response, '3.4.1');
        assert.equal(f.healthCalls(), 2);
    },
);

test(
    'same UUID canonical edits and ABA cannot reuse old version or capability evidence',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        const financialKey = f.service.connectionKey(f.opts);
        assert.equal((await f.service.getNodeVersion(f.opts)).response, '3.4.1');
        f.commit(f.members[1]);
        assert.equal((await f.service.getNodeVersion(f.opts)).response, '2.2.0');
        f.members[0].version = '3.4.2';
        const revision = f.commit(f.members[0]);
        const restored = await f.service.getNodeVersion(f.opts);
        assert.equal(restored.response, '3.4.2');
        assert.equal(restored.nodeControlRevision, revision);
        assert.equal(f.healthCalls(), 3);
        assert.equal(f.service.connectionKey(f.opts), financialKey);
    },
);

test(
    'concurrent version callers share one native health request for the same row revision',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        const entered = deferred(),
            release = deferred();
        f.members[0].healthHook = async () => {
            entered.resolve();
            await release.promise;
        };
        const calls = Array.from({ length: 32 }, () => f.service.getNodeVersion(f.opts));
        await entered.promise;
        release.resolve();
        const results = await Promise.all(calls);
        assert(results.every((result) => result.isOk && result.response === '3.4.1'));
        assert.equal(f.healthCalls(), 1);
        assert.equal(f.service.versionRequests.size, 0);
    },
);

test(
    'a new row revision never joins an old in-flight health request',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        const entered = deferred(),
            release = deferred();
        t.after(() => release.resolve());
        f.members[0].healthHook = async () => {
            entered.resolve();
            await release.promise;
        };
        const first = f.service.getNodeVersion(f.opts);
        await entered.promise;
        f.commit(f.members[1]);
        const second = f.service.getNodeVersion(f.opts);
        let timer;
        const independentlyCompleted = await Promise.race([
            second.then((result) => ({ result })),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(null), 2000);
            }),
        ]).finally(() => clearTimeout(timer));
        release.resolve();
        const [oldResult, newResult] = await Promise.all([first, second]);
        assert(
            independentlyCompleted,
            'the new revision waited for the previous revision health request',
        );
        assert.equal(newResult.response, '2.2.0');
        assert.equal(oldResult.code, 'NODE_ROUTE_BUSY');
        assert.equal(f.service.versionRequests.size, 0);
    },
);

test(
    'health response metadata comes from the fenced request and cannot be forged by its body',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        const revision = f.revision();
        const result = await f.service.getNodeHealth(f.opts);
        assert.equal(result.isOk, true);
        assert.equal(result.nodeControlRevision, revision);
        assert.equal(result.response.nodeControlRevision, 'untrusted-body-revision');
    },
);

test(
    'an edit immediately after the response fence cannot relabel old health evidence as the new revision',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        const oldRevision = f.revision(),
            original = f.registry.isCurrent.bind(f.registry);
        let checks = 0;
        f.registry.isCurrent = async (...args) => {
            const current = await original(...args);
            if (++checks === 2) f.commit(f.members[1]);
            return current;
        };
        const health = await f.service.getNodeHealth(f.opts);
        assert.equal(health.nodeControlRevision, oldRevision);
        assert.equal((await f.service.getNodeVersion(f.opts)).response, '2.2.0');
        assert.equal(f.healthCalls(), 2);
    },
);

test(
    'database outages and disabled management cannot be hidden by a warm version cache',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        await f.service.getNodeVersion(f.opts);
        f.unavailable(true);
        const unavailable = await f.service.getNodeVersion(f.opts);
        assert.equal(unavailable.isOk, false);
        assert.equal(unavailable.code, 'NODE_ROUTE_BUSY');
        f.unavailable(false);
        f.commit(f.members[0], {
            controlAddresses: [{ address: f.members[0].address, enabled: false }],
        });
        const disabled = await f.service.getNodeVersion(f.opts);
        assert.equal(disabled.code, 'NODE_ROUTE_DISABLED');
        assert.equal(f.healthCalls(), 1);
    },
);

test(
    'compression uses the currently registered revision and remains enabled for learned capable nodes',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        await f.service.getNodeVersion(f.opts);
        f.commit(f.members[1]);
        const send = () =>
            f.service.request({
                label: 'VERSION CONTEXT FIXTURE',
                opts: f.opts,
                path: '/version-context',
                data: { fixture: 'synthetic' },
                compress: true,
            });
        assert.equal((await send()).isOk, true);
        assert.equal(f.members[1].calls.at(-1).headers['content-encoding'], undefined);
        f.members[1].version = '3.4.1';
        f.commit(f.members[1]);
        await f.service.getNodeVersion(f.opts);
        assert.equal((await send()).isOk, true);
        assert.equal(f.members[1].calls.at(-1).headers['content-encoding'], 'zstd');
        assert.deepEqual(f.members[1].calls.at(-1).body, { fixture: 'synthetic' });
    },
);

test(
    'canonical version changes select the current native versus legacy user format',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        await f.service.getNodeVersion(f.opts);
        f.commit(f.members[1]);
        const result = await f.service.addUser(
            {
                hashData: { vlessUuid: randomUUID() },
                data: [
                    {
                        tag: 'fixture',
                        type: 'shadowsocks22',
                        username: 'synthetic-user',
                        password: 'synthetic-password',
                    },
                ],
            },
            f.opts,
        );
        assert.equal(result.isOk, true);
        assert.equal(f.members[1].calls.at(-1).body.data[0].type, 'shadowsocks2022');
        assert.equal(f.members[1].calls.at(-1).body.data[0].key, 'synthetic-password');
    },
);

for (const strict of [true, false]) {
    test(
        `plugin ACK follows actual response context when the new node strict support is ${strict}`,
        { timeout: 10000 },
        async (t) => {
            const f = await fixture(t);
            f.members[0].strict = !strict;
            await f.service.getNodeVersion(f.opts);
            f.members[1].version = '3.4.1';
            f.members[1].strict = strict;
            f.commit(f.members[1]);
            const result = await f.service.syncNodePlugins({ plugin: null }, f.opts);
            assert.equal(result.isOk, !strict);
            assert.equal(f.healthCalls(), 2);
            assert.equal(f.members[1].calls.at(-1).path, contract.SyncCommand.url);
        },
    );
}

test(
    'a protocol decision cannot dispatch to a row revision changed after the version lookup',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        await f.service.getNodeVersion(f.opts);
        const version = f.service.getNodeVersion.bind(f.service);
        f.service.getNodeVersion = async (opts) => {
            const result = await version(opts);
            f.commit(f.members[1]);
            return result;
        };
        const result = await f.service.syncNodePlugins({ plugin: {} }, f.opts);
        assert.equal(result.code, 'NODE_ROUTE_BUSY');
        assert.equal(f.members[1].calls.length, 0);
    },
);

test(
    'legacy health fallback preserves the successful request revision and cache hits do not repeat either RPC',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        f.members[0].healthStatus = 404;
        const revision = f.revision();
        const health = await f.service.getNodeHealth(f.opts);
        assert.equal(health.isOk, true);
        assert.equal(health.nodeControlRevision, revision);
        assert.equal(health.response.nodeVersion, '');
        assert.equal((await f.service.getNodeVersion(f.opts)).response, '');
        assert.deepEqual(
            f.members[0].calls.map((call) => call.path),
            [contract.GetNodeHealthCheckCommand.url, '/node/xray/status'],
        );
    },
);

test(
    'start replies retain their fenced context when the database changes before version caching',
    { timeout: 10000 },
    async (t) => {
        const f = await fixture(t);
        await f.service.getNodeVersion(f.opts);
        const original = f.registry.isCurrent.bind(f.registry);
        let checks = 0;
        f.registry.isCurrent = async (...args) => {
            const current = await original(...args);
            if (++checks === 2) f.commit(f.members[1]);
            return current;
        };
        const result = await f.service.startXray(
            {
                xrayConfig: { inbounds: [] },
                internals: { forceRestart: false, hashes: { emptyConfig: 'fixture' } },
            },
            f.opts,
        );
        assert.equal(result.isOk, true);
        assert.equal((await f.service.getNodeVersion(f.opts)).response, '2.2.0');
        assert.equal(f.healthCalls(), 2);
    },
);
