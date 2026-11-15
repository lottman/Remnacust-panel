const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const axios = require('axios');
const { GetNodeHealthCheckCommand, GetSystemStatsCommand } = require('@remnawave/node-contract');
const load = require('./load-typescript.cjs');

const source = path.join(__dirname, '../src');
const base = {
    uuid: '00000000-0000-4000-8000-000000000140',
    address: 'primary.invalid',
    port: 2222,
    proxyUrl: null,
    ips: [
        { ip: '192.0.2.1', status: 'MANAGEMENT' },
        { ip: '2001:db8::1', status: 'RESERVE' },
    ],
};

function fixtureClock() {
    let now = 100_000;
    class ClockDate extends Date {
        constructor(...args) {
            super(...(args.length ? args : [now]));
        }
        static now() {
            return now;
        }
    }
    return { Date: ClockDate, advance: (ms) => (now += ms) };
}

class Cache {
    rows = new Map();
    constructor(clock) {
        this.clock = clock;
    }
    async get(key) {
        const row = this.rows.get(key);
        return row && row.until > this.clock.Date.now() ? row.value : null;
    }
    async set(key, value, seconds) {
        this.rows.set(key, { value, until: this.clock.Date.now() + seconds * 1000 });
    }
    async incrementWithTtl(key, seconds) {
        const value = ((await this.get(key)) ?? 0) + 1;
        const until = this.rows.get(key)?.until;
        this.rows.set(key, {
            value,
            until: value === 1 ? this.clock.Date.now() + seconds * 1000 : until,
        });
        return value;
    }
}

function resolverFixture() {
    const clock = fixtureClock();
    const routes = load(
        path.join(source, 'common/axios/node-control-route.ts'),
        {},
        { Date: clock.Date },
    );
    const cache = new Cache(clock);
    const resolver = new routes.NodeControlRouteResolver(cache);
    return { clock, routes, cache, resolver };
}

function assertCooldown(routes, error) {
    assert(error instanceof routes.NodeRouteBusyError);
    assert(error instanceof routes.NodeRouteCooldownError);
    assert.equal(error.code, 'NODE_ROUTE_BUSY');
    assert.match(error.message, /cooling down/);
    return true;
}

test('round cooldown is typed admission pressure and retains the last real failure report', async () => {
    const { clock, routes, cache, resolver } = resolverFixture();
    const calls = [];
    const codes = ['refused', 'certificate', 'authorization'];
    const probe = async (opts) => {
        calls.push(opts.address);
        return { healthy: false, code: codes[calls.length - 1] };
    };
    await assert.rejects(resolver.select(base, probe), (error) => {
        assert(!(error instanceof routes.NodeRouteBusyError));
        assert.match(error.message, /No authenticated node API route/);
        return true;
    });
    const report = structuredClone(resolver.diagnostics(base));
    assert.equal(report.status, 'unavailable');
    assert.equal(report.activeAddress, null);
    assert.equal(report.checkedAt, new clock.Date().toISOString());
    assert.deepEqual(
        report.attempts.map((attempt) => attempt.code),
        codes,
    );
    const revision = routes.routeRevision(base);
    const roundUntil = cache.rows.get(`node-route:round-failure:${revision}`).until;
    clock.advance(1);
    await assert.rejects(resolver.select(base, probe), (error) => assertCooldown(routes, error));
    assert.deepEqual(resolver.diagnostics(base), report);
    assert.equal(calls.length, 3);
    assert.equal(cache.rows.get(`node-route:round-failure:${revision}`).until, roundUntil);
});

