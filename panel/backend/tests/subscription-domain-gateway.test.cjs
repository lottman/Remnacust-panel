const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const pageLoad = require('../../../subscription-page/backend/tests/load-typescript.cjs');
const root = path.join(__dirname, '../../../subscription-page/backend/src/common');
const context = pageLoad(path.join(root, 'utils/subscription-domain-context.ts'));
const page = pageLoad(path.join(root, 'middlewares/subscription-domain-gateway.middleware.ts'), {
    '../utils/subscription-domain-context': context,
}).subscriptionDomainGateway;
const backendContext = load(path.join(__dirname, '../src/common/utils/geofile-request-context.ts'));
const backend = load(path.join(__dirname, '../src/common/middlewares/subscription-domain-gateway.middleware.ts'), {
    '../utils/geofile-request-context': backendContext,
}).subscriptionDomainGateway;
const uuid = '11111111-1111-4111-8111-111111111111';
const neutralName = 'x-c57fd6ed1e03429887769a88';
function response() { return { code: 200, headers: {}, set(k, v) { this.headers[k] = v; }, status(v) { this.code = v; return this; }, end() { this.ended = true; } }; }

test('registered public prefix is translated into a custom page prefix without losing query or request context', async () => {
    const value = { uuid, publicBaseUrl: 'https://cdn.example.test/edge' };
    const req = { method: 'GET', url: `/edge/cdn/${uuid}/shortuuid/json?revision=123` };
    const res = response();
    let called = 0;
    await page(async () => value, 'source')(req, res, () => {
        called++;
        assert.equal(req.url, '/source/shortuuid/json?revision=123');
        assert.deepEqual(context.currentSubscriptionDomain(), value);
    });
    assert.equal(called, 1);
    assert.equal(context.currentSubscriptionDomain(), undefined);
    const mismatch = response();
    await page(async () => value)({ method: 'GET', url: `/wrong/cdn/${uuid}/shortuuid/json` }, mismatch, () => assert.fail());
    assert.equal(mismatch.code, 404);
    const legacyPrefix = { uuid, publicBaseUrl: 'https://cdn.example.test/cdn' };
    const prefixed = { method: 'GET', url: `/cdn/cdn/${uuid}/shortuuid/json` };
    await page(async () => legacyPrefix, '/cdn')(prefixed, response(), () => {
        assert.equal(prefixed.url, '/cdn/shortuuid/json');
    });
});

test('public panel gateway retains its fixed API destination and restores context after completion', async () => {
    const req = { method: 'HEAD', url: `/api/sub/cdn/${uuid}/geofiles/id/bundles/selection/bundle.dat.sha256?revision=123` };
    const base = 'https://cdn.example.test/api/sub';
    await backend(async () => base)(req, response(), () => {
        assert.equal(req.url, '/api/sub/geofiles/id/bundles/selection/bundle.dat.sha256?revision=123');
        assert.equal(backendContext.requestGeofileBase('unused'), base + '/geofiles/');
    });
    assert.equal(backendContext.currentGeofileOrigin(), undefined);
});

test('plain CDN links translate a registered prefix while retaining the entered public domain', async () => {
    const value = { uuid, publicBaseUrl: 'https://cdn.example.test/edge', requestHeaderName: neutralName };
    const req = { method: 'GET', url: '/edge/shortuuid/json?revision=123', headers: { [neutralName]: uuid } };
    await page(async () => value, '/source')(req, response(), () => {
        assert.equal(req.url, '/source/shortuuid/json?revision=123');
        assert.deepEqual(context.currentSubscriptionDomain(), value);
    });
});

