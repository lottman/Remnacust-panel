const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { DashboardSnapshotCache } = load(
    path.join(__dirname, '../src/modules/system/dashboard-snapshot-cache.ts'),
);

test('dashboard aggregate reads coalesce per timezone and cache failures for a shorter period', async () => {
    let now = 0,
        calls = 0;
    const cache = new DashboardSnapshotCache(
        2,
        15000,
        2500,
        (value) => value.isOk,
        () => now,
    );
    const successful = async () => {
        calls++;
        return { isOk: true, count: 1 };
    };
    const results = await Promise.all(
        Array.from({ length: 60 }, () => cache.get('UTC', successful)),
    );
    assert.equal(calls, 1);
    assert(results.every((value) => value === results[0]));
    await cache.get('Europe/Moscow', successful);
    assert.equal(calls, 2);
    now = 15001;
    const failed = await cache.get('UTC', async () => {
        calls++;
        return { isOk: false };
    });
    assert.deepEqual(failed, { isOk: false });
    now = 17000;
    await cache.get('UTC', successful);
    assert.equal(calls, 3);
    now = 17502;
    await cache.get('UTC', successful);
    assert.equal(calls, 4);
});

test('unique in-flight timezones cannot exceed capacity and failures release their slots', async () => {
    const cache = new DashboardSnapshotCache(2, 100, 10, () => true);
    let release;
    const held = new Promise((resolve) => {
        release = resolve;
    });
    const first = cache.get('A', async () => {
        await held;
        return 1;
    });
    const second = cache.get('B', async () => {
        await held;
        throw new Error('temporary');
    });
    const rejectedSecond = assert.rejects(second, /temporary/);
    await assert.rejects(
        cache.get('C', async () => 3),
        /capacity/,
    );
    release();
    await first;
    await rejectedSecond;
    assert.equal(await cache.get('C', async () => 3), 3);
    for (let i = 0; i < 100; i++) await cache.get(String(i), async () => i);
    assert.equal(cache.entries.size, 2);
});