test('all quarantined addresses preserve evidence without extending cooldown and recover at 30 seconds', async () => {
    const { clock, routes, cache, resolver } = resolverFixture();
    let calls = 0;
    const failed = async () => {
        calls++;
        return { healthy: false, code: 'timeout' };
    };
    await assert.rejects(resolver.select(base, failed), /No authenticated node API route/);
    const report = structuredClone(resolver.diagnostics(base));
    const revision = routes.routeRevision(base);
    const roundKey = `node-route:round-failure:${revision}`;
    const originalRows = structuredClone(cache.rows);
    for (const advance of [5000, 24_999]) {
        clock.advance(advance);
        assert.equal(await cache.get(roundKey), null);
        await assert.rejects(resolver.select(base, failed), (error) =>
            assertCooldown(routes, error),
        );
        assert.equal(calls, 3);
        assert.deepEqual(resolver.diagnostics(base), report);
        assert.deepEqual(cache.rows, originalRows);
    }
    clock.advance(1);
    const selected = await resolver.select(base, async () => {
        calls++;
        return { healthy: true };
    });
    assert.equal(selected.address, base.address);
    assert.equal(calls, 4);
    assert.equal(resolver.diagnostics(base).status, 'authenticated');
    assert.equal(resolver.diagnostics(base).checkedAt, new clock.Date().toISOString());
});

test('another worker cannot turn shared cooldown into fabricated outage or authentication evidence', async () => {
    const { clock, routes, cache, resolver } = resolverFixture();
    await assert.rejects(
        resolver.select(base, async () => ({ healthy: false, code: 'authorization' })),
    );
    const other = new routes.NodeControlRouteResolver(cache);
    let probes = 0;
    const probe = async () => {
        probes++;
        return { healthy: true };
    };
    for (const advance of [0, 5000]) {
        clock.advance(advance);
        await assert.rejects(other.select(base, probe), (error) => assertCooldown(routes, error));
        assert.equal(probes, 0);
        assert.deepEqual(other.diagnostics(base), routes.emptyConnectionRoute(base));
    }
});

test('per-node capacity preserves failed attempts and the cursor reaches a fourth address in the next window', async () => {
    const { clock, routes, resolver } = resolverFixture();
    const config = { ...base, ips: [...base.ips, { ip: '192.0.2.4', status: 'RESERVE' }] };
    const calls = [];
    const probe = async (opts) => {
        calls.push(opts.address);
        return { healthy: opts.address === '192.0.2.4', code: 'refused' };
    };
    await assert.rejects(resolver.select(config, probe), /No authenticated node API route/);
    const report = structuredClone(resolver.diagnostics(config));
    clock.advance(5000);
    await assert.rejects(
        resolver.select(config, probe),
        (error) => error instanceof routes.NodeRouteBusyError,
    );
    assert.equal(calls.length, 3);
    assert.deepEqual(resolver.diagnostics(config), report);
    clock.advance(5000);
    assert.equal((await resolver.select(config, probe)).address, '192.0.2.4');
    assert.deepEqual(calls, routes.routeCandidates(config));
});

test('shared cursor visits all 65 candidates in bounded batches even after earlier quarantine expires', async () => {
    const { clock, routes, cache } = resolverFixture();
    const config = {
        ...base,
        controlAddresses: Array.from({ length: 65 }, (_, index) => ({
            address: `192.0.2.${index + 1}`,
            enabled: true,
        })),
    };
    const calls = [];
    for (let round = 0; round < 22; round++) {
        const resolver = new routes.NodeControlRouteResolver(cache);
        const before = calls.length;
        const pending = resolver.select(config, async (opts) => {
            calls.push(opts.address);
            return { healthy: opts.address === '192.0.2.65', code: 'timeout' };
        });
        if (round < 21) await assert.rejects(pending, /No authenticated node API route/);
        else assert.equal((await pending).address, '192.0.2.65');
        assert(calls.length - before <= 3);
        clock.advance(10_000);
    }
    assert.deepEqual(calls, routes.routeCandidates(config));
});

test('cooldown after an expired successful route never refreshes or revives authentication', async () => {
    const { clock, routes, resolver } = resolverFixture();
    await resolver.select(base, async () => ({ healthy: true }));
    for (const address of routes.routeCandidates(base))
        await resolver.failed(base, address, 'certificate');
    const report = structuredClone(resolver.diagnostics(base));
    clock.advance(10_000);
    await assert.rejects(
        resolver.select(base, async () => assert.fail('Quarantine must prevent I/O')),
        (error) => assertCooldown(routes, error),
    );
    assert.equal(report.status, 'unavailable');
    assert.equal(report.activeAddress, null);
    assert.deepEqual(resolver.diagnostics(base), report);
});

