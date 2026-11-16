const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { ERRORS } = require('../libs/contract/build/backend/constants/errors/errors.js');

const base = path.join(__dirname, '../src/modules/nodes');
const queueRoot = path.join(__dirname, '../src/queue/_nodes');
const leaseTypes = load(path.join(queueRoot, 'port-plan-lease.service.ts'), {
    '@common/database': {},
});
const { NodesQueuesService } = load(path.join(queueRoot, 'nodes-queues.service.ts'), {
    '@common/axios': {},
    '@queue/queue.enum': load(path.join(queueRoot, '../queue.enum.ts')),
    './port-plan-lease.service': leaseTypes,
});
const serviceFile = path.join(base, 'nodes.service.ts');
const aliases = Object.fromEntries(
    [...fs.readFileSync(serviceFile, 'utf8').matchAll(/from '([^']+)'/g)]
        .filter((match) => /^@(common|modules|queue|integration-)/.test(match[1]))
        .map((match) => [match[1], {}]),
);
const { NodesService } = load(serviceFile, {
    ...aliases,
    '@queue/_nodes/port-plan-lease.service': leaseTypes,
    '@contract/constants': { ERRORS, EVENTS: { NODE: { DELETED: 'node.deleted' } } },
    '@common/types': {
        ok: (response) => ({ isOk: true, response }),
        fail: (error) => ({ isOk: false, ...error }),
    },
    '@integration-modules/notifications/interfaces': {
        NodeEvent: class {
            constructor(node) {
                this.node = node;
            }
        },
    },
    './entities': {},
    './models': {},
    './repositories/nodes.repository': {},
    './nodes-system-cache.service': {},
    './dtos': {},
});

function ownershipFixture() {
    const leases = new Map();
    const commands = [];
    let now = 0;
    const redis = {
        options: { keyPrefix: 'ioraw:' },
        sendCommand(command) {
            commands.push(command);
            const [first, second, key, owner, ttl] = command.args;
            const leaseKey = command.name === 'eval' ? key : first;
            let lease = leases.get(leaseKey);
            if (lease && lease.expires <= now) {
                leases.delete(leaseKey);
                lease = undefined;
            }
            let result;
            if (command.name === 'set') {
                assert.equal(command.args[2], 'PX');
                assert.equal(Number(command.args[3]), 120000);
                assert.equal(command.args[4], 'NX');
                result = lease ? null : 'OK';
                if (result) leases.set(leaseKey, { owner: second, expires: now + 120000 });
            } else if (command.name === 'eval') {
                result = lease?.owner === owner ? 1 : 0;
                if (result && first.includes('PEXPIRE')) lease.expires = now + Number(ttl);
                else if (result) leases.delete(leaseKey);
            } else assert.fail(`Unexpected Redis command: ${command.name}`);
            command.resolve(result);
            return command.promise;
        },
    };
    const deliveries = new leaseTypes.PortPlanLeaseService({}, {}, redis);
    return {
        deliveries,
        commands,
        leases,
        redis,
        advance: (ms) => {
            now += ms;
        },
        hold: (uuid, owner = 'foreign-owner') => {
            const key = `ioraw:remnacust:node-delivery:${uuid}`;
            leases.set(key, { owner, expires: now + 120000 });
            return key;
        },
    };
}

function fixture() {
    const node = {
        uuid: '11111111-1111-4111-8111-111111111111',
        address: 'node.example.test',
        isConnected: false,
        isDisabled: false,
    };
    const rows = new Map([[node.uuid, node]]);
    const calls = [];
    const repository = {
        findByUUID: async (uuid) => rows.get(uuid) ?? null,
        deleteByUUID: async (uuid) => {
            calls.push('delete');
            return rows.delete(uuid);
        },
    };
    const ownership = ownershipFixture();
    const queueHandles = Array.from({ length: 11 }, () => ({
        add: async () => assert.fail('Deletion must not enqueue a deferred stop intent'),
    }));
    const queues = new NodesQueuesService(...queueHandles, ownership.deliveries);
    const events = {
        emit: (event, payload) => {
            assert.equal(event, 'node.deleted');
            assert.equal(payload.node, node);
            calls.push('event');
        },
    };
    const cache = {
        delete: async (uuid) => {
            assert.equal(uuid, node.uuid);
            calls.push('cache');
        },
    };
    const routes = {
        invalidate: async () => {
            assert.equal(rows.has(node.uuid), false, 'Invalidate routes after commit');
            calls.push('routes');
        },
    };
    const service = new NodesService(repository, events, queues, {}, {}, cache, routes);
    service.logger = { error() {}, warn() {} };
    return { node, rows, calls, repository, queues, events, cache, routes, service, ...ownership };
}

