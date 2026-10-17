const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');

function fixture() {
    const events = [],
        pending = {},
        receipts = new Set();
    let active = false,
        failCommit = false;
    const sql = (parts, ...values) => ({
        execute: async () => {
            const statement = parts.join('');
            if (statement.includes('pg_advisory_xact_lock')) events.push('lock');
            if (statement.includes('clock_timestamp'))
                return { rows: [{ requestedAt: '1792000000000' }] };
            if (statement.includes('INSERT INTO xera_host_usage_receipts')) {
                const id = values[0];
                if (receipts.has(id)) return { rows: [] };
                receipts.add(id);
                return { rows: [{ id }] };
            }
            if (statement.includes('INSERT INTO xera_host_quota_usage')) events.push('write');
            return { rows: [] };
        },
    });
    sql.join = (joined) => ({ joined });
    const cache = {
        hsetJson: async (_key, id, value) => {
            pending[id] = value;
            events.push('stage');
        },
        hgetallParsed: async () => pending,
        createPipeline: () => {
            let id;
            return {
                hdel: (_key, value) => {
                    id = value;
                },
                exec: async () => {
                    assert.equal(active, false, 'Redis acknowledgement must follow SQL commit');
                    events.push('ack');
                    delete pending[id];
                    return [[null, 1]];
                },
            };
        },
    };
    const transactions = {
        isTransactionActive: () => active,
        withTransaction: async (_options, fn) => {
            const before = new Set(receipts);
            active = true;
            try {
                const result = await fn();
                if (failCommit) throw Error('commit lost');
                events.push('commit');
                return result;
            } catch (error) {
                receipts.clear();
                for (const id of before) receipts.add(id);
                events.push('rollback');
                throw error;
            } finally {
                active = false;
            }
        },
    };
    const { HostUsageService } = load(
        path.join(__dirname, '../src/common/host-policy/host-usage.service.ts'),
        {
            kysely: { sql },
            '@common/database': {},
            '@common/raw-cache': {},
            '@common/utils/host-identity': load(
                path.join(__dirname, '../src/common/utils/host-identity.ts'),
            ),
        },
    );
    return {
        service: new HostUsageService({ kysely: {} }, cache, transactions),
        events,
        pending,
        failCommit: (value) => {
            failCommit = value;
        },
        transactions,
    };
}
const sample = {
    isOk: true,
    response: {
        users: [{ username: `123~${'a'.repeat(24)}~h${'b'.repeat(32)}`, uplink: 2, downlink: 3 }],
    },
};

test('destructive stats reads hold the node lock through commit and acknowledge afterwards', async () => {
    const f = fixture();
    const result = await f.service.collect(1n, async () => {
        f.events.push('read');
        return sample;
    });
    assert.equal(result.requestedAt, 1792000000000);
    assert.deepEqual(f.events, ['lock', 'read', 'stage', 'write', 'commit', 'ack']);
    assert.deepEqual(f.pending, {});
});

test('cutover is rechecked under the destructive-read lock before touching a legacy counter',async()=>{
    const f=fixture();let reads=0;
    await assert.rejects(f.service.collect(1n,async()=>{reads++;return sample;},async()=>{f.events.push('cutover');throw Error('durable stream activated');}),/durable stream activated/);
    assert.equal(reads,0);assert.deepEqual(f.events,['lock','cutover','rollback']);assert.deepEqual(f.pending,{});
});

test('failed SQL commit preserves the staged sample for replay instead of deleting it', async () => {
    const f = fixture();
    f.failCommit(true);
    await assert.rejects(
        f.service.collect(1n, async () => sample),
        /commit lost/,
    );
    assert.equal(Object.keys(f.pending).length, 1);
    assert.equal(f.events.includes('ack'), false);
    f.failCommit(false);
    await f.service.record(1n, []);
    assert.deepEqual(f.pending, {});
    assert.deepEqual(f.events.slice(-3), ['write', 'commit', 'ack']);
    const writes = f.events.filter((event) => event === 'write').length;
    await f.service.record(1n, []);
    assert.equal(f.events.filter((event) => event === 'write').length, writes);
});

test('unavailable nodes produce no receipt; caller transactions cannot receive premature acknowledgements', async () => {
    const f = fixture();
    const failure = { isOk: false, error: { message: 'offline' } };
    assert.equal((await f.service.collect(1n, async () => failure)).result, failure);
    assert.deepEqual(f.events, ['lock', 'commit']);
    await f.transactions.withTransaction({}, async () => {
        await assert.rejects(f.service.record(1n, sample.response.users), /must commit/);
        await assert.rejects(
            f.service.collect(1n, async () => sample),
            /must commit/,
        );
    });
    assert.deepEqual(f.pending, {});
});
