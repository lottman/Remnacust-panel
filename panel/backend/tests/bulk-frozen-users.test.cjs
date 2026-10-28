const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');

class BulkUpdate { constructor(fields) { this.fields = fields; } }
class BulkSync { constructor(kind) { this.kind = kind; } }
class Page { constructor(start, size, beforeId) { this.start = start; this.size = size; this.beforeId = beforeId; } }
const { SerialUsersOperationsQueueProcessor } = load(
    path.join(__dirname, '../src/queue/_users/processors/serial-operations.processor.ts'),
    {
        '@nestjs/bullmq': { Processor: () => target => target, WorkerHost: class {} },
        '@common/config/app-config': {},
        '@common/types': { ok: value => ({ isOk: true, response: value }) },
        '@common/utils': { wrapBigInt: v => v === undefined ? undefined : BigInt(v), wrapBigIntNullable: v => v },
        '@libs/contracts/constants': { EVENTS: {}, USERS_STATUS: { ACTIVE: 'ACTIVE', FROZEN: 'FROZEN' } },
        '@modules/users/commands/bulk-all-extend-expiration-date': {},
        '@modules/users/commands/bulk-delete-by-status': {},
        '@modules/users/commands/bulk-sync-users': { BulkSyncUsersCommand: BulkSync },
        '@modules/users/commands/bulk-update-all-users': { BulkUpdateAllUsersCommand: BulkUpdate },
        '@modules/users/dtos/bulk/bulk-operations.dto': {},
        '@modules/users/queries/get-users-by-expire-at/get-users-by-expire-at.query': {},
        '@modules/users/queries/get-users-with-pagination/get-users-with-pagination.query': { GetUsersWithPaginationQuery: Page },
        '@queue/_nodes/nodes-queues.service': {},
        '@queue/queue.enum': { QUEUES_NAMES: { USERS: { SERIAL_OPERATIONS: 'fixture' } } },
        '../constants/users-job-name.constant': {},
        '../users-queues.service': {},
    },
);

function processor() {
    const p = Object.create(SerialUsersOperationsQueueProcessor.prototype);
    p.logger = { error: message => { throw Error(message); } };
    p.nodesQueuesService = { startAllNodesWithoutDeduplication: async () => {} };
    return p;
}

test('bulk queue restores a serialized expiry date before the database update', async () => {
    const p = processor(), calls = [];
    p.commandBus = { execute: async command => calls.push(command) };
    await p.handleBulkUpdateAllUsersJob({ data: { dto: { expireAt: '2026-11-20T12:34:56.000Z' } } });
    assert.ok(calls[0].fields.expireAt instanceof Date);
    assert.equal(calls[0].fields.expireAt.toISOString(), '2026-11-20T12:34:56.000Z');
});

test('bulk freezing queues each user so device access is synchronized', async () => {
    const p = processor(), batches = [];
    p.queryBus = { execute: async () => ({ isOk: true, response: { users: [{ id: 2n }, { id: 1n }], total: 2 } }) };
    p.usersQueuesService = { updateUsersBulk: async batch => batches.push(batch) };
    p.commandBus = { execute: async () => { throw Error('bulk SQL must not bypass device synchronization'); } };
    await p.handleBulkUpdateAllUsersJob({ data: { dto: { status: 'FROZEN' } } });
    assert.deepEqual(batches, [{ userIds: [2, 1], fields: { status: 'FROZEN' } }]);
});

test('bulk freezing uses a stable ID cursor instead of offsets during concurrent deletion', async () => {
    const p = processor(), cursors = [], batches = [];
    p.queryBus = { execute: async query => {
        assert.equal(query.start, 0);
        cursors.push(query.beforeId);
        const top = query.beforeId === undefined ? 1000 : Number(query.beforeId) - 1;
        const users = Array.from({length: Math.min(500, top)}, (_,index) => ({id: BigInt(top-index)}));
        return {isOk: true, response: {users, total: query.beforeId === undefined ? 1000 : 999}};
    } };
    p.usersQueuesService = {updateUsersBulk: async batch => batches.push(...batch.userIds)};
    await p.handleBulkUpdateAllUsersJob({data:{dto:{status:'FROZEN'}}});
    assert.deepEqual(cursors, [undefined, 501n, 1n]);
    assert.equal(new Set(batches).size, 1000);
    assert.equal(batches.at(-1), 1);
});