test('deadline exhaustion after capacity admission cannot manufacture a failed probe report', async () => {
    const { clock, routes, cache, resolver } = resolverFixture();
    const increment = cache.incrementWithTtl.bind(cache);
    cache.incrementWithTtl = async (key, ttl) => {
        const value = await increment(key, ttl);
        if (key.startsWith(`node-route:probes:${base.uuid}:`)) clock.advance(6000);
        return value;
    };
    await assert.rejects(
        resolver.select(base, async () => assert.fail('The deadline has expired')),
        (error) => error instanceof routes.NodeRouteBusyError,
    );
    assert.deepEqual(resolver.diagnostics(base), routes.emptyConnectionRoute(base));
    assert.equal(resolver.active, 0);
    assert(![...cache.rows.keys()].some((key) => key.startsWith('node-route:round-failure:')));
});

class Logger {
    log() {}
    warn() {}
    error() {}
    debug() {}
}
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
const errors = {
    NODE_ERROR_WITH_MSG: { withMessage: (message) => ({ code: 'N001', message }) },
    NODE_ERROR_500_WITH_MSG: {
        code: 'N002',
        withMessage: (message) => ({ code: 'N002', message }),
    },
    INTERNAL_SERVER_ERROR: {},
};
const keys = Object.fromEntries(
    [
        'NODE_SYSTEM_INFO',
        'NODE_SYSTEM_STATS',
        'NODE_USERS_ONLINE',
        'NODE_XRAY_UPTIME',
        'NODE_TELEMETRY_SNAPSHOT',
    ].map((name) => [name, (uuid) => `${name}:${uuid}`]),
);

