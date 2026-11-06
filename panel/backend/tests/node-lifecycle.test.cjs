const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src/queue/_nodes');
const constants = { ERRORS: { NODE_NOT_FOUND: { code: 'A011' } } };
class GetNodeByUuidQuery {
    constructor(uuid) {
        this.uuid = uuid;
    }
}
class UpdateNodeCommand {
    constructor(node) {
        this.node = node;
    }
}
class DeleteNodeByUuidCommand {
    constructor(uuid) {
        this.uuid = uuid;
    }
}
const common = {
    '@nestjs/bullmq': {
        Processor: () => (value) => value,
        InjectQueue: () => () => {},
        WorkerHost: class {},
    },
    '@common/axios': {},
    '@common/database': {},
    '@libs/contracts/constants': constants,
    '@queue/queue.enum': load(path.join(root, '../queue.enum.ts')),
    '@modules/nodes/queries/get-node-by-uuid': { GetNodeByUuidQuery },
    '@modules/nodes/commands/update-node': { UpdateNodeCommand },
    '@modules/nodes/commands/delete-node-by-uuid': { DeleteNodeByUuidCommand },
};
function fixture() {
    const node = {
        uuid: 'aaaaaaaa-1111-4111-8111-111111111111',
        address: 'old.test',
        port: 3000,
        proxyUrl: null,
        activeConfigProfileUuid: 'bbbbbbbb-1111-4111-8111-111111111111',
        activeInbounds: [{ tag: 'vless' }],
        isDisabled: true,
        isConnected: true,
        isConnecting: false,
        lastStatusMessage: 'previous',
    };
    let exists = true,
        active = false,
        transactions = 0,
        stopCalls = 0;
    const writes = [],
        redisValues = new Map(),
        redisCommands = [];
    const redis = {
        options: {},
        sendCommand(command) {
            assert.equal(active, false, 'Redis must never run while the SQL row lock is held');
            redisCommands.push(command);
            const [first, count, key, arg, ttl] = command.args;
            let result;
            if (command.name === 'set') {
                result = redisValues.has(first) ? null : 'OK';
                if (result) redisValues.set(first, count);
            } else if (command.name === 'get') result = redisValues.get(first) ?? null;
            else if (first.includes('PEXPIRE')) result = redisValues.get(key) === arg ? 1 : 0;
            else if (first.includes('generation==')) {
                result =
                    redisValues.has(key) && JSON.parse(redisValues.get(key)).generation === arg
                        ? 1
                        : 0;
                if (result) redisValues.delete(key);
            } else if (first.includes('isNeedToBeDeleted')) {
                const previous = redisValues.get(key);
                result = previous && JSON.parse(previous).isNeedToBeDeleted ? previous : arg;
                redisValues.set(key, result);
            } else {
                result = redisValues.get(key) === arg ? 1 : 0;
                if (result) redisValues.delete(key);
            }
            command.resolve(result);
            return command.promise;
        },
    };
    const sql = (parts, ...values) => ({
        execute: async () => {
            assert.equal(active, true);
            assert(parts.join('').includes('FOR UPDATE'));
            const [uuid, disabled, profile, address, port, proxy] = values;
            const matches =
                exists &&
                uuid === node.uuid &&
                disabled === node.isDisabled &&
                profile === node.activeConfigProfileUuid &&
                address === node.address &&
                port === node.port &&
                proxy === node.proxyUrl;
            return { rows: matches ? [{ uuid }] : [] };
        },
    });
    const tx = {
        withTransaction: async (_opts, work) => {
            transactions++;
            active = true;
            try {
                return await work();
            } finally {
                active = false;
            }
        },
    };
    const types = load(path.join(root, 'port-plan-lease.service.ts'), {
        ...common,
        kysely: { sql },
    });
    const deliveries = new types.PortPlanLeaseService({ kysely: {} }, tx, redis);
    const queryBus = {
        execute: async () =>
            exists
                ? { isOk: true, response: structuredClone(node) }
                : { isOk: false, code: 'A011' },
    };
    const commandBus = {
        execute: async (command) => {
            if (command instanceof DeleteNodeByUuidCommand) {
                exists = false;
                return;
            }
            writes.push(command.node);
            Object.assign(node, command.node);
            return { isOk: true, response: structuredClone(node) };
        },
    };
    const axios = {
        stopXray: async () => {
            stopCalls++;
            return { isOk: true, response: { isStopped: true } };
        },
    };
    const { StopNodeProcessor } = load(path.join(root, 'processors/stop-node.processor.ts'), {
        ...common,
        '../port-plan-lease.service': types,
    });
    const processor = new StopNodeProcessor(axios, queryBus, commandBus, deliveries);
    const job = (data) => ({ data, opts: { attempts: 5 }, attemptsMade: 0 });
    return {
        node,
        redis,
        redisValues,
        redisCommands,
        writes,
        types,
        deliveries,
        processor,
        axios,
        queryBus,
        commandBus,
        job,
        get stopCalls() {
            return stopCalls;
        },
        get transactions() {
            return transactions;
        },
        get exists() {
            return exists;
        },
    };
}

