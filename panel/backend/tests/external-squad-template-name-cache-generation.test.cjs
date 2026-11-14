require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { TransactionHost } = require('@nestjs-cls/transactional');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const constants = require('../libs/contract/build/backend/constants');
const result = load(path.join(__dirname, '../src/common/types/result.type.ts'));
const { RawCacheService } = source('common/raw-cache/raw-cache.service.ts');
const { MemoryCacheService } = source('common/raw-cache/memory-cache.service.ts');
const { GetCachedTemplateNameHandler } = source(
    'modules/external-squads/queries/get-template-name/get-cached-template-name.handler.ts',
    {
        '@libs/contracts/constants': constants,
        '@common/types': result,
        './get-cached-template-name.query': { GetCachedTemplateNameQuery: class {} },
    },
);
const { ExternalSquadService } = source('modules/external-squads/external-squads.service.ts', {
    '@libs/contracts/constants': constants,
    '@libs/contracts/constants/errors': constants,
    '@common/types': result,
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
const squadUuid = '10000000-0000-4000-8000-000000000001';
const oldUuid = '10000000-0000-4000-8000-000000000002';
const newUuid = '10000000-0000-4000-8000-000000000003';
const templateType = 'SINGBOX';

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

function missing(value) {
    assert.equal(value.isOk, false);
    assert.equal(value.code, constants.ERRORS.SUBSCRIPTION_TEMPLATE_NOT_FOUND.code);
}

function fixture({ stage, assigned = true, holdSync = false } = {}) {
    const data = new Map();
    const faults = {};
    const errors = [];
    const events = [];
    const entered = deferred();
    const release = deferred();
    const syncEntered = deferred();
    const commit = deferred();
    const templates = new Map([
        [oldUuid, 'Original template'],
        [newUuid, 'Replacement template'],
    ]);
    let exists = true;
    let assignment = assigned ? oldUuid : null;
    let generation = randomUUID().replaceAll('-', '');
    let reads = 0;
    let generationReads = 0;
    let writes = 0;
    let gated = false;
    const logger = { error: (value) => errors.push(value), warn() {} };
    const gate = async (at) => {
        if (stage !== at || gated) return;
        gated = true;
        events.push('cache-' + at);
        entered.resolve();
        await release.promise;
    };
    const advance = (event) => {
        generation = randomUUID().replaceAll('-', '');
        events.push(event);
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
        del: async (key) => data.delete(key),
        publish: async () => {},
    };
    const database = {
        $queryRaw: async () => {
            generationReads++;
            if (faults.generation) throw new Error('Generation unavailable');
            return [{ revision: generation }];
        },
    };
    const rawA = new RawCacheService(redis, new MemoryCacheService(redis), database);
    const rawB = new RawCacheService(redis, new MemoryCacheService(redis), database);
    rawA.logger = rawB.logger = logger;
    const transactionHost = new TransactionHost({
        wrapWithTransaction: async (_options, fn, setClient) => {
            const pending = { assignment };
            setClient(pending);
            const value = await fn();
            assert(transactionHost.isTransactionActive());
            events.push('join-uncommitted');
            syncEntered.resolve();
            if (holdSync) await commit.promise;
            assignment = pending.assignment;
            advance('join-commit');
            return value;
        },
        getFallbackInstance: () => assert.fail('Assignment writes must use the CLS transaction'),
    });
    const view = () =>
        exists
            ? {
                  uuid: squadUuid,
                  name: 'Squad',
                  templates: assignment ? [{ templateUuid: assignment, templateType }] : [],
              }
            : null;
    const repository = {
        getTemplateName: async (uuid, type) => {
            reads++;
            if (faults.database) throw new Error('Assignment query failed');
            const name =
                exists && uuid === squadUuid && type === templateType
                    ? (templates.get(assignment) ?? null)
                    : null;
            await gate('repository');
            return name;
        },
        getExternalSquadByUuid: async () => view(),
        findByUUID: async () => view(),
        update: async () => {
            advance('root-commit');
            return view();
        },
        cleanTemplates: async () => {
            assert(transactionHost.isTransactionActive());
            transactionHost.tx.assignment = null;
            return { affectedCount: assignment ? 1 : 0 };
        },
        createTemplates: async (rows) => {
            assert(transactionHost.isTransactionActive());
            transactionHost.tx.assignment = rows[0]?.templateUuid ?? null;
            return { affectedCount: rows.length };
        },
        deleteByUUID: async () => {
            exists = false;
            assignment = null;
            advance('root-delete-cascade');
            return true;
        },
        create: async () => {
            exists = true;
            assignment = null;
            advance('root-create');
            return view();
        },
    };
    const reader = new GetCachedTemplateNameHandler(repository, rawA);
    const otherReader = new GetCachedTemplateNameHandler(repository, rawB);
    const service = new ExternalSquadService(repository, {}, rawB);
    reader.logger = otherReader.logger = service.logger = logger;
    const read = (handler, uuid = squadUuid, type = templateType) =>
        handler.execute({ externalSquadUuid: uuid, templateType: type });
    return {
        data,
        faults,
        errors,
        events,
        entered,
        release,
        syncEntered,
        commit,
        service,
        read: (uuid, type) => read(reader, uuid, type),
        readOther: () => read(otherReader),
        sync: (clear = false) =>
            service.updateExternalSquad({
                uuid: squadUuid,
                templates: clear ? [] : [{ templateUuid: newUuid, templateType }],
            }),
        rename: () => {
            templates.set(oldUuid, 'Renamed template');
            advance('template-rename');
        },
        removeTemplate: () => {
            templates.delete(oldUuid);
            assignment = null;
            advance('template-delete-cascade');
        },
        assign: () => {
            assignment = newUuid;
            advance('join-direct-commit');
        },
        reads: () => reads,
        generationReads: () => generationReads,
        writes: () => writes,
    };
}

for (const stage of ['repository', 'redis']) {
    for (const operation of ['replace', 'clear', 'first assignment']) {
        test(`late ${stage} name fill after root commit cannot undo ${operation} at join commit`, async () => {
            const f = fixture({
                stage,
                assigned: operation !== 'first assignment',
                holdSync: true,
            });
            const update = f.sync(operation === 'clear');
            let oldRead;
            try {
                await within(f.syncEntered.promise);
                assert.deepEqual(f.events, ['root-commit', 'join-uncommitted']);
                oldRead = f.read();
                await within(f.entered.promise);
                f.commit.resolve();
                assert.equal((await update).isOk, true);
                assert(f.events.indexOf('join-commit') > f.events.indexOf('cache-' + stage));
            } finally {
                f.commit.resolve();
                f.release.resolve();
                await update;
                if (oldRead) await oldRead;
            }
            for (const read of [f.read, f.readOther]) {
                const value = await read();
                if (operation === 'clear') missing(value);
                else assert.deepEqual(value, result.ok('Replacement template'));
            }
            assert.equal(f.reads(), 2);
        });
    }

    for (const operation of ['rename', 'delete template', 'delete squad', 'recreate squad']) {
        test(`late ${stage} name fill cannot undo ${operation}`, async () => {
            const f = fixture({ stage });
            const oldRead = f.read();
            try {
                await within(f.entered.promise);
                if (operation === 'rename') f.rename();
                else if (operation === 'delete template') f.removeTemplate();
                else {
                    assert.equal((await f.service.deleteExternalSquad(squadUuid)).isOk, true);
                    if (operation === 'recreate squad') {
                        assert.equal(
                            (await f.service.createExternalSquad('Replacement')).isOk,
                            true,
                        );
                        f.assign();
                    }
                }
            } finally {
                f.release.resolve();
                await oldRead;
            }
            const current = await f.read();
            if (operation.startsWith('delete')) missing(current);
            else
                assert.deepEqual(
                    current,
                    result.ok(operation === 'rename' ? 'Renamed template' : 'Replacement template'),
                );
        });
    }
}

test('empty-string negative hits remain cached and are invalidated by first assignment', async () => {
    const f = fixture({ assigned: false });
    missing(await f.read());
    missing(await f.read());
    missing(await f.readOther());
    assert.equal(f.reads(), 1);
    assert.equal((await f.sync()).isOk, true);
    assert.deepEqual(await f.read(), result.ok('Replacement template'));
    assert.equal(f.reads(), 2);
});

test('another process with a warm L1 follows a committed template rename', async () => {
    const f = fixture();
    await f.read();
    await f.read();
    await f.readOther();
    assert.equal(f.reads(), 1);
    f.rename();
    assert.deepEqual(await f.read(), result.ok('Renamed template'));
    assert.equal(f.reads(), 2);
});

test('legacy strings are ignored and positive/negative names stay scoped to squad and type', async () => {
    const f = fixture();
    f.data.set(constants.CACHE_KEYS.EXTERNAL_SQUAD_TEMPLATE_NAME(squadUuid, templateType), 'Stale');
    assert.deepEqual(await f.read(), result.ok('Original template'));
    missing(await f.read(squadUuid, 'MIHOMO'));
    missing(await f.read(newUuid, templateType));
    assert.deepEqual(await f.read(), result.ok('Original template'));
    assert.equal(f.reads(), 3);
});

test('XRAY_BASE64 is rejected before cache or repository access', async () => {
    const f = fixture();
    const value = await f.read(squadUuid, 'XRAY_BASE64');
    assert.equal(value.isOk, false);
    assert.equal(value.code, constants.ERRORS.TEMPLATE_TYPE_NOT_ALLOWED.code);
    assert.equal(f.reads(), 0);
    assert.equal(f.generationReads(), 0);
    assert.equal(f.writes(), 0);
});

for (const failure of ['get', 'set', 'generation', 'database']) {
    test(`${failure} failure preserves INTERNAL_SERVER_ERROR without caching a negative result`, async () => {
        const f = fixture();
        f.faults[failure] = true;
        const value = await f.read();
        assert.equal(value.isOk, false);
        assert.equal(value.code, constants.ERRORS.INTERNAL_SERVER_ERROR.code);
        assert.equal(f.reads(), failure === 'get' || failure === 'generation' ? 0 : 1);
        assert.equal(f.writes(), failure === 'set' ? 1 : 0);
        assert.equal(f.data.size, 0);
        assert.equal(f.errors.length, 1);
    });
}

for (const failure of ['get', 'set']) {
    test(`stalled Redis ${failure} fails with a bounded wait`, async () => {
        const f = fixture();
        f.faults[failure] = 'stall';
        const start = performance.now();
        const value = await f.read();
        assert.equal(value.isOk, false);
        assert.equal(value.code, constants.ERRORS.INTERNAL_SERVER_ERROR.code);
        assert(performance.now() - start < 2000);
    });
}
