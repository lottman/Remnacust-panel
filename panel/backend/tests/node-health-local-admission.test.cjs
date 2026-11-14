const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const load = require('./load-typescript.cjs');
const file = path.join(__dirname, '../src/queue/_nodes/processors/node-health-check.processor.ts');
const mocks = {};
for (const match of fs.readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g))
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
const { NodeHealthCheckQueueProcessor } = load(file, {
    ...mocks,
    '@nestjs/common': {
        Logger: class {
            log() {}
            warn() {}
            error() {}
            debug() {}
        },
    },
    '@contract/constants': { ERRORS: { NODE_ERROR_500_WITH_MSG: { code: 'N002' } } },
    '@nestjs/bullmq': { Processor: () => (value) => value, WorkerHost: class {} },
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

const healthy = { isOk: true, response: { xrayInfo: { uptime: 120 }, system: null } };
const busy = { isOk: false, code: 'NODE_ROUTE_BUSY', message: 'Local admission delayed' };
function job(index = 1) {
    const nodeUuid = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    return {
        timestamp: Date.now(),
        data: {
            nodeUuid,
            isConnected: true,
            connectionOpts: { address: `node-${index}.invalid`, port: 2222, proxyUrl: null },
        },
    };
}
function fixture(
    getSystemStats,
    getNodeHealth = async () => ({ isOk: false, code: 'ECONNREFUSED' }),
) {
    const writes = [],
        records = [],
        deleted = [],
        incidents = [],
        starts = [];
    const cache = new Map(),
        observations = [];
    const worker = new NodeHealthCheckQueueProcessor(
        {
            execute: async (command) => {
                writes.push(command.value);
                return { isOk: true, response: command.value };
            },
        },
        { emitAsync: async (event) => incidents.push(event) },
        { getSystemStats, getNodeHealth },
        { startNode: async (value) => starts.push(value) },
        {
            setMany: async () => {},
            delMany: async (value) => deleted.push(value),
            get: async (key) => cache.get(key) ?? null,
            getString: async () => null,
            observeNodeIncident: async (_uuid, _at, good, muted) => {
                observations.push({ good, muted });
                return good || muted ? 0 : 1;
            },
            acknowledgeNodeIncident: async () => {},
        },
        { record: async (value) => records.push(value) },
        {
            execute: async (query) => ({
                isOk: true,
                response: { uuid: query.uuid, isDisabled: false },
            }),
        },
    );
    return { worker, writes, records, deleted, incidents, starts, cache, observations };
}

test('legacy cached health preserves existing state without inventing connection recovery', async () => {
    for (const connected of [true, false]) {
        const f = fixture(
            async () => ({ isOk: false, code: 'N002', message: 'Failed to get system stats' }),
            async () => ({
                isOk: true,
                response: { isAlive: true, xrayInternalStatusCached: true },
            }),
        );
        const current = job();
        current.data.isConnected = connected;
        await f.worker.process(current);
        assert.deepEqual(f.deleted, []);
        assert.deepEqual(f.starts, []);
        assert.deepEqual(f.incidents, []);
        assert.equal(f.records.length, 1);
        assert.equal(f.records[0].status, 'retry');
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.observations, []);
    }
});

test('an authenticated stopped core loses live metrics and retains configuration backoff', async () => {
    for (const connected of [true, false])
        for (const retry of [null, Date.now() + 60000, Date.now() - 60000]) {
            const f = fixture(
                async () => ({ isOk: false, code: 'N002', message: 'Failed to get system stats' }),
                async () => ({
                    isOk: true,
                    response: { isAlive: true, xrayInternalStatusCached: false },
                }),
            );
            const current = job();
            current.data.isConnected = connected;
            if (retry !== null) f.cache.set(`retry:${current.data.nodeUuid}`, retry);
            await f.worker.process(current);
            assert.equal(f.starts.length, retry !== null && retry > Date.now() ? 0 : 1);
            assert.equal(
                f.records.every((record) => record.status !== 'ok' && !record.metrics),
                true,
            );
            assert.deepEqual(f.deleted, [
                [
                    keys.NODE_SYSTEM_STATS(current.data.nodeUuid),
                    keys.NODE_XRAY_UPTIME(current.data.nodeUuid),
                    keys.NODE_USERS_ONLINE(current.data.nodeUuid),
                    `binding:${current.data.nodeUuid}`,
                ],
            ]);
            assert.equal(f.writes.length, 1);
            assert.equal(f.writes[0].isConnected, false);
            assert.equal(Object.hasOwn(f.writes[0], 'isConnecting'), false);
            assert.equal(
                f.observations.every((value) => !value.good),
                true,
            );
            assert.equal(f.incidents.includes('restored'), false);
        }
});

test('missing core status does not authorize an automatic start', async () => {
    const f = fixture(
        async () => ({ isOk: false, code: 'N002', message: 'Failed to get system stats' }),
        async () => ({ isOk: true, response: { isAlive: true } }),
    );
    await f.worker.process(job());
    assert.deepEqual(f.starts, []);
});

test('a successful telemetry response without core information still schedules configuration with policy backoff', async () => {
    for (const connected of [true, false])
        for (const retry of [null, Date.now() + 60000, Date.now() - 60000]) {
            const f = fixture(async () => ({
                isOk: true,
                response: { xrayInfo: null, system: null, userStateSynchronized: false },
            }));
            const current = job();
            current.data.isConnected = connected;
            if (retry !== null) f.cache.set(`retry:${current.data.nodeUuid}`, retry);
            await f.worker.process(current);
            assert.deepEqual(
                f.starts,
                retry !== null && retry > Date.now() ? [] : [{ nodeUuid: current.data.nodeUuid }],
            );
            assert.equal(f.writes.at(-1).isConnected, false);
            assert.equal(f.records[0].status, 'xray_missing');
            assert.equal(
                f.records.some((record) => record.status === 'ok'),
                false,
            );
        }
});

test('Stats 503 distinguishes cached API health from a confirmed stopped Core', async () => {
    for (const running of [true, false]) {
        const f = fixture(
            async () => ({ isOk: false, code: 'NODE_HTTP_503', message: 'Core is not ready' }),
            async () => ({
                isOk: true,
                response: { isAlive: true, xrayInternalStatusCached: running },
            }),
        );
        await f.worker.process(job());
        if (running) {
            assert.deepEqual(f.writes, []);
            assert.deepEqual(f.deleted, []);
            assert.deepEqual(f.incidents, []);
            assert.deepEqual(f.observations, []);
        } else {
            assert.equal(f.writes.length, 1);
            assert.equal(f.writes[0].isConnected, false);
            assert.equal(f.deleted[0].length, 4);
            assert.deepEqual(f.incidents, ['lost']);
        }
        assert.equal(f.starts.length, running ? 0 : 1);
        assert.deepEqual(
            f.records.map((record) => record.status),
            ['retry'],
        );
    }
});

test('Stats 503 preserves policy backoff and cannot bypass unknown readiness or local route admission', async () => {
    for (const readiness of [undefined, false]) {
        const f = fixture(
            async () => ({ isOk: false, code: 'NODE_HTTP_503' }),
            async () => ({
                isOk: true,
                response: { isAlive: true, xrayInternalStatusCached: readiness },
            }),
        );
        const current = job();
        f.cache.set(`retry:${current.data.nodeUuid}`, Date.now() + 60000);
        await f.worker.process(current);
        assert.deepEqual(f.starts, []);
        assert.equal(f.writes.length, readiness === false ? 1 : 0);
        if (readiness === false) assert.equal(f.writes[0].isConnected, false);
    }
    const f = fixture(
        async () => ({ isOk: false, code: 'NODE_HTTP_503' }),
        async () => busy,
    );
    await f.worker.process(job());
    assert.deepEqual(f.starts, []);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.records, []);
    assert.deepEqual(f.observations, []);
});