test('stale disable and automatic no-profile stop both preserve a restored enabled node', async () => {
    for (const automatic of [false, true]) {
        const f = fixture();
        if (automatic) {
            f.node.isDisabled = false;
            f.node.activeConfigProfileUuid = null;
            f.node.activeInbounds = [];
        }
        const request = await f.deliveries.saveStopRequest(f.node.uuid, false);
        f.node.isDisabled = false;
        f.node.activeConfigProfileUuid = 'bbbbbbbb-1111-4111-8111-111111111111';
        f.node.activeInbounds = [{ tag: 'restored' }];
        assert.equal(await f.processor.process(f.job(request)), true);
        assert.equal(f.stopCalls, 0);
        assert.equal(f.writes.length, 0);
        assert.equal(f.node.isDisabled, false);
    }
});

test('failed stop has five bounded attempts and never flips the desired disable or reports stopped', async () => {
    for (const response of [
        { isOk: false, message: 'offline' },
        { isOk: true, response: { isStopped: false } },
    ]) {
        const f = fixture();
        f.axios.stopXray = async () => response;
        const request = await f.deliveries.saveStopRequest(f.node.uuid, false);
        for (let attempt = 0; attempt < 5; attempt++) {
            await assert.rejects(f.processor.process({ ...f.job(request), attemptsMade: attempt }));
            assert.equal(f.node.isDisabled, true);
            assert.equal(f.node.isConnected, true);
            assert.match(
                f.node.lastStatusMessage,
                attempt === 4 ? /NODE_STOP_FAILED/ : /NODE_STOP_PENDING/,
            );
        }
        assert(
            f.writes.every(
                (write) =>
                    !Object.hasOwn(write, 'isDisabled') && !Object.hasOwn(write, 'isConnected'),
            ),
        );
    }
});

test('an offline node can still be deleted without any network acknowledgement', async () => {
    const f = fixture();
    f.axios.stopXray = async () => assert.fail('Offline deletion must not contact the node');
    const request = await f.deliveries.saveStopRequest(f.node.uuid, true);
    assert.equal(await f.processor.process(f.job(request)), true);
    assert.equal(f.exists, false);
});

test('enable and endpoint edits during a stop RPC cannot receive a stale disconnected result', async () => {
    for (const edit of [
        (node) => {
            node.isDisabled = false;
        },
        (node) => {
            node.address = 'new.test';
        },
        (node) => {
            node.port++;
        },
        (node) => {
            node.proxyUrl = 'http://new-proxy.test';
        },
    ]) {
        const f = fixture();
        f.axios.stopXray = async () => {
            edit(f.node);
            return { isOk: true, response: { isStopped: true } };
        };
        const request = await f.deliveries.saveStopRequest(f.node.uuid, false);
        assert.equal(await f.processor.process(f.job(request)), true);
        assert.equal(f.writes.length, 0);
        assert.equal(f.node.isConnected, true);
    }
});

