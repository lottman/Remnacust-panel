const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const load = require('./load-typescript.cjs');
const { NodeHealthLogService } = load(path.join(__dirname, '../src/modules/nodes/node-health-log.service.ts'), { '@common/database/prisma.service': {} });

test('missing settings use three days; recording health does not wait for retention cleanup', async () => {
    const calls = [];
    const service = new NodeHealthLogService({ $queryRaw: async () => [], $executeRaw: async (sql, ...values) => { calls.push({ sql: sql.join('?'), values }); return 1; } });
    assert.equal(await service.retentionDays(), 3);
    await service.record({ nodeUuid: '00000000-0000-4000-8000-000000000001', status: 'ok' });
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /INSERT INTO/);
});

test('cleanup uses an indexed age cutoff and bounded, nonblocking batches', async () => {
    const calls = [];
    const now = Date.now();
    const service = new NodeHealthLogService({ $queryRaw: async () => [{ retention_days: 3 }], $executeRaw: async (sql, ...values) => { calls.push({ sql: sql.join('?'), values }); return calls.length === 1 ? 5000 : 1; } });
    await service.cleanup();
    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /FOR UPDATE SKIP LOCKED/);
    assert.match(calls[0].sql, /LIMIT/);
    assert.equal(calls[0].values[1], 5000);
    assert.ok(Math.abs(calls[0].values[0].getTime() - (now - 3 * 86400000)) < 1000);
});

test('cleanup caps backlog work and concurrent calls cannot multiply it', async () => {
    let finish; let calls = 0;
    const service = new NodeHealthLogService({ $queryRaw: () => new Promise(resolve => { finish = resolve; }), $executeRaw: async () => { calls++; return 5000; } });
    const pending = service.cleanup();
    await service.cleanup();
    finish([{ retention_days: 3 }]); await pending;
    assert.equal(calls, 20);
});

test('failed cleanup releases its guard so subsequent maintenance retries', async () => {
    let fail = true; let calls = 0;
    const service = new NodeHealthLogService({ $queryRaw: async () => [{ retention_days: 3 }], $executeRaw: async () => { calls++; if (fail) throw Error('temporary database failure'); return 0; } });
    await assert.rejects(service.cleanup(), /temporary database failure/);
    fail = false; await service.cleanup(); assert.equal(calls, 2);
});
