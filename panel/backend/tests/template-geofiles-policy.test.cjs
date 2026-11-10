const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { templateService, regex, load } = require('./subscription-delivery-fixture.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template');
const { withTemplateGeofilePolicy } = load(path.join(root, 'geofiles/template-geofile-policy.ts'));
test.after(() => regex.configuredRegex.close());

const raw = () => ({
    routing: { rules: [{ domain: ['geosite:manual'] }] },
    remnacust: { geofiles: [{ id: 'a'.repeat(34), target: 'DIRECT', categories: ['test'] }] },
});

test('raw template caches bind the database flag without mutating content or trusting a JSON opt-in', async () => {
    const config = raw();
    config.remnacust.geofilesEnabled = true;
    let enabled = false;
    const cache = new Map();
    const service = templateService(
        {
            getTemplateByNameAndTypeOrGetDefault: async () => ({
                templateType: 'XRAY_JSON',
                templateJson: config,
                geofilesEnabled: enabled,
            }),
        },
        {
            templateSnapshot: async () => ({
                value: cache.get(enabled),
                generation: String(enabled),
            }),
            setTemplateSnapshot: async (_key, _generation, value) => cache.set(enabled, value),
        },
    );
    const preparations = [];
    service.geofiles = {
        prepare: async (value) => {
            preparations.push(value);
            return { prepared: true };
        },
    };
    const before = structuredClone(config);
    for (const active of [false, true, false]) {
        enabled = active;
        const output = await service.getCachedTemplateByType(
            'XRAY_JSON',
            'Default',
            undefined,
            true,
        );
        if (active) assert.deepEqual(output, { prepared: true });
        else {
            assert(!output.remnacust);
            assert.deepEqual(output.routing, config.routing);
        }
    }
    assert.equal(preparations.length, 1);
    assert.deepEqual(config, before);
});

test('a disabled template never reads a managed file, even when another template enables the feature', async () => {
    const service = templateService({}, {});
    service.geofiles = {
        prepare: () => {
            throw Error('unexpected file read');
        },
    };
    const config = withTemplateGeofilePolicy(raw(), false);
    const result = await service.prepareClientTemplate(config, 'XRAY_JSON', undefined, true);
    assert.deepEqual(result.routing, config.routing);
    assert(!result.remnacust);
    assert(config.remnacust);
});

test('assigned autoselect variants carry their own authoritative flag', () => {
    const { indexXrayTemplateAssignments, assignedXrayTemplates } = source(
        'modules/hosts/utils/xray-template-assignments.ts',
    );
    const host = { uuid: '10000000-0000-4000-8000-000000000001', tags: ['EU'] };
    const templates = [false, true].map((enabled, i) => ({
        uuid: String(i),
        name: 'template-' + i,
        geofilesEnabled: enabled,
        templateJson: { ...raw(), remnawave: { assignments: [{ hosts: [host.uuid] }] } },
    }));
    const before = structuredClone(templates);
    const variants = assignedXrayTemplates(host, indexXrayTemplateAssignments(templates));
    assert.deepEqual(
        variants.map((value) => value.template.remnacust.geofilesEnabled),
        [false, true],
    );
    assert.deepEqual(templates, before);
});

test('template update contract accepts only explicit booleans and old clients can omit the field', () => {
    const {
        UpdateSubscriptionTemplateCommand,
    } = require('../libs/contract/build/backend/commands/subscription-template/update-template.command');
    const uuid = '10000000-0000-4000-8000-000000000001';
    for (const value of [true, false])
        assert.equal(
            UpdateSubscriptionTemplateCommand.RequestBodySchema.parse({
                uuid,
                geofilesEnabled: value,
            }).geofilesEnabled,
            value,
        );
    for (const value of [1, 'true', null, {}, []])
        assert.equal(
            UpdateSubscriptionTemplateCommand.RequestBodySchema.safeParse({
                uuid,
                geofilesEnabled: value,
            }).success,
            false,
        );
    assert(
        !Object.hasOwn(
            UpdateSubscriptionTemplateCommand.RequestBodySchema.parse({ uuid }),
            'geofilesEnabled',
        ),
    );
});

