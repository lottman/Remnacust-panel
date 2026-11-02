const test = require('node:test');
const assert = require('node:assert/strict');
const { source } = require('./upstream-filter-fixture.cjs');
const constants = require('../libs/contract/build/backend/constants');
class Response { constructor(value) { Object.assign(this, value); } }
const { SubscriptionService } = source('modules/subscription/subscription.service.ts', {
    '@integration-modules/notifications/interfaces': {},
    '@queue/_users/users-queues.service': {},
    '@libs/contracts/constants': constants,
    '@modules/users/queries/get-user-by-unique-field': { GetUserByUniqueFieldQuery: class {} },
    '@modules/hwid-user-devices/queries/get-user-devices.query': { GetUserDevicesQuery: class {} },
    '@modules/subscription-settings/queries/get-cached-subscrtipion-settings': { GetCachedSubscriptionSettingsQuery: class {} },
    '@modules/subscription-template/constants': { isExtendedClient: () => false },
    './models': { SubscriptionWithConfigResponse: Response },
});
const { RenderTemplatesService } = source('modules/subscription-template/render-templates.service.ts', {
    './constants/config-types': { SUBSCRIPTION_CONFIG_TYPES: { XRAY_BASE64: { isBase64: true, CONTENT_TYPE: 'text/plain' } } },
});

test('preview counts resolved host credentials, excluding notice placeholders and format exclusions', async () => {
    const service = Object.create(RenderTemplatesService.prototype);
    const host = (uuid, extra = {}) => ({ metadata: { uuid, isDisabled: false, excludeFromSubscriptionTypes: [], ...extra } });
    service.resolveProxyConfigService = { resolveProxyConfig: async () => [
        host('00000000-0000-0000-0000-000000000000'), host('permitted'),
        host('disabled', { isDisabled: true }), host('excluded', { excludeFromSubscriptionTypes: ['XRAY_BASE64'] }),
    ] };
    service.xrayGeneratorService = { generateConfig: async () => 'fixture' };
    let resolved;
    await service.generateSubscription({ srrContext: { matchedResponseType: 'XRAY_BASE64' }, onResolvedHosts: ids => { resolved = ids; } });
    assert.deepEqual(resolved, ['permitted']);
});

test('inactive preview distinguishes notifications without hosts from permitted exception access', async () => {
    for (const status of ['EXPIRED', 'DISABLED', 'FROZEN', 'LIMITED', 'ACTIVE']) {
        for (const [count, blocked] of [[0, false], [1, false], [1, true]]) {
            const service = Object.create(SubscriptionService.prototype);
            const device = { hwid: 'fixture-device', userAgent: 'Happ/6.2.0', blocked };
            const user = { status, id: 42n, shortUuid: 'fixture', expireAt: new Date(Date.now() + 86400000) };
            const results = [{ isOk: true, response: user }, [device], { responseRules: {}, customResponseHeaders: {} }];
            service.queryBus = { execute: async () => results.shift() };
            service.srrMatcher = { matchRules: async () => ({ matched: true, responseType: 'XRAY_JSON' }) };
            service.getSubscriptionByShortUuid = async (_ctx, _id, _token, trace) => {
                trace.resolvedHostCount = count;
                trace.hosts = [];
                return new Response({ body: '[{"remarks":"notice"}]', headers: {}, contentType: 'application/json' });
            };
            const result = await service.previewDevice(42n, device.hwid, 'json');
            assert.equal(result.allowed, !blocked && count > 0, status);
            assert.equal(result.reason, blocked ? 'deviceBlocked' : count ? null : status === 'ACTIVE' ? 'noAvailableHosts' : 'noInactiveHosts', status);
            assert.equal(result.resolvedHostCount, count);
        }
    }
});
