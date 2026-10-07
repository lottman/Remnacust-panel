const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const load = require('./load-typescript.cjs');
const session = load(path.join(__dirname, '../src/common/utils/admin-session.ts'));
const constants = {
    BACKEND_TOOLS_AUTH_COOKIE_NAME: 'tools', BACKEND_TOOLS_JWT_ISSUER: 'tools-test',
    BACKEND_TOOLS_JWT_LIFETIME_HOURS: 1, BACKEND_TOOLS_JWT_SCOPES: { ACCESS: 'access' },
    ERRORS: { FORBIDDEN: { message: 'Forbidden', code: 'forbidden', httpCode: 403 } },
    ROLE: { ADMIN: 'ADMIN' },
};
const { toolsAuthMiddleware } = load(path.join(__dirname, '../src/common/middlewares/tools-auth.middleware.ts'), {
    '@common/utils/startup-app': { isDevelopment: () => false },
    '@common/exception/http-exeception-with-error-code.type': { HttpExceptionWithErrorCodeType: Error },
    '@libs/contracts/api': { ROOT: '/api', BACKEND_TOOLS_ROOT: '/tools' },
    '@libs/contracts/constants': constants,
    '@common/utils/admin-session': session,
    '@modules/admin/queries/get-admin-by-username': { GetAdminByUsernameQuery: class {} },
});
const secret = 'only-an-isolated-test-secret';
const frontEndOrigin = 'https://panel.example.test';
const admin = { uuid: 'test-admin', username: 'admin', passwordHash: 'test-password-hash' };
const parent = { uuid: admin.uuid, username: admin.username, role: 'ADMIN',
    exp: Math.floor(Date.now() / 1000) + 120, ...session.createAdminSessionClaims(admin, secret) };
const queryBus = { execute: async () => ({ isOk: true, response: admin }) };
function response() {
    return { status: 0, headers: {}, setHeader(name, value) { this.headers[name] = value; },
        cookies: [], cookie(...args) { this.cookies.push(args); },
        redirect(url) { this.url = url; this.status = 302; }, sendStatus(status) { this.status = status; } };
}
function assertSecurityHeaders(res) {
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
    assert.equal(res.headers['X-Frame-Options'], 'DENY');
}
test('a one-time tools token permits exactly one concurrent redemption across workers', async () => {
    const used = new Map();
    const cache = { exists: async () => true, async incrementWithTtl(key) { const n = (used.get(key) || 0) + 1; used.set(key, n); return n; } };
    const handlers = [toolsAuthMiddleware(secret, cache, queryBus, frontEndOrigin), toolsAuthMiddleware(secret, cache, queryBus, frontEndOrigin)];
    const token = jwt.sign({ scope: 'ott', parent }, secret, { issuer: 'tools-test', expiresIn: '30s' });
    const req = { method: 'GET', originalUrl: `/api/tools?ott=${token}`, headers: {}, path: '/api/tools' };
    const results = await Promise.all(Array.from({ length: 10 }, async (_, i) => {
        const res = response(); await handlers[i % 2](req, res, () => assert.fail('must redirect')); return res;
    }));
    assert.equal(results.filter(r => r.status === 302).length, 1);
    assert.equal(results.filter(r => r.status === 403).length, 9);
    results.forEach(assertSecurityHeaders);
    assert.equal(results.find(r => r.status === 302).url, '/api/tools');
    const cookie = results.find(r => r.status === 302).cookies[0][1];
    const decoded = jwt.verify(cookie, secret);
    assert.equal(decoded.parent.jti, parent.jti);
    assert(decoded.exp <= parent.exp);
    const unavailable = response();
    await toolsAuthMiddleware(secret, { exists: async () => true, incrementWithTtl: async () => { throw Error('offline'); } }, queryBus, frontEndOrigin)(req, unavailable, () => {});
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.cookies.length, 0);
    assertSecurityHeaders(unavailable);
});

