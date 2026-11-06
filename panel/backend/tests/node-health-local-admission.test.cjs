const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const load = require('./load-typescript.cjs');
const file = path.join(__dirname, '../src/queue/_nodes/processors/node-health-check.processor.ts');
const mocks = {};
for (const match of fs.readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g))
    if (match[1].startsWith('@') || match[1].startsWith('.')) mocks[match[1]] = {};
class UpdateNodeCommand { constructor(value) { this.value = value; } }
class GetNodeByUuidQuery { constructor(uuid) { this.uuid = uuid; } }
const keys = Object.fromEntries(['NODE_SYSTEM_INFO', 'NODE_SYSTEM_STATS', 'NODE_USERS_ONLINE', 'NODE_XRAY_UPTIME']
    .map(name => [name, uuid => `${name}:${uuid}`]));
const { NodeHealthCheckQueueProcessor } = load(file, {
    ...mocks,
    '@nestjs/common': { Logger: class { log() {} warn() {} error() {} debug() {} } },
    '@nestjs/bullmq': { Processor: () => value => value, WorkerHost: class {} },
    '@common/axios/profile-traffic.schema': { nodeBindingTrafficKey: uuid => `binding:${uuid}`, parseProfileTraffic: () => null },
    '@common/host-policy/sync-host-policy-for-start': { hostPolicyRetryKey: uuid => `retry:${uuid}` },
    '@libs/contracts/constants': { CACHE_KEYS: keys, CACHE_KEYS_TTL: { NODE_SYSTEM_STATS: 60, NODE_XRAY_UPTIME: 60 },
        EVENTS: { NODE: { CONNECTION_LOST: 'lost', CONNECTION_RESTORED: 'restored' } } },
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
    return { timestamp: Date.now(), data: { nodeUuid, isConnected: true,
        connectionOpts: { address: `node-${index}.invalid`, port: 2222, proxyUrl: null } } };
}
function fixture(getSystemStats) {
    const writes = [], records = [], deleted = [], incidents = [], starts = [];
    const worker = new NodeHealthCheckQueueProcessor(
        { execute: async command => { writes.push(command.value); return { isOk: true, response: command.value }; } },
        { emitAsync: async event => incidents.push(event) },
        { getSystemStats },
        { startNode: async value => starts.push(value) },
        { setMany: async () => {}, delMany: async value => deleted.push(value), get: async () => null,
            getString: async () => null, observeNodeIncident: async (_uuid, _at, good) => good ? 0 : 1,
            acknowledgeNodeIncident: async () => {} },
        { record: async value => records.push(value) },
        { execute: async query => ({ isOk: true, response: { uuid: query.uuid, isDisabled: false } }) },
    );
    return { worker, writes, records, deleted, incidents, starts };
}

test('40 healthy nodes under eight-slot local pressure never become offline and later polls succeed', async () => {
    let active = 0, peak = 0, skipped = 0, pressure = true;
    const f = fixture(async opts => {
        assert.match(opts.uuid, /^00000000-0000-4000-8000-/);
        if (pressure && active >= 8) { skipped++; return busy; }
        active++; peak = Math.max(peak, active);
        await new Promise(resolve => setImmediate(resolve));
        active--;
        return healthy;
    });
    const fleet = Array.from({ length: 40 }, (_, i) => job(i + 1));
    await Promise.all(fleet.map(value => f.worker.process(value)));
    assert.equal(skipped, 32);
    assert.equal(peak, 8);
    assert.equal(f.records.filter(record => record.status === 'ok').length, 8);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.deleted, []);
    assert.deepEqual(f.incidents, []);
    assert.deepEqual(f.starts, []);
    assert(f.records.every(record => record.status === 'ok'));
    pressure = false;
    for (const value of fleet) await f.worker.process(value);
    assert.equal(f.records.filter(record => record.status === 'ok').length, 48);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.incidents, []);
});

test('local admission failure on the second attempt cannot turn one network failure into offline', async () => {
    let calls = 0;
    const f = fixture(async () => ++calls === 1 ? { isOk: false, code: 'ETIMEDOUT', message: 'network timeout' } : busy);
    await f.worker.process(job());
    assert.equal(calls, 2);
    assert.deepEqual(f.records.map(record => record.status), ['retry']);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.deleted, []);
    assert.deepEqual(f.incidents, []);
    assert.deepEqual(f.starts, []);
});

test('two actual transport failures still record offline and the connection-lost incident', async () => {
    const f = fixture(async () => ({ isOk: false, code: 'ECONNREFUSED', message: 'connection refused' }));
    await f.worker.process(job());
    assert.deepEqual(f.records.map(record => record.status), ['retry', 'retry', 'unreachable']);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].isConnected, false);
    assert.equal(f.deleted.length, 1);
    assert.deepEqual(f.incidents, ['lost']);
    assert.equal(f.starts.length, 1);
});
