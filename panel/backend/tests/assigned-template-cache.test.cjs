const test = require('node:test');
const assert = require('node:assert/strict');
const { source } = require('./upstream-filter-fixture.cjs');
const { GetHostsForUserHandler } = source(
    'modules/hosts/queries/get-hosts-for-user/get-hosts-for-user.handler.ts',
    {
        './get-hosts-for-user.query': source(
            'modules/hosts/queries/get-hosts-for-user/get-hosts-for-user.query.ts',
        ),
        '../../utils/xray-template-assignments': source(
            'modules/hosts/utils/xray-template-assignments.ts',
        ),
        '@libs/contracts/constants': require('../libs/contract/build/backend/constants'),
        '@common/types': {
            ok: (response) => ({ isOk: true, response }),
            fail: (error) => ({ isOk: false, error }),
        },
        '@modules/hosts/entities/host-with-inbound-tag.entity': {
            HostWithRawInbound: class {
                constructor(value) {
                    Object.assign(this, value);
                }
            },
        },
    },
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fixture() {
    const state = {
        generation: 'a'.repeat(32),
        rows: [{ uuid: 'template', name: 'Fixture', templateJson: {}, geofilesEnabled: false }],
        reads: 0,
        auth: [],
        usage: [],
        writes: 0,
        cacheFailure: false,
    };
    const cache = new Map();
    const repository = {
        getAssignedXrayTemplates: async () => {
            state.reads++;
            const rows = state.rows;
            await delay(10);
            return rows;
        },
        findActiveHostsByUserId: async (userId) => {
            state.auth.push(userId);
            return userId === 1n
                ? [{ uuid: 'host', tags: [], configProfileInboundUuid: 'inbound' }]
                : [];
        },
    };
    const raw = {
        templateSnapshot: async () => {
            if (state.cacheFailure) throw Error('cache unavailable');
            return { generation: state.generation, value: cache.get(state.generation) ?? null };
        },
        setTemplateSnapshot: async (_key, generation, value) => {
            if (state.generation !== generation) return false;
            state.writes++;
            cache.set(generation, value);
            return true;
        },
        cachedByKeys: async () => new Map([['inbound', { rawInbound: {}, tag: 'inbound' }]]),
    };
    const handler = new GetHostsForUserHandler(
        repository,
        {
            usageForUser: async (userId) => {
                state.usage.push(userId);
                return [];
            },
        },
        raw,
    );
    return { state, cache, handler, repository, raw };
}

test('100 overlapping catalogue requests share one full metadata query, then reuse the current generation', async () => {
    const f = fixture();
    const values = await Promise.all(
        Array.from({ length: 100 }, () => f.handler.getAssignedTemplates()),
    );
    assert.equal(f.state.reads, 1);
    assert.equal(f.state.writes, 1);
    assert(values.every((value) => value === f.state.rows));
    await Promise.all(Array.from({ length: 100 }, () => f.handler.getAssignedTemplates()));
    assert.equal(f.state.reads, 1);
    f.state.generation = 'b'.repeat(32);
    f.state.rows = [{ ...f.state.rows[0], geofilesEnabled: true }];
    const updated = await f.handler.getAssignedTemplates();
    assert.equal(f.state.reads, 2);
    assert.equal(updated[0].geofilesEnabled, true);
    assert.equal(values[0][0].geofilesEnabled, false);
});

test('catalogue reuse never reuses user authorization, quotas or an earlier host list', async () => {
    const f = fixture();
    const result = await Promise.all(
        Array.from({ length: 100 }, () =>
            f.handler.execute({ userId: 1n, returnDisabledHosts: false, returnHiddenHosts: false }),
        ),
    );
    assert(result.every((value) => value.isOk && value.response.length === 1));
    assert.equal(f.state.reads, 1);
    assert.equal(f.state.auth.length, 100);
    assert.equal(f.state.usage.length, 100);
    const denied = await f.handler.execute({
        userId: 2n,
        returnDisabledHosts: false,
        returnHiddenHosts: false,
    });
    assert.deepEqual(denied.response, []);
    assert.equal(f.state.auth.at(-1), 2n);
});

test('cache failures use direct metadata reads and rejected loads do not poison later requests', async () => {
    const f = fixture();
    f.state.cacheFailure = true;
    await f.handler.getAssignedTemplates();
    await f.handler.getAssignedTemplates();
    assert.equal(f.state.reads, 2);
    assert.equal(f.state.writes, 0);
    f.state.cacheFailure = false;
    const original = f.repository.getAssignedXrayTemplates;
    f.repository.getAssignedXrayTemplates = async () => {
        throw Error('database unavailable');
    };
    await assert.rejects(f.handler.getAssignedTemplates(), /database unavailable/);
    f.repository.getAssignedXrayTemplates = original;
    assert.deepEqual(await f.handler.getAssignedTemplates(), f.state.rows);
});

test('late old fills cannot overwrite a newer generation and oversized catalogues are not cached', async () => {
    const f = fixture();
    const oldRows = f.state.rows;
    const old = f.handler.getAssignedTemplates();
    await delay(1);
    f.state.generation = 'b'.repeat(32);
    f.state.rows = [{ ...oldRows[0], geofilesEnabled: true }];
    const current = await f.handler.getAssignedTemplates();
    assert.equal((await old)[0].geofilesEnabled, false);
    assert.equal(current[0].geofilesEnabled, true);
    assert.equal(f.cache.has('a'.repeat(32)), false);
    assert.deepEqual(await f.handler.getAssignedTemplates(), current);
    f.state.generation = 'c'.repeat(32);
    f.state.rows = [{ ...oldRows[0], templateJson: { extra: 'x'.repeat(4 * 1024 * 1024) } }];
    await f.handler.getAssignedTemplates();
    assert.equal(f.cache.has(f.state.generation), false);
});