test('deletion commits before success without a STOP worker, for online and offline nodes', async () => {
    for (const isConnected of [true, false]) {
        const f = fixture();
        f.node.isConnected = isConnected;
        assert.deepEqual(await f.service.deleteNode(f.node.uuid), { isOk: true, response: true });
        assert.equal(f.rows.has(f.node.uuid), false);
        assert.deepEqual(f.calls, ['delete', 'routes', 'event', 'cache']);
    }
});

test('deletion does not depend on queue or remote node availability', async () => {
    const f = fixture();
    f.node.controlAddresses = [{ address: f.node.address, enabled: false }];
    f.queues.stopNode = async () => {
        throw Error('queue unavailable');
    };
    assert.equal((await f.service.deleteNode(f.node.uuid)).isOk, true);
    assert.equal(f.rows.size, 0);
});

test('a missing node preserves NODE_NOT_FOUND without deletion side effects', async () => {
    const f = fixture();
    f.rows.clear();
    assert.equal((await f.service.deleteNode(f.node.uuid)).code, ERRORS.NODE_NOT_FOUND.code);
    assert.deepEqual(f.calls, []);
});

test('failed database deletion preserves the node and emits no success side effects', async () => {
    for (const failure of ['throw', 'false']) {
        const f = fixture();
        f.repository.deleteByUUID = async () => {
            if (failure === 'throw') throw Error('database unavailable');
            return false;
        };
        const result = await f.service.deleteNode(f.node.uuid);
        assert.equal(result.isOk, false);
        assert.equal(result.code, ERRORS.DELETE_NODE_ERROR.code);
        assert.equal(f.rows.size, 1);
        assert.deepEqual(f.calls, []);
    }
});

test('post-commit route, notification and telemetry failures cannot report deletion failure', async () => {
    for (const target of ['routes', 'events', 'cache']) {
        const f = fixture();
        const method = { routes: 'invalidate', events: 'emit', cache: 'delete' }[target];
        f[target][method] = () => {
            f.calls.push(target);
            throw Error(`${target} unavailable`);
        };
        assert.equal((await f.service.deleteNode(f.node.uuid)).isOk, true);
        assert.equal(f.rows.size, 0);
        assert.equal(f.calls.length, 4, 'All independent cleanup operations must be attempted');
    }
});

test('a repeated delete cannot notify twice or delete a different node', async () => {
    const f = fixture();
    const other = '22222222-2222-4222-8222-222222222222';
    f.rows.set(other, { uuid: other });
    assert.equal((await f.service.deleteNode(f.node.uuid)).isOk, true);
    assert.equal((await f.service.deleteNode(f.node.uuid)).code, ERRORS.NODE_NOT_FOUND.code);
    assert.equal(f.rows.has(other), true);
    assert.deepEqual(f.calls, ['delete', 'routes', 'event', 'cache']);
});

test('occupied lifecycle ownership returns translated HTTP409 without deleting or queuing', async () => {
    const f = fixture();
    const key = f.hold(f.node.uuid);
    const result = await f.service.deleteNode(f.node.uuid);
    assert.equal(result.isOk, false);
    assert.equal(result.code, ERRORS.NODE_DELETE_BUSY.code);
    assert.equal(result.httpCode, 409);
    const { errorHandler } = load(
        path.join(__dirname, '../src/common/helpers/error-handler.helper.ts'),
        {
            '@libs/contracts/constants/errors': { ERRORS },
        },
    );
    assert.throws(
        () => errorHandler(result),
        (error) => error.getStatus() === 409 && error.errorCode === 'A272',
    );
    assert.equal(f.rows.size, 1);
    assert.equal(f.leases.get(key).owner, 'foreign-owner');
    assert.deepEqual(f.calls, []);
    assert.equal(f.commands.length, 1);
    f.leases.delete(key);
    assert.equal((await f.service.deleteNode(f.node.uuid)).isOk, true);
    assert.equal(f.rows.size, 0);
    assert.equal(f.leases.size, 0);
});

test('a failed Redis lease acquisition cannot delete the node or report success', async () => {
    const f = fixture();
    f.redis.sendCommand = (command) => {
        command.reject(Error('Redis unavailable'));
        return command.promise;
    };
    assert.equal((await f.service.deleteNode(f.node.uuid)).code, ERRORS.DELETE_NODE_ERROR.code);
    assert.equal(f.rows.size, 1);
    assert.deepEqual(f.calls, []);
});

