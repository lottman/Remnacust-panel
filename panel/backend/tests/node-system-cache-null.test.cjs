const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const contract = require('../libs/contract/build/frontend');
const root = path.resolve(__dirname, '..');
const { CACHE_KEYS } = load(
    path.join(root, 'libs/contract/constants/cache-keys/cache-keys.constants.ts'),
);
const { NodesSystemCacheService } = load(
    path.join(root, 'src/modules/nodes/nodes-system-cache.service.ts'),
    { '@contract/constants': { CACHE_KEYS }, '@common/raw-cache': {} },
);
const { NodeResponseModel } = load(
    path.join(root, 'src/modules/nodes/models/node.response.model.ts'),
    { '@common/utils/nano': load(path.join(root, 'src/common/utils/nano/nano.util.ts')) },
);
const uuid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const revision = '33333333-3333-4333-8333-333333333333';
const olderRevision = '44444444-4444-4444-8444-444444444444';
const info = {
    arch: 'x64',
    cpus: 4,
    cpuModel: 'synthetic',
    memoryTotal: 200,
    hostname: 'synthetic',
    platform: 'linux',
    release: 'synthetic',
    type: 'Linux',
    version: 'synthetic',
    networkInterfaces: [],
};
const stats = { memoryFree: 100, memoryUsed: 100, uptime: 10, loadAvg: [0, 0, 0], interface: null };
const versions = { xray: '1.1.22', node: '1.1.38' };

function fixture() {
    const rows = new Map();
    const errors = new Map();
    const execution = { error: null, empty: false };
    const service = new NodesSystemCacheService({
        createPipeline() {
            const keys = [];
            return {
                get(key) {
                    keys.push(key);
                    return this;
                },
                async exec() {
                    if (execution.error) throw execution.error;
                    if (execution.empty) return null;
                    return keys.map((key) => [errors.get(key) ?? null, rows.get(key) ?? null]);
                },
            };
        },
    });
    function seed(id, systemInfo = null) {
        rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(id), JSON.stringify(systemInfo));
        rows.set(CACHE_KEYS.NODE_SYSTEM_STATS(id), JSON.stringify(stats));
        rows.set(CACHE_KEYS.NODE_USERS_ONLINE(id), '7');
        rows.set(CACHE_KEYS.NODE_VERSIONS(id), JSON.stringify(versions));
        rows.set(CACHE_KEYS.NODE_XRAY_UPTIME(id), '999');
        rows.set(
            CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(id),
            JSON.stringify({ controlRevision: revision, stats, xrayUptime: 12 }),
        );
    }
    seed(uuid);
    return { service, rows, errors, execution, seed };
}

function entity(id = uuid, patch = {}) {
    return {
        uuid: id,
        id: 1n,
        name: 'Synthetic',
        address: 'node.example.test',
        port: 443,
        proxyUrl: null,
        controlRevision: revision,
        controlAddresses: [{ address: 'node.example.test', enabled: true }],
        isConnected: true,
        isConnecting: false,
        isDisabled: false,
        lastStatusChange: null,
        lastStatusMessage: null,
        isTrafficTrackingActive: false,
        trafficResetDay: null,
        trafficLimitBytes: null,
        trafficUsedBytes: null,
        notifyPercent: null,
        note: null,
        consumptionMultiplier: 1000000000n,
        nodeConsumptionMultiplier: 1000000000n,
        tags: [],
        integrationUuids: [],
        ips: [],
        createdAt: new Date(0),
        updatedAt: new Date(0),
        viewPosition: 0,
        countryCode: 'US',
        activeConfigProfileUuid: null,
        activeInbounds: [],
        providerUuid: null,
        provider: null,
        activePluginUuid: null,
        ...patch,
    };
}

function response(hot, id = uuid, patch) {
    return JSON.parse(JSON.stringify(new NodeResponseModel(entity(id, patch), hot)));
}

function assertNodeContract(node) {
    const result = contract.GetNodeCommand.ResponseSchema.safeParse({ response: node });
    assert.equal(
        result.success,
        true,
        result.success
            ? ''
            : JSON.stringify(result.error.issues.map(({ path, code }) => ({ path, code }))),
    );
}

