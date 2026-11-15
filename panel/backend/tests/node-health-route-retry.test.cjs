const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const axios = require('axios');
const { randomUUID } = require('node:crypto');
const { GetNodeHealthCheckCommand } = require('@remnawave/node-contract');
const load = require('./load-typescript.cjs');

const root = path.join(__dirname, '../src');
const uuid = '00000000-0000-4000-8000-000000000140';
const revision = '00000000-0000-4000-8000-000000000001';
const nextRevision = '00000000-0000-4000-8000-000000000002';
const processorFile = path.join(root, 'queue/_nodes/processors/node-health-check.processor.ts');
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
    ].map((name) => [name, (id) => `${name}:${id}`]),
);
class Logger {
    log() {}
    warn() {}
    error() {}
    debug() {}
}
class UpdateNodeCommand {
    constructor(value, expectedControlRevision, healthObservation) {
        this.value = value;
        this.expectedControlRevision = expectedControlRevision;
        this.healthObservation = healthObservation;
    }
}
class GetNodeByUuidQuery {
    constructor(id) {
        this.uuid = id;
    }
}
const healthy = { isOk: true, response: { xrayInfo: { uptime: 120 }, system: null } };
const failed = { isOk: false, code: 'ECONNREFUSED', message: 'Node API connection refused' };
const busy = {
    isOk: false,
    code: 'NODE_ROUTE_BUSY',
    message: 'Node route selection is cooling down',
};
const nativeNodeSource = process.env.REMNACUST_NODE_SOURCE;

async function nativeNodeFixture() {
    const xrayFile = path.join(nativeNodeSource, 'src/modules/xray-core/xray.service.ts');
    const statsFile = path.join(nativeNodeSource, 'src/modules/stats/stats.service.ts');
    const mockImports = (file) =>
        Object.fromEntries(
            [...fs.readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)]
                .filter((match) => !match[1].startsWith('node:'))
                .map((match) => [match[1], {}]),
        );
    const common = require('@nestjs/common');
    const { coreManagement } = load(
        path.join(nativeNodeSource, 'src/modules/xray-core/core-management.ts'),
    );
    const state = { active: false, starts: 0, sdkStats: 0 };
    const processControl = {
        isControlAvailable: () => true,
        getCoreVersion: async () => '26.11.9',
        getStatus: async () =>
            state.active
                ? { up: true, pid: 42, raw: 'true 42' }
                : { up: false, pid: null, raw: 'false -1' },
        isApiSocketAvailable: () => state.active,
        getApiSocketIdentity: () => (state.active ? 'native-fixture-socket' : null),
        probeApi: async () => state.active,
        start: async () => {
            state.starts++;
        },
        stop: async () => {
            state.active = false;
        },
    };
    const { restoreCachedCore } = load(
        path.join(nativeNodeSource, 'src/modules/xray-core/core-boot-recovery.ts'),
        {
            'node:fs/promises': {
                lstat: async () => {
                    throw Object.assign(Error('No saved checkpoint'), { code: 'ENOENT' });
                },
            },
        },
    );
    const version = JSON.parse(
        fs.readFileSync(path.join(nativeNodeSource, 'package.json'), 'utf8'),
    ).version;
    const { XrayService } = load(
        xrayFile,
        {
            ...mockImports(xrayFile),
            '@nestjs/common': { ...common, Logger },
            '@remnawave/xtls-sdk-nestjs': { InjectXtls: () => () => {} },
            '@common/types': { ok: (response) => ({ isOk: true, response }) },
            './core-management': { coreManagement },
            './core-boot-recovery': { restoreCachedCore },
            './core-crash-watchdog': {
                CoreCrashWatchdog: class {
                    start() {}
                    arm() {}
                    close() {}
                },
            },
            './port-plan-state': {
                PortPlanStateStore: class {
                    async read() {
                        return null;
                    }
                },
            },
            './models': load(
                path.join(
                    nativeNodeSource,
                    'src/modules/xray-core/models/get-node-health-check.model.ts',
                ),
            ),
            './live-core.service': { LIVE_CORE_CHECKPOINT: '/fixture/no-checkpoint' },
        },
        { __RWNODE_VERSION__: version },
    );
    const xray = new XrayService(
        {},
        processControl,
        {},
        {},
        { load: async () => ({ paused: false }) },
        {},
        {},
        { getOrThrow: () => '/fixture/private-api' },
        {},
        {},
        {},
        { supported: async () => false, profilesSupported: async () => false },
    );
    await xray.onApplicationBootstrap();
    assert.equal(state.starts, 0);
    const { StatsService } = load(statsFile, {
        ...mockImports(statsFile),
        '@nestjs/common': { ...common, Logger },
        '@remnawave/xtls-sdk-nestjs': { InjectXtls: () => () => {} },
        '@common/types': { fail: (error) => ({ isOk: false, ...error }) },
        '@libs/contracts/constants': {
            ERRORS: {
                FAILED_TO_GET_SYSTEM_STATS: {
                    code: 'N002',
                    httpCode: 500,
                    message: 'Native stats RPC unavailable',
                },
            },
        },
        '../xray-core/core-management': { coreManagement },
        './core-stats-client': {
            CoreStatsClient: class {
                async getSysStats() {
                    state.sdkStats++;
                    return { isOk: false };
                }
            },
        },
    });
    const stats = new StatsService({}, {}, processControl, {});
    return { state, xray, stats, version };
}

