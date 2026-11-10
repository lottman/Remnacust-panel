const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { source } = require('./upstream-filter-fixture.cjs');
const { templateService, generators, host } = require('./subscription-delivery-fixture.cjs');
const load = require('./load-typescript.cjs');
const constants = require('../libs/contract/build/backend/constants');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const geo = (name) =>
    load(path.join(__dirname, '../src/modules/subscription-template/geofiles', name + '.ts'), {
        ...mocks,
        '../generators/client-pool': pool,
    });
const { RenderTemplatesService } = source(
    'modules/subscription-template/render-templates.service.ts',
    {
        '@libs/contracts/constants': constants,
        './constants/config-types': load(
            path.join(__dirname, '../src/modules/subscription-template/constants/config-types.ts'),
            { '@libs/contracts/constants': constants },
        ),
        './geofiles/xray-geofile-delivery': geo('xray-geofile-delivery'),
        './geofiles/automatic-xray-delivery': geo('automatic-xray-delivery'),
        './geofiles/stabilize-routing-profile': geo('stabilize-routing-profile'),
    },
);

test('off by default skips every saved custom reference without mutating raw templates or manual rules', async () => {
    for (const type of ['XRAY_JSON', 'SINGBOX', 'CLASH', 'MIHOMO', 'STASH']) {
        const raw = {
            remnacust: { geofiles: [{ id: 'missing', target: 'DIRECT' }] },
            remnawave: { includeHiddenHosts: true },
            routing: { rules: [{ domain: ['geosite:category-ru'], outboundTag: 'direct' }] },
        };
        const original = structuredClone(raw);
        const templates = templateService({}, {});
        let calls = 0;
        templates.geofiles = {
            prepare: async (config) => {
                calls++;
                return config;
            },
        };
        for (const enabled of [undefined, false]) {
            const result = await templates.prepareClientTemplate(raw, type, undefined, enabled);
            assert.equal(result.remnacust, undefined);
            assert.deepEqual(result.routing, original.routing);
            assert.deepEqual(result.remnawave, original.remnawave);
            assert.deepEqual(raw, original);
        }
        assert.equal(calls, 0);
        await templates.prepareClientTemplate(raw, type, undefined, true);
        assert.equal(calls, 1);
    }
});

test('cached raw templates respect concurrent per-request opt-in and retain saved assignments', async () => {
    const raw = { remnacust: { geofiles: [{ id: 'a'.repeat(34), target: 'DIRECT' }] } };
    const templates = templateService(
        {},
        { templateSnapshot: async () => ({ generation: 'a'.repeat(32), value: raw }) },
    );
    let calls = 0;
    templates.geofiles = {
        prepare: async () => {
            calls++;
            return { managed: true };
        },
    };
    const results = await Promise.all(
        Array.from({ length: 100 }, (_, n) =>
            templates.getCachedTemplateByType('XRAY_JSON', 'Saved', undefined, n % 2 === 0),
        ),
    );
    assert.equal(calls, 50);
    results.forEach((value, n) => assert.deepEqual(value, n % 2 === 0 ? { managed: true } : {}));
    assert.equal(raw.remnacust.geofiles.length, 1);
});

test('real format generators receive the global switch through the renderer', async () => {
    const template = {
        remnacust: { geofiles: [{ id: 'a'.repeat(34), target: 'DIRECT' }] },
        inbounds: [],
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        proxies: [],
        'proxy-groups': [],
    };
    for (const type of ['XRAY_JSON', 'SINGBOX', 'CLASH', 'MIHOMO', 'STASH']) {
        for (const enabled of [false, true]) {
            const templates = templateService(
                {},
                { templateSnapshot: async () => ({ generation: 'a'.repeat(32), value: template }) },
            );
            let prepares = 0;
            templates.geofiles = {
                prepare: async (config) => {
                    prepares++;
                    const result = structuredClone(config);
                    delete result.remnacust;
                    return result;
                },
            };
            const [sing, mihomo, clash, xray] = generators(templates);
            const renderer = new RenderTemplatesService(
                { resolveProxyConfig: async () => [host()] },
                mihomo,
                clash,
                {},
                sing,
                xray,
                { retireRoutingProfileRevision: async () => null },
            );
            const context = {
                matchedResponseType: type,
                userAgent: 'ordinary-client',
                subscriptionSettings: { geofilesEnabled: enabled },
            };
            const result = await renderer.generateSubscription({
                srrContext: context,
                user: { id: 1, status: 'ACTIVE', expireAt: new Date(Date.now() + 86400000) },
                hosts: [],
            });
            assert(result.subscription.length > 0);
            assert.equal(prepares, enabled ? 1 : 0, `${type}: opt-in reaches preparation`);
            assert.equal(context.headersToApply, undefined);
        }
    }
});