test('getOne serialized-null info produces declared system:null and preserves current telemetry evidence', async () => {
    const f = fixture();
    const hot = await f.service.getOne(uuid);
    assertNodeContract(response(hot));
    assert.equal(hot.system, null);
    assert.equal(hot.controlRevision, revision);
    assert.equal(hot.xrayUptime, 12);
    assert.equal(hot.onlineUsers, 7);
    assert.deepEqual(hot.versions, versions);
});

test('getMany preserves node correlation and the browser list contract with null and complete info', async () => {
    const f = fixture();
    f.seed(other, info);
    const hot = await f.service.getMany([{ uuid: other }, { uuid }]);
    assert.equal(hot.get(uuid).system, null);
    assert.deepEqual(hot.get(other).system, { info, stats });
    assert.equal(
        contract.GetNodesCommand.ResponseSchema.safeParse({
            response: [response(hot.get(other), other), response(hot.get(uuid))],
        }).success,
        true,
    );
});

test('missing and serialized-null info have identical unknown-system semantics', async () => {
    const f = fixture();
    const serializedNull = await f.service.getOne(uuid);
    f.rows.delete(CACHE_KEYS.NODE_SYSTEM_INFO(uuid));
    assert.deepEqual(await f.service.getOne(uuid), serializedNull);
});

test('absent stats do not newly decode corrupt info or synthesize a system', async () => {
    const f = fixture();
    f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), '{');
    f.rows.delete(CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(uuid));
    f.rows.delete(CACHE_KEYS.NODE_SYSTEM_STATS(uuid));
    const hot = await f.service.getOne(uuid);
    assert.equal(hot.system, null);
    assert.equal(hot.controlRevision, null);
    assertNodeContract(response(hot));
});

test('explicit null snapshot stats stay unknown instead of borrowing legacy stats', async () => {
    const f = fixture();
    f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), '{');
    f.rows.set(
        CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(uuid),
        JSON.stringify({ controlRevision: revision, stats: null, xrayUptime: 12 }),
    );
    assert.equal((await f.service.getOne(uuid)).system, null);
});

test('corrupt usable info, legacy stats and snapshots retain their JSON failures', async () => {
    for (const field of ['NODE_SYSTEM_INFO', 'NODE_SYSTEM_STATS', 'NODE_TELEMETRY_SNAPSHOT']) {
        const f = fixture();
        if (field === 'NODE_SYSTEM_STATS') f.rows.delete(CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(uuid));
        f.rows.set(CACHE_KEYS[field](uuid), '{');
        await assert.rejects(f.service.getOne(uuid), SyntaxError);
        await assert.rejects(f.service.getMany([{ uuid }]), SyntaxError);
    }
});

test('non-null malformed info and versions remain rejected by the unchanged response contract', async () => {
    for (const value of [{}, 0, false, '', []]) {
        const f = fixture();
        f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), JSON.stringify(value));
        const result = contract.GetNodeCommand.ResponseSchema.safeParse({
            response: response(await f.service.getOne(uuid)),
        });
        assert.equal(result.success, false);
        assert.ok(
            result.error.issues.some(
                ({ path }) => path.slice(0, 3).join('.') === 'response.system.info',
            ),
        );
    }
    const f = fixture();
    f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), JSON.stringify(info));
    f.rows.set(CACHE_KEYS.NODE_VERSIONS(uuid), JSON.stringify({ xray: null, node: '1.1.38' }));
    assert.equal(
        contract.GetNodeCommand.ResponseSchema.safeParse({
            response: response(await f.service.getOne(uuid)),
        }).success,
        false,
    );
});

test('finite zero metrics and authoritative snapshot uptime survive stale legacy numbers', async () => {
    const f = fixture();
    f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), JSON.stringify(info));
    f.rows.set(CACHE_KEYS.NODE_USERS_ONLINE(uuid), '0');
    f.rows.set(CACHE_KEYS.NODE_XRAY_UPTIME(uuid), 'Infinity');
    f.rows.set(
        CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(uuid),
        JSON.stringify({ controlRevision: revision, stats, xrayUptime: 0 }),
    );
    const hot = await f.service.getOne(uuid);
    assert.equal(hot.onlineUsers, 0);
    assert.equal(hot.xrayUptime, 0);
    assertNodeContract(response(hot));
});

