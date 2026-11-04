const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const load = require('./load-typescript.cjs');

function fixture(count = 0) {
    const pending = new Map();
    const committed = new Set();
    const batches = [];
    const events = [];
    let active = false,
        current,
        bytes = 0n,
        stagedBytes,
        inserts = 0;
    let commitFailure = 0,
        ackFailure = false,
        fenced = false,
        scans = 0,
        scanReply = null;
    const receipt = {
        day: '2026-11-04',
        records: [{ userId: '901', hostUuid: '11111111-1111-4111-8111-111111111111', bytes: '3' }],
    };
    for (let i = 0; i < count; i++) pending.set(randomUUID(), receipt);
    const sql = (parts, ...values) => ({
        execute: async () => {
            const statement = parts.join('');
            if (statement.includes('xera_assert_quota_restore_reconciled') && fenced)
                throw Error('restore fence');
            if (statement.includes('pg_advisory_xact_lock')) events.push('lock');
            if (statement.includes('clock_timestamp'))
                return { rows: [{ requestedAt: '1792000000000' }] };
            if (statement.includes('INSERT INTO xera_host_usage_receipts')) {
                if (++inserts > 8) throw Error('transaction receipt budget exceeded');
                if (current.has(values[0])) return { rows: [] };
                current.add(values[0]);
                return { rows: [{ id: values[0] }] };
            }
            if (statement.includes('INSERT INTO xera_host_quota_usage')) {
                for (const row of values.find((value) => value?.joined).joined)
                    stagedBytes += BigInt(row.values[2]);
            }
            return { rows: [] };
        },
        values,
    });
    sql.join = (joined) => ({ joined });
    const cache = {
        hgetallParsed: async () => Object.fromEntries(pending),
        hsetJson: async (_key, id, value) => {
            pending.set(id, value);
            events.push('stage');
        },
        createPipeline: () => {
            let command;
            return {
                hscan: (_key, cursor, _count, count) => {
                    command = ['scan', cursor, count];
                },
                hdel: (_key, id) => {
                    command = ['delete', id];
                },
                exec: async () => {
                    if (command[0] === 'scan') {
                        assert.equal(active, false, 'backlog retrieval must not hold SQL locks');
                        scans++;
                        if (scanReply) {
                            const response = scanReply(command[1]);
                            if (response) return response;
                        }
                        const offset = Number(command[1]);
                        const entries = [...pending].slice(offset, offset + command[2]);
                        const next =
                            offset + entries.length < pending.size
                                ? String(offset + entries.length)
                                : '0';
                        return [
                            [
                                null,
                                [
                                    next,
                                    entries.flatMap(([id, value]) => [id, JSON.stringify(value)]),
                                ],
                            ],
                        ];
                    }
                    assert.equal(active, false);
                    assert.ok(
                        committed.has(command[1]),
                        'only committed receipts may be acknowledged',
                    );
                    if (ackFailure) throw Error('ACK unavailable');
                    pending.delete(command[1]);
                    events.push('ack');
                    return [[null, 1]];
                },
            };
        },
    };
    const transactions = {
        isTransactionActive: () => active,
        withTransaction: async (_options, fn) => {
            assert.equal(active, false);
            active = true;
            current = new Set(committed);
            stagedBytes = bytes;
            inserts = 0;
            try {
                const result = await fn();
                if (commitFailure && batches.length + 1 === commitFailure)
                    throw Error('commit failure');
                committed.clear();
                for (const id of current) committed.add(id);
                bytes = stagedBytes;
                batches.push(inserts);
                events.push('commit');
                return result;
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
        pending,
        batches,
        events,
        get bytes() {
            return bytes;
        },
        get scans() {
            return scans;
        },
        failCommit: (value) => {
            commitFailure = value;
        },
        failAck: (value) => {
            ackFailure = value;
        },
        fence: (value) => {
            fenced = value;
        },
        scanWith: (value) => {
            scanReply = value;
        },
    };
}

test('backlog larger than a SQL transaction commits bounded batches and fully drains', async () => {
    const f = fixture(75);
    await f.service.drain(901n);
    assert.equal(f.bytes, 225n);
    assert.equal(f.pending.size, 0);
    assert.ok(f.batches.length > 1);
    assert.ok(f.batches.every((size) => size >= 0 && size <= 8));
    assert.ok(f.scans > 1);
});

test('a later rollback preserves earlier committed batches and replay bills exactly once', async () => {
    const f = fixture(25);
    f.failCommit(2);
    await assert.rejects(f.service.drain(901n), /commit failure/);
    assert.ok(f.bytes > 0n && f.bytes < 75n);
    assert.equal(BigInt(f.pending.size) * 3n + f.bytes, 75n);
    f.failCommit(0);
    await f.service.drain(901n);
    assert.equal(f.bytes, 75n);
    assert.equal(f.pending.size, 0);
});

test('lost Redis ACK replays committed receipts without duplicate billing', async () => {
    const f = fixture(25);
    f.failAck(true);
    await assert.rejects(f.service.drain(901n), /ACK unavailable/);
    assert.ok(f.bytes > 0n);
    assert.equal(f.pending.size, 25);
    f.failAck(false);
    await f.service.drain(901n);
    assert.equal(f.bytes, 75n);
    assert.equal(f.pending.size, 0);
});

test('destructive sample survives a subsequent backlog transaction failure', async () => {
    const f = fixture(25);
    const sample = {
        isOk: true,
        response: {
            users: [
                { username: `901~${'a'.repeat(24)}~h${'1'.repeat(32)}`, uplink: 2, downlink: 3 },
            ],
        },
    };
    f.failCommit(2);
    await assert.rejects(
        f.service.collect(901n, async () => {
            f.events.push('read');
            return sample;
        }),
        /commit failure/,
    );
    assert.equal(f.events.filter((event) => event === 'read').length, 1);
    assert.equal(f.bytes, 5n);
    assert.equal(BigInt(f.pending.size) * 3n + f.bytes, 80n);
    f.failCommit(0);
    await f.service.drain(901n);
    assert.equal(f.bytes, 80n);
});

test('restore fence prevents destructive reads and pending receipt acknowledgement', async () => {
    const f = fixture(1);
    f.failAck(true);
    await assert.rejects(f.service.drain(901n), /ACK unavailable/);
    f.failAck(false);
    f.fence(true);
    await assert.rejects(f.service.drain(901n), /restore fence/);
    await assert.rejects(
        f.service.collect(901n, async () => assert.fail('read through restore fence')),
        /restore fence/,
    );
    assert.equal(f.pending.size, 1);
    f.fence(false);
    await f.service.drain(901n);
    assert.equal(f.bytes, 3n);
});

test('scan handles empty nonterminal pages, duplicates and COUNT overshoot without skipping receipts', async () => {
    const f = fixture(25);
    let calls = 0;
    f.scanWith((cursor) => {
        if (++calls === 1) return [[null, ['17', []]]];
        if (calls === 2) {
            assert.equal(cursor, '17');
            const rows = [...f.pending].flatMap(([id, value]) => [id, JSON.stringify(value)]);
            return [[null, ['0', [...rows.slice(0, 2), ...rows]]]];
        }
        return null;
    });
    await f.service.drain(901n);
    assert.equal(f.bytes, 75n);
    assert.equal(f.pending.size, 0);
    assert.ok(f.batches.every((size) => size <= 8));
});

test('Redis scan failure cannot lose the destructive sample or acknowledge unapplied backlog', async () => {
    const f = fixture(1);
    f.scanWith(() => [[Error('scan unavailable'), null]]);
    await assert.rejects(
        f.service.collect(901n, async () => ({
            isOk: true,
            response: {
                users: [
                    {
                        username: `901~${'a'.repeat(24)}~h${'1'.repeat(32)}`,
                        uplink: 2,
                        downlink: 3,
                    },
                ],
            },
        })),
        /Cannot read pending host usage samples/,
    );
    assert.equal(f.pending.size, 1);
    assert.equal(f.bytes, 5n);
    assert.deepEqual(f.events, ['lock', 'stage', 'commit', 'ack']);
    f.scanWith(null);
    await f.service.drain(901n);
    assert.equal(f.bytes, 8n);
});
