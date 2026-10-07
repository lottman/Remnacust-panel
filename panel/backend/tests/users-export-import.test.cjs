const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { z } = require('zod');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '..');
const constants = {
    USERS_STATUS: { ACTIVE: 'ACTIVE', DISABLED: 'DISABLED', EXPIRED: 'EXPIRED', LIMITED: 'LIMITED' },
    RESET_PERIODS: { NO_RESET: 'NO_RESET', DAY: 'DAY', WEEK: 'WEEK', MONTH: 'MONTH', MONTH_ROLLING: 'MONTH_ROLLING' },
    getEndpointDetails: () => ({}),
    ERRORS: { INTERNAL_SERVER_ERROR: {}, USER_USERNAME_ALREADY_EXISTS: { code: 'duplicate' }, USER_SHORT_UUID_ALREADY_EXISTS: { code: 'short-duplicate' } },
};
const api = { REST_API: { USERS: { CREATE: '/api/users', IMPORT: '/api/users/import' } }, USERS_ROUTES: {} };
const { CreateUserCommand } = load(path.join(root, 'libs/contract/commands/users/create-user.command.ts'), {
    '../../api': api, '../../constants': constants, './user.response': { UserResponseSchema: z.object({}) },
});
const { ImportUsersCommand } = load(path.join(root, 'libs/contract/commands/users/import-users.command.ts'), {
    '../../api': api, '../../constants': constants, './create-user.command': { CreateUserCommand },
});
const secret = process.env.APP_SECRET;
process.env.APP_SECRET = 'remnacust-export-import-test-only-secret';
test.after(() => { if (secret === undefined) delete process.env.APP_SECRET; else process.env.APP_SECRET = secret; });
const crypto = load(path.join(root, 'src/common/utils/xera-crypto.ts'));
const { BaseUserEntity } = load(path.join(root, 'src/modules/users/entities/base-users.entity.ts'), {
    '@common/utils/xera-crypto': crypto,
});
constants.EVENTS = { USER: { MODIFIED: 'user.modified' } };
const mocks = {
    '@common/config/app-config': {}, '@common/utils/xera-crypto': crypto,
    '@common/types': { ok: value => ({ isOk: true, response: value }), fail: error => ({ isOk: false, error }) },
    '@common/utils': {
        wrapBigInt: value => value === undefined ? undefined : BigInt(value),
        wrapBigIntNullable: value => value == null ? value : BigInt(value),
    }, '@libs/contracts/constants': constants,
    '@integration-modules/notifications/interfaces': { UserEvent: class { constructor(value) { Object.assign(this, value); } } },
    '@modules/nodes/events/add-user-to-node': {}, '@modules/nodes/events/add-users-to-node': {},
    '@modules/nodes/events/remove-user-from-node': {}, '@modules/nodes/events/remove-users-from-node': {},
    '@modules/hwid-user-devices/device-access.service': {},
    '@modules/hwid-user-devices/queries/get-user-devices.query': {},
    '@modules/user-subscription-request-history/queries/get-user-subscription-request-history': {},
    '@queue/_users': {}, './dtos': {}, './entities': { BaseUserEntity }, './interfaces': {}, './models': {},
    './repositories/users.repository': {},
};
const { UsersService } = load(path.join(root, 'src/modules/users/users.service.ts'), mocks);
const makeService = () => {
    const instance = Object.create(UsersService.prototype);
    instance.logger = { error() {} };
    return instance;
};
const record = {
    id: 1n, username: 'alice', shortUuid: 'alice-short',
    vlessUuid: '11111111-1111-4111-8111-111111111111',
    trojanPassword: 'test-trojan-password', ssPassword: 'test-ss-password',
    status: 'ACTIVE', trafficLimitBytes: 0n, trafficLimitStrategy: 'NO_RESET',
    expireAt: new Date('2030-01-01T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z'),
    hwidDeviceLimit: null, tag: null, description: null, email: null, telegramId: null,
};