function consumerFixture(t, config = base, connected = true) {
    const f = resolverFixture();
    const globals = { Date: f.clock.Date };
    const { AxiosService } = load(
        path.join(source, 'common/axios/axios.service.ts'),
        {
            '@nestjs/common': { Injectable: () => (value) => value, Logger },
            '@common/config/app-config/typed-config.service': {},
            '@common/raw-cache': {},
            '@common/utils/bytes': { prettyBytesUtil: String },
            '@common/utils/certs': { deriveSni: () => 'panel.invalid' },
            '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
            '@common/utils/node-version': { nodeSupportsCompression: () => false },
            '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
            '@contract/constants': { ERRORS: errors },
            '../types': {
                ok: (response) => ({ isOk: true, response }),
                fail: (error) => ({ isOk: false, ...error }),
            },
            './node-control-route': f.routes,
        },
        globals,
    );
    const client = new AxiosService(
        {
            execute: async () => ({
                isOk: true,
                response: {
                    jwtToken: 'synthetic',
                    caCert: '',
                    clientCert: '',
                    clientKey: '',
                    jwtPublicKey: '',
                },
            }),
        },
        f.cache,
        { getOrThrow: () => false },
        {
            get: async () => config,
            isCurrent: async () => true,
        },
    );
    t.after(() => {
        client.axiosInstance.defaults.httpsAgent?.destroy();
        client.socksAgentCache.forEach((agent) => agent.destroy());
    });
    const calls = [];
    let recovered = false;
    let fault = { code: 'ECONNREFUSED' };
    client.axiosInstance.get = async (url, opts) => {
        calls.push(url);
        assert.equal(opts.proxy, false);
        assert.equal(opts.maxRedirects, 0);
        if (!recovered)
            throw new axios.AxiosError(
                'Synthetic endpoint failure',
                fault.code,
                {},
                {},
                fault.status ? { status: fault.status } : undefined,
            );
        const pathname = new URL(url).pathname;
        assert([GetNodeHealthCheckCommand.url, GetSystemStatsCommand.url].includes(pathname));
        return {
            data: {
                response:
                    pathname === GetNodeHealthCheckCommand.url
                        ? { isAlive: true }
                        : { xrayInfo: { uptime: 120 }, system: null },
            },
        };
    };
    client.axiosInstance.post = async () =>
        assert.fail('Health and diagnostics must not dispatch mutations');
    const state = {
        ...config,
        isConnected: connected,
        isDisabled: false,
        lastStatusMessage: 'Previous actionable certificate failure',
    };
    const writes = [],
        records = [],
        deleted = [],
        incidents = [],
        starts = [],
        observations = [];
    const queries = { execute: async () => ({ isOk: true, response: { ...state } }) };
    const workerFile = path.join(source, 'queue/_nodes/processors/node-health-check.processor.ts');
    const mocks = {};
    for (const match of fs.readFileSync(workerFile, 'utf8').matchAll(/from '([^']+)'/g))
        if (match[1].startsWith('@') || match[1].startsWith('.')) mocks[match[1]] = {};
    const { NodeHealthCheckQueueProcessor } = load(
        workerFile,
        {
            ...mocks,
            '@nestjs/common': { Logger },
            '@nestjs/bullmq': { Processor: () => (value) => value, WorkerHost: class {} },
            '@contract/constants': { ERRORS: errors },
            '@common/axios/profile-traffic.schema': {
                nodeBindingTrafficKey: (uuid) => `binding:${uuid}`,
                parseProfileTraffic: () => null,
            },
            '@common/host-policy/sync-host-policy-for-start': {
                hostPolicyRetryKey: (uuid) => `retry:${uuid}`,
            },
            '@libs/contracts/constants': {
                CACHE_KEYS: keys,
                CACHE_KEYS_TTL: { NODE_SYSTEM_STATS: 60, NODE_XRAY_UPTIME: 60 },
                EVENTS: { NODE: { CONNECTION_LOST: 'lost', CONNECTION_RESTORED: 'restored' } },
            },
            '@modules/nodes/commands/update-node': { UpdateNodeCommand },
            '@modules/nodes/queries/get-node-by-uuid': { GetNodeByUuidQuery },
            '@integration-modules/notifications/interfaces': { NodeEvent: class {} },
            '@queue/queue.enum': { QUEUES_NAMES: { NODES: { HEALTH_CHECK: 'health' } } },
            '../constants/nodes-job-name.constant': {
                NODES_JOB_NAMES: { NODE_HEALTH_CHECK: 'health' },
            },
        },
        globals,
    );
    const worker = new NodeHealthCheckQueueProcessor(
        {
            execute: async (command) => {
                writes.push(command.value);
                Object.assign(state, command.value);
                return { isOk: true, response: { ...state } };
            },
        },
        { emitAsync: async (event) => incidents.push(event) },
        client,
        { startNode: async (value) => starts.push(value) },
        {
            get: (key) => f.cache.get(key),
            getString: async () => null,
            setMany: async () => {},
            delMany: async (value) => deleted.push(value),
            observeNodeIncident: async (_uuid, _at, good) => {
                observations.push(good);
                return good ? 2 : 1;
            },
            acknowledgeNodeIncident: async () => {},
        },
        { record: async (value) => records.push(value) },
        queries,
    );
    const { NodeDiagnosticsService } = load(
        path.join(source, 'modules/nodes/node-diagnostics.service.ts'),
        {
            '@contract/constants': { ERRORS: errors },
            '@common/axios': {},
            '@common/raw-cache': {},
            '@common/helpers/error-handler.helper': { errorHandler: (result) => result.response },
            './node-port-plans.service': {},
            './queries/get-node-by-uuid/get-node-by-uuid.query': { GetNodeByUuidQuery },
        },
        globals,
    );
    const diagnostics = new NodeDiagnosticsService(queries, client, f.cache, {
        get: async () => ({ status: 'APPLIED' }),
    });
    const job = () => ({
        timestamp: f.clock.Date.now(),
        data: {
            nodeUuid: config.uuid,
            isConnected: state.isConnected,
            connectionOpts: config,
        },
    });
    return {
        ...f,
        client,
        worker,
        diagnostics,
        job,
        state,
        writes,
        records,
        deleted,
        incidents,
        starts,
        observations,
        calls,
        recover: () => (recovered = true),
        failWith: (value) => (fault = value),
    };
}

