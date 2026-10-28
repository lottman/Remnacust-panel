const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src');
const { UpdateUserWithServiceHandler } = load(path.join(root,
    'modules/users/commands/update-user-with-service/update-user-with-service.handler.ts'), {
    '@nestjs/cqrs': { CommandHandler: () => target => target },
    '@modules/users/users.service': {}, './update-user-with-service.command': {},
});
const commandMocks = Object.fromEntries(['reset-user-traffic','revoke-user-subscription','update-user-with-service']
    .map(name => ['@modules/users/commands/'+name, { UpdateUserWithServiceCommand: class { constructor(dto) { this.dto = dto; } } }]));
const { UsersModifyManyQueueProcessor } = load(path.join(root,
    'queue/_users/processors/modify-many-users.processor.ts'), {
    ...commandMocks,
    '@nestjs/bullmq': { Processor: () => target => target, WorkerHost: class {} },
    '@queue/queue.enum': { QUEUES_NAMES: { USERS: { MODIFY_MANY: 'fixture' } } },
    '../constants/users-job-name.constant': { USERS_JOB_NAMES: { UPDATE_MANY_USERS: 'update' } },
});

test('service failures and exceptions reject the command rather than acknowledging success', async () => {
    const handler = Object.create(UpdateUserWithServiceHandler.prototype);
    handler.logger = { error() {} };
    handler.usersService = { updateUser: async () => ({ isOk: false }) };
    await assert.rejects(handler.execute({ dto: {id: 1} }), /synchronization failed/);
    handler.usersService.updateUser = async () => { throw new Error('transport failed'); };
    await assert.rejects(handler.execute({ dto: {id: 1} }), /transport failed/);
    handler.usersService.updateUser = async () => ({ isOk: true });
    await handler.execute({ dto: {id: 1} });
});

test('bulk worker exposes update failure to BullMQ and can retry the same status successfully', async () => {
    const worker = Object.create(UsersModifyManyQueueProcessor.prototype);
    worker.logger = { error() {} };
    let attempts = 0;
    worker.commandBus = { execute: async () => { if (++attempts === 1) throw new Error('node unavailable'); } };
    const job = { name: 'update', data: {userId: 1,fields: {status: 'FROZEN'}} };
    await assert.rejects(worker.process(job), /node unavailable/);
    await worker.process(job);
    assert.equal(attempts, 2);
});

test('bulk database update errors propagate to the serial worker', async () => {
    const { BulkUpdateAllUsersHandler } = load(path.join(root,
        'modules/users/commands/bulk-update-all-users/bulk-update-all-users.handler.ts'), {
        '@nestjs/cqrs': { CommandHandler: () => target => target },
        '../../repositories/users.repository': {}, './bulk-update-all-users.command': {},
    });
    const handler = Object.create(BulkUpdateAllUsersHandler.prototype);
    handler.logger = { error() {} };
    handler.usersRepository = { bulkUpdateAllUsersByRange: async () => { throw Error('database unavailable'); } };
    await assert.rejects(handler.execute({ fields: {} }), /database unavailable/);
});