test('disabled system never creates Happ or INCY routing state for ordinary clients', async () => {
    for (const userAgent of ['Happ/6.3.0', 'INCY/3.9.7']) {
        const templates = templateService(
            {},
            {
                templateSnapshot: async () => ({
                    generation: 'a'.repeat(32),
                    value: {
                        outbounds: [{ protocol: 'freedom', tag: 'direct' }],
                        routing: {
                            rules: [{ domain: ['geosite:category-ru'], outboundTag: 'direct' }],
                        },
                        remnacust: { geofiles: ['invalid-but-disabled'] },
                    },
                }),
            },
        );
        templates.geofiles = { prepare: () => assert.fail('disabled geofile I/O') };
        const [sing, mihomo, clash, xray] = generators(templates);
        const renderer = new RenderTemplatesService(
            { resolveProxyConfig: async () => [host()] },
            mihomo,
            clash,
            {},
            sing,
            xray,
            {
                retireRoutingProfileRevision: async () => null,
                routingProfileRevision: () => assert.fail('new routing state'),
            },
        );
        const context = {
            matchedResponseType: 'XRAY_JSON',
            userAgent,
            subscriptionSettings: { geofilesEnabled: false },
        };
        const result = await renderer.generateSubscription({
            srrContext: context,
            user: { id: 1, status: 'ACTIVE', expireAt: new Date(Date.now() + 86400000) },
            hosts: [],
        });
        assert.equal(context.headersToApply, undefined);
        assert(result.subscription.includes('geosite:category-ru'));
        assert(!result.subscription.includes('remnacust'));
    }
});

test('automatic refresh has no file or network operations while global opt-in is off', async () => {
    const { GeofilesService } = source(
        'modules/subscription-template/geofiles/geofiles.service.ts',
    );
    const service = Object.create(GeofilesService.prototype);
    let enabled = false,
        calls = 0;
    service.prisma = {
        subscriptionSettings: { findFirst: async () => ({ geofilesEnabled: enabled }) },
    };
    service.refreshStore = {
        refreshDue: async () => {
            calls++;
            return ['refreshed'];
        },
    };
    assert.deepEqual(await service.refreshDue(), []);
    enabled = true;
    assert.deepEqual(await service.refreshDue(), ['refreshed']);
    enabled = false;
    assert.deepEqual(await service.refreshDue(), []);
    assert.equal(calls, 1);
});

test('repository rejects invalid merged settings before mutation and allows explicit paired transitions', async () => {
    const { SubscriptionSettingsRepository } = load(
        path.join(
            __dirname,
            '../src/modules/subscription-settings/repositories/subscription-settings.repository.ts',
        ),
        {
            '@nestjs-cls/transactional': {
                TransactionHost: class {},
                Transactional: () => () => {},
            },
            '../subscription-settings.converter': {},
        },
    );
    let state = { uuid: 'settings', serveJsonAtBaseSubscription: false, geofilesEnabled: false },
        writes = 0,
        locks = 0;
    const repo = new SubscriptionSettingsRepository(
        {
            tx: {
                $queryRaw: async () => {
                    locks++;
                },
                subscriptionSettings: {
                    findUniqueOrThrow: async () => state,
                    update: async ({ data }) => {
                        writes++;
                        state = { ...state, ...data };
                        return state;
                    },
                },
            },
        },
        { fromEntityToPrismaModel: (value) => value, fromPrismaModelToEntity: (value) => value },
    );
    await assert.rejects(
        repo.update({ uuid: 'settings', geofilesEnabled: true }),
        /GEOFILES_REQUIRE_BASE_JSON/,
    );
    assert.equal(writes, 0);
    await repo.update({
        uuid: 'settings',
        serveJsonAtBaseSubscription: true,
        geofilesEnabled: true,
    });
    await assert.rejects(
        repo.update({ uuid: 'settings', serveJsonAtBaseSubscription: false }),
        /GEOFILES_REQUIRE_BASE_JSON/,
    );
    await repo.update({ uuid: 'settings', randomizeHosts: true });
    assert.equal(state.geofilesEnabled, true);
    await repo.update({
        uuid: 'settings',
        serveJsonAtBaseSubscription: false,
        geofilesEnabled: false,
    });
    assert.equal(state.geofilesEnabled, false);
    assert.equal(locks, 5);
});