test('nonfinite online numbers are not replaced with invented healthy counts', async () => {
    const countSchema =
        contract.GetStatsCommand.ResponseSchema.shape.response.shape.nodes.shape.totalOnline;
    for (const value of ['NaN', 'Infinity', '-Infinity', 'not-a-number']) {
        const f = fixture();
        f.rows.set(CACHE_KEYS.NODE_USERS_ONLINE(uuid), value);
        const hot = await f.service.getOne(uuid);
        assert.equal(Number.isFinite(hot.onlineUsers), false);
        const total = await f.service.getTotalOnlineUsers([{ uuid }]);
        assert.equal(Number.isFinite(total), false);
        assert.equal(countSchema.safeParse(total).success, false);
        assert.equal(
            contract.GetNodeCommand.ResponseSchema.safeParse({ response: response(hot) }).success,
            false,
        );
    }
});

test('nonfinite legacy uptime and null snapshot uptime cannot become a valid live metric', async () => {
    const f = fixture();
    f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), JSON.stringify(info));
    f.rows.delete(CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(uuid));
    f.rows.set(CACHE_KEYS.NODE_XRAY_UPTIME(uuid), 'Infinity');
    const legacy = await f.service.getOne(uuid);
    assert.equal(Number.isFinite(legacy.xrayUptime), false);
    assert.equal(
        contract.GetNodeCommand.ResponseSchema.safeParse({
            response: response(legacy, uuid, { controlRevision: undefined }),
        }).success,
        false,
    );
    f.rows.set(
        CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(uuid),
        JSON.stringify({ controlRevision: revision, stats, xrayUptime: null }),
    );
    const unknown = await f.service.getOne(uuid);
    assert.equal(unknown.xrayUptime, null);
    assert.equal(
        contract.GetNodeCommand.ResponseSchema.safeParse({ response: response(unknown) }).success,
        false,
    );
});

test('old or absent snapshot revision cannot inherit the current node revision', async () => {
    for (const controlRevision of [olderRevision, null, undefined]) {
        const f = fixture();
        f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), JSON.stringify(info));
        f.rows.set(
            CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(uuid),
            JSON.stringify({ controlRevision, stats, xrayUptime: 12 }),
        );
        const hot = await f.service.getOne(uuid);
        assert.equal(hot.controlRevision, controlRevision ?? null);
        const node = response(hot);
        assert.equal(node.system, null);
        assert.equal(node.usersOnline, 0);
        assert.equal(node.xrayUptime, 0);
        assert.deepEqual(node.versions, versions);
        assertNodeContract(node);
    }
});

test('disconnected, disabled and connecting nodes do not promote cached telemetry', async () => {
    const f = fixture();
    f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), JSON.stringify(info));
    const hot = await f.service.getOne(uuid);
    for (const flags of [{ isConnected: false }, { isDisabled: true }, { isConnecting: true }]) {
        const node = response(hot, uuid, flags);
        assert.equal(node.system, null);
        assert.equal(node.usersOnline, 0);
        assert.equal(node.xrayUptime, 0);
        assertNodeContract(node);
    }
});

test('per-key Redis errors preserve existing unknown-value and snapshot-fallback semantics', async () => {
    const f = fixture();
    const error = new Error('synthetic Redis key failure');
    f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), '{');
    for (const field of ['NODE_SYSTEM_INFO', 'NODE_VERSIONS', 'NODE_USERS_ONLINE'])
        f.errors.set(CACHE_KEYS[field](uuid), error);
    const hot = await f.service.getOne(uuid);
    assert.equal(hot.system, null);
    assert.equal(hot.versions, null);
    assert.equal(hot.onlineUsers, 0);
    assert.equal(hot.controlRevision, revision);
    assert.equal(hot.xrayUptime, 12);
    assertNodeContract(response(hot));
    assert.equal(await f.service.getTotalOnlineUsers([{ uuid }]), 0);
    f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(uuid), JSON.stringify(info));
    f.errors.clear();
    f.errors.set(CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(uuid), error);
    const legacy = await f.service.getOne(uuid);
    assert.equal(legacy.controlRevision, null);
    assert.equal(legacy.xrayUptime, 999);
    assert.equal(response(legacy).system, null);
});