test('deletion success waits for database commit and serializes competing delete requests', async () => {
    const f = fixture();
    let enterDelete, commitDelete;
    const entered = new Promise((resolve) => {
        enterDelete = resolve;
    });
    const gate = new Promise((resolve) => {
        commitDelete = resolve;
    });
    const remove = f.repository.deleteByUUID;
    f.repository.deleteByUUID = async (uuid) => {
        enterDelete();
        await gate;
        return remove(uuid);
    };
    let completed = false;
    const first = f.service.deleteNode(f.node.uuid).then((result) => {
        completed = true;
        return result;
    });
    await entered;
    let second;
    try {
        assert.equal(completed, false);
        assert.equal(f.rows.size, 1);
        second = await f.service.deleteNode(f.node.uuid);
    } finally {
        commitDelete();
    }
    assert.equal((await first).isOk, true);
    assert.equal(second.code, ERRORS.NODE_DELETE_BUSY.code);
    assert.equal(f.rows.size, 0);
    assert.equal(f.leases.size, 0);
    assert.deepEqual(f.calls, ['delete', 'routes', 'event', 'cache']);
});

test('an abandoned foreign lifecycle lease expires after 120 seconds and permits retry', async () => {
    const f = fixture();
    f.hold(f.node.uuid);
    f.advance(119999);
    assert.equal((await f.service.deleteNode(f.node.uuid)).code, ERRORS.NODE_DELETE_BUSY.code);
    f.advance(2);
    assert.equal((await f.service.deleteNode(f.node.uuid)).isOk, true);
    assert.equal(f.rows.size, 0);
});

test('ownership lost during lookup cannot delete or release a successor lease', async () => {
    const f = fixture();
    let key;
    f.repository.findByUUID = async () => {
        key = f.hold(f.node.uuid, 'successor');
        return f.node;
    };
    const result = await f.service.deleteNode(f.node.uuid);
    assert.equal(result.isOk, false);
    assert.equal(result.code, ERRORS.NODE_DELETE_BUSY.code);
    assert.equal(f.rows.size, 1);
    assert.equal(f.leases.get(key).owner, 'successor');
    assert.deepEqual(f.calls, []);
});

test('post-compression dispatch finishes under its lifecycle lease before deletion can succeed', async () => {
    const commonRoot = path.join(__dirname, '../src/common');
    const { AxiosService } = load(path.join(commonRoot, 'axios/axios.service.ts'), {
        '@common/config/app-config/typed-config.service': {},
        '@common/raw-cache': {},
        '@common/utils/bytes': { prettyBytesUtil: String },
        '@common/utils/certs': load(
            path.join(commonRoot, 'utils/certs/generate-servername.util.ts'),
        ),
        '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
        '@common/utils/node-version': { nodeSupportsCompression: () => true },
        '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
        '@contract/constants': { ERRORS },
        '../types': {
            ok: (response) => ({ isOk: true, response }),
            fail: (error) => ({ isOk: false, ...error }),
        },
    });
    const f = fixture();
    const registered = {
        ...f.node,
        port: 443,
        proxyUrl: null,
        controlAddresses: [{ address: f.node.address, enabled: true }],
        revision: '22222222-2222-4222-8222-222222222222',
    };
    let enterCompression, releaseCompression;
    const entered = new Promise((resolve) => {
        enterCompression = resolve;
    });
    const gate = new Promise((resolve) => {
        releaseCompression = resolve;
    });
    let dispatched = 0;
    let dispatchedAfterDeletion = false;
    const transport = Object.create(AxiosService.prototype);
    Object.assign(transport, {
        mtlsOptions: {},
        nodeVersions: new Map(),
        rawCacheService: {},
        logger: { log() {} },
        nodeRoutes: { confirmed() {} },
        resolveAgent: () => ({}),
        routeRegistry: {
            get: async () => {
                assert(f.rows.has(f.node.uuid));
                return registered;
            },
            isCurrent: async () => f.rows.has(f.node.uuid),
        },
        compressData: async () => {
            enterCompression();
            await gate;
            return { buffer: Buffer.from('compressed'), size: 1 };
        },
        axiosInstance: {
            post: async () => {
                dispatched++;
                dispatchedAfterDeletion = !f.rows.has(f.node.uuid);
                return { data: { response: { isStarted: true } } };
            },
        },
    });
    const running = f.deliveries.withLifecycle(f.node.uuid, () =>
        transport.request({
            label: 'START XRAY',
            path: '/node/xray/start',
            opts: registered,
            data: {},
            compress: true,
        }),
    );
    await entered;
    let busy;
    try {
        busy = await f.service.deleteNode(f.node.uuid);
    } finally {
        releaseCompression();
    }
    const result = await running;
    assert.equal(
        busy.isOk,
        false,
        'Deletion cannot succeed while the active dispatcher owns the lease',
    );
    assert.equal(busy.code, ERRORS.NODE_DELETE_BUSY.code);
    assert.equal(result.isOk, true);
    assert.equal(dispatched, 1);
    assert.equal(dispatchedAfterDeletion, false);
    assert.equal(f.rows.size, 1);
    assert.equal((await f.service.deleteNode(f.node.uuid)).isOk, true);
    assert.equal(f.rows.size, 0);
    assert.equal(dispatched, 1);
});