test('a newer stop generation survives an old acknowledgement', async () => {
    const f = fixture();
    let newer;
    const request = await f.deliveries.saveStopRequest(f.node.uuid, false);
    f.axios.stopXray = async () => {
        newer = await f.deliveries.saveStopRequest(f.node.uuid, false);
        return { isOk: true, response: { isStopped: true } };
    };
    await f.processor.process(f.job(request));
    assert.equal(f.writes.length, 0);
    assert.equal((await f.deliveries.currentStopRequest(request)).generation, newer.generation);
});

test('delivery ownership serializes independent worker instances while allowing other nodes', async () => {
    const f = fixture();
    const other = new f.types.PortPlanLeaseService({}, {}, f.redis);
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const first = f.deliveries.withLifecycle(f.node.uuid, async (check) => {
        await check();
        await gate;
    });
    await new Promise(setImmediate);
    await assert.rejects(
        other.withLifecycle(f.node.uuid, async () => assert.fail()),
        f.types.NodeDeliveryBusyError,
    );
    await other.withLifecycle('another-node', async (check) => check());
    release();
    await first;
    await other.withLifecycle(f.node.uuid, async (check) => check());
    assert.equal(f.redisValues.size, 0);
});

test('an expired owner cannot assert or release a successor ownership token', async () => {
    const f = fixture();
    await f.deliveries.withLifecycle(f.node.uuid, async (check) => {
        f.redisValues.set(`remnacust:node-delivery:${f.node.uuid}`, 'successor');
        await assert.rejects(check(), f.types.NodeDeliveryLostError);
    });
    assert.equal(f.redisValues.get(`remnacust:node-delivery:${f.node.uuid}`), 'successor');
});

test('stop generation reads time out before acquiring any SQL row lock', async (t) => {
    const f = fixture();
    const request = await f.deliveries.saveStopRequest(f.node.uuid, false);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    f.redis.sendCommand = (command) => command.promise;
    const pending = f.deliveries.commitLifecycleStatus(f.node, async () => assert.fail(), request);
    const rejected = assert.rejects(pending, /timed out/);
    t.mock.timers.tick(5000);
    await rejected;
    assert.equal(f.transactions, 0);
});

test('producers configure one global profile worker and bounded durable node retries', async () => {
    const f = fixture(),
        adds = [],
        globalLimits = [];
    const queues = Array.from({ length: 11 }, (_, i) => ({
        name: String(i),
        waitUntilReady: async () => {},
        setGlobalConcurrency: async (n) => globalLimits.push([i, n]),
        add: async (name, data, opts) => {
            adds.push({ name, data, opts });
        },
    }));
    const { NodesQueuesService } = load(path.join(root, 'nodes-queues.service.ts'), common);
    const producer = new NodesQueuesService(...queues, f.deliveries);
    await producer.onApplicationBootstrap();
    assert.deepEqual(globalLimits, [
        [4, 1],
        [5, 1],
    ]);
    await producer.startNode({ nodeUuid: f.node.uuid });
    await producer.stopNode({ nodeUuid: f.node.uuid, isNeedToBeDeleted: false });
    await producer.stopNode({ nodeUuid: f.node.uuid, isNeedToBeDeleted: true });
    for (const { opts } of adds) {
        assert.equal(opts.attempts, 5);
        assert.deepEqual(opts.backoff, { type: 'fixed', delay: 30000 });
        assert.equal(opts.deduplication.keepLastIfActive, true);
        assert.equal(opts.jobId, undefined);
    }
    assert.equal(adds[1].opts.deduplication.id, adds[2].opts.deduplication.id);
    assert.equal(adds[2].data.isNeedToBeDeleted, true);
});
