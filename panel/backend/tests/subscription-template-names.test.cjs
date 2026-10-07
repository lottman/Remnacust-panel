const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
const load = require('./load-typescript.cjs');
const directory = path.join(__dirname, '../src/modules/subscription-template');
const { ERRORS } = load(path.join(__dirname, '../libs/contract/constants/errors/errors.ts'));
const { SubscriptionTemplateService } = load(path.join(directory, 'subscription-template.service.ts'), {
    '@common/types': { ok: response => ({ isOk: true, response }), fail: error => ({ isOk: false, error }) },
    '@common/utils': {},
    '@libs/contracts/constants': { ERRORS, CACHE_KEYS: { SUBSCRIPTION_TEMPLATE: uuid => uuid } },
    '@libs/contracts/models': {},
    './constants': { DEFAULT_TEMPLATE_XRAY_JSON: { outbounds: [] }, DEFAULT_TEMPLATE_SINGBOX: { outbounds: [] } },
    './entities/subscription-template.entity': load(path.join(directory, 'entities/subscription-template.entity.ts')),
    './models/base-template.response.model': load(path.join(directory, 'models/base-template.response.model.ts')),
    './models/get-templates.response.model': {},
});
const current = { uuid: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', name: 'Autoselect', templateType: 'XRAY_JSON', tags: [], viewPosition: 1, templateJson: {} };
const conflict = (target = ['template_type', 'name'], modelName = 'SubscriptionTemplate') =>
    new PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.19.3', meta: { modelName, target } });
function serviceWith(repo) {
    const service = new SubscriptionTemplateService({ findByUUID: async () => current, ...repo }, { del: async () => {} });
    service.logger = { error() {} };
    return service;
}

test('renaming to an existing template name returns the specific business error', async () => {
    const service = serviceWith({ update: async () => { throw conflict(); } });
    const result = await service.updateTemplate(current.uuid, 'Autoselect_YT', undefined, undefined);
    assert.equal(result.isOk, false);
    assert.equal(result.error, ERRORS.TEMPLATE_NAME_ALREADY_EXISTS_FOR_THIS_TYPE);
    assert.equal(result.error.code, 'A176');
    assert.equal(result.error.httpCode, 400);
});

test('creating an existing name uses the same business error', async () => {
    const service = serviceWith({ create: async () => { throw conflict(); } });
    const result = await service.createTemplate('Autoselect_YT', 'XRAY_JSON');
    assert.equal(result.error, ERRORS.TEMPLATE_NAME_ALREADY_EXISTS_FOR_THIS_TYPE);
});

test('other constraints and other models are not misreported as a name conflict', async () => {
    for (const error of [conflict(['uuid']), conflict(['name'], 'ConfigProfiles'), new Error('database unavailable')]) {
        const service = serviceWith({ update: async () => { throw error; }, create: async () => { throw error; } });
        assert.equal((await service.updateTemplate(current.uuid, 'Another', undefined, undefined)).error, ERRORS.UPDATE_SUBSCRIPTION_TEMPLATE_ERROR);
        assert.equal((await service.createTemplate('Another', 'XRAY_JSON')).error, ERRORS.CREATE_SUBSCRIPTION_TEMPLATE_ERROR);
    }
});

test('an unchanged own name and a valid new name are accepted', async () => {
    const written = [];
    const service = serviceWith({ update: async data => { written.push(data.name); return { ...current, ...data }; } });
    service.removeCachedTemplate = async () => {};
    for (const name of ['Autoselect', 'Autoselect_New']) {
        const result = await service.updateTemplate(current.uuid, name, undefined, undefined);
        assert.equal(result.isOk, true);
        assert.equal(result.response.name, name);
    }
    assert.deepEqual(written, ['Autoselect', 'Autoselect_New']);
});