test('updating client credentials writes a valid UUID and upstream-compatible passwords', async () => {
    const service = makeService();
    let written;
    const errors = [];
    service.logger = { error: value => errors.push(value) };
    service.userRepository = {
        findUniqueByCriteria: async () => ({ ...record, activeInternalSquads: [] }),
        update: async value => {
            written = value;
            return { ...record, ...Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) };
        },
    };
    service.eventEmitter = { emit() {} };
    const changed = {
        id: 1, vlessUuid: '22222222-2222-4222-8222-222222222222',
        trojanPassword: 'changed-trojan', ssPassword: 'changed-shadowsocks',
    };
    const result = await service.updateUser(changed);
    assert.equal(result.isOk, true, errors.map(String).join('\n'));
    for (const field of ['vlessUuid', 'trojanPassword', 'ssPassword']) {
        assert.equal(written[field], changed[field]);
        assert.equal(crypto.isXeraEnvelope(written[field]), false);
    }
});

test('our encrypted user export is accepted by the import contract and preserves usable credentials', async () => {
    const service = makeService();
    const encrypted = { ...record };
    for (const key of ['vlessUuid', 'trojanPassword', 'ssPassword']) encrypted[key] = crypto.encryptSecret(record[key]);
    service.userRepository = { exportUsersWithSquadNames: async () => ({
        users: [encrypted], squadNamesByUserId: new Map([['1', ['Premium']]]), squadUuidsByUserId: new Map(),
    }) };
    const exported = await service.exportUsers();
    assert.equal(exported.isOk, true);
    const payload = ImportUsersCommand.RequestBodySchema.parse(JSON.parse(JSON.stringify({ users: exported.response })));
    for (const key of ['vlessUuid', 'trojanPassword', 'ssPassword']) assert.equal(payload.users[0][key], record[key]);
    assert.deepEqual(payload.users[0].activeInternalSquads, ['Premium']);
    assert.equal(payload.users[0].hwidDeviceLimit, null);
    assert.equal(payload.users[0].expireAt, '2030-01-01T00:00:00.000Z');
});

test('minimal imports remain accepted; invalid protocol credentials and negative quota are rejected', () => {
    const minimal = { username: 'alice', expireAt: '2030-01-01T00:00:00Z' };
    assert.equal(ImportUsersCommand.RequestBodySchema.safeParse({ users: [minimal] }).success, true);
    assert.equal(ImportUsersCommand.RequestBodySchema.safeParse({ users: [{ ...minimal, vlessUuid: 'xera1:encrypted-key' }] }).success, false);
    assert.equal(ImportUsersCommand.RequestBodySchema.safeParse({ users: [{ ...minimal, trafficLimitBytes: -1 }] }).success, false);
});

test('squad names resolve to destination UUIDs and the additional squad is always included', async () => {
    const service = makeService();
    const assigned = '22222222-2222-4222-8222-222222222222';
    const extra = '33333333-3333-4333-8333-333333333333';
    let created;
    service.userRepository = { getSquadUuidsByNames: async () => new Map([['Premium', assigned]]) };
    service.createUser = async body => { created = body; return { isOk: true }; };
    const body = ImportUsersCommand.RequestBodySchema.parse({
        users: [{ username: 'alice', expireAt: '2030-01-01T00:00:00Z', activeInternalSquads: ['Premium', 'Missing'], hwidDeviceLimit: null }],
        defaultInternalSquadUuid: extra,
    });
    const result = await service.importUsers(body);
    assert.equal(result.response.created, 1);
    assert.deepEqual(created.activeInternalSquads, [assigned, extra]);
    assert.equal(created.expireAt instanceof Date, true);
    assert.equal(created.hwidDeviceLimit, undefined);
});

test('a missing expiry is reported for that record without discarding valid users', async () => {
    const service = makeService();
    service.userRepository = { getSquadUuidsByNames: async () => new Map() };
    service.createUser = async () => ({ isOk: true });
    const body = ImportUsersCommand.RequestBodySchema.parse({ users: [
        { username: 'alice', expireAt: null }, { username: 'bob', expireAt: '2030-01-01T00:00:00Z' },
    ] });
    const result = await service.importUsers(body);
    assert.equal(result.response.created, 1);
    assert.equal(result.response.failed, 1);
    assert.equal(result.response.errors[0].username, 'alice');
});
