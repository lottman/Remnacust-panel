const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');

const processor = path.join(
    __dirname,
    '../src/queue/_nodes/processors/node-health-check.processor.ts',
);
const mocks = {};
for (const match of fs.readFileSync(processor, 'utf8').matchAll(/from '([^']+)'/g))
    if (match[1].startsWith('@') || match[1].startsWith('.')) mocks[match[1]] = {};

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
const keys = Object.fromEntries(
    ['NODE_SYSTEM_INFO', 'NODE_SYSTEM_STATS', 'NODE_USERS_ONLINE', 'NODE_XRAY_UPTIME'].map(
        (name) => [name, (uuid) => `${name}:${uuid}`],
    ),
);
const { NodeHealthCheckQueueProcessor } = load(processor, {
    ...mocks,
    '@nestjs/common': {
        Logger: class {
            log() {}
            warn() {}
            error() {}
            debug() {}
        },
    },
    '@nestjs/bullmq': { Processor: () => (value) => value, WorkerHost: class {} },
    '@contract/constants': { ERRORS: { NODE_ERROR_500_WITH_MSG: { code: 'N002' } } },
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
    '../constants/nodes-job-name.constant': { NODES_JOB_NAMES: { NODE_HEALTH_CHECK: 'health' } },
});

function fixture({
    code = 'N002',
    connected = false,
    cachedCore,
    retryAt,
    validStats = false,
    faults = {},
} = {}) {
    const nodeUuid = '00000000-0000-4000-8000-000000000001';
    const state = { uuid: nodeUuid, isConnected: connected };
    const writes = [],
        records = [],
        deleted = [],
        events = [],
        starts = [],
        observations = [],
        cacheWrites = [];
    const liveKeys = ['NODE_SYSTEM_STATS', 'NODE_XRAY_UPTIME', 'NODE_USERS_ONLINE'].map((name) =>
        keys[name](nodeUuid),
    );
    const cache = new Map(liveKeys.map((key, index) => [key, { stale: index + 1 }]));
    const retryKey = `retry:${nodeUuid}`;
    if (retryAt !== undefined) cache.set(retryKey, retryAt);
    const calls = { stats: 0, health: 0, delMany: 0, record: 0, start: 0 };
    const trace = [],
        warnings = [],
        errors = [];
    const worker = new NodeHealthCheckQueueProcessor(
        {
            execute: async (command) => {
                assert(command instanceof UpdateNodeCommand);
                trace.push('persist');
                writes.push({ ...command.value });
                Object.assign(state, command.value);
                return { isOk: true, response: { ...state } };
            },
        },
        { emitAsync: async (event) => events.push(event) },
        {
            getSystemStats: async (options) => {
                assert.equal(options.uuid, nodeUuid);
                calls.stats++;
                return validStats
                    ? { isOk: true, response: { xrayInfo: { uptime: 120 }, system: null } }
                    : { isOk: false, code, message: 'Core telemetry unavailable' };
            },
            getNodeHealth: async (options) => {
                assert.equal(options.uuid, nodeUuid);
                calls.health++;
                return {
                    isOk: true,
                    response: {
                        isAlive: true,
                        ...(cachedCore === undefined
                            ? {}
                            : { xrayInternalStatusCached: cachedCore }),
                    },
                };
            },
        },
        {
            startNode: async (value) => {
                trace.push('start');
                calls.start++;
                if (faults.start) throw new Error('Fixture start queue unavailable');
                starts.push(value);
            },
        },
        {
            setMany: async (entries) => {
                cacheWrites.push(...entries);
                for (const entry of entries) cache.set(entry.key, entry.value);
            },
            delMany: async (entries) => {
                trace.push('delMany');
                calls.delMany++;
                if (faults.delMany) throw new Error('Fixture cache unavailable');
                deleted.push(...entries);
                for (const key of entries) cache.delete(key);
            },
            get: async (key) => cache.get(key) ?? null,
            getString: async () => null,
            observeNodeIncident: async (_uuid, _at, good, muted, previouslyConnected) => {
                trace.push(good ? 'healthy' : 'unhealthy');
                observations.push({ good, muted, previouslyConnected });
                if (muted) return 0;
                if (good && !previouslyConnected) return 2;
                if (!good && previouslyConnected) return 1;
                return 0;
            },
            acknowledgeNodeIncident: async () => {},
        },
        {
            record: async (value) => {
                trace.push('record');
                calls.record++;
                if (faults.record) throw new Error('Fixture health log unavailable');
                records.push(value);
            },
        },
        {
            execute: async (query) => {
                assert(query instanceof GetNodeByUuidQuery);
                return { isOk: true, response: { ...state, isDisabled: false } };
            },
        },
    );
    worker.logger.warn = (...values) => warnings.push(values.map(String).join(' '));
    worker.logger.error = (...values) => errors.push(values.map(String).join(' '));
    const job = {
        timestamp: Date.now(),
        data: {
            nodeUuid,
            isConnected: connected,
            connectionOpts: { address: '127.0.0.1', port: 2222, proxyUrl: null },
        },
    };
    return {
        worker,
        job,
        nodeUuid,
        state,
        writes,
        records,
        deleted,
        events,
        starts,
        observations,
        cacheWrites,
        cache,
        liveKeys,
        retryKey,
        calls,
        trace,
        warnings,
        errors,
    };
}

