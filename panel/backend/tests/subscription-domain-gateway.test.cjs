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
function response() { return { code: 200, headers: {}, set(k, v) { this.headers[k] = v; }, status(v) { this.code = v; return this; }, end() { this.ended = true; } }; }

test('registered public prefix is translated into a custom page prefix without losing query or request context', async () => {
    const value = { uuid, publicBaseUrl: `https://cdn.example.test/edge/cdn/${uuid}` };
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
    const legacyPrefix = { uuid, publicBaseUrl: `https://cdn.example.test/cdn/cdn/${uuid}` };
    const prefixed = { method: 'GET', url: `/cdn/cdn/${uuid}/shortuuid/json` };
    await page(async () => legacyPrefix, '/cdn')(prefixed, response(), () => {
        assert.equal(prefixed.url, '/cdn/shortuuid/json');
    });
});

test('public panel gateway retains its fixed API destination and restores context after completion', async () => {
    const req = { method: 'HEAD', url: `/api/sub/cdn/${uuid}/geofiles/id/bundles/selection/bundle.dat.sha256?revision=123` };
    const base = `https://cdn.example.test/api/sub/cdn/${uuid}`;
    await backend(async () => base)(req, response(), () => {
        assert.equal(req.url, '/api/sub/geofiles/id/bundles/selection/bundle.dat.sha256?revision=123');
        assert.equal(backendContext.requestGeofileBase('unused'), base + '/geofiles/');
    });
    assert.equal(backendContext.currentGeofileOrigin(), undefined);
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
