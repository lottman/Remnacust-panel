require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { source } = require('./upstream-filter-fixture.cjs');
const constants = require('../libs/contract/build/backend/constants');
const {
    DEFAULT_SUBSCRIPTION_REMARKS,
} = require('../libs/contract/build/backend/models/subscription-settings/custom-remarks.schema');
const { RawCacheService } = source('common/raw-cache/raw-cache.service.ts');
const { MemoryCacheService } = source('common/raw-cache/memory-cache.service.ts');
const { GetCachedExternalSquadSettingsHandler } = source(
    'modules/external-squads/queries/get-cached-external-squad-settings/get-cached-external-squad-settings.handler.ts',
    {
        '@libs/contracts/constants': constants,
        './get-cached-external-squad-settings.query': {
            GetCachedExternalSquadSettingsQuery: class {},
        },
    },
);
const { ExternalSquadService } = source('modules/external-squads/external-squads.service.ts', {
    '@libs/contracts/constants': constants,
    '@libs/contracts/constants/errors': constants,
    '@common/types': {
        ok: (response) => ({ isOk: true, response }),
        fail: (error) => ({ isOk: false, error }),
    },
    './entities': {
        ExternalSquadEntity: class {
            constructor(value) {
                Object.assign(this, value);
            }
        },
    },
    './models/get-external-squad-by-uuid.response.model': {
        GetExternalSquadByUuidResponseModel: class {
            constructor(value) {
                Object.assign(this, value);
            }
        },
    },
});

const uuid = '10000000-0000-4000-8000-000000000002';
const rules = {
    rules: [
        {
            id: '10000000-0000-4000-8000-000000000001',
            enabled: true,
            daysBeforeExpiry: 3,
            scope: 'all',
            internalSquadUuids: [],
            externalSquadUuids: [],
            remarks: ['Old rules', '{HOSTS}'],
        },
    ],
};
const remarks = (activeExpiry = rules) => ({
    ...structuredClone(DEFAULT_SUBSCRIPTION_REMARKS),
    activeExpiry: structuredClone(activeExpiry),
});

function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

async function within(promise) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Fixture did not reach its gate')), 2000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function fixture(stage) {
    const data = new Map();
    const faults = {};
    const warnings = [];
    const errors = [];
    const entered = deferred();
    const release = deferred();
    let gated = false;
    let generation = randomUUID().replaceAll('-', '');
    let row = {
        uuid,
        name: 'Original',
        templates: [],
        subscriptionSettings: null,
        hostOverrides: null,
        responseHeadersAdd: {},
        responseHeadersRemove: [],
        hwidSettings: null,
        customRemarks: remarks(),
    };
    let reads = 0;
    let writes = 0;
    const logger = {
        warn: (value) => warnings.push(value),
        error: (value) => errors.push(value),
    };
    const gate = async (at) => {
        if (stage !== at || gated) return;
        gated = true;
        entered.resolve();
        await release.promise;
    };
    const redis = {
        get: async (key) => {
            if (faults.get === 'stall') return new Promise(() => {});
            if (faults.get) throw new Error('Redis read failed');
            return data.get(key) ?? null;
        },
        set: async (key, value) => {
            writes++;
            if (faults.set === 'stall') return new Promise(() => {});
            if (faults.set) throw new Error('Redis write failed');
            await gate('redis');
            data.set(key, value);
        },
        del: async (key) => {
            if (faults.del) throw new Error('Redis delete failed');
            data.delete(key);
        },
        publish: async (_channel, key) => {
            if (faults.cleanup && key === '*') throw new Error('Redis publication failed');
        },
    };
    const database = {
        $queryRaw: async () => {
            if (faults.generation) throw new Error('Revision unavailable');
            return [{ revision: generation }];
        },
    };
    const memoryA = new MemoryCacheService(redis);
    const memoryB = new MemoryCacheService(redis);
    const rawA = new RawCacheService(redis, memoryA, database);
    const rawB = new RawCacheService(redis, memoryB, database);
    rawA.logger = rawB.logger = logger;
    const advance = () => {
        generation = randomUUID().replaceAll('-', '');
    };
    const repository = {
        getExternalSquadSettings: async () => {
            reads++;
            if (faults.database) throw new Error('Settings database unavailable');
            const snapshot = structuredClone(row);
            await gate('repository');
            return snapshot;
        },
        getExternalSquadByUuid: async () => structuredClone(row),
        findByUUID: async () => structuredClone(row),
        update: async (patch) => {
            for (const [key, value] of Object.entries(patch))
                if (value !== undefined) row[key] = structuredClone(value);
            advance();
            return structuredClone(row);
        },
        deleteByUUID: async () => {
            row = null;
            advance();
            return true;
        },
        create: async ({ name }) => {
            row = { uuid, name, templates: [], customRemarks: null };
            advance();
            return structuredClone(row);
        },
    };
    const reader = new GetCachedExternalSquadSettingsHandler(repository, rawA);
    const otherReader = new GetCachedExternalSquadSettingsHandler(repository, rawB);
    reader.logger = otherReader.logger = logger;
    const service = new ExternalSquadService(repository, {}, rawB);
    service.logger = logger;
    return {
        data,
        faults,
        warnings,
        errors,
        rawA,
        rawB,
        entered,
        release,
        service,
        repository,
        read: () => reader.execute({ externalSquadUuid: uuid }),
        readOther: () => otherReader.execute({ externalSquadUuid: uuid }),
        current: () => structuredClone(row),
        reads: () => reads,
        writes: () => writes,
    };
}