async function poll(f) {
    await f.worker.process(f.job);
    assert.equal(
        f.records.some((record) => record.status === 'error'),
        false,
    );
    assert(f.calls.stats > 0);
}

function assertNoHealthyTelemetry(f) {
    assert.equal(
        f.records.some((record) => record.status === 'ok' || record.metrics != null),
        false,
    );
    assert.deepEqual(f.cacheWrites, []);
}

for (const [status, code] of [
    [500, 'N002'],
    [503, 'NODE_HTTP_503'],
]) {
    test(`stats ${status}: explicit Core=false cannot remain connected or confirm healthy`, async () => {
        for (const connected of [true, false]) {
            const f = fixture({ code, connected, cachedCore: false });
            await poll(f);
            assert.equal(f.state.isConnected, false, 'stopped Core retained connected=true');
            assert.equal(
                f.writes.some((value) => value.isConnected === true),
                false,
            );
            assert.equal(
                f.observations.some((value) => value.good),
                false,
            );
            assert.equal(f.events.includes('restored'), false);
            assertNoHealthyTelemetry(f);
        }
    });

    test(`stats ${status}: explicit Core=false evicts all stale live metrics`, async () => {
        for (const connected of [true, false]) {
            const f = fixture({ code, connected, cachedCore: false });
            await poll(f);
            for (const key of f.liveKeys) {
                assert.equal(f.cache.has(key), false, `stopped Core retained ${key}`);
                assert(f.deleted.includes(key), `stopped Core did not invalidate ${key}`);
            }
            assertNoHealthyTelemetry(f);
        }
    });

    test(`stats ${status}: explicit Core=false retains configuration start and policy backoff`, async () => {
        for (const connected of [true, false]) {
            for (const retryAt of [undefined, Date.now() + 86_400_000, Date.now() - 60_000]) {
                const f = fixture({ code, connected, cachedCore: false, retryAt });
                await poll(f);
                assert.deepEqual(f.starts, retryAt > Date.now() ? [] : [{ nodeUuid: f.nodeUuid }]);
                assert.equal(f.cache.get(f.retryKey), retryAt);
                assert.equal(f.deleted.includes(f.retryKey), false);
            }
        }
    });

    test(`stats ${status}: unknown cached Core cannot recover a disconnected node`, async () => {
        for (const cachedCore of [undefined, null]) {
            const f = fixture({ code, cachedCore });
            await poll(f);
            assert.equal(f.state.isConnected, false, 'unknown Core promoted disconnected node');
            assert.equal(
                f.writes.some((value) => value.isConnected === true),
                false,
            );
            assert.equal(
                f.observations.some((value) => value.good),
                false,
            );
            assert.equal(f.events.includes('restored'), false);
            assert.deepEqual(f.starts, []);
            assertNoHealthyTelemetry(f);
        }
    });

    test(`stats ${status}: cached Core=true preserves an already connected degraded legacy node`, async () => {
        const f = fixture({ code, connected: true, cachedCore: true });
        const previousCache = [...f.cache.entries()];
        await poll(f);
        assert.equal(f.state.isConnected, true);
        assert.equal(
            f.writes.some((value) => value.isConnected === false),
            false,
        );
        assert.deepEqual(f.starts, []);
        assert.deepEqual(f.deleted, []);
        assert.deepEqual([...f.cache.entries()], previousCache);
        assert.deepEqual(f.events, []);
        assert.deepEqual(
            f.records.map((record) => record.status),
            ['retry'],
        );
        assertNoHealthyTelemetry(f);
    });

    test(`stats ${status}: stale cached Core=true cannot recover a disconnected node`, async () => {
        const f = fixture({ code, cachedCore: true });
        await poll(f);
        assert.equal(f.state.isConnected, false, 'cached Core=true promoted disconnected node');
        assert.equal(
            f.writes.some((value) => value.isConnected === true),
            false,
        );
        assert.equal(f.events.includes('restored'), false);
        assert.deepEqual(f.starts, []);
        assertNoHealthyTelemetry(f);
    });

    test(`stats ${status}: cached Core=true alone cannot acknowledge new healthy or recovery`, async () => {
        for (const connected of [true, false]) {
            const f = fixture({ code, connected, cachedCore: true });
            await poll(f);
            assert.equal(
                f.observations.some((value) => value.good),
                false,
                'cached latch confirmed healthy',
            );
            assert.equal(f.events.includes('restored'), false);
            assertNoHealthyTelemetry(f);
        }
    });
}

