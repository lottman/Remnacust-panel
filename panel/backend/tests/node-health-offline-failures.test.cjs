const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
class NodeEvent {
    constructor(node, event) {
        this.node = node;
        this.event = event;
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
    '@integration-modules/notifications/interfaces': { NodeEvent },
    '@queue/queue.enum': { QUEUES_NAMES: { NODES: { HEALTH_CHECK: 'health' } } },
    '../constants/nodes-job-name.constant': { NODES_JOB_NAMES: { NODE_HEALTH_CHECK: 'health' } },
});

function fixture(mode, fault) {
    const uuid = '00000000-0000-4000-8000-000000000002';
    const state = {
        uuid,
        address: '127.0.0.1',
        port: 2222,
        isConnected: true,
        isConnecting: true,
        isDisabled: false,
    };
    const faults = Object.fromEntries(
        ['delMany', 'record', 'start'].map((name) => [name, fault === name || fault === 'all']),
    );
    const liveKeys = [
        keys.NODE_SYSTEM_STATS(uuid),
        keys.NODE_XRAY_UPTIME(uuid),
        keys.NODE_USERS_ONLINE(uuid),
    ];
    const cache = new Map(liveKeys.map((key) => [key, { stale: true }]));
    cache.set(keys.NODE_SYSTEM_INFO(uuid), { cpus: 1 });
    const writes = [],
        observations = [],
        events = [],
        records = [],
        starts = [],
        errors = [];
    const calls = { stats: 0, health: 0, delMany: 0, record: 0, start: 0, setMany: 0 };
    const worker = new NodeHealthCheckQueueProcessor(
        {
            execute: async (command) => {
                assert(command instanceof UpdateNodeCommand);
                assert.equal(command.value.uuid, uuid);
                writes.push({ ...command.value });
                Object.assign(state, command.value);
                return { isOk: true, response: { ...state } };
            },
        },
        {
            emitAsync: async (event, payload) => {
                assert(payload instanceof NodeEvent);
                assert.equal(payload.node.uuid, uuid);
                events.push(event);
            },
        },
        {
            getSystemStats: async (options) => {
                assert.equal(options.uuid, uuid);
                calls.stats++;
                return mode === 'null-core'
                    ? { isOk: true, response: { xrayInfo: null, system: null } }
                    : {
                          isOk: false,
                          code: 'ECONNREFUSED',
                          message: 'Fixture transport disconnected',
                      };
            },
            getNodeHealth: async () => {
                calls.health++;
                throw new Error('These negative paths must not use the 500/503 health fallback');
            },
        },
        {
            startNode: async (value) => {
                calls.start++;
                assert.deepEqual(value, { nodeUuid: uuid });
                if (faults.start) throw new Error('Fixture start enqueue failed');
                starts.push(value);
            },
        },
        {
            get: async (key) => cache.get(key) ?? null,
            getString: async () => null,
            setMany: async () => {
                calls.setMany++;
            },
            delMany: async (entries) => {
                calls.delMany++;
                if (faults.delMany) throw new Error('Fixture cache deletion failed');
                for (const key of entries) cache.delete(key);
            },
            observeNodeIncident: async (
                nodeUuid,
                observedAt,
                healthy,
                muted,
                previouslyConnected,
            ) => {
                assert.equal(nodeUuid, uuid);
                assert.equal(typeof observedAt, 'number');
                observations.push({ healthy, muted, previouslyConnected });
                return muted
                    ? 0
                    : healthy
                      ? Number(!previouslyConnected) * 2
                      : Number(previouslyConnected);
            },
            acknowledgeNodeIncident: async () => {},
        },
        {
            record: async (value) => {
                calls.record++;
                if (faults.record) throw new Error('Fixture health history write failed');
                records.push(value);
            },
        },
        {
            execute: async (query) => {
                assert(query instanceof GetNodeByUuidQuery);
                assert.equal(query.uuid, uuid);
                return { isOk: true, response: { ...state } };
            },
        },
    );
    worker.logger.error = (message) => errors.push(message);
    return {
        state,
        faults,
        cache,
        liveKeys,
        writes,
        observations,
        events,
        records,
        starts,
        errors,
        calls,
        poll: async () => {
            let failure = null;
            try {
                await worker.process({
                    timestamp: Date.now(),
                    data: {
                        nodeUuid: uuid,
                        isConnected: state.isConnected,
                        connectionOpts: {
                            address: state.address,
                            port: state.port,
                            proxyUrl: null,
                        },
                    },
                });
            } catch (error) {
                failure = error;
            }
            return failure;
        },
    };
}

for (const mode of ['null-core', 'transport-disconnect']) {
    for (const fault of ['none', 'delMany', 'record', 'start', 'all']) {
        test(`${mode}: worker.process retains offline and unhealthy incident with ${fault} failure`, async () => {
            const f = fixture(mode, fault);
            const rejection = await f.poll();

            assert.equal(
                f.state.isConnected,
                false,
                'an auxiliary failure left the database online',
            );
            assert(f.writes.some((value) => value.isConnected === false));
            assert(f.writes.every((value) => value.isConnected !== true));
            assert.equal(f.state.isConnecting, true);
            assert.deepEqual(f.observations, [
                { healthy: false, muted: false, previouslyConnected: true },
            ]);
            assert.deepEqual(f.events, ['lost']);
            assert.equal(f.calls.stats, mode === 'null-core' ? 1 : 2);
            assert.equal(f.calls.health, 0);
            assert.equal(f.calls.setMany, 0);
            assert.equal(f.calls.delMany, 1);
            assert(f.calls.record > 0);
            assert.equal(f.calls.start, 1);
            assert.equal(f.starts.length, f.faults.start ? 0 : 1);
            assert(f.records.every((record) => record.status !== 'ok' && !record.metrics));
            assert.equal(rejection, null, 'an auxiliary exception escaped worker.process');

            if (f.faults.delMany) {
                assert(f.liveKeys.every((key) => f.cache.has(key)));
            } else {
                assert(f.liveKeys.every((key) => !f.cache.has(key)));
            }
            if (fault === 'delMany') {
                f.faults.delMany = false;
                assert.equal(await f.poll(), null);
                assert.equal(f.state.isConnected, false);
                assert(f.liveKeys.every((key) => !f.cache.has(key)));
                assert(f.observations.every((value) => value.healthy === false));
                assert.deepEqual(f.events, ['lost']);
            }
        });
    }
}
