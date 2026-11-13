const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const constants = require('../libs/contract/build/backend/constants');
const root = path.join(__dirname, '../src');
const identity = {
    fromEntityToPrismaModel: (value) => value,
    fromPrismaModelToEntity: (value) => value,
};
const transactionMocks = {
    '@nestjs-cls/transactional': { TransactionHost: class {}, Transactional: () => () => {} },
};

function settingsRepository(initial) {
    const { SubscriptionSettingsRepository } = source(
        'modules/subscription-settings/repositories/subscription-settings.repository.ts',
        transactionMocks,
    );
    let state = {
        uuid: 'settings',
        geofilesEnabled: false,
        geofilesSystemEnabled: false,
        serveJsonAtBaseSubscription: false,
        ...initial,
    };
    const events = [];
    const repo = new SubscriptionSettingsRepository(
        {
            tx: {
                $queryRaw: async (parts) => {
                    assert.match(parts.join(''), /FOR UPDATE/);
                    events.push('lock');
                },
                subscriptionSettings: {
                    findUniqueOrThrow: async () => {
                        events.push('read');
                        return { ...state };
                    },
                    update: async ({ data }) => {
                        events.push('write');
                        state = { ...state, ...data };
                        return state;
                    },
                },
            },
        },
        identity,
    );
    return { repo, events, state: () => state };
}

test('master can stay on with zero enabled templates and requires base JSON independently of the aggregate', async () => {
    const f = settingsRepository();
    await assert.rejects(
        f.repo.update({ uuid: 'settings', geofilesSystemEnabled: true }),
        /GEOFILES_REQUIRE_BASE_JSON/,
    );
    assert.deepEqual(f.events, ['lock', 'read']);
    await f.repo.update({
        uuid: 'settings',
        geofilesSystemEnabled: true,
        serveJsonAtBaseSubscription: true,
    });
    assert.equal(f.state().geofilesSystemEnabled, true);
    assert.equal(f.state().geofilesEnabled, false);
    await assert.rejects(
        f.repo.update({ uuid: 'settings', serveJsonAtBaseSubscription: false }),
        /GEOFILES_REQUIRE_BASE_JSON/,
    );
    await f.repo.update({
        uuid: 'settings',
        geofilesSystemEnabled: false,
        serveJsonAtBaseSubscription: false,
    });
    assert.equal(f.state().serveJsonAtBaseSubscription, false);
});

test('master off preserves a true aggregate, preferences and unrelated settings while allowing JSON off', async () => {
    const f = settingsRepository({
        geofilesEnabled: true,
        geofilesSystemEnabled: true,
        serveJsonAtBaseSubscription: true,
        geofilesInlineRuleLimit: 1234,
    });
    await f.repo.update({
        uuid: 'settings',
        geofilesSystemEnabled: false,
        serveJsonAtBaseSubscription: false,
    });
    await f.repo.update({ uuid: 'settings', randomizeHosts: true });
    assert.equal(f.state().geofilesEnabled, true);
    assert.equal(f.state().geofilesInlineRuleLimit, 1234);
    assert.equal(f.state().geofilesSystemEnabled, false);
    await assert.rejects(
        f.repo.update({ uuid: 'settings', geofilesEnabled: false }),
        /GEOFILES_PER_TEMPLATE/,
    );
    assert.equal(f.state().geofilesEnabled, true);
});

function templateRepository(before, settings) {
    const { SubscriptionTemplateRepository } = source(
        'modules/subscription-template/repositories/subscription-template.repository.ts',
        transactionMocks,
    );
    const events = [];
    const repo = new SubscriptionTemplateRepository(
        {
            tx: {
                $queryRaw: async (parts) => {
                    const sql = parts.join('');
                    assert.match(sql, /FOR UPDATE/);
                    events.push(
                        sql.includes('subscription_settings') ? 'settings-lock' : 'template-lock',
                    );
                    return sql.includes('subscription_settings') ? settings : [];
                },
                subscriptionTemplate: {
                    findUniqueOrThrow: async () => before,
                    update: async ({ data }) => {
                        events.push('write');
                        return { ...before, ...data };
                    },
                },
            },
        },
        identity,
        {},
    );
    repo.saveRevision = async () => events.push('revision');
    return { repo, events };
}

test('locked API enable checks master and JSON on the same settings row before revisions or writes', async () => {
    for (const settings of [[], [{ enabled: true, systemEnabled: false }]]) {
        const f = templateRepository({ geofilesEnabled: false }, settings);
        await assert.rejects(
            f.repo.update({ uuid: 'template', geofilesEnabled: true }),
            /GEOFILES_SYSTEM_DISABLED/,
        );
        assert.deepEqual(f.events, ['template-lock', 'settings-lock']);
    }
    for (const settings of [
        [{ enabled: false, systemEnabled: true }],
        [
            { enabled: false, systemEnabled: true },
            { enabled: true, systemEnabled: false },
        ],
    ]) {
        const f = templateRepository({ geofilesEnabled: false }, settings);
        await assert.rejects(
            f.repo.update({ uuid: 'template', geofilesEnabled: true }),
            /GEOFILES_REQUIRE_BASE_JSON/,
        );
        assert(!f.events.includes('write'));
    }
    const f = templateRepository({ geofilesEnabled: false }, [
        { enabled: true, systemEnabled: true },
    ]);
    await f.repo.update({ uuid: 'template', geofilesEnabled: true });
    assert.deepEqual(f.events, ['template-lock', 'settings-lock', 'revision', 'write', 'revision']);
});