test('ordinary and CDN domains preserve browser, app, explicit-format and deny response rules', async () => {
    const constants = require('../libs/contract/build/backend/constants');
    const bounded = load(path.join(__dirname, '../src/common/utils/bounded-regex.ts'));
    const { ResponseRulesMatcherService } = load(path.join(__dirname, '../src/modules/subscription-response-rules/services/response-rules-matcher.service.ts'), {
        '@libs/contracts/constants': constants, '@common/utils/bounded-regex': bounded,
    });
    const matcher = new ResponseRulesMatcherService();
    const rules = { rules: [
        { name: 'Browser Subscription', enabled: true, operator: 'AND', conditions: [{ headerName: 'accept', operator: 'CONTAINS', value: 'text/html', caseSensitive: true }], responseType: 'BROWSER' },
        { name: 'Fallback Base64', enabled: true, operator: 'AND', conditions: [], responseType: 'XRAY_BASE64' },
    ] };
    try {
        for (const cdn of [false, true]) {
            const value = { uuid, publicBaseUrl: 'https://cdn.example.test', requestHeaderName: neutralName };
            for (const [agent, accept, format, expected] of [
                ['Mozilla/5.0', 'text/html', undefined, 'BROWSER'],
                ['Happ/6.2.0', '*/*', undefined, 'XRAY_BASE64'],
                ['INCY/2.6.2/iOS', 'application/json', undefined, 'XRAY_BASE64'],
                ['Happ/6.2.0', '*/*', 'json', 'XRAY_JSON'],
                ['INCY/2.6.2/iOS', 'application/json', 'json', 'XRAY_JSON'],
                ['Mihomo/1.19', '*/*', 'mihomo', 'MIHOMO'],
                ['sing-box/1.12', '*/*', 'singbox', 'SINGBOX'],
            ]) {
                const req = { method: 'GET', url: '/shortuuid' + (format ? '/' + format : ''), headers: {
                    host: 'canonical.example.test', 'user-agent': agent, accept, ...(cdn ? { [neutralName]: uuid } : {}),
                } };
                let called = false;
                await page(async () => value)(req, response(), async () => {
                    called = true;
                    assert.equal(req.headers['user-agent'], agent);
                    assert.equal(req.headers.accept, accept);
                    assert.deepEqual(context.currentSubscriptionDomain(), cdn ? value : undefined);
                    assert.equal((await matcher.matchRules(rules, req.headers, format)).responseType, expected);
                });
                assert.equal(called, true);
                assert.equal(context.currentSubscriptionDomain(), undefined);
            }
        }
        const denied = { rules: [{ enabled: true, operator: 'AND', conditions: [], responseType: 'BLOCK' }, ...rules.rules] };
        const req = { method: 'GET', url: '/shortuuid', headers: { [neutralName]: uuid, 'user-agent': 'Happ/6.2.0' } };
        await page(async () => ({ uuid, publicBaseUrl: 'https://cdn.example.test', requestHeaderName: neutralName }))(req, response(), async () => {
            assert.equal((await matcher.matchRules(denied, req.headers)).responseType, 'BLOCK');
            assert.equal((await matcher.matchRules({ ...rules, settings: { disableSubscriptionAccessByPath: true } }, req.headers, 'json')).responseType, 'BLOCK');
        });
    } finally { bounded.configuredRegex.close(); }
});

test('public resolver keeps legacy metadata for old pages and negotiates plain URLs for new pages', async () => {
    const { SubscriptionDomainGatewayController } = load(path.join(__dirname, '../src/modules/subscription-domains/subscription-domain-gateway.controller.ts'), {
        './subscription-domains.service': {},
    });
    const controller = new SubscriptionDomainGatewayController({
        gatewayBase: async () => 'https://cdn.example.test/edge',
        gatewayHeaderName: async () => neutralName,
    });
    assert.equal((await controller.resolve(uuid)).response.publicBaseUrl, `https://cdn.example.test/edge/cdn/${uuid}`);
    assert.equal((await controller.resolve(uuid, '1')).response.publicBaseUrl, `https://cdn.example.test/edge/cdn/${uuid}`);
    const current = (await controller.resolve(uuid, '2')).response;
    assert.deepEqual(current, {uuid, publicBaseUrl:'https://cdn.example.test/edge', requestHeaderName:neutralName});
    for (const value of ['3', '', ['2']]) await assert.rejects(controller.resolve(uuid, value), e => e.getStatus() === 400);
});

