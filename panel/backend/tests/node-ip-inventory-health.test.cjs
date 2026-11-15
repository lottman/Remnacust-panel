const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const load = require('./load-typescript.cjs');

const root = path.join(__dirname, '../src');
const file = path.join(root, 'queue/_nodes/processors/node-health-check.processor.ts');
const { ObserveNodeIpInventoryCommand } = load(
    path.join(
        root,
        'modules/nodes/commands/observe-node-ip-inventory/observe-node-ip-inventory.command.ts',
    ),
);
const { NODE_IP_SCAN_INTERVAL_MS: interval } = load(
    path.join(root, 'modules/nodes/node-ip-inventory.constants.ts'),
);
const id = '00000000-0000-4000-8000-000000000001';
const revision = '00000000-0000-4000-8000-000000000002';
const next = '00000000-0000-4000-8000-000000000003';
class Logger {
    warn() {}
    log() {}
    error() {}
}
class Update {
    constructor(value) {
        this.value = value;
    }
}

function fixture() {
    const calls = [],
        writes = [],
        telemetry = [],
        starts = [];
    const state = { uuid: id, controlRevision: revision, isConnected: true, isDisabled: false };
    const keys = Object.fromEntries(
        [
            'NODE_SYSTEM_INFO',
            'NODE_SYSTEM_STATS',
            'NODE_USERS_ONLINE',
            'NODE_XRAY_UPTIME',
            'NODE_TELEMETRY_SNAPSHOT',
        ].map((key) => [key, (uuid) => `${key}:${uuid}`]),
    );
    let now = interval * 2;
    class Clock extends Date {
        static now() {
            return now;
        }
    }
    const imports = Object.fromEntries(
        [...fs.readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)]
            .filter((m) => m[1].startsWith('@') || m[1].startsWith('.'))
            .map((m) => [m[1], {}]),
    );
    const { NodeHealthCheckQueueProcessor } = load(
        file,
        {
            ...imports,
            '@nestjs/common': { Logger },
            '@nestjs/bullmq': { Processor: () => (value) => value, WorkerHost: class {} },
            '@contract/constants': { ERRORS: { NODE_ERROR_500_WITH_MSG: { code: 'N002' } } },
            '@modules/nodes/commands/update-node': { UpdateNodeCommand: Update },
            '@modules/nodes/queries/get-node-by-uuid': { GetNodeByUuidQuery: class {} },
            '../../../modules/nodes/commands/observe-node-ip-inventory/observe-node-ip-inventory.command':
                { ObserveNodeIpInventoryCommand },
            '../../../modules/nodes/node-ip-inventory.constants': {
                NODE_IP_SCAN_INTERVAL_MS: interval,
            },
            '@common/axios/profile-traffic.schema': {
                nodeBindingTrafficKey: (uuid) => `traffic:${uuid}`,
                parseProfileTraffic: () => null,
            },
            '@common/host-policy/sync-host-policy-for-start': {
                hostPolicyRetryKey: (uuid) => `retry:${uuid}`,
            },
            '@libs/contracts/constants': {
                CACHE_KEYS: keys,
                CACHE_KEYS_TTL: { NODE_SYSTEM_STATS: 60, NODE_XRAY_UPTIME: 60 },
                EVENTS: {},
            },
            '@queue/queue.enum': { QUEUES_NAMES: { NODES: { HEALTH_CHECK: 'health' } } },
            '../constants/nodes-job-name.constant': {
                NODES_JOB_NAMES: { NODE_HEALTH_CHECK: 'health' },
            },
        },
        { Date: Clock },
    );
    const stats = {
        xrayInfo: { uptime: 12 },
        system: {
            info: { ipAddresses: ['192.0.2.1', '2001:db8::1'] },
            stats: { memoryUsed: 1, memoryFree: 2, loadAvg: [0, 0, 0] },
        },
    };
    let scan = async () => ({ isOk: true, response: { ...state } });
    const worker = new NodeHealthCheckQueueProcessor(
        {
            execute: async (command) => {
                if (command instanceof ObserveNodeIpInventoryCommand) {
                    calls.push(command);
                    return scan(command);
                }
                writes.push(command.value);
                Object.assign(state, command.value);
                return { isOk: true, response: { ...state } };
            },
        },
        { emitAsync: async () => {} },
        { getSystemStats: async () => ({ isOk: true, response: stats }) },
        { startNode: async (value) => starts.push(value) },
        {
            observeNodeHealth: async () => 0,
            get: async () => null,
            getString: async () => null,
            setManyFenced: async (_key, _epoch, values) => {
                telemetry.push(...values);
                return true;
            },
        },
        { record: async () => {} },
        { execute: async () => ({ isOk: true, response: { ...state } }) },
    );
    worker.reportIncident = async () => {};
    const { NodesQueuesService } = load(path.join(root, 'queue/_nodes/nodes-queues.service.ts'), {
        '@common/axios': {},
        '@queue/queue.enum': { QUEUES_NAMES: { NODES: { HEALTH_CHECK: 'health' } } },
        '@nestjs/bullmq': { InjectQueue: () => () => {} },
        '@nestjs/common': { Injectable: () => (value) => value, Logger },
    });
    const producer = Object.create(NodesQueuesService.prototype);
    producer.nodeHealthCheckQueue = { addBulk: async (values) => values };
    return {
        calls,
        writes,
        telemetry,
        stats,
        state,
        starts,
        set scan(value) {
            scan = value;
        },
        set now(value) {
            now = value;
        },
        async run(scannedAt = null) {
            const [job] = await producer.checkNodeHealthBulk([
                {
                    ...state,
                    ipScanAt: scannedAt,
                    connectionOpts: { uuid: id, address: 'node.test', port: 7289, proxyUrl: null },
                },
            ]);
            assert.equal(job.data.ipScanAt, scannedAt);
            await worker.process({ ...job, timestamp: now });
        },
    };
}

test('actual scheduler producer carries scan time and a due successful health check observes both IP families', async () => {
    const f = fixture();
    await f.run();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].uuid, id);
    assert.equal(f.calls[0].controlRevision, revision);
    assert.deepEqual(f.calls[0].addresses, ['192.0.2.1', '2001:db8::1']);
    assert.ok(f.writes.some((row) => row.isConnected === true));
    assert.ok(f.telemetry.length);
});

test('fresh persisted scan skips inventory work until the exact 30 minute boundary', async () => {
    const f = fixture();
    await f.run(interval + 1);
    assert.equal(f.calls.length, 0);
    await f.run(interval);
    assert.equal(f.calls.length, 1);
});

test('a scan that changes control revision cannot promote telemetry from the preceding revision', async () => {
    const f = fixture();
    f.scan = async () => ({ isOk: true, response: { ...f.state, controlRevision: next } });
    await f.run();
    assert.equal(f.calls.length, 1);
    assert.equal(f.writes.length, 0);
    assert.equal(f.telemetry.length, 0);
    assert.equal(f.starts.length, 0);
});

test('inventory storage failures retain normal health handling without clearing addresses', async () => {
    const f = fixture();
    f.scan = async () => {
        throw Error('synthetic inventory failure');
    };
    await f.run();
    assert.equal(f.calls.length, 1);
    assert.ok(f.writes.some((row) => row.isConnected === true));
    assert.ok(f.telemetry.length);
});

test('legacy stats without complete address metadata cannot trigger a scan', async () => {
    const f = fixture();
    delete f.stats.system.info;
    await f.run();
    assert.equal(f.calls.length, 0);
    assert.ok(f.writes.some((row) => row.isConnected === true));
});
