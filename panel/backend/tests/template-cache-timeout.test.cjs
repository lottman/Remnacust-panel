const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { RawCacheService } = load(
    path.join(__dirname, '../src/common/raw-cache/raw-cache.service.ts'),
    {
        './memory-cache.service': {},
        '../database/prisma.service': {},
    },
);
const revision = 'a'.repeat(32);
const db = { $queryRaw: async () => [{ revision }] };
const stalled = () => new Promise(() => {});

test('stalled Redis template reads and writes have a bounded wait', async () => {
    const cache = new RawCacheService({ get: stalled, set: stalled }, { get: () => undefined }, db);
    const start = performance.now();
    await assert.rejects(cache.templateSnapshot('template'), /Template cache timeout/);
    await assert.rejects(
        cache.setTemplateSnapshot('template', revision, {}),
        /Template cache timeout/,
    );
    assert.ok(performance.now() - start < 2000);
});

test('stalled host template cache falls back to authorized repository rows', async () => {
    const cache = new RawCacheService({}, {}, db);
    cache.logger = { warn() {} };
    cache.mget = stalled;
    cache.setMany = stalled;
    let reads = 0;
    const result = await cache.cachedByKeys(['host'], {
        templateGeneration: true,
        cacheKey: (id) => id,
        ttlSeconds: 60,
        fetch: async (ids) => {
            reads++;
            return ids.map((id) => ({ id, value: 'authorized' }));
        },
        rowId: (row) => row.id,
        toValue: (row) => row.value,
    });
    assert.equal(result.get('host'), 'authorized');
    assert.equal(reads, 1);
});

test('a late cache rejection after timeout is observed', async () => {
    let reject;
    const cache = new RawCacheService(
        {
            get: () =>
                new Promise((_resolve, fail) => {
                    reject = fail;
                }),
        },
        { get: () => undefined },
        db,
    );
    await assert.rejects(cache.templateSnapshot('template'), /Template cache timeout/);
    reject(Error('late Redis failure'));
    await new Promise((resolve) => setImmediate(resolve));
});
