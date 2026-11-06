const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const fixture = require('./api-permissions-fixture.cjs');
const contract = require('../libs/contract/build/backend');
const root = path.resolve(__dirname, '..');
const uuid = '11111111-1111-4111-8111-111111111111';
const { requireApiReadScope } = load(path.join(root, 'src/common/helpers/require-api-read-scope.ts'), {
    '@libs/contracts/constants': contract,
});
const userModels = load(path.join(root, 'src/modules/users/models/get-full-user.response.model.ts'), {
    '@common/utils/frozen-user-lifetime': load(path.join(root, 'src/common/utils/frozen-user-lifetime.ts')),
});
function controller(relative, name, overrides = {}) {
    const filename = path.join(root, relative);
    const stub = new Proxy({}, { get: (_, key) => key === '__esModule' ? true : function Stub() { return () => {}; } });
    const mocks = {};
    for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
        if (!match[1].startsWith('@nestjs/')) mocks[match[1]] = stub;
    }
    for (const [id, file] of Object.entries({
        '@common/decorators/admin-only-endpoint': 'src/common/decorators/admin-only-endpoint.ts',
        '@common/decorators/base-endpoint': 'src/common/decorators/base-endpoint/base-endpoint.ts',
        '@common/decorators/base-endpoint/base-endpoint': 'src/common/decorators/base-endpoint/base-endpoint.ts',
        '@common/decorators/roles/roles': 'src/common/decorators/roles/roles.ts',
        '@common/decorators/scopes': 'src/common/decorators/scopes/scopes.ts',
    })) mocks[id] = fixture.load(file);
    for (const id of ['@contract/api', '@contract/constants', '@libs/contracts/api', '@libs/contracts/commands', '@libs/contracts/constants']) mocks[id] = contract;
    return load(filename, {
        ...mocks,
        '@common/helpers/require-api-read-scope': { requireApiReadScope },
        '@common/helpers/error-handler.helper': { errorHandler: result => {
            if (!result.isOk) throw new Error('Request failed');
            return result.response;
        } },
        ...overrides,
    })[name];
}
const UsersController = controller('src/modules/users/controllers/users.controller.ts', 'UsersController', { '../models': userModels });
const BulkController = controller('src/modules/users/controllers/users-bulk-actions.controller.ts', 'UsersBulkActionsController');
const ExternalController = controller('src/modules/external-squads/external-squads.controller.ts', 'ExternalSquadController');
const config = { getOrThrow: () => 'subscription.invalid' };
const storedUser = {
    id: 42n, username: 'Fixture', shortUuid: 'synthetic-short-uuid', status: 'ACTIVE',
    trafficLimitBytes: 0n, trafficLimitStrategy: Object.values(contract.RESET_PERIODS)[0],
    expireAt: new Date('2030-01-01T00:00:00Z'), frozenAt: null, telegramId: null, email: null,
    description: null, tag: null, hwidDeviceLimit: null, externalSquadUuid: null,
    trojanPassword: 'synthetic-trojan', vlessUuid: uuid, ssPassword: 'synthetic-shadowsocks',
    lastTriggeredThreshold: 0, subRevokedAt: null, lastTrafficResetAt: null,
    createdAt: new Date(0), updatedAt: new Date(0), activeInternalSquads: [],
    userTraffic: { usedTrafficBytes: 0n, lifetimeUsedTrafficBytes: 0n, onlineAt: null, lastConnectedNodeUuid: null, firstConnectedAt: null },
};
const storedSquad = {
    uuid, viewPosition: 0, name: 'Fixture', tags: [], info: { membersCount: 0 },
    templates: [{ templateUuid: uuid, templateType: 'XRAY_JSON' }], subscriptionSettings: null,
    hostOverrides: null, responseHeadersAdd: { 'x-fixture': 'stored-header' }, responseHeadersRemove: [],
    hwidSettings: null, customRemarks: null, subpageConfigUuid: null,
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};
const cases = [
    ['updateUser', 'UpdateUserCommand', [{ id: 42 }]],
    ['disableUser', 'DisableUserCommand', [{ userId: 42 }]],
    ['enableUser', 'EnableUserCommand', [{ userId: 42 }]],
    ['resetUserTraffic', 'ResetUserTrafficCommand', [{ userId: 42 }]],
    ['extendUserExpirationDate', 'ExtendUserCommand', [{ userId: 42 }, { days: 1 }]],
    ['revokeUserSubscription', 'RevokeUserSubscriptionCommand', [{ userId: 42 }, { revokeOnlyPasswords: true }]],
].map(([method, command, args]) => ({ Controller: UsersController, method, command: contract[command], args, resource: 'users', read: 'by-id', stored: storedUser }));
cases.push(
    { Controller: ExternalController, method: 'updateExternalSquad', command: contract.UpdateExternalSquadCommand, args: [{ uuid }], resource: 'external-squads', read: 'get', stored: storedSquad },
    { Controller: ExternalController, method: 'reorderExternalSquads', command: contract.ReorderExternalSquadCommand, args: [{ items: [] }], resource: 'external-squads', read: 'list', stored: { total: 1, externalSquads: [storedSquad] } },
);
for (const entry of cases) {
    const { Controller, method, command, args, resource, read, stored } = entry;
    const action = `${resource}:${command.endpointDetails.SCOPE}`;
    const endpoint = { controller: Controller, handler: Controller.prototype[method] };
    test(`${action} denies missing or unrelated reads before any mutation`, async () => {
        let effects = 0;
        const instance = new Controller({ [method]: async () => { effects++; throw new Error('must not mutate'); } }, config);
        for (const scopes of [[action], [`${resource}:write`], [action, `${resource}:tags`], [action, 'unrelated:read'], [action, `${resource}:resolve`]]) {
            assert.equal(fixture.authorize(endpoint, contract.ROLE.API, scopes), true);
            await assert.rejects(instance[method](...args, { user: { role: contract.ROLE.API, scopes } }), error => error.getStatus() === 403);
            assert.equal(effects, 0);
        }
    });
    test(`${action} preserves full response contracts for read-authorized tokens and administrators`, async () => {
        let effects = 0;
        const instance = new Controller({ [method]: async () => { effects++; return { isOk: true, response: stored }; } }, config);
        const identities = [
            { role: contract.ROLE.API, scopes: [action, `${resource}:${read}`] },
            { role: contract.ROLE.API, scopes: [`${resource}:write`, `${resource}:read`] },
            { role: contract.ROLE.API, scopes: [`${resource}:*`] },
            { role: contract.ROLE.API, scopes: ['*'] },
            { role: contract.ROLE.ADMIN },
        ];
        for (const user of identities) {
            assert.equal(fixture.authorize(endpoint, user.role, user.scopes), true);
            const result = await instance[method](...args, { user });
            const serialized = JSON.parse(JSON.stringify(result));
            assert.equal(command.ResponseSchema.safeParse(serialized).success, true);
            if (resource === 'users') {
                assert.equal(result.response.trojanPassword, storedUser.trojanPassword);
                assert.equal(result.response.vlessUuid, storedUser.vlessUuid);
                assert.equal(result.response.ssPassword, storedUser.ssPassword);
                assert.equal(result.response.shortUuid, storedUser.shortUuid);
            } else assert.equal(result.response, stored);
        }
        assert.equal(effects, identities.length);
        assert.equal(fixture.authorize(endpoint, contract.ROLE.API, [`${resource}:${read}`]), false);
    });
}
test('the Users management preset satisfies every protected user mutation without external grants', async () => {
    const { getUserManagementKeys } = load(path.join(root, '../frontend/src/widgets/remnawave-settings/api-tokens-card/modals/api-token-presets.ts'));
    const scopes = getUserManagementKeys(fixture.catalog.getGroupedCatalog().resources);
    assert.ok(scopes.includes('users:by-id'));
    assert.ok(scopes.every(scope => scope.startsWith('users:')));
    for (const entry of cases.filter(entry => entry.resource === 'users')) {
        const endpoint = { controller: entry.Controller, handler: entry.Controller.prototype[entry.method] };
        const instance = new entry.Controller({ [entry.method]: async () => ({ isOk: true, response: entry.stored }) }, config);
        assert.equal(fixture.authorize(endpoint, contract.ROLE.API, scopes), true);
        await instance[entry.method](...entry.args, { user: { role: contract.ROLE.API, scopes } });
    }
});
test('creation retains newly generated credentials without an existing-user read grant', async () => {
    const instance = new UsersController({ createUser: async () => ({ isOk: true, response: storedUser }) }, config);
    const endpoint = { controller: UsersController, handler: UsersController.prototype.createUser };
    assert.equal(fixture.authorize(endpoint, contract.ROLE.API, ['users:create']), true);
    assert.equal((await instance.createUser({ username: 'NewUser' })).response.trojanPassword, storedUser.trojanPassword);
    const external = new ExternalController({ createExternalSquad: async () => ({ isOk: true, response: storedSquad }) });
    assert.equal((await external.createExternalSquad({ name: 'NewSquad' })).response, storedSquad);
});
test('no-content user and external-squad actions retain their action-only permissions', async () => {
    const unchanged = [
        [UsersController, 'deleteUser', 'deleteUser', [{ userId: 42 }]],
        [ExternalController, 'deleteExternalSquad', 'deleteExternalSquad', [{ uuid }]],
        [ExternalController, 'addUsersToExternalSquad', 'addUsersToExternalSquad', [{ uuid }]],
        [ExternalController, 'removeUsersFromExternalSquad', 'removeUsersFromExternalSquad', [{ uuid }]],
        [BulkController, 'bulkDeleteUsersByStatus', 'bulkDeleteUsersByStatus', [{ status: 'DISABLED' }]],
        [BulkController, 'bulkDeleteUsers', 'bulkDeleteUsersByUserId', [{ userIds: [42] }]],
        [BulkController, 'bulkRevokeUsersSubscription', 'bulkRevokeUsersSubscription', [{ userIds: [42] }]],
        [BulkController, 'bulkResetUserTraffic', 'bulkResetUserTraffic', [{ userIds: [42] }]],
        [BulkController, 'bulkUpdateUsers', 'bulkUpdateUsers', [{}]],
        [BulkController, 'bulkUpdateUsersInternalSquads', 'bulkUpdateUsersInternalSquads', [{ userIds: [42], activeInternalSquads: [] }]],
        [BulkController, 'bulkExtendExpirationDate', 'bulkExtendExpirationDate', [{ userIds: [42], extendDays: 1 }]],
        [BulkController, 'bulkUpdateAllUsers', 'bulkUpdateAllUsers', [{}]],
        [BulkController, 'bulkAllResetUserTraffic', 'bulkAllResetUserTraffic', []],
        [BulkController, 'bulkAllExtendExpirationDate', 'bulkAllExtendExpirationDate', [{ extendDays: 1 }]],
    ];
    for (const [Controller, method, serviceMethod, args] of unchanged) {
        let effects = 0;
        const instance = new Controller({ [serviceMethod]: async () => { effects++; return { isOk: true, response: true }; } }, config);
        const discovered = fixture.endpoints.find(endpoint => endpoint.controller.name === Controller.name && endpoint.name === method);
        const scope = fixture.catalog.getCatalog().find(entry => entry.path === discovered.url && entry.method === discovered.method).key;
        assert.equal(fixture.authorize({ controller: Controller, handler: Controller.prototype[method] }, contract.ROLE.API, [scope]), true);
        assert.equal(await instance[method](...args), undefined);
        assert.equal(effects, 1);
    }
});
test('the shared read check fails closed for missing or non-API identities', () => {
    for (const user of [undefined, {}, { role: 'unexpected', scopes: ['*'] }]) {
        assert.throws(() => requireApiReadScope(user, 'users', 'by-id'), error => error.getStatus() === 403);
    }
});
