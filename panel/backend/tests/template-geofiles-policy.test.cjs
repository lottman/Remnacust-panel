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