test('valid Core stats recover a disconnected node with existing start and backoff rules', async () => {
    for (const retryAt of [undefined, Date.now() + 86_400_000, Date.now() - 60_000]) {
        const f = fixture({ validStats: true, retryAt });
        await poll(f);
        assert.equal(f.state.isConnected, true);
        assert(f.writes.some((value) => value.isConnected === true));
        assert(f.records.some((record) => record.status === 'ok'));
        assert(f.observations.some((value) => value.good));
        assert.deepEqual(f.events, retryAt > Date.now() ? [] : ['restored']);
        assert.equal(f.cache.get(keys.NODE_XRAY_UPTIME(f.nodeUuid)), 120);
        assert.equal(f.calls.health, 0);
        assert.deepEqual(f.starts, retryAt > Date.now() ? [] : [{ nodeUuid: f.nodeUuid }]);
        assert.equal(f.cache.get(f.retryKey), retryAt);
    }
});

for (const [status, code] of [
    [500, 'N002'],
    [503, 'NODE_HTTP_503'],
]) {
    test(`stats ${status}: cache failure cannot retain green and eviction retries next poll`, async () => {
        const faults = { delMany: true };
        const f = fixture({
            code,
            connected: true,
            cachedCore: false,
            retryAt: Date.now() + 86_400_000,
            faults,
        });
        const binding = `binding:${f.nodeUuid}`;
        f.cache.set(binding, { stale: true });
        f.state.isConnecting = true;
        await f.worker.process(f.job);
        assert.equal(f.state.isConnected, false);
        assert.equal(f.state.isConnecting, true);
        assert(f.writes.every((value) => !Object.hasOwn(value, 'isConnecting')));
        assert(f.trace.indexOf('persist') < f.trace.indexOf('delMany'));
        assert(f.warnings.some((value) => value.includes('Could not clear stale telemetry')));
        assert.equal(f.calls.delMany, 1);
        assert(f.liveKeys.every((key) => f.cache.has(key)));
        assert(f.observations.every((value) => value.good === false));
        assert.deepEqual(f.starts, []);
        faults.delMany = false;
        await f.worker.process(f.job);
        assert.equal(f.calls.delMany, 2);
        assert(f.liveKeys.every((key) => !f.cache.has(key)));
        assert.equal(f.cache.has(binding), false);
        assert.equal(f.state.isConnected, false);
    });

    test(`stats ${status}: health log failure cannot block disconnected persistence or restart`, async () => {
        const f = fixture({ code, connected: true, cachedCore: false, faults: { record: true } });
        await f.worker.process(f.job);
        assert.equal(f.state.isConnected, false);
        assert(f.liveKeys.every((key) => !f.cache.has(key)));
        assert(f.calls.record > 0);
        assert(f.warnings.length > 0, 'health history write failure must emit a warning');
        assert(f.trace.indexOf('persist') < f.trace.indexOf('record'));
        assert.deepEqual(f.starts, [{ nodeUuid: f.nodeUuid }]);
        assert.deepEqual(f.events, ['lost']);
        assert(f.observations.every((value) => value.good === false));
    });

    test(`stats ${status}: failed start enqueue retains an earlier unhealthy incident`, async () => {
        const f = fixture({ code, connected: true, cachedCore: false, faults: { start: true } });
        await f.worker.process(f.job);
        assert.equal(f.state.isConnected, false);
        assert(f.liveKeys.every((key) => !f.cache.has(key)));
        assert.equal(f.calls.start, 1);
        assert.deepEqual(f.events, ['lost']);
        assert.deepEqual(f.observations, [
            { good: false, muted: false, previouslyConnected: true },
        ]);
        assert(f.trace.indexOf('unhealthy') < f.trace.indexOf('start'));
        assert(f.records.some((record) => record.status === 'error'));
        assert(f.errors.some((value) => value.includes('Fixture start queue unavailable')));
    });
}
