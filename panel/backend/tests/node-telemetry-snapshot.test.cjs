const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const { CACHE_KEYS } = load(
    path.join(__dirname, '../libs/contract/constants/cache-keys/cache-keys.constants.ts'),
);
const { NodesSystemCacheService } = load(
    path.join(__dirname, '../src/modules/nodes/nodes-system-cache.service.ts'),
    {
        '@contract/constants': { CACHE_KEYS },
        '@common/raw-cache': {},
    },
);
const { NodeResponseModel } = load(
    path.join(__dirname, '../src/modules/nodes/models/node.response.model.ts'),
    {
        '@common/utils/nano': { fromNanoToNumber: (value) => value },
    },
);
const before = '11111111-1111-4111-8111-111111111111';
const after = '22222222-2222-4222-8222-222222222222';
const uuid = '33333333-3333-4333-8333-333333333333';

function fixture(snapshot) {
    const rows = new Map([
        [CACHE_KEYS.NODE_SYSTEM_INFO(uuid), JSON.stringify({ cpuCount: 4 })],
        [CACHE_KEYS.NODE_SYSTEM_STATS(uuid), JSON.stringify({ memoryUsed: 999 })],
        [CACHE_KEYS.NODE_XRAY_UPTIME(uuid), '999'],
        [CACHE_KEYS.NODE_USERS_ONLINE(uuid), '17'],
        [CACHE_KEYS.NODE_VERSIONS(uuid), JSON.stringify({ xray: 'old', node: 'old' })],
    ]);
    if (snapshot) rows.set(CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(uuid), JSON.stringify(snapshot));
    const service = new NodesSystemCacheService({
        async get(key) {
            const raw = rows.get(key);
            return raw == null ? null : JSON.parse(raw);
        },
        async getNumber(key) {
            const raw = rows.get(key);
            return raw == null ? 0 : Number(raw);
        },
        createPipeline() {
            const requested = [];
            return {
                get(key) {
                    requested.push(key);
                    return this;
                },
                async exec() {
                    return requested.map((key) => [null, rows.get(key) ?? null]);
                },
            };
        },
    });
    return service;
}

test('cached health metrics and their control revision come from the same JSON snapshot', async () => {
    const service = fixture({ controlRevision: after, stats: { memoryUsed: 2 }, xrayUptime: 20 });
    const response = new NodeResponseModel(
        { uuid, controlRevision: after, isConnected: true, activeInbounds: [] },
        (await service.getMany([{ uuid }])).get(uuid),
    );
    assert.equal(
        response.system.stats.memoryUsed,
        2,
        'a separately delayed legacy metric replaced the fenced snapshot',
    );
    assert.equal(response.xrayUptime, 20);
    assert.equal(response.usersOnline, 17);
    assert.deepEqual(await service.getOne(uuid), (await service.getMany([{ uuid }])).get(uuid));
});

test('a late old snapshot or a missing snapshot cannot revive live metrics in the new generation', async () => {
    for (const snapshot of [
        null,
        { controlRevision: before, stats: { memoryUsed: 1 }, xrayUptime: 10 },
    ]) {
        const service = fixture(snapshot);
        const cached = await service.getOne(uuid);
        const response = new NodeResponseModel(
            { uuid, controlRevision: after, isConnected: true, activeInbounds: [] },
            cached,
        );
        assert.equal(response.system, null);
        assert.equal(response.xrayUptime, 0);
        assert.equal(response.usersOnline, 0);
        assert.deepEqual(response.versions, { xray: 'old', node: 'old' });
    }
});

test('snapshot pipeline offsets preserve independent nodes and return empty telemetry on cache outage', async () => {
    const service = fixture({ controlRevision: after, stats: { memoryUsed: 2 }, xrayUptime: 20 });
    const other = '44444444-4444-4444-8444-444444444444';
    const map = await service.getMany([{ uuid: other }, { uuid }]);
    assert.equal(map.get(other).system, null);
    assert.equal(map.get(other).xrayUptime, 0);
    assert.equal(map.get(uuid).controlRevision, after);
    service.rawCacheService = { createPipeline: () => ({ get() {}, exec: async () => null }) };
    assert.deepEqual(await service.getOne(uuid), {
        system: null,
        versions: null,
        xrayUptime: 0,
        onlineUsers: 0,
    });
});
