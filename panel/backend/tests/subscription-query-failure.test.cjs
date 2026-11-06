const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { source } = require('./upstream-filter-fixture.cjs');
const {
    subscriptionService,
    httpController,
    models,
    regex,
} = require('./subscription-delivery-fixture.cjs');
const load = require('./load-typescript.cjs');
const { ERRORS } = require('../libs/contract/build/backend/constants');
const { fail, ok } = load(path.join(__dirname, '../src/common/types/result.type.ts'));

class GetUserByUniqueFieldQuery {}
class GetHostsForUserQuery {}
class GetCachedSubscriptionSettingsQuery {}
class CheckHwidExistsQuery {}
const { SubscriptionService } = source('modules/subscription/subscription.service.ts', {
    '@integration-modules/notifications/interfaces': {},
    '@common/types': { fail, ok },
    '@libs/contracts/constants': require('../libs/contract/build/backend/constants'),
    '@modules/users/queries/get-user-by-unique-field': { GetUserByUniqueFieldQuery },
    '../hosts/queries/get-hosts-for-user': { GetHostsForUserQuery },
    '@modules/subscription-settings/queries/get-cached-subscrtipion-settings': {
        GetCachedSubscriptionSettingsQuery,
    },
    '@modules/hwid-user-devices/queries/check-hwid-exists/check-hwid-exists.query': {
        CheckHwidExistsQuery,
    },
    './models': models,
});

test.after(() => regex.configuredRegex.close());

function fixture(stage, error = ERRORS.INTERNAL_SERVER_ERROR) {
    const { service, settings } = subscriptionService({});
    Object.setPrototypeOf(service, SubscriptionService.prototype);
    const normal = service.queryBus.execute;
    let rendered = 0;
    service.resolveProxyConfigService = {
        resolveProxyConfig: async () => {
            rendered++;
            return [];
        },
    };
    service.xrayGeneratorService = { generateLinks: () => [] };
    service.getUserInfo = async () => new models.SubscriptionRawResponse({ links: [], user: {} });
    service.queryBus.execute = async (query) => {
        if (query instanceof GetCachedSubscriptionSettingsQuery) return settings;
        if (
            (stage === 'user' && query instanceof GetUserByUniqueFieldQuery) ||
            (stage === 'hosts' && query instanceof GetHostsForUserQuery) ||
            (stage === 'device' && query instanceof CheckHwidExistsQuery)
        )
            return fail(error);
        return normal(query);
    };
    return { service, settings, rendered: () => rendered };
}

test('user and host query failures produce retriable HTTP 503 for every public subscription format', async () => {
    for (const stage of ['user', 'hosts']) {
        const { service, settings, rendered } = fixture(stage);
        const { app, base } = await httpController(service, settings);
        try {
            for (const type of [
                'SINGBOX',
                'MIHOMO',
                'STASH',
                'CLASH',
                'XRAY_JSON',
                'XRAY_BASE64',
                'BROWSER',
            ]) {
                const response = await fetch(`${base}/api/sub/fixture123/${type}`);
                assert.equal(response.status, 503, `${stage}:${type}`);
                assert.equal(response.headers.get('retry-after'), '30');
                assert.match(response.headers.get('cache-control'), /no-store/);
                assert.doesNotMatch(await response.text(), /Server error|A001/);
            }
            assert.equal(rendered(), 0);
        } finally {
            await app.close();
        }
    }
});

test('a genuinely missing user retains HTTP 404 for configuration and browser subscriptions', async () => {
    const { service, settings } = fixture('user', ERRORS.USER_NOT_FOUND);
    const { app, base } = await httpController(service, settings);
    try {
        for (const type of ['SINGBOX', 'BROWSER']) {
            const response = await fetch(`${base}/api/sub/missing123/${type}`);
            assert.equal(response.status, 404);
            assert.match(response.headers.get('cache-control'), /no-store/);
        }
    } finally {
        await app.close();
    }
});

test('device query failures are unavailable rather than a missing subscription', async () => {
    const { service, settings } = fixture('device');
    const result = await service.getSubscriptionByShortUuid(
        {
            matchedResponseType: 'SINGBOX',
            subscriptionSettings: settings,
            userAgent: 'fixture-client',
            hwidHeaders: { hwid: 'fixture-device' },
        },
        'fixture123',
    );
    assert(result instanceof models.SubscriptionUnavailableResponse);
});

test('info queries preserve missing users, fail on host SQL errors and accept legitimate empty hosts', async () => {
    for (const [stage, error] of [
        ['user', ERRORS.USER_NOT_FOUND],
        ['user', ERRORS.INTERNAL_SERVER_ERROR],
        ['hosts', ERRORS.INTERNAL_SERVER_ERROR],
        ['none', null],
    ]) {
        const { service, rendered } = fixture(stage, error);
        const result = await service.getSubscriptionInfo({
            searchBy: { uniqueFieldKey: 'shortUuid', uniqueField: 'fixture123' },
            authenticated: false,
        });
        assert.equal(result.isOk, error === null);
        if (error) assert.equal(result.code, error.code);
        assert.equal(rendered(), error ? 0 : 1);
    }
});