test('API returns a validation error for an invalid switch combination without clearing caches', async () => {
    const { SubscriptionSettingsService } = source(
        'modules/subscription-settings/subscription-settings.service.ts',
        {
            '@libs/contracts/constants': constants,
            '@common/types': {
                fail: (error) => ({ isOk: false, error }),
                ok: (response) => ({ isOk: true, response }),
            },
        },
    );
    const service = new SubscriptionSettingsService(
        { del: () => assert.fail('failed update must not publish cache invalidation') },
        {},
        {
            findByUUID: async () => ({ uuid: 'settings' }),
            update: async () => {
                throw Error('GEOFILES_REQUIRE_BASE_JSON');
            },
        },
    );
    const result = await service.updateSettings({ uuid: 'settings', geofilesEnabled: true });
    assert.equal(result.isOk, false);
    assert.equal(result.error.message, 'GEOFILES_REQUIRE_BASE_JSON');
    assert.equal(result.error.code, constants.ERRORS.CONFIG_VALIDATION_ERROR.code);
});

test('external squad overrides cannot turn on the global geofile system', async () => {
    const { SubscriptionService } = source('modules/subscription/subscription.service.ts', {
        '@common/utils/convert-type': load(
            path.join(__dirname, '../src/common/utils/convert-type.ts'),
        ),
        '@integration-modules/notifications/interfaces': {},
        '@modules/external-squads/queries/get-cached-external-squad-settings': {
            GetCachedExternalSquadSettingsQuery: class {},
        },
    });
    const service = Object.create(SubscriptionService.prototype);
    service.logger = { error: () => assert.fail('unexpected override failure') };
    service.queryBus = {
        execute: async () => ({
            subscriptionSettings: { geofilesEnabled: true, serveJsonAtBaseSubscription: true },
            responseHeadersRemove: [],
            responseHeadersAdd: {},
            hwidSettings: {},
            customRemarks: {},
        }),
    };
    const settings = { geofilesEnabled: false, serveJsonAtBaseSubscription: false };
    const result = await service.applyMaybeExternalSquadOverrides(settings, 'external-squad');
    assert.equal(result.subscriptionSettings.geofilesEnabled, false);
    assert.equal(result.subscriptionSettings.serveJsonAtBaseSubscription, true);
    assert.deepEqual(settings, { geofilesEnabled: false, serveJsonAtBaseSubscription: false });
});

test('cached global settings are copied before entering request-local subscription processing', async () => {
    const { GetCachedSubscriptionSettingsHandler } = source(
        'modules/subscription-settings/queries/get-cached-subscrtipion-settings/get-cached-subscrtipion-settings.handler.ts',
        {
            '@libs/contracts/constants': constants,
            '@nestjs/cqrs': { QueryHandler: () => () => {} },
        },
    );
    const cached = {
        geofilesEnabled: false,
        serveJsonAtBaseSubscription: false,
        customResponseHeaders: { routing: 'manual' },
    };
    const handler = new GetCachedSubscriptionSettingsHandler(
        { findFirst: () => assert.fail('unexpected DB read') },
        { templateSnapshot: async () => ({ generation: 'a'.repeat(32), value: cached }) },
    );
    const one = await handler.execute();
    one.geofilesEnabled = true;
    one.customResponseHeaders.routing = 'changed';
    const two = await handler.execute();
    assert.deepEqual(two, cached);
    assert.equal(two.geofilesEnabled, false);
    assert.equal(two.customResponseHeaders.routing, 'manual');
    assert.notEqual(two, cached);
});