for (const stage of ['repository', 'redis']) {
    for (const operation of ['replace', 'clear', 'inherit']) {
        test(`late ${stage} snapshot cannot undo ${operation} on another cache instance`, async () => {
            const f = fixture(stage);
            const oldRead = f.read();
            const customRemarks =
                operation === 'inherit'
                    ? null
                    : remarks(
                          operation === 'clear'
                              ? { rules: [] }
                              : { rules: [{ ...rules.rules[0], daysBeforeExpiry: 9 }] },
                      );
            try {
                await within(f.entered.promise);
                const result = await f.service.updateExternalSquad({ uuid, customRemarks });
                assert.equal(result.isOk, true);
                assert.deepEqual(f.current().customRemarks, customRemarks);
            } finally {
                f.release.resolve();
                await oldRead;
            }
            assert.deepEqual((await f.read()).customRemarks, customRemarks);
            assert.deepEqual((await f.readOther()).customRemarks, customRemarks);
            assert.equal(f.reads(), 2);
        });
    }

    for (const recreate of [false, true]) {
        test(`late ${stage} snapshot cannot resurrect a deleted${recreate ? '/recreated' : ''} squad`, async () => {
            const f = fixture(stage);
            const oldRead = f.read();
            try {
                await within(f.entered.promise);
                assert.equal((await f.service.deleteExternalSquad(uuid)).isOk, true);
                assert.equal(f.current(), null);
                if (recreate) {
                    assert.equal((await f.service.createExternalSquad('Replacement')).isOk, true);
                    assert.equal(f.current().customRemarks, null);
                }
            } finally {
                f.release.resolve();
                await oldRead;
            }
            assert.deepEqual(await f.read(), f.current());
            assert.deepEqual(await f.readOther(), f.current());
        });
    }
}

test('a warm cache on another process follows the committed generation even if cleanup fails', async () => {
    const f = fixture();
    await f.read();
    await f.read();
    await f.readOther();
    assert.equal(f.reads(), 1);
    f.faults.cleanup = true;
    assert.equal((await f.service.updateExternalSquad({ uuid, customRemarks: null })).isOk, true);
    assert.equal((await f.read()).customRemarks, null);
    assert(f.warnings.length > 0);
});

test('legacy unversioned entries are ignored and a cache hit cannot mutate the next response', async () => {
    const f = fixture();
    f.data.set(
        constants.CACHE_KEYS.EXTERNAL_SQUAD_SETTINGS(uuid),
        JSON.stringify({ customRemarks: remarks({ rules: [] }) }),
    );
    assert.deepEqual((await f.read()).customRemarks.activeExpiry, rules);
    const cached = await f.read();
    cached.customRemarks.activeExpiry.rules[0].remarks[0] = 'Mutated by caller';
    assert.deepEqual((await f.read()).customRemarks.activeExpiry, rules);
    assert.equal(f.reads(), 1);
});

for (const failure of ['get', 'set', 'generation']) {
    test(`cache ${failure} failure returns database settings without publishing an unfenced value`, async () => {
        const f = fixture();
        f.faults[failure] = true;
        assert.deepEqual(await f.read(), f.current());
        assert.equal(f.reads(), 1);
        assert(f.warnings.length > 0);
        if (failure !== 'set') assert.equal(f.writes(), 0);
    });
}

for (const failure of ['get', 'set']) {
    test(`stalled Redis ${failure} has a bounded wait and retains database settings`, async () => {
        const f = fixture();
        f.faults[failure] = 'stall';
        const start = performance.now();
        assert.deepEqual(await f.read(), f.current());
        assert(performance.now() - start < 2000);
        assert.equal(f.reads(), 1);
    });
}

test('missing rows and database failures remain null instead of falling back to old entries', async () => {
    for (const failure of ['missing', 'database']) {
        const f = fixture();
        f.data.set(constants.CACHE_KEYS.EXTERNAL_SQUAD_SETTINGS(uuid), JSON.stringify(f.current()));
        if (failure === 'missing') await f.repository.deleteByUUID(uuid);
        else f.faults.database = true;
        assert.equal(await f.read(), null);
        assert.equal(f.writes(), 0);
    }
});

test('legacy invalidation failures keep their API behavior and cannot restore stale settings', async () => {
    const update = fixture();
    await update.read();
    update.faults.del = true;
    assert.equal(
        (await update.service.updateExternalSquad({ uuid, customRemarks: null })).isOk,
        false,
    );
    assert.equal(update.current().customRemarks, null);
    assert.equal((await update.read()).customRemarks, null);
    const removal = fixture();
    removal.faults.del = true;
    assert.equal((await removal.service.deleteExternalSquad(uuid)).isOk, false);
    assert(removal.current());
});