test('telemetry failure cannot claim connection recovery without authenticated API evidence', async () => {
    for (const health of [
        { isOk: false, code: 'NODE_HTTP_401' },
        { isOk: true, response: {} },
        { isOk: true, response: { isAlive: false, xrayInternalStatusCached: true } },
    ]) {
        const f = fixture(
            async () => ({ isOk: false, code: 'N002', message: 'Failed to get system stats' }),
            async () => health,
        );
        await f.worker.process(job());
        assert.equal(
            f.writes.some((value) => value.isConnected === true),
            false,
        );
        assert.equal(f.writes[0].isConnected, false);
    }
});

test('40 healthy nodes under eight-slot local pressure never become offline and later polls succeed', async () => {
    let active = 0,
        peak = 0,
        skipped = 0,
        pressure = true;
    const f = fixture(async (opts) => {
        assert.match(opts.uuid, /^00000000-0000-4000-8000-/);
        if (pressure && active >= 8) {
            skipped++;
            return busy;
        }
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setImmediate(resolve));
        active--;
        return healthy;
    });
    const fleet = Array.from({ length: 40 }, (_, i) => job(i + 1));
    await Promise.all(fleet.map((value) => f.worker.process(value)));
    assert.equal(skipped, 32);
    assert.equal(peak, 8);
    assert.equal(f.records.filter((record) => record.status === 'ok').length, 8);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.deleted, []);
    assert.deepEqual(f.incidents, []);
    assert.deepEqual(f.starts, []);
    assert(f.records.every((record) => record.status === 'ok'));
    pressure = false;
    for (const value of fleet) await f.worker.process(value);
    assert.equal(f.records.filter((record) => record.status === 'ok').length, 48);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.incidents, []);
});