test('queued deletion exhausts retries behind a lifecycle owner even if diagnostic CAS rejects', async () => {
    const queueRoot = path.join(__dirname, '../src/queue/_nodes');
    class GetNodeByUuidQuery {}
    class DeleteNodeByUuidCommand {}
    class UpdateNodeCommand {
        constructor(node) {
            this.node = node;
        }
    }
    const mocks = {
        '@nestjs/bullmq': {
            Processor: () => (value) => value,
            InjectQueue: () => () => {},
            WorkerHost: class {},
        },
        '@common/axios': {},
        '@common/database': {},
        '@libs/contracts/constants': { ERRORS },
        '@queue/queue.enum': load(path.join(queueRoot, '../queue.enum.ts')),
        '@modules/nodes/queries/get-node-by-uuid': { GetNodeByUuidQuery },
        '@modules/nodes/commands/delete-node-by-uuid': { DeleteNodeByUuidCommand },
        '@modules/nodes/commands/update-node': { UpdateNodeCommand },
    };
    for (const stale of [false, true]) {
        const f = fixture();
        const saved = new Map();
        let diagnosticWrites = 0;
        const redis = {
            options: {},
            sendCommand(command) {
                const [first, , key, arg] = command.args;
                let result;
                if (command.name === 'set') result = null;
                else if (command.name === 'get') result = saved.get(first) ?? null;
                else if (first.includes('isNeedToBeDeleted')) {
                    saved.set(key, arg);
                    result = arg;
                } else if (first.includes('generation==')) {
                    result = saved.has(key) && JSON.parse(saved.get(key)).generation === arg;
                    if (result) saved.delete(key);
                    result = Number(result);
                } else assert.fail(`Unexpected Redis command: ${command.name}`);
                command.resolve(result);
                return command.promise;
            },
        };
        const leaseTypes = load(path.join(queueRoot, 'port-plan-lease.service.ts'), {
            ...mocks,
            kysely: {
                sql: (_parts, ...values) => ({
                    execute: async () => {
                        assert.equal(values[0], f.node.uuid);
                        return { rows: stale || !f.rows.has(f.node.uuid) ? [] : [f.node] };
                    },
                }),
            },
        });
        const deliveries = new leaseTypes.PortPlanLeaseService(
            { kysely: {} },
            { withTransaction: async (_options, work) => work() },
            redis,
        );
        const { NodesQueuesService } = load(path.join(queueRoot, 'nodes-queues.service.ts'), mocks);
        let queued;
        const queues = Array.from({ length: 11 }, () => ({
            add: async (_name, data, opts) => {
                queued = { data, opts };
            },
        }));
        const producer = new NodesQueuesService(...queues, deliveries);
        await producer.stopNode({ nodeUuid: f.node.uuid, isNeedToBeDeleted: true });
        assert.deepEqual(Object.keys(queued.data).sort(), [
            'generation',
            'isNeedToBeDeleted',
            'nodeUuid',
        ]);
        assert.equal(queued.data.isNeedToBeDeleted, true);
        assert.equal(queued.opts.attempts, 5);
        assert.deepEqual(queued.opts.backoff, { type: 'fixed', delay: 30000 });
        const { StopNodeProcessor } = load(
            path.join(queueRoot, 'processors/stop-node.processor.ts'),
            {
                ...mocks,
                '../port-plan-lease.service': leaseTypes,
            },
        );
        const processor = new StopNodeProcessor(
            { stopXray: async () => assert.fail('Deletion must not contact a node') },
            { execute: async () => ({ isOk: true, response: structuredClone(f.node) }) },
            {
                execute: async (command) => {
                    assert(
                        command instanceof UpdateNodeCommand,
                        'Deletion never reaches its command',
                    );
                    diagnosticWrites++;
                    return { isOk: true };
                },
            },
            deliveries,
        );
        processor.logger = { error() {} };
        for (let attemptsMade = 0; attemptsMade < queued.opts.attempts; attemptsMade++) {
            await assert.rejects(
                processor.process({ ...queued, attemptsMade }),
                leaseTypes.NodeDeliveryBusyError,
            );
        }
        assert.equal(diagnosticWrites, stale ? 0 : 5);
        assert.equal(f.rows.has(f.node.uuid), true);
        assert.equal(saved.size, 0, 'Terminal failure clears the durable deletion generation');
        assert.equal((await f.service.deleteNode(f.node.uuid)).isOk, true);
        assert.equal(f.rows.has(f.node.uuid), false);
        assert.equal(
            await deliveries.commitLifecycleStatus(f.node, async () => assert.fail('Stale write')),
            undefined,
        );
    }
});
