const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const fixture = require('./api-permissions-fixture.cjs');
const contract = require('../libs/contract/build/backend');
const uuid = '11111111-1111-4111-8111-111111111111';
function controller(relative, name) {
    const filename = path.resolve(__dirname, '..', relative);
    const stub = new Proxy({}, { get: (_, key) => key === '__esModule' ? true : function Stub() { return () => {}; } });
    const mocks = {};
    for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
        if (!match[1].startsWith('@nestjs/')) mocks[match[1]] = stub;
    }
    for (const [id, file] of Object.entries({
        '@common/decorators/admin-only-endpoint': 'src/common/decorators/admin-only-endpoint.ts',
        '@common/decorators/base-endpoint': 'src/common/decorators/base-endpoint/base-endpoint.ts',
        '@common/decorators/roles/roles': 'src/common/decorators/roles/roles.ts',
        '@common/decorators/scopes': 'src/common/decorators/scopes/scopes.ts',
    })) mocks[id] = fixture.load(file);
    for (const id of ['@contract/api', '@contract/constants', '@libs/contracts/api', '@libs/contracts/commands', '@libs/contracts/constants']) mocks[id] = contract;
    mocks['@common/helpers/error-handler.helper'] = { errorHandler: result => {
        if (!result.isOk) throw new Error('Request failed');
        return result.response;
    } };
    return load(filename, mocks)[name];
}
const ConfigController = controller('src/modules/config-profiles/config-profile.controller.ts', 'ConfigProfileController');
const TemplateController = controller('src/modules/subscription-template/subscription-template.controller.ts', 'SubscriptionTemplateController');
const cases = [
    {
        Controller: ConfigController, method: 'updateConfigProfile', resource: 'config-profiles',
        command: contract.UpdateConfigProfileCommand, body: { uuid, name: 'Fixture' },
        stored: { uuid, viewPosition: 0, name: 'Fixture', tags: [], config: { fixture: true }, inbounds: [], nodes: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), applyStatus: 'unchanged' },
    },
    {
        Controller: TemplateController, method: 'updateTemplate', resource: 'subscription-template',
        command: contract.UpdateSubscriptionTemplateCommand, body: { uuid },
        stored: { uuid, viewPosition: 0, name: 'Fixture', tags: [], templateType: 'XRAY_JSON', templateJson: { fixture: true }, encodedTemplateYaml: null, draftContent: 'stored-draft' },
    },
];
for (const entry of cases) {
    const { Controller, method, resource, body, stored, command } = entry;
    const endpoint = { controller: Controller, handler: Controller.prototype[method] };
    test(`${resource} denies update-only tokens before invoking mutation services`, async () => {
        let calls = 0;
        const instance = new Controller({ [method]: async () => { calls++; throw new Error('must not mutate'); } });
        assert.equal(command.RequestBodySchema.safeParse(body).success, true);
        for (const scopes of [[`${resource}:update`], [`${resource}:write`], [`${resource}:update`, 'unrelated:read']]) {
            assert.equal(fixture.authorize(endpoint, contract.ROLE.API, scopes), true);
            await assert.rejects(instance[method](body, { user: { role: contract.ROLE.API, scopes } }), error => error.getStatus() === 403);
            assert.equal(calls, 0);
        }
    });
    test(`${resource} accepts explicit and wildcard read grants without changing the full response contract`, async () => {
        let calls = 0;
        const instance = new Controller({ [method]: async () => { calls++; return { isOk: true, response: stored }; } });
        for (const scopes of [
            [`${resource}:update`, `${resource}:get`],
            [`${resource}:write`, `${resource}:read`],
            [`${resource}:*`], ['*'],
        ]) {
            assert.equal(fixture.authorize(endpoint, contract.ROLE.API, scopes), true);
            const result = await instance[method](body, { user: { role: contract.ROLE.API, scopes } });
            assert.equal(result.response, stored);
            assert.equal(command.ResponseSchema.safeParse(result).success, true);
        }
        assert.equal(calls, 4);
    });
    test(`${resource} preserves administrators and never grants update through read permission alone`, async () => {
        let calls = 0;
        const instance = new Controller({ [method]: async () => { calls++; return { isOk: true, response: stored }; } });
        assert.equal(fixture.authorize(endpoint, contract.ROLE.ADMIN, []), true);
        assert.equal((await instance[method](body, { user: { role: contract.ROLE.ADMIN } })).response, stored);
        assert.equal(calls, 1);
        for (const scopes of [[`${resource}:get`], [`${resource}:read`], []]) {
            assert.equal(fixture.authorize(endpoint, contract.ROLE.API, scopes), false);
        }
    });
}
test('template cloning retains its read requirement while creating new templates needs only create', async () => {
    let calls = 0;
    const instance = new TemplateController({ createTemplate: async () => { calls++; return { isOk: true, response: cases[1].stored }; } });
    const body = { name: 'Fixture', templateType: 'XRAY_JSON', sourceUuid: uuid };
    await assert.rejects(instance.createTemplate(body, { user: { role: contract.ROLE.API, scopes: ['subscription-template:create'] } }), error => error.getStatus() === 403);
    assert.equal(calls, 0);
    await instance.createTemplate(body, { user: { role: contract.ROLE.API, scopes: ['subscription-template:create', 'subscription-template:get'] } });
    await instance.createTemplate({ ...body, sourceUuid: undefined }, { user: { role: contract.ROLE.API, scopes: ['subscription-template:create'] } });
    assert.equal(calls, 2);
});
