const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { source } = require('./upstream-filter-fixture.cjs');
const serviceFile = path.join(__dirname, '../src/modules/subscription/subscription.service.ts');
const imports = Object.fromEntries([...fs.readFileSync(serviceFile, 'utf8').matchAll(/from '([^']+)'/g)]
    .filter(match => match[1].startsWith('@') && !match[1].startsWith('@nestjs/'))
    .map(match => [match[1], {}]));
const { SubscriptionService } = source('modules/subscription/subscription.service.ts', {
    ...imports,
    '@common/types': { ok: response => ({ isOk: true, response }), fail: error => ({ isOk: false, error }) },
    '../hosts/queries/get-hosts-for-user': { GetHostsForUserQuery: class {} },
});

test('pages with hidden connection keys never enumerate hosts or issue connection credentials', async () => {
    const service = Object.create(SubscriptionService.prototype);
    let visibilityReads = 0;
    const forbidden = () => { throw Error('Hidden keys triggered connection generation'); };
    Object.assign(service, {
        logger: { error: forbidden },
        subpageConfigs: { connectionKeysMayBeVisible: async () => { visibilityReads++; return false; } },
        queryBus: { execute: forbidden },
        resolveProxyConfigService: { resolveProxyConfig: forbidden },
        xrayGeneratorService: { generateLinks: forbidden },
        deviceAccess: { enabled: false },
        getUserInfo: async (user, links) => ({ status: user.status, links }),
    });
    for (const status of ['ACTIVE', 'FROZEN', 'EXPIRED', 'DISABLED', 'LIMITED']) {
        const result = await service.getSubscriptionInfo({
            userEntity: { id: 1n, status }, subscriptionSettingsRaw: { hwidSettings: { enabled: false } },
            subscriptionPageRequest: true,
        });
        assert.deepEqual(result, { isOk: true, response: { status, links: [] } });
    }
    assert.equal(visibilityReads, 5);
});

test('ordinary API calls retain links and a page with visible keys retains device authorization', async () => {
    for (const [page, visible, blocked, expected] of [[false, false, false, 1], [true, true, false, 1], [true, true, true, 0]]) {
        const service = Object.create(SubscriptionService.prototype);
        let visibilityReads = 0, generated = 0;
        Object.assign(service, {
            logger: { error: error => { throw error; } },
            subpageConfigs: { connectionKeysMayBeVisible: async () => { visibilityReads++; return visible; } },
            queryBus: { execute: async () => ({ isOk: true, response: ['host'] }) },
            resolveProxyConfigService: { resolveProxyConfig: async () => ['resolved'] },
            xrayGeneratorService: { generateLinks: () => { generated++; return ['fixture-link']; } },
            deviceAccess: { enabled: true, hasBlockedDevice: async () => blocked },
            getUserInfo: async (_user, links) => ({ links }),
        });
        const result = await service.getSubscriptionInfo({ userEntity: { id: 1n },
            subscriptionSettingsRaw: { hwidSettings: { enabled: false } }, subscriptionPageRequest: page });
        assert.equal(result.isOk, true);
        assert.equal(generated, expected);
        assert.equal(result.response.links.length, expected);
        assert.equal(visibilityReads, page ? 1 : 0);
    }
});

test('only the versioned subscription page client opts into the metadata optimization', async () => {
    const noop = () => () => {};
    const { SubscriptionController } = source('modules/subscription/controllers/subscription.controller.ts', {
        '@nestjs/common': { Controller: noop, Get: noop, Header: noop, Headers: noop, Param: noop, Res: noop,
            UseFilters: noop, UseInterceptors: noop, HttpStatus: { OK: 200 } },
        '@common/decorators/base-endpoint': { Endpoint: noop },
        '@common/decorators/get-srr-context': { GetSrrContext: noop },
        '@common/exception/http-exception.filter': {},
        '@common/exception/public-http-exception.filter': {},
        '@common/middlewares/subscription-budget.middleware': {},
        '@libs/contracts/api': { CONTROLLERS_INFO: { SUBSCRIPTION: { tag: 'Subscriptions' } }, SUBSCRIPTION_CONTROLLER: 'sub', SUBSCRIPTION_ROUTES: { GET: '' } },
        '@libs/contracts/commands': {},
        '@common/helpers/error-handler.helper': { errorHandler: result => result.response },
    });
    const calls = [];
    const controller = new SubscriptionController({ getSubscriptionInfo: async params => {
        calls.push(params); return { isOk: true, response: {} };
    } }, {});
    for (const [version, agent] of [[undefined, undefined], ['1', 'Happ'], [undefined, 'Remnawave Subscription Page'], ['1', 'Remnawave Subscription Page']])
        await controller.getSubscriptionInfoByShortUuid({ shortUuid: 'fixture' }, version, agent);
    assert.deepEqual(calls.map(x => x.subscriptionPageRequest), [false, false, false, true]);
    assert(calls.every(x => x.authenticated === false));
});
