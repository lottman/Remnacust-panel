const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Redis = require('ioredis');
const load = require('./load-typescript.cjs');
const url = process.env.TEMPLATE_CACHE_TEST_REDIS_URL;
assert.ok(url, 'Set isolated TEMPLATE_CACHE_TEST_REDIS_URL');
const parsed = new URL(url);
assert.equal(parsed.hostname, '127.0.0.1');
assert.equal(parsed.port, '56382');
assert.equal(parsed.pathname, '/15');
const prefix = 'template-generation-test:' + randomUUID() + ':';
const redisA = new Redis(url, { keyPrefix: prefix });
const redisB = new Redis(url, { keyPrefix: prefix });
const admin = new Redis(url);
const { RawCacheService } = load(
    path.join(__dirname, '../src/common/raw-cache/raw-cache.service.ts'),
    { './memory-cache.service': {}, '../database/prisma.service': {} },
);
const { ERRORS } = load(path.join(__dirname, '../libs/contract/constants/errors/errors.ts'));
const { SubscriptionTemplateService } = load(
    path.join(__dirname, '../src/modules/subscription-template/subscription-template.service.ts'),
    {
        '@common/types': {
            ok: (response) => ({ isOk: true, response }),
            fail: (error) => ({ isOk: false, error }),
        },
        '@common/utils': {},
        '@libs/contracts/constants': {
            ERRORS,
            CACHE_KEYS: { SUBSCRIPTION_TEMPLATE: (name, type) => `template:${type}:${name}` },
        },
        '@libs/contracts/models': {},
        './constants': {},
        './models/get-templates.response.model': {},
        './geofiles/xray-geofile-delivery': { XrayGeofileDelivery: class {} },
    },
);
function memory() {
    const values = new Map();
    return {
        get: (key) => values.get(key),
        set: (key, value) => values.set(key, value),
        invalidate: async (key) => values.delete(key),
    };
}
(async () => {
    try {
        let revision = randomUUID().replaceAll('-', '');
        const advance = () => {
            revision = randomUUID().replaceAll('-', '');
        };
        const db = { $queryRaw: async () => [{ revision }] };
        const cacheA = new RawCacheService(redisA, memory(), db),
            cacheB = new RawCacheService(redisB, memory(), db);
        let row = {
                uuid: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
                name: 'Saved',
                templateType: 'SINGBOX',
                tags: [],
                templateJson: { marker: 'old' },
                templateYaml: null,
                draftContent: null,
            },
            reads = 0;
        const repository = {
            findByUUID: async () => structuredClone(row),
            getTemplateByNameAndTypeOrGetDefault: async () => {
                reads++;
                return structuredClone(row);
            },
            update: async (patch) => {
                for (const [key, value] of Object.entries(patch))
                    if (value !== undefined) row[key] = value;
                advance();
                return structuredClone(row);
            },
            deleteByUUID: async () => {
                row = null;
                advance();
            },
        };
        const reader = new SubscriptionTemplateService(repository, cacheA, {});
        const publisher = new SubscriptionTemplateService(repository, cacheB, {});
        let release, started, lateApplied;
        const ready = new Promise((r) => {
                started = r;
            }),
            gate = new Promise((r) => {
                release = r;
            });
        const set = cacheA.setTemplateSnapshot.bind(cacheA);
        cacheA.setTemplateSnapshot = async (...args) => {
            started();
            await gate;
            return (lateApplied = await set(...args));
        };
        const oldRead = reader.getCachedTemplateByType('SINGBOX', 'Saved');
        await ready;
        assert.equal(
            (await publisher.updateTemplate(row.uuid, undefined, { marker: 'new' }, undefined))
                .isOk,
            true,
        );
        release();
        await oldRead;
        assert.equal(lateApplied, false, 'Committed database revision rejects the old cache fill');
        assert.equal((await reader.getCachedTemplateByType('SINGBOX', 'Saved')).marker, 'new');
        await reader.getCachedTemplateByType('SINGBOX', 'Saved');
        const beforeReads = reads;
        let evals = 0;
        const originalEval = redisA.eval.bind(redisA);
        redisA.eval = (...args) => {
            evals++;
            return originalEval(...args);
        };
        assert.equal((await reader.getCachedTemplateByType('SINGBOX', 'Saved')).marker, 'new');
        assert.equal(evals, 0, 'Hot L1 reads only the shared generation');
        assert.equal(reads, beforeReads);
        redisA.eval = originalEval;
        assert.equal(
            (await publisher.updateTemplate(row.uuid, undefined, { marker: 'newest' }, undefined))
                .isOk,
            true,
        );
        assert.equal(
            (await reader.getCachedTemplateByType('SINGBOX', 'Saved')).marker,
            'newest',
            'Other worker L1 cannot reuse the previous generation',
        );
        const snapshot = await cacheA.templateSnapshot('reset');
        advance();
        assert.equal(await cacheA.setTemplateSnapshot('reset', snapshot.generation, {}), false);
        assert.notEqual((await cacheB.templateSnapshot('reset')).generation, snapshot.generation);
        let batchStarted, batchRelease;
        const batchReady = new Promise((r) => {
                batchStarted = r;
            }),
            batchGate = new Promise((r) => {
                batchRelease = r;
            });
        const options = {
            templateGeneration: true,
            cacheKey: (id) => 'host-template:' + id,
            ttlSeconds: 60,
            rowId: (row) => row.id,
            toValue: (row) => row.value,
        };
        const oldBatch = cacheA.cachedByKeys(['host'], {
            ...options,
            fetch: async () => {
                batchStarted();
                await batchGate;
                return [{ id: 'host', value: 'old' }];
            },
        });
        await batchReady;
        advance();
        await cacheB.invalidateTemplateSnapshots();
        batchRelease();
        await oldBatch;
        assert.equal(
            (
                await cacheB.cachedByKeys(['host'], {
                    ...options,
                    fetch: async () => [{ id: 'host', value: 'new' }],
                })
            ).get('host'),
            'new',
        );
        const originalDel = redisB.del.bind(redisB);
        redisB.del = async () => {
            throw Error('ETIMEDOUT');
        };
        cacheB.memoryCacheService.invalidate = async () => {
            throw Error('ETIMEDOUT');
        };
        assert.equal(
            (await publisher.updateTemplate(row.uuid, undefined, { marker: 'outage' }, undefined))
                .isOk,
            true,
        );
        assert.equal((await reader.getCachedTemplateByType('SINGBOX', 'Saved')).marker, 'outage');
        const restarted = new SubscriptionTemplateService(
            repository,
            new RawCacheService(redisA, memory(), db),
            {},
        );
        assert.equal(
            (await restarted.getCachedTemplateByType('SINGBOX', 'Saved')).marker,
            'outage',
        );
        redisB.del = originalDel;
        assert.equal((await publisher.deleteTemplate(row.uuid)).isOk, true);
        await assert.rejects(
            () => reader.getCachedTemplateByType('SINGBOX', 'Saved'),
            /Template not found/,
        );
        process.stdout.write(
            'PASS real Redis: database revision fencing, cross-worker L1, hot-hit cost, epoch reset, per-host batch, invalidation outage/restart and delete\n',
        );
    } finally {
        let cursor = '0';
        do {
            const page = await admin.scan(cursor, 'MATCH', prefix + '*', 'COUNT', 100);
            cursor = page[0];
            if (page[1].length) await admin.del(...page[1]);
        } while (cursor !== '0');
        await Promise.all([redisA.quit(), redisB.quit(), admin.quit()]);
    }
})().catch((error) => {
    process.stderr.write(String(error.stack ?? error) + '\n');
    process.exitCode = 1;
});