test('master off accepts old-client saves of an unchanged true flag, unrelated saves and disable', async () => {
    for (const patch of [
        { name: 'Renamed' },
        { geofilesEnabled: true },
        { geofilesEnabled: false },
    ]) {
        const f = templateRepository({ geofilesEnabled: true }, []);
        const saved = await f.repo.update({ uuid: 'template', ...patch });
        assert(!f.events.includes('settings-lock'));
        assert(f.events.includes('write'));
        assert.equal(saved.geofilesEnabled, patch.geofilesEnabled ?? true);
    }
});

test('settings entity, converter and response fail closed for old rows without the new master', () => {
    const { SubscriptionSettingsEntity } = source(
        'modules/subscription-settings/entities/subscription-settings.entity.ts',
    );
    const { SubscriptionSettingsConverter } = source(
        'modules/subscription-settings/subscription-settings.converter.ts',
        {
            './entities/subscription-settings.entity': { SubscriptionSettingsEntity },
            '@common/converter/universalConverter': load(
                path.join(root, 'common/converter/universalConverter.ts'),
            ),
        },
    );
    const { SubscriptionSettingsResponseModel } = source(
        'modules/subscription-settings/models/get-subscription-settings.response.model.ts',
    );
    const converter = new SubscriptionSettingsConverter();
    for (const enabled of [undefined, false, true]) {
        const entity = converter.fromPrismaModelToEntity({
            uuid: 'settings',
            geofilesEnabled: true,
            ...(enabled === undefined ? {} : { geofilesSystemEnabled: enabled }),
        });
        assert.equal(entity.geofilesSystemEnabled, enabled === true);
        assert.equal(
            converter.fromEntityToPrismaModel(entity).geofilesSystemEnabled,
            enabled === true,
        );
        assert.equal(
            new SubscriptionSettingsResponseModel(entity).geofilesSystemEnabled,
            enabled === true,
        );
    }
    assert.equal(
        converter.fromEntityToPrismaModel({ uuid: 'settings', randomizeHosts: true })
            .geofilesSystemEnabled,
        undefined,
    );
});

test('master contract defaults old responses off, accepts only boolean patches and preserves omission', () => {
    const models = require('../libs/contract/build/backend/models');
    const { SubscriptionSettingsSchema } = load(
        path.join(__dirname, '../libs/contract/models/subscription-settings.schema.ts'),
        {
            './response-rules': models,
        },
    );
    const { UpdateSubscriptionSettingsCommand } = load(
        path.join(
            __dirname,
            '../libs/contract/commands/subscription-settings/update-subscription-settings.command.ts',
        ),
        {
            '../../api': require('../libs/contract/build/backend/api'),
            '../../constants': constants,
            '../../models': { ...models, SubscriptionSettingsSchema },
        },
    );
    assert.equal(SubscriptionSettingsSchema.shape.geofilesSystemEnabled.parse(undefined), false);
    const schema = UpdateSubscriptionSettingsCommand.RequestBodySchema;
    const uuid = '10000000-0000-4000-8000-000000000001';
    assert(!Object.hasOwn(schema.parse({ uuid }), 'geofilesSystemEnabled'));
    for (const value of [true, false])
        assert.equal(
            schema.parse({ uuid, geofilesSystemEnabled: value }).geofilesSystemEnabled,
            value,
        );
    for (const value of [1, 'true', null, {}, []])
        assert.equal(schema.safeParse({ uuid, geofilesSystemEnabled: value }).success, false);
});