test('pipeline failures propagate unchanged for all three public read methods', async () => {
    const f = fixture();
    const error = new Error('synthetic pipeline failure');
    f.execution.error = error;
    for (const read of [
        () => f.service.getOne(uuid),
        () => f.service.getMany([{ uuid }]),
        () => f.service.getTotalOnlineUsers([{ uuid }]),
    ])
        await assert.rejects(read(), (failure) => failure === error);
});

test('null pipeline and empty inputs keep the established absence behavior', async () => {
    const f = fixture();
    assert.equal((await f.service.getMany([])).size, 0);
    assert.equal(await f.service.getTotalOnlineUsers([]), 0);
    f.execution.empty = true;
    assert.deepEqual(await f.service.getOne(uuid), {
        system: null,
        versions: null,
        xrayUptime: 0,
        onlineUsers: 0,
    });
    assert.equal(await f.service.getTotalOnlineUsers([{ uuid }]), 0);
});

test('total online users stays independent of null or corrupt system-info cache entries', async () => {
    const f = fixture();
    f.seed(other, info);
    f.rows.set(CACHE_KEYS.NODE_SYSTEM_INFO(other), '{');
    f.rows.set(CACHE_KEYS.NODE_USERS_ONLINE(other), '11');
    assert.equal(await f.service.getTotalOnlineUsers([{ uuid }, { uuid: other }]), 18);
});

const handlerMocks = {
    '@common/types': {
        ok: (response) => ({ isOk: true, response }),
        fail: (error) => ({ isOk: false, error }),
    },
    '@libs/contracts/constants': contract,
    '@modules/nodes/nodes-system-cache.service': { NodesSystemCacheService },
    '../../repositories/nodes.repository': {},
};

test('actual system-stats and recap consumers accept unknown info without discarding valid peers', async () => {
    const f = fixture();
    f.seed(other, info);
    const { GetNodesSystemStatsHandler } = load(
        path.join(
            root,
            'src/modules/nodes/queries/get-nodes-system-stats/get-nodes-system-stats.handler.ts',
        ),
        handlerMocks,
    );
    const { GetNodesRecapHandler } = load(
        path.join(root, 'src/modules/nodes/queries/get-nodes-recap/get-nodes-recap.handler.ts'),
        handlerMocks,
    );
    const nodes = [entity(), entity(other)];
    const recap = new GetNodesRecapHandler({ findAllNodes: async () => nodes }, f.service);
    recap.logger.error = () => {};
    assert.deepEqual(await recap.execute(), {
        isOk: true,
        response: { total: 2, totalRam: 200, totalCpuCores: 4, distinctCountries: 1 },
    });
    const result = await new GetNodesSystemStatsHandler(f.service).execute({ nodes });
    assert.equal(result.isOk, true);
    assert.equal(result.response.get(uuid).system, null);
});

test('actual online-count consumer retains the aggregate and reports pipeline failure', async () => {
    const f = fixture();
    f.seed(other, info);
    const { CountOnlineUsersHandler } = load(
        path.join(
            root,
            'src/modules/nodes/queries/count-online-users/count-online-users.handler.ts',
        ),
        handlerMocks,
    );
    const handler = new CountOnlineUsersHandler(
        { findConnectedNodesPartial: async () => [{ uuid }, { uuid: other }] },
        f.service,
    );
    handler.logger.error = () => {};
    assert.deepEqual(await handler.execute(), { isOk: true, response: { usersOnline: 14 } });
    f.execution.error = new Error('synthetic pipeline failure');
    assert.equal((await handler.execute()).isOk, false);
});