test('the existing JSON prerequisite still disables automated delivery without erasing manual rules', async () => {
    const service = templateService({}, {});
    service.geofiles = {
        prepare: () => {
            throw Error('unexpected file read');
        },
    };
    const result = await service.prepareClientTemplate(
        withTemplateGeofilePolicy(raw(), true),
        'XRAY_JSON',
        undefined,
        false,
    );
    assert.deepEqual(result.routing.rules, raw().routing.rules);
    assert(!result.remnacust);
});

test('template enable validates locked JSON settings before writing revisions and disable still works without them', async () => {
    const { SubscriptionTemplateRepository } = load(
        path.join(root, 'repositories/subscription-template.repository.ts'),
        {
            '@nestjs-cls/transactional': {
                TransactionHost: class {},
                Transactional: () => () => {},
            },
            '@common/database/tx-kysely.service': {},
            '@common/helpers/kysely/values': {},
            '@common/types/crud-port': {},
            '../entities/subscription-template.entity': {},
            '../subscription-template.converter': {},
            '@libs/contracts/constants': {},
        },
    );
    const calls = [];
    let settings = [];
    const tx = {
        $queryRaw: async (parts) => {
            const query = parts.join('');
            calls.push(query);
            return query.includes('subscription_settings') ? settings : [];
        },
        subscriptionTemplate: {
            findUniqueOrThrow: async () => ({ uuid: 'test', geofilesEnabled: false }),
            update: async ({ data }) => {
                calls.push('write');
                return data;
            },
        },
    };
    const repo = new SubscriptionTemplateRepository(
        { tx },
        { fromEntityToPrismaModel: (value) => value, fromPrismaModelToEntity: (value) => value },
        {},
    );
    repo.saveRevision = async () => calls.push('history');
    for (const rows of [[], [{ enabled: false }]]) {
        settings = rows;
        calls.length = 0;
        await assert.rejects(
            repo.update({ uuid: 'test', geofilesEnabled: true }),
            /GEOFILES_REQUIRE_BASE_JSON/,
        );
        assert.equal(calls.length, 2);
        assert(calls.every((value) => value.includes('FOR UPDATE')));
    }
    settings = [{ enabled: true }];
    calls.length = 0;
    await repo.update({ uuid: 'test', geofilesEnabled: true });
    assert.deepEqual(calls.slice(-3), ['history', 'write', 'history']);
    settings = [];
    calls.length = 0;
    await repo.update({ uuid: 'test', geofilesEnabled: false });
    assert.equal(
        calls.some((value) => value.includes('subscription_settings')),
        false,
    );
    assert(calls.includes('write'));
});

test('template JSON conflicts are validation responses and never publish cache invalidation', async () => {
    const constants = require('../libs/contract/build/backend/constants');
    const { SubscriptionTemplateService } = source(
        'modules/subscription-template/subscription-template.service.ts',
        {
            '@libs/contracts/constants': constants,
            '@common/types': {
                fail: (error) => ({ isOk: false, error }),
                ok: (response) => ({ isOk: true, response }),
            },
        },
    );
    const service = new SubscriptionTemplateService(
        {
            findByUUID: async () => ({
                uuid: 'test',
                name: 'Saved',
                templateType: 'XRAY_JSON',
                templateJson: {},
            }),
            update: async () => {
                throw new Error('GEOFILES_REQUIRE_BASE_JSON');
            },
        },
        {
            invalidateTemplateSnapshots: () =>
                assert.fail('failed update cannot publish a new cache generation'),
        },
        {},
    );
    const result = await service.updateTemplate(
        'test',
        undefined,
        undefined,
        undefined,
        undefined,
        true,
    );
    assert.equal(result.isOk, false);
    assert.equal(result.error.code, constants.ERRORS.CONFIG_VALIDATION_ERROR.code);
    assert.equal(result.error.message, 'GEOFILES_REQUIRE_BASE_JSON');
});