function templateService(enabled) {
    const { SubscriptionTemplateService } = load(
        path.join(root, 'modules/subscription-template/subscription-template.service.ts'),
        {
            '@common/raw-cache': {},
            '@common/utils': {},
            '@libs/contracts/models': {},
            './constants': {},
            './dtos': {},
            './entities/subscription-template.entity': {},
            './generators/validate-client-template': {},
            './geofiles/geofiles.service': {},
            './geofiles/template-geofile-policy': load(
                path.join(
                    root,
                    'modules/subscription-template/geofiles/template-geofile-policy.ts',
                ),
            ),
            './geofiles/xray-geofile-delivery': {},
            './models/get-templates.response.model': {},
            './repositories/subscription-template.repository': {},
            './template-validation': {},
            '@libs/contracts/constants': constants,
            '@common/types': {
                ok: (response) => ({ isOk: true, response }),
                fail: (error) => ({ isOk: false, error }),
            },
            './models/base-template.response.model': {
                BaseTemplateResponseModel: class {
                    constructor(value) {
                        Object.assign(this, value);
                    }
                },
            },
        },
    );
    const raw = {
        uuid: 'template',
        name: 'Saved',
        templateType: 'SINGBOX',
        geofilesEnabled: true,
        templateJson: {
            remnacust: { geofiles: ['missing-file'] },
            routing: { domain: ['geosite:manual'] },
        },
    };
    const writes = [];
    const service = new SubscriptionTemplateService(
        {
            findByUUID: async () => structuredClone(raw),
            isGeofilesSystemEnabled: async () => enabled,
            update: async (patch) => {
                writes.push(patch);
                return { ...raw, ...patch };
            },
        },
        { invalidateTemplateSnapshots: async () => {}, del: async () => {} },
        {
            withReferenceLock: () =>
                assert.fail('disabled master must not read library references'),
            prepare: () => assert.fail('disabled master must not process manual JSON'),
        },
    );
    service.logger = { error: () => {} };
    return { service, writes, raw };
}

test('master off allows unrelated template saves despite preserved invalid geofile preferences', async () => {
    const f = templateService(false);
    const before = structuredClone(f.raw);
    const saved = await f.service.updateTemplate(
        'template',
        'Renamed',
        undefined,
        undefined,
        undefined,
        true,
    );
    assert.equal(saved.isOk, true);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].geofilesEnabled, true);
    assert.deepEqual(f.raw, before);
});

test('master gate strips only our automation options and leaves manual JSON and URLs authoritative', async () => {
    const f = templateService(false);
    const config = {
        remnacust: { geofilesEnabled: true, geofiles: ['missing-file'] },
        routing: {
            rules: [{ domain: ['geosite:manual', 'ext:manual.dat:sites'], ip: ['geoip:private'] }],
        },
        geodata: {
            assets: [{ url: 'https://manual.example.test/geosite.dat', file: 'geosite.dat' }],
        },
    };
    const before = structuredClone(config);
    const prepared = await f.service.prepareClientTemplate(
        config,
        'XRAY_JSON',
        { deferTemplates: true },
        false,
    );
    const expected = structuredClone(config);
    delete expected.remnacust;
    assert.deepEqual(prepared, expected);
    assert.deepEqual(config, before);
});

test('template master conflicts are validation errors and do not invalidate caches', async () => {
    const f = templateService(false);
    f.service.subscriptionTemplateRepository.update = async () => {
        throw new Error('GEOFILES_SYSTEM_DISABLED');
    };
    f.service.rawCacheService.invalidateTemplateSnapshots = () =>
        assert.fail('failed save cannot invalidate');
    const result = await f.service.updateTemplate(
        'template',
        undefined,
        undefined,
        undefined,
        undefined,
        true,
    );
    assert.equal(result.isOk, false);
    assert.equal(result.error.code, constants.ERRORS.CONFIG_VALIDATION_ERROR.code);
    assert.equal(result.error.message, 'GEOFILES_SYSTEM_DISABLED');
});

test('scheduler delegates to the real service master gate, which stops automatic I/O but permits manual refresh', async () => {
    const { GeofilesRefreshTask } = source('scheduler/tasks/geofiles-refresh.task.ts');
    const { GeofilesService } = source(
        'modules/subscription-template/geofiles/geofiles.service.ts',
    );
    let settings;
    let calls = 0;
    let reads = 0;
    const service = Object.create(GeofilesService.prototype);
    service.prisma = {
        subscriptionSettings: {
            findFirst: async () => {
                reads++;
                return settings;
            },
        },
        subscriptionTemplate: {
            findFirst: () => assert.fail('the aggregate is not a master gate'),
        },
    };
    service.refreshStore = {
        refreshDue: async () => calls++,
        refresh: async (id, manual) => {
            assert.equal(manual, true);
            return id;
        },
    };
    const task = new GeofilesRefreshTask(service);
    for (const next of [
        null,
        {},
        { geofilesEnabled: true, serveJsonAtBaseSubscription: true },
        { geofilesSystemEnabled: false, geofilesEnabled: true, serveJsonAtBaseSubscription: true },
        { geofilesSystemEnabled: true, geofilesEnabled: false, serveJsonAtBaseSubscription: true },
        { geofilesSystemEnabled: false, geofilesEnabled: true, serveJsonAtBaseSubscription: true },
    ]) {
        settings = next;
        const before = calls;
        const beforeReads = reads;
        await task.run();
        assert.equal(calls - before, settings?.geofilesSystemEnabled === true ? 1 : 0);
        assert.equal(reads - beforeReads, 1);
    }
    settings = { geofilesSystemEnabled: false };
    assert.equal(await service.refreshNow('manual-file'), 'manual-file');
    const before = calls;
    service.prisma.subscriptionSettings.findFirst = async () => {
        throw Error('unavailable');
    };
    task.logger = { error: () => {} };
    await task.run();
    assert.equal(calls, before);
    await assert.rejects(service.refreshDue(), /unavailable/);
});