function attachNativeNode(f, native) {
    f.client.axiosInstance.get = async (url, options) => {
        f.transport.push(url);
        assert.equal(options.proxy, false);
        assert.equal(options.maxRedirects, 0);
        if (new URL(url).pathname === GetNodeHealthCheckCommand.url) {
            const health = await native.xray.getNodeHealthCheck();
            assert.equal(health.isOk, true);
            return { data: { response: health.response } };
        }
        try {
            const stats = await native.stats.getSystemStats();
            if (!stats.isOk)
                throw new axios.AxiosError(
                    stats.message,
                    'ERR_BAD_RESPONSE',
                    {},
                    {},
                    { status: stats.httpCode },
                );
            return { data: { response: stats.response } };
        } catch (error) {
            if (typeof error.getStatus === 'function')
                throw new axios.AxiosError(
                    error.message,
                    'ERR_BAD_RESPONSE',
                    {},
                    {},
                    { status: error.getStatus() },
                );
            throw error;
        }
    };
}

function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function fixture(t, count = 3) {
    let now = 100_000;
    class ClockDate extends Date {
        constructor(...args) {
            super(...(args.length ? args : [now]));
        }
        static now() {
            return now;
        }
    }
    const globals = { Date: ClockDate };
    const routes = load(path.join(root, 'common/axios/node-control-route.ts'), {}, globals);
    const rows = new Map();
    const observations = new Map();
    const observationCalls = [];
    let cacheUnavailable = false;
    const cache = {
        get: async (key) => {
            const row = rows.get(key);
            return row && row.until > now ? row.value : null;
        },
        set: async (key, value, seconds = 60) => {
            rows.set(key, { value, until: now + seconds * 1000 });
        },
        incrementWithTtl: async (key, seconds) => {
            const value = ((await cache.get(key)) ?? 0) + 1;
            rows.set(key, {
                value,
                until: value === 1 ? now + seconds * 1000 : rows.get(key).until,
            });
            return value;
        },
        observeNodeHealth: async (id, controlRevision, observedAt, attempt, success) => {
            if (cacheUnavailable) throw Error('Synthetic observation cache unavailable');
            observationCalls.push({ id, controlRevision, observedAt, attempt, success });
            const old = observations.get(id);
            if (
                old &&
                (observedAt < old.observedAt ||
                    (observedAt === old.observedAt &&
                        (attempt < old.attempt ||
                            (attempt === old.attempt && (!success || old.success)))))
            )
                return null;
            const failures = success
                ? 0
                : Math.min(2, (old?.controlRevision === controlRevision ? old.failures : 0) + 1);
            observations.set(id, { controlRevision, observedAt, attempt, success, failures });
            return failures;
        },
        getString: async () => null,
        setMany: async (entries) => {
            for (const entry of entries) await cache.set(entry.key, entry.value, entry.ttlSeconds);
        },
        setManyFenced: async (key, epoch, entries) => {
            const old = await cache.get(key);
            if (old !== null && BigInt(old) > BigInt(epoch)) return false;
            await cache.set(key, epoch, 604800);
            await cache.setMany(entries);
            return true;
        },
        delMany: async (entries) => {
            deleted.push(entries);
            entries.forEach((key) => rows.delete(key));
        },
        observeNodeIncident: async (_id, at, success) => {
            incidentObservations.push({ at, success });
            return 0;
        },
        acknowledgeNodeIncident: async () => {},
    };
    const state = {
        uuid,
        controlRevision: revision,
        revision,
        address: 'primary.invalid',
        port: 2222,
        proxyUrl: null,
        ips: [],
        isConnected: true,
        isDisabled: false,
        controlAddresses: Array.from({ length: count }, (_, index) => ({
            address: `192.0.2.${index + 1}`,
            enabled: true,
        })),
        lastStatusMessage: 'Prior actionable failure',
    };
    const { AxiosService } = load(
        path.join(root, 'common/axios/axios.service.ts'),
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
            './node-control-route': routes,
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
        cache,
        { getOrThrow: () => false },
        {
            get: async () => ({ ...state }),
            isCurrent: async (config) => config.controlRevision === state.controlRevision,
        },
    );
    t.after(() => client.axiosInstance.defaults.httpsAgent?.destroy());
    let workingAddress = null;
    const transport = [];
    client.axiosInstance.get = async (url, options) => {
        transport.push(url);
        assert.equal(options.proxy, false);
        assert.equal(options.maxRedirects, 0);
        if (new URL(url).hostname !== workingAddress)
            throw new axios.AxiosError('Synthetic connection refused', 'ECONNREFUSED');
        return {
            data: {
                response:
                    new URL(url).pathname === GetNodeHealthCheckCommand.url
                        ? { isAlive: true }
                        : healthy.response,
            },
        };
    };
    client.axiosInstance.post = async () => assert.fail('Health must not dispatch mutations');
    const writes = [],
        records = [],
        deleted = [],
        starts = [],
        incidentObservations = [];
    let databaseObservation;
    let pauseWrite;
    const commandBus = {
        execute: async (command) => {
            if (pauseWrite && command.value.isConnected === false) {
                pauseWrite.entered.resolve();
                await pauseWrite.release.promise;
            }
            if (
                command.expectedControlRevision !== undefined &&
                command.expectedControlRevision !== state.controlRevision
            )
                return { isOk: false, code: 'A266' };
            const incoming = command.healthObservation;
            if (
                incoming &&
                databaseObservation &&
                (incoming.observedAt < databaseObservation.observedAt ||
                    (incoming.observedAt === databaseObservation.observedAt &&
                        incoming.attempt <= databaseObservation.attempt))
            )
                return { isOk: false, code: 'A266' };
            if (incoming) databaseObservation = incoming;
            writes.push({ ...command.value });
            Object.assign(state, command.value);
            return { isOk: true, response: { ...state } };
        },
    };
    const mocks = {};
    for (const match of fs.readFileSync(processorFile, 'utf8').matchAll(/from '([^']+)'/g))
        if (match[1].startsWith('@') || match[1].startsWith('.')) mocks[match[1]] = {};
    const { NodeHealthCheckQueueProcessor } = load(
        processorFile,
        {
            ...mocks,
            '@nestjs/common': { Logger },
            '@nestjs/bullmq': { Processor: () => (value) => value, WorkerHost: class {} },
            '@contract/constants': { ERRORS: errors },
            '@common/axios/profile-traffic.schema': {
                nodeBindingTrafficKey: (id) => `binding:${id}`,
                parseProfileTraffic: () => null,
            },
            '@common/host-policy/sync-host-policy-for-start': {
                hostPolicyRetryKey: (id) => `retry:${id}`,
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
    const worker = () =>
        new NodeHealthCheckQueueProcessor(
            commandBus,
            { emitAsync: async () => {} },
            client,
            { startNode: async (value) => starts.push(value) },
            cache,
            { record: async (value) => records.push(value) },
            { execute: async () => ({ isOk: true, response: { ...state } }) },
        );
    const { QUEUES_NAMES } = load(path.join(root, 'queue/queue.enum.ts'));
    const { NodesQueuesService } = load(path.join(root, 'queue/_nodes/nodes-queues.service.ts'), {
        '@common/axios': {},
        '@queue/queue.enum': { QUEUES_NAMES },
        '@nestjs/bullmq': { InjectQueue: () => () => {} },
        '@nestjs/common': { Injectable: () => (value) => value, Logger },
    });
    const producer = Object.create(NodesQueuesService.prototype);
    producer.nodeHealthCheckQueue = { addBulk: async (jobs) => jobs };
    const job = async () => {
        const [entry] = await producer.checkNodeHealthBulk([
            {
                ...state,
                connectionOpts: {
                    uuid,
                    address: state.address,
                    port: state.port,
                    proxyUrl: state.proxyUrl,
                },
            },
        ]);
        assert.equal(entry.data.controlRevision, state.controlRevision);
        assert.equal(entry.data.connectionOpts.uuid, uuid);
        return { ...entry, timestamp: now };
    };
    return {
        state,
        cache,
        rows,
        observations,
        observationCalls,
        client,
        transport,
        writes,
        records,
        deleted,
        starts,
        incidentObservations,
        worker,
        job,
        advance: (ms) => (now += ms),
        recover: (address = state.controlAddresses[0].address) => (workingAddress = address),
        cacheOutage: (unavailable = true) => (cacheUnavailable = unavailable),
        holdOfflineWrite: () => (pauseWrite = { entered: deferred(), release: deferred() }),
    };
}

test('real producer and route worker eventually persist offline after two real failed rounds across jobs', async (t) => {
    const f = fixture(t);
    await f.worker().process(await f.job());
    assert.equal(f.transport.length, 3);
    assert.equal(f.state.isConnected, true);
    assert.equal(
        f.writes.some((write) => write.isConnected === false),
        false,
    );
    const first = structuredClone(f.observations.get(uuid));
    f.advance(1000);
    await f.worker().process(await f.job());
    assert.deepEqual(
        f.observations.get(uuid),
        first,
        'Busy-only job changed real failure evidence',
    );
    assert.equal(f.transport.length, 3);
    f.advance(29_000);
    await f.worker().process(await f.job());
    assert.equal(f.transport.length, 6);
    assert.equal(
        f.state.isConnected,
        false,
        'Every job reset the first real failure and left the node falsely online',
    );
    assert.equal(f.state.lastStatusMessage, 'No authenticated node API route available');
    assert.equal(f.records.at(-1).status, 'unreachable');
});

test('three failed addresses cannot turn a fourth healthy candidate offline in its next probe window', async (t) => {
    const f = fixture(t, 4);
    f.recover('192.0.2.4');
    await f.worker().process(await f.job());
    assert.equal(f.transport.length, 3);
    assert.equal(f.state.isConnected, true);
    f.advance(10_000);
    await f.worker().process(await f.job());
    assert.equal(f.transport.length, 5);
    assert.equal(f.state.isConnected, true);
    assert.equal(
        f.writes.some((write) => write.isConnected === false),
        false,
    );
    assert.equal(f.observations.get(uuid).failures, 0);
    assert.equal(f.records.at(-1).status, 'ok');
});

test('busy-only jobs preserve cross-worker failures and a successful job resets the evidence', async (t) => {
    const f = fixture(t);
    f.client.getSystemStats = async () => failed;
    let calls = 0;
    f.client.getSystemStats = async () => (++calls === 1 ? failed : busy);
    await f.worker().process(await f.job());
    assert.equal(f.observations.get(uuid).failures, 1);
    f.advance(10_000);
    f.client.getSystemStats = async () => busy;
    await f.worker().process(await f.job());
    assert.equal(f.observations.get(uuid).failures, 1);
    f.advance(10_000);
    f.client.getSystemStats = async () => healthy;
    await f.worker().process(await f.job());
    assert.equal(f.observations.get(uuid).failures, 0);
    f.advance(10_000);
    calls = 0;
    f.client.getSystemStats = async () => (++calls === 1 ? failed : busy);
    await f.worker().process(await f.job());
    assert.equal(f.state.isConnected, true);
    assert.equal(f.observations.get(uuid).failures, 1);
});

test('a delayed older failed RPC cannot replace a newer successful health observation', async (t) => {
    const f = fixture(t);
    const release = deferred();
    let calls = 0;
    f.client.getSystemStats = async () => (++calls === 1 ? release.promise : healthy);
    const old = f.worker().process(await f.job());
    while (calls === 0) await new Promise((done) => setImmediate(done));
    f.advance(10_000);
    await f.worker().process(await f.job());
    release.resolve(failed);
    await old;
    assert.equal(f.state.isConnected, true);
    assert.equal(f.observations.get(uuid).failures, 0);
    assert.equal(
        f.writes.some((write) => write.isConnected === false),
        false,
    );
});

test('a failure already admitted before a newer success cannot write offline after that success', async (t) => {
    const f = fixture(t);
    f.client.getSystemStats = async () => failed;
    const paused = f.holdOfflineWrite();
    const old = f.worker().process(await f.job());
    await paused.entered.promise;
    f.advance(10_000);
    f.client.getSystemStats = async () => healthy;
    await f.worker().process(await f.job());
    paused.release.resolve();
    await old;
    assert.equal(
        f.state.isConnected,
        true,
        'A stale SQL write overwrote a newer successful observation',
    );
    assert.equal(
        f.writes.some((write) => write.isConnected === false),
        false,
    );
    assert.equal(f.deleted.length, 0);
    assert.equal(
        f.records.some((record) => record.status === 'unreachable'),
        false,
    );
});

test('control revision changes reset the streak and queued older revisions cannot poison it', async (t) => {
    const f = fixture(t);
    let calls = 0;
    f.client.getSystemStats = async () => (++calls === 1 ? failed : busy);
    const oldJob = await f.job();
    await f.worker().process(oldJob);
    f.advance(10_000);
    f.state.controlRevision = nextRevision;
    f.state.revision = nextRevision;
    calls = 0;
    await f.worker().process(await f.job());
    assert.equal(f.state.isConnected, true);
    assert.equal(f.observations.get(uuid).failures, 1);
    assert.equal(f.observations.get(uuid).controlRevision, nextRevision);
    calls = 0;
    await f.worker().process(oldJob);
    assert.equal(f.observations.get(uuid).controlRevision, nextRevision);
    assert.equal(f.state.isConnected, true);
});

test('duplicate deliveries count each real attempt once across worker instances', async (t) => {
    const f = fixture(t);
    const entry = await f.job();
    let calls = 0;
    f.client.getSystemStats = async () => (++calls <= 2 ? failed : busy);
    await Promise.all([f.worker().process(entry), f.worker().process(entry)]);
    assert.equal(f.state.isConnected, true);
    assert.equal(f.observations.get(uuid).failures, 1);
});

test('observation cache outage cannot manufacture an offline transition and later evidence can retry', async (t) => {
    const f = fixture(t);
    f.cacheOutage();
    f.client.getSystemStats = async () => failed;
    await f.worker().process(await f.job());
    assert.equal(f.state.isConnected, true);
    assert.equal(
        f.writes.some((write) => write.isConnected === false),
        false,
    );
    assert.equal(f.deleted.length, 0);
    f.cacheOutage(false);
    f.advance(10_000);
    await f.worker().process(await f.job());
    assert.equal(f.state.isConnected, false);
});

test('late offline cleanup cannot remove the snapshot from a newer successful observation', async (t) => {
    const f = fixture(t);
    const entered = deferred(),
        release = deferred();
    const write = f.cache.setManyFenced;
    f.cache.setManyFenced = async (key, epoch, entries) => {
        if (
            entries.some(
                (entry) => entry.key === keys.NODE_TELEMETRY_SNAPSHOT(uuid) && entry.value === null,
            )
        ) {
            entered.resolve();
            await release.promise;
        }
        return write(key, epoch, entries);
    };
    f.client.getSystemStats = async () => failed;
    const old = f.worker().process(await f.job());
    await entered.promise;
    assert.equal(f.state.isConnected, false);
    f.advance(10_000);
    f.client.getSystemStats = async () => healthy;
    await f.worker().process(await f.job());
    release.resolve();
    await old;
    assert.equal(f.state.isConnected, true);
    assert.equal((await f.cache.get(keys.NODE_TELEMETRY_SNAPSHOT(uuid))).xrayUptime, 120);
});

test('actual RawCache health observations reject invalid inputs, unavailable cache and invalid replies', async () => {
    const { RawCacheService } = load(path.join(root, 'common/raw-cache/raw-cache.service.ts'), {
        './memory-cache.service': {},
    });
    const calls = [];
    let result = 1;
    const cache = new RawCacheService(
        {
            eval: async (...args) => {
                calls.push(args);
                if (result instanceof Error) throw result;
                if (result === 'stalled') return new Promise(() => {});
                return result;
            },
        },
        {},
    );
    for (const args of [
        ['invalid', revision, 100_000, 1, false],
        [uuid, 'invalid', 100_000, 1, false],
        [uuid, revision, -1, 1, false],
        [uuid, revision, 100_000, 3, false],
    ])
        await assert.rejects(cache.observeNodeHealth(...args), /Invalid node health observation/);
    assert.equal(calls.length, 0);
    assert.equal(await cache.observeNodeHealth(uuid, revision, 100_000, 1, false), 1);
    assert.deepEqual(calls[0].slice(1), [
        1,
        `remnacust:node-health:v1:${uuid}`,
        revision,
        100_000,
        1,
        0,
    ]);
    result = -1;
    assert.equal(await cache.observeNodeHealth(uuid, revision, 100_000, 1, false), null);
    result = '2';
    await assert.rejects(
        cache.observeNodeHealth(uuid, revision, 100_000, 1, false),
        /Invalid node health observation response/,
    );
    result = Error('Local Redis unavailable');
    await assert.rejects(
        cache.observeNodeHealth(uuid, revision, 100_000, 1, false),
        /Local Redis unavailable/,
    );
    result = 'stalled';
    const started = performance.now();
    await assert.rejects(
        cache.observeNodeHealth(uuid, revision, 100_000, 1, false),
        /Node health observation cache timed out/,
    );
    assert(performance.now() - started < 1500);
});

test(
    'actual cold native Node health is false and panel enqueues configuration without claiming Core recovery',
    { skip: !nativeNodeSource },
    async (t) => {
        const native = await nativeNodeFixture();
        const health = await native.xray.getNodeHealthCheck();
        assert.equal(health.response.isAlive, true);
        assert.equal(health.response.xrayInternalStatusCached, false);
        assert.equal(health.response.nodeVersion, `${native.version}-remnacust`);
        await assert.rejects(native.stats.getSystemStats(), (error) => error.getStatus() === 503);
        assert.equal(native.state.sdkStats, 0);
        const f = fixture(t);
        f.state.isConnected = false;
        attachNativeNode(f, native);
        await f.worker().process(await f.job());
        assert.deepEqual(f.starts, [{ nodeUuid: uuid }]);
        assert.equal(f.state.isConnected, false);
        assert.equal(f.state.lastStatusMessage, '[NODE_CORE_NOT_READY]');
        assert.equal(
            f.records.some((record) => record.status === 'ok'),
            false,
        );
        assert.equal(native.state.starts, 0);
    },
);

test(
    'actual cold native Node respects policy backoff and resumes configuration when it expires',
    { skip: !nativeNodeSource },
    async (t) => {
        const native = await nativeNodeFixture();
        const f = fixture(t);
        f.state.isConnected = false;
        const entry = await f.job();
        await f.cache.set(`retry:${uuid}`, entry.timestamp + 60_000, 3600);
        attachNativeNode(f, native);
        await f.worker().process(entry);
        assert.deepEqual(f.starts, []);
        assert.equal(f.state.isConnected, false);
        f.advance(60_000);
        await f.worker().process(await f.job());
        assert.deepEqual(f.starts, [{ nodeUuid: uuid }]);
        assert.equal(
            f.records.some((record) => record.status === 'ok'),
            false,
        );
    },
);

test(
    'actual active native Core with failed stats is never restarted or declared newly healthy from API alone',
    { skip: !nativeNodeSource },
    async (t) => {
        for (const connected of [true, false]) {
            const native = await nativeNodeFixture();
            native.state.active = true;
            const f = fixture(t);
            f.state.isConnected = connected;
            attachNativeNode(f, native);
            await f.worker().process(await f.job());
            assert.deepEqual(f.starts, []);
            assert.equal(f.state.isConnected, connected);
            assert.equal(
                f.records.some((record) => record.status === 'ok'),
                false,
            );
            assert.equal(native.state.starts, 0);
        }
    },
);

test(
    'real local Redis serializes health evidence, rejects replay and resets on success and revision',
    { skip: !process.env.NODE_HEALTH_TEST_REDIS_URL },
    async () => {
        const url = new URL(process.env.NODE_HEALTH_TEST_REDIS_URL);
        assert.equal(url.hostname, '127.0.0.1');
        assert.equal(url.port, '56383');
        assert.equal(url.pathname, '/15');
        const Redis = require('ioredis');
        const redis = new Redis(url.toString(), {
            enableOfflineQueue: false,
            lazyConnect: true,
            maxRetriesPerRequest: 0,
            retryStrategy: () => null,
        });
        const id = randomUUID(),
            key = `remnacust:node-health:v1:${id}`;
        const { RawCacheService } = load(path.join(root, 'common/raw-cache/raw-cache.service.ts'), {
            './memory-cache.service': {},
        });
        const cache = new RawCacheService(redis, {});
        try {
            await redis.connect();
            const first = await Promise.all(
                Array.from({ length: 16 }, () =>
                    cache.observeNodeHealth(id, revision, 100_000, 1, false),
                ),
            );
            assert.equal(first.filter((value) => value === 1).length, 1);
            assert.equal(first.filter((value) => value === null).length, 15);
            assert.equal(await cache.observeNodeHealth(id, revision, 110_000, 1, false), 2);
            assert.equal(await cache.observeNodeHealth(id, revision, 120_000, 1, true), 0);
            assert.equal(await cache.observeNodeHealth(id, revision, 110_000, 2, false), null);
            assert.equal(await cache.observeNodeHealth(id, nextRevision, 130_000, 1, false), 1);
            assert.equal(await cache.observeNodeHealth(id, revision, 120_000, 2, false), null);
            assert.equal(await cache.observeNodeHealth(id, nextRevision, 130_000, 2, false), 2);
            assert.equal(await cache.observeNodeHealth(id, nextRevision, 130_000, 2, true), 0);
        } finally {
            if (redis.status === 'ready') await redis.del(key);
            redis.disconnect();
        }
    },
);