test('a CDN request header selects registered context for ordinary links without changing their path', async () => {
    const value = { uuid, publicBaseUrl: 'https://cdn.example.test' };
    const legacy = { method: 'GET', url: '/cdn/shortuuid/json?revision=123', headers: { 'x-remnacust-cdn': uuid } };
    let passed = false;
    await page(async () => value, '/cdn')(legacy, response(), () => {
        passed = true;
        assert.equal(legacy.url, '/cdn/shortuuid/json?revision=123');
        assert.deepEqual(context.currentSubscriptionDomain(), value);
    });
    assert.equal(passed, true);
    for (const [factory, prefix, current] of [[page, '', () => context.currentSubscriptionDomain()],
        [backend, '/api/sub', () => backendContext.currentGeofileOrigin()]]) {
        const neutral = { method: 'GET', url: prefix + '/shortuuid/json', headers: { [neutralName]: uuid } };
        let accepted = false;
        const neutralValue = { ...value, requestHeaderName: neutralName };
        await factory(async () => prefix ? value.publicBaseUrl : neutralValue, prefix ? async () => neutralName : '')(neutral, response(), () => {
            accepted = true;
            assert.deepEqual(current(), prefix ? value.publicBaseUrl : neutralValue);
            assert.equal(neutral.headers[neutralName], undefined);
        });
        assert.equal(accepted, true);
        const wrong = response();
        await factory(async () => prefix ? value.publicBaseUrl : neutralValue, prefix ? async () => neutralName : '')(
            { method: 'GET', url: prefix + '/shortuuid/json', headers: { 'x-000000000000000000000000': uuid } },
            wrong, () => assert.fail('Mismatched header reached subscription routes'));
        assert.equal(wrong.code, 404);
        for (const method of ['GET', 'HEAD']) {
            const req = { method, url: prefix + '/shortuuid/json?revision=123', headers: { 'x-remnacust-cdn': uuid } };
            const original = req.url;
            await factory(async (id) => { assert.equal(id, uuid); return prefix ? value.publicBaseUrl : value; })(req, response(), () => {
                assert.equal(req.url, original);
                assert.equal(req.headers['x-remnacust-cdn'], undefined, 'public selector is consumed, not forwarded');
                assert.deepEqual(current(), prefix ? value.publicBaseUrl : value);
            });
            assert.equal(current(), undefined);
        }
        for (const selector of ['', 'https://evil.test', 'bad', [uuid, uuid]]) {
            const res = response();
            await factory(async () => assert.fail('Malformed header reached lookup'))({ method: 'GET', url: prefix + '/shortuuid/json', headers: { 'x-remnacust-cdn': selector } }, res, () => assert.fail());
            assert.equal(res.code, 404);
        }
        const conflict = response();
        await factory(async () => assert.fail('Conflicting selectors reached lookup'))({ method: 'GET', url: `${prefix}/cdn/${uuid}/shortuuid/json`, headers: { 'x-remnacust-cdn': '22222222-2222-4222-8222-222222222222' } }, conflict, () => assert.fail());
        assert.equal(conflict.code, 404);
        const unknown = response();
        await factory(async () => { throw Object.assign(Error('unknown'), { status: 404 }); })({ method: 'GET', url: prefix + '/shortuuid/json', headers: { 'x-remnacust-cdn': uuid } }, unknown, () => assert.fail());
        assert.equal(unknown.code, 404);
    }
});

test('malformed, encoded, nested and traversal selectors fail before any lookup; legacy links bypass gateway', async () => {
    const rest = [`/cdn/no-id/short`, `/cdn/${uuid}/cdn/${uuid}/short`, `/cdn/${uuid}/../admin`,
        `/cdn/${uuid}/%2e%2e/admin`, `/cdn/${uuid}/%2fadmin`, `/cdn/${uuid}//admin`, `/cdn/${uuid}/\\admin`];
    for (const [factory, prefix] of [[page, ''], [backend, '/api/sub']]) {
        for (const url of rest) {
            const res = response();
            await factory(async () => assert.fail('Unsafe path reached resolver'))({ method: 'GET', url: prefix + url }, res, () => assert.fail('Unsafe path reached routes'));
            assert.equal(res.code, 404, prefix + url);
        }
        const denied = response();
        await factory(async () => assert.fail())({ method: 'POST', url: `${prefix}/cdn/${uuid}/short` }, denied, () => assert.fail());
        assert.equal(denied.code, 404);
        let legacy = false;
        await factory(async () => assert.fail())({ method: 'GET', url: `${prefix}/short/json` }, response(), () => { legacy = true; });
        assert.equal(legacy, true);
    }
});