test('tools cookies and unredeemed OTTs are denied after parent logout, credential change or expiry', async () => {
    const activeKeys = new Set([session.adminSessionKey(parent.jti)]);
    const cache = { exists: async key => activeKeys.has(key), incrementWithTtl: async () => 1 };
    let currentAdmin = admin;
    const queries = { execute: async () => ({ isOk: !!currentAdmin, response: currentAdmin }) };
    const handler = toolsAuthMiddleware(secret, cache, queries, frontEndOrigin);
    const cookie = jwt.sign({ scope: 'access', parent }, secret, { issuer: 'tools-test', expiresIn: '1h' });
    const req = { method: 'GET', originalUrl: '/api/tools', headers: { cookie: `tools=${cookie}` } };
    let accepted = 0;
    await handler(req, response(), () => accepted++);
    assert.equal(accepted, 1);

    activeKeys.delete(session.adminSessionKey(parent.jti));
    await assert.rejects(handler(req, response(), () => assert.fail('revoked cookie accepted')), /Forbidden/);
    const ott = jwt.sign({ scope: 'ott', parent }, secret, { issuer: 'tools-test', expiresIn: '30s' });
    const denied = response();
    await handler({ ...req, originalUrl: `/api/tools?ott=${ott}` }, denied, () => assert.fail('revoked OTT accepted'));
    assert.equal(denied.status, 403);
    assert.equal(denied.cookies.length, 0);
    activeKeys.add(session.adminSessionKey(parent.jti));

    currentAdmin = { ...admin, passwordHash: 'changed-password-hash' };
    await assert.rejects(handler(req, response(), () => assert.fail('old credentials accepted')), /Forbidden/);
    currentAdmin = null;
    await assert.rejects(handler(req, response(), () => assert.fail('deleted admin accepted')), /Forbidden/);
    currentAdmin = admin;
    for (const invalidParent of [undefined, { ...parent, exp: 1 }, { ...parent, role: 'API' }]) {
        const token = jwt.sign({ scope: 'access', parent: invalidParent }, secret, { issuer: 'tools-test', expiresIn: '1h' });
        await assert.rejects(handler({ ...req, headers: { cookie: `tools=${token}` } }, response(), () => assert.fail('invalid parent accepted')), /Forbidden/);
    }
    const unavailable = response();
    await toolsAuthMiddleware(secret, { exists: async () => { throw Error('offline'); } }, queries, frontEndOrigin)(req, unavailable, () => assert.fail('failed open'));
    assert.equal(unavailable.status, 503);
});
test('a malformed tools cookie is rejected instead of throwing a URI decoding exception', async () => {
    const req = { method: 'GET', originalUrl: '/api/tools', headers: { cookie: 'tools=%ZZ' } };
    const res = response();
    await assert.rejects(toolsAuthMiddleware(secret, {}, queryBus, frontEndOrigin)(req, res, () => assert.fail('denied')), /Forbidden/);
    assertSecurityHeaders(res);
});

test('unsafe tools methods reject missing, cross-site and non-exact origins despite a valid cookie', async () => {
    const cookie = jwt.sign({ scope: 'access', parent }, secret, { issuer: 'tools-test', expiresIn: '1h' });
    const handler = toolsAuthMiddleware(secret, { exists: async () => true }, queryBus, frontEndOrigin);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'TRACE']) {
        for (const origin of [undefined, 'null', 'https://evil.example.test', `${frontEndOrigin}.evil.test`, `${frontEndOrigin}/`, 'http://panel.example.test', `${frontEndOrigin}:8443`]) {
            const res = response();
            await handler({ method, originalUrl: '/api/tools', headers: {
                cookie: `tools=${cookie}`, origin, host: 'evil.example.test', 'x-forwarded-host': 'evil.example.test',
            } }, res, () => assert.fail(`${method} accepted origin ${origin}`));
            assert.equal(res.status, 403);
            assertSecurityHeaders(res);
        }
    }
});

test('unsafe tools methods accept the configured exact origin independently of Host', async () => {
    const cookie = jwt.sign({ scope: 'access', parent }, secret, { issuer: 'tools-test', expiresIn: '1h' });
    const handler = toolsAuthMiddleware(secret, { exists: async () => true }, queryBus, frontEndOrigin);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const res = response();
        let accepted = false;
        await handler({ method, originalUrl: '/api/tools', headers: {
            cookie: `tools=${cookie}`, origin: frontEndOrigin, host: 'untrusted.example.test',
        } }, res, () => { accepted = true; });
        assert.equal(accepted, true);
        assertSecurityHeaders(res);
    }
});

test('GET, HEAD and OPTIONS do not require Origin but still require tools authentication', async () => {
    const cookie = jwt.sign({ scope: 'access', parent }, secret, { issuer: 'tools-test', expiresIn: '1h' });
    const handler = toolsAuthMiddleware(secret, { exists: async () => true }, queryBus, frontEndOrigin);
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        const res = response();
        let accepted = false;
        await handler({ method, originalUrl: '/api/tools', headers: { cookie: `tools=${cookie}` } }, res, () => { accepted = true; });
        assert.equal(accepted, true);
        assertSecurityHeaders(res);
        await assert.rejects(handler({ method, originalUrl: '/api/tools', headers: {} }, response(), () => assert.fail('unauthenticated request accepted')), /Forbidden/);
    }
});

test('wildcard CORS is not a trusted tools origin; configured panel domain can supply it', async () => {
    const cookie = jwt.sign({ scope: 'access', parent }, secret, { issuer: 'tools-test', expiresIn: '1h' });
    const req = { method: 'POST', originalUrl: '/api/tools', headers: {
        cookie: `tools=${cookie}`, origin: frontEndOrigin, host: 'untrusted.example.test',
    } };
    const denied = response();
    await toolsAuthMiddleware(secret, { exists: async () => true }, queryBus, '*')(req, denied, () => assert.fail('wildcard trusted'));
    assert.equal(denied.status, 403);
    for (const [front, panel] of [[`${frontEndOrigin}/`, undefined], ['*', 'panel.example.test']]) {
        let accepted = false;
        await toolsAuthMiddleware(secret, { exists: async () => true }, queryBus, front, panel)(req, response(), () => { accepted = true; });
        assert.equal(accepted, true);
    }
});
