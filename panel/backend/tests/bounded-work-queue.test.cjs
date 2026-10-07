const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BoundedWorkQueue } = require('./load-typescript.cjs')(path.join(__dirname, '../src/common/utils/bounded-work-queue.ts'));

test('saturation rejects excess work and failures free slots for retries', async () => {
    const queue = new BoundedWorkQueue(1, 2);
    let release, ran = false;
    const first = queue.submit(() => new Promise(r => { release = r; }));
    const second = queue.submit(async () => { ran = true; throw Error('offline'); });
    const rejected = assert.rejects(second, /offline/);
    assert.equal(queue.submit(async () => 3), null);
    assert.equal(ran, false);
    release(1); await first; await rejected;
    await new Promise(r => setImmediate(r));
    assert.equal(await queue.submit(async () => 4), 4);
});

test('a synchronous task failure does not strand the next job', async () => {
    const queue = new BoundedWorkQueue(1, 2);
    await assert.rejects(queue.submit(() => { throw Error('failure'); }), /failure/);
    assert.equal(await queue.submit(async () => 5), 5);
});