test('local admission failure on the second attempt cannot turn one network failure into offline', async () => {
    let calls = 0;
    const f = fixture(async () =>
        ++calls === 1 ? { isOk: false, code: 'ETIMEDOUT', message: 'network timeout' } : busy,
    );
    await f.worker.process(job());
    assert.equal(calls, 2);
    assert.deepEqual(
        f.records.map((record) => record.status),
        ['retry'],
    );
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.deleted, []);
    assert.deepEqual(f.incidents, []);
    assert.deepEqual(f.starts, []);
});

test('two actual transport failures still record offline and the connection-lost incident', async () => {
    const f = fixture(async () => ({
        isOk: false,
        code: 'ECONNREFUSED',
        message: 'connection refused',
    }));
    await f.worker.process(job());
    assert.deepEqual(
        f.records.map((record) => record.status),
        ['retry', 'retry', 'unreachable'],
    );
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].isConnected, false);
    assert.equal(f.deleted.length, 1);
    assert.deepEqual(f.incidents, ['lost']);
    assert.equal(f.starts.length, 1);
});

test('two network failures replace stale policy warnings while future and expired retry keys retain scheduling and muting', async () => {
    for (const future of [true, false]) {
        const currentJob = job();
        const retryKey = `retry:${currentJob.data.nodeUuid}`;
        const retryAt = Date.now() + (future ? 60_000 : -60_000);
        let calls = 0;
        const f = fixture(async () => {
            calls++;
            return { isOk: false, code: 'ETIMEDOUT', message: 'Node API connection timed out' };
        });
        f.cache.set(retryKey, retryAt);
        await f.worker.process(currentJob);
        assert.equal(calls, 2);
        assert.deepEqual(
            f.records.map((record) => record.status),
            ['retry', 'retry', 'unreachable'],
        );
        assert.equal(f.writes.length, 1);
        assert.equal(f.writes[0].isConnected, false);
        assert.equal(f.writes[0].lastStatusMessage, 'Node API connection timed out');
        assert.equal(f.cache.get(retryKey), retryAt);
        assert.equal(f.deleted.flat().includes(retryKey), false);
        assert.deepEqual(f.starts, future ? [] : [{ nodeUuid: currentJob.data.nodeUuid }]);
        assert.deepEqual(f.observations, [{ good: false, muted: future }]);
        assert.deepEqual(f.incidents, future ? [] : ['lost']);
    }
});

test('retry keys do not let local admission pressure bypass the two-network-failure barrier', async () => {
    for (const future of [true, false]) {
        const currentJob = job();
        const retryKey = `retry:${currentJob.data.nodeUuid}`;
        const retryAt = Date.now() + (future ? 60_000 : -60_000);
        let calls = 0;
        const f = fixture(async () =>
            ++calls === 1
                ? { isOk: false, code: 'ETIMEDOUT', message: 'Node API connection timed out' }
                : busy,
        );
        f.cache.set(retryKey, retryAt);
        await f.worker.process(currentJob);
        assert.equal(calls, 2);
        assert.deepEqual(
            f.records.map((record) => record.status),
            ['retry'],
        );
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.deleted, []);
        assert.deepEqual(f.starts, []);
        assert.deepEqual(f.observations, []);
        assert.deepEqual(f.incidents, []);
        assert.equal(f.cache.get(retryKey), retryAt);
    }
});
