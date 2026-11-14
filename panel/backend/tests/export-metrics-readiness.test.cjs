const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { Counter, Gauge, Registry } = require('@prometheus-io/client');
const load = require('./load-typescript.cjs');

const filename = path.join(
    __dirname,
    '../src/scheduler/tasks/export-metrics/export-metrics.task.ts',
);
const mocks = {};
for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g))
    if (match[1].startsWith('@') || match[1].startsWith('.')) mocks[match[1]] = {};
class GetAllNodesQuery {}
class GetNodesSystemStatsQuery {}
const { ExportMetricsTask } = load(filename, {
    ...mocks,
    '@nestjs/common': {
        Injectable: () => (value) => value,
        Logger: class {
            error() {}
        },
    },
    '@nestjs/schedule': { Cron: () => () => {} },
    '@willsoto/nestjs-prometheus': { InjectMetric: () => () => {} },
    '@common/utils/resolve-country-emoji': { resolveCountryEmoji: () => 'XX' },
    '@libs/contracts/constants': { METRIC_NAMES: new Proxy({}, { get: (_, key) => key }) },
    '@modules/nodes/queries/get-all-nodes/get-all-nodes.query': { GetAllNodesQuery },
    '@modules/nodes/queries/get-nodes-system-stats': { GetNodesSystemStatsQuery },
    '@scheduler/intervals': { JOBS_INTERVALS: {} },
});

function fixture() {
    const registry = new Registry();
    const task = Object.create(ExportMetricsTask.prototype);
    const node = {
        uuid: 'fixture',
        name: 'Fixture',
        countryCode: 'XX',
        tags: [],
        isConnected: true,
        isConnecting: false,
        isDisabled: false,
    };
    const state = {
        nodes: [node],
        nodesFailure: null,
        statsFailure: null,
        stats: new Map([[node.uuid, { onlineUsers: 17, system: null }]]),
    };
    const errors = [];
    task.logger = { error: (message) => errors.push(message) };
    task.queryBus = {
        execute: async (query) => {
            const kind = query instanceof GetAllNodesQuery ? 'nodes' : 'stats';
            assert(query instanceof GetAllNodesQuery || query instanceof GetNodesSystemStatsQuery);
            if (state[`${kind}Failure`] === 'throw') throw Error('Fixture read failed');
            if (state[`${kind}Failure`] === 'result') return { isOk: false };
            return { isOk: true, response: state[kind] };
        },
    };
    const liveNames = [
        'nodeOnlineUsers',
        'nodeStatus',
        'nodeMemoryTotalBytes',
        'nodeMemoryFreeBytes',
        'nodeUptimeSeconds',
        'nodeCpuCount',
        'nodeNetworkRxBytesPerSec',
        'nodeNetworkRxBytesTotal',
        'nodeNetworkTxBytesPerSec',
        'nodeNetworkTxBytesTotal',
        'nodeCpuLoadAvg1m',
        'nodeCpuLoadAvg5m',
        'nodeCpuLoadAvg15m',
    ];
    for (const name of liveNames)
        task[name] = new Gauge({
            name,
            help: 'Fixture live metric',
            labelNames: ['node_uuid'],
            registers: [registry],
        });
    task.nodeBasicInfo = new Gauge({
        name: 'nodeBasicInfo',
        help: 'Fixture node metadata',
        labelNames: ['node_uuid', 'node_name', 'node_country_emoji', 'provider_name', 'tags'],
        registers: [registry],
    });
    task.nodeSystemInfo = new Gauge({
        name: 'nodeSystemInfo',
        help: 'Fixture system metadata',
        labelNames: [
            'node_uuid',
            'arch',
            'cpu_model',
            'hostname',
            'platform',
            'release',
            'version',
        ],
        registers: [registry],
    });
    const traffic = [
        'inbound_upload',
        'inbound_download',
        'outbound_upload',
        'outbound_download',
    ].map((name) => {
        const counter = new Counter({
            name,
            help: 'Fixture cumulative traffic',
            labelNames: ['node_uuid', 'tag'],
            registers: [registry],
        });
        counter.inc({ node_uuid: node.uuid, tag: 'fixture' }, 37);
        return counter;
    });
    task.nodeOnlineUsers.set({ node_uuid: node.uuid }, 17);
    return { task, state, node, registry, traffic, errors };
}

async function users(f, uuid = f.node.uuid) {
    return (await f.task.nodeOnlineUsers.get()).values.find(
        (value) => value.labels.node_uuid === uuid,
    )?.value;
}
async function assertTraffic(f) {
    for (const counter of f.traffic) assert.equal((await counter.get()).values[0].value, 37);
}

test('offline, disabled and connecting nodes cannot export cached online users', async () => {
    for (const flags of [{ isConnected: false }, { isDisabled: true }, { isConnecting: true }]) {
        const f = fixture();
        Object.assign(f.node, flags);
        await f.task.reportNodesStats();
        assert.equal(await users(f), 0);
        assert.equal((await f.task.nodeStatus.get()).values[0].value, 0);
        await assertTraffic(f);
    }
});

test('cache read failure, exception and missing sample cannot retain the previous 17 users', async () => {
    for (const failure of ['result', 'throw', 'missing']) {
        const f = fixture();
        if (failure === 'missing') f.state.stats.clear();
        else f.state.statsFailure = failure;
        await f.task.reportNodesStats();
        assert([undefined, 0].includes(await users(f)));
        await assertTraffic(f);
    }
});

for (const failure of ['result', 'throw', 'empty']) {
    test(`successful export followed by node-list ${failure} removes live status and users without resetting traffic`, async () => {
        const f = fixture();
        await f.task.reportNodesStats();
        assert.equal((await f.task.nodeStatus.get()).values[0].value, 1);
        assert.equal(await users(f), 17);
        await assertTraffic(f);

        if (failure === 'empty') f.state.nodes = [];
        else f.state.nodesFailure = failure;
        await f.task.reportNodesStats();
        assert.deepEqual((await f.task.nodeStatus.get()).values, []);
        assert.deepEqual((await f.task.nodeOnlineUsers.get()).values, []);
        await assertTraffic(f);

        f.state.nodesFailure = null;
        f.state.nodes = [f.node];
        await f.task.reportNodesStats();
        assert.equal((await f.task.nodeStatus.get()).values[0].value, 1);
        assert.equal(await users(f), 17);
        await assertTraffic(f);
    });
}

test('active cached user counts work without hardware telemetry and recover after read failure', async () => {
    const f = fixture();
    await f.task.reportNodesStats();
    assert.equal(await users(f), 17);
    f.state.statsFailure = 'result';
    await f.task.reportNodesStats();
    assert([undefined, 0].includes(await users(f)));
    f.state.statsFailure = null;
    f.state.stats.set(f.node.uuid, { onlineUsers: 3, system: null });
    await f.task.reportNodesStats();
    assert.equal(await users(f), 3);
    await assertTraffic(f);
});

test('one poll isolates live user counts for mixed active and inactive nodes', async () => {
    const f = fixture();
    for (const [uuid, flags] of [
        ['offline', { isConnected: false }],
        ['disabled', { isDisabled: true }],
        ['connecting', { isConnecting: true }],
    ]) {
        f.state.nodes.push({ ...f.node, ...flags, uuid });
        f.state.stats.set(uuid, { onlineUsers: 99, system: null });
    }
    await f.task.reportNodesStats();
    assert.equal(await users(f), 17);
    for (const uuid of ['offline', 'disabled', 'connecting']) assert.equal(await users(f, uuid), 0);
    await assertTraffic(f);
});