test('actual Axios preserves initial endpoint, proxy, certificate and authorization failures', async (t) => {
    for (const [code, status, expected, proxyUrl] of [
        ['ECONNREFUSED', undefined, 'refused', null],
        ['ENOTFOUND', undefined, 'dns', null],
        ['ETIMEDOUT', undefined, 'timeout', null],
        ['CERT_HAS_EXPIRED', undefined, 'certificate', null],
        ['ERR_BAD_REQUEST', 401, 'authorization', null],
        ['ERR_BAD_REQUEST', 403, 'authorization', null],
        [
            'NODE_PROXY_UNAVAILABLE',
            undefined,
            'proxy',
            'socks5://fixture:synthetic@proxy.invalid:1080',
        ],
    ]) {
        const config = { ...base, proxyUrl };
        const f = consumerFixture(t, config);
        f.failWith({ code, status });
        const initial = await f.client.getSystemStats(config);
        assert.equal(initial.isOk, false);
        assert.notEqual(initial.code, 'NODE_ROUTE_BUSY');
        assert.match(initial.message, /No authenticated node API route/);
        const report = await f.client.connectionRoute(config);
        assert.equal(report.status, 'unavailable');
        assert.equal(report.attempts.length, proxyUrl ? 1 : 3);
        assert(
            report.attempts.every(
                (attempt) => attempt.code === expected && attempt.status === 'failed',
            ),
        );
        assert(!JSON.stringify(report).includes('synthetic'));
        const cooldown = await f.client.getSystemStats(config);
        assert.equal(cooldown.code, 'NODE_ROUTE_BUSY');
        assert.deepEqual(await f.client.connectionRoute(config), report);
        assert.equal(f.calls.length, proxyUrl ? 1 : 3);
    }
});

test('actual resolver to Axios to health never records cooldown as a second failure and later recovers', async (t) => {
    for (const connected of [true, false]) {
        const f = consumerFixture(t, base, connected);
        await f.worker.process(f.job());
        assert.deepEqual(
            { statuses: f.records.map((record) => record.status), writes: f.writes },
            { statuses: ['retry'], writes: [] },
        );
        assert.match(f.records[0].message, /No authenticated node API route/);
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.deleted, []);
        assert.deepEqual(f.incidents, []);
        assert.deepEqual(f.starts, []);
        assert.deepEqual(f.observations, []);
        assert.equal(f.state.isConnected, connected);
        assert.equal(f.state.lastStatusMessage, 'Previous actionable certificate failure');
        const report = await f.client.connectionRoute(base);
        assert.equal(report.status, 'unavailable');
        assert.equal(report.attempts.length, 3);
        f.recover();
        f.clock.advance(29_999);
        await f.worker.process(f.job());
        assert.equal(f.calls.length, 3);
        assert.equal(f.records.length, 1);
        assert.deepEqual(await f.client.connectionRoute(base), report);
        assert.equal(f.state.isConnected, connected);
        f.clock.advance(1);
        await f.worker.process(f.job());
        assert.equal(f.calls.length, 5);
        assert.deepEqual(
            f.records.map((record) => record.status),
            ['retry', 'ok'],
        );
        assert.equal(f.state.isConnected, true);
        assert.equal(f.writes.length, connected ? 0 : 1);
        assert.deepEqual(f.starts, connected ? [] : [{ nodeUuid: base.uuid }]);
        assert.deepEqual(f.incidents, ['restored']);
        assert.deepEqual(f.observations, [true]);
        assert.equal((await f.client.connectionRoute(base)).status, 'authenticated');
    }
});

test('actual diagnostics marks cooldown warning while retaining attempts and their timestamp', async (t) => {
    const f = consumerFixture(t);
    assert.equal((await f.client.getSystemStats(base)).isOk, false);
    const report = structuredClone(await f.client.connectionRoute(base));
    f.clock.advance(1);
    const diagnostics = await f.diagnostics.inspect(base.uuid);
    assert.deepEqual(diagnostics.checks[0], { id: 'connection', status: 'warning', code: 'busy' });
    assert.deepEqual(diagnostics.connectionRoute, {
        ...report,
        status: 'unverified',
        activeAddress: null,
    });
    assert.deepEqual(await f.client.connectionRoute(base), report);
    assert.equal(f.calls.length, 3);
});
