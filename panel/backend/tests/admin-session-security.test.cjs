const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '..');
const session = load(path.join(root, 'src/common/utils/admin-session.ts'));
const secret = 'local-test-secret-with-at-least-32-characters';
const admin = { uuid: 'e256ae78-2215-4106-a018-22e2f620f61f', username: 'owner', passwordHash: 'test-hash-v1' };
const config = { getOrThrow: () => secret };
const claims = () => ({ ...admin, passwordHash: undefined, role: 'ADMIN',
    ...session.createAdminSessionClaims(admin, secret), exp: Math.floor(Date.now() / 1000) + 3600 });

test('weak signing keys and malformed session lifetimes are rejected at startup', () => {
    const { configSchema } = load(path.join(root, 'src/common/config/app-config/config.schema.ts'), {
        '@common/utils/short-uuid': { compileShortUuidPattern: () => /test/ },
    });
    for (const key of ['', 'change_me', 'short']) {
        assert.equal(configSchema.shape.APP_SECRET.safeParse(key).success, false);
    }
    assert.equal(configSchema.shape.APP_SECRET.safeParse(secret).success, true);
    for (const value of ['', 'abc', '12hours', '12.5', '0', '169']) {
        assert.equal(configSchema.shape.JWT_AUTH_LIFETIME.safeParse(value).success, false, value);
    }
    assert.equal(configSchema.shape.JWT_AUTH_LIFETIME.parse(undefined), 12);
});

test('sessions are unique and never disclose the password hash', () => {
    const a = session.createAdminSessionClaims(admin, secret);
    const b = session.createAdminSessionClaims(admin, secret);
    assert.notEqual(a.jti, b.jti);
    assert.equal(a.authVersion, b.authVersion);
    assert.equal(JSON.stringify(a).includes(admin.passwordHash), false);
});

test('credential changes, legacy tokens and malformed claims cannot retain admin access', async () => {
    const token = claims();
    const valid = (payload, identity = admin) => session.isAdminSessionCurrent(payload, identity, secret, async () => true);
    assert.equal(await valid(token), true);
    assert.equal(await valid(token, { ...admin, passwordHash: 'new-password-hash' }), false);
    assert.equal(await valid(token, { ...admin, username: 'renamed' }), false);
    for (const patch of [
        { jti: undefined }, { jti: '../key' }, { authVersion: undefined },
        { authVersion: 'bad' }, { authVersion: '0'.repeat(64) },
        { exp: undefined }, { exp: Infinity }, { exp: '9999999999' }, { exp: 0 }, { uuid: 'other' },
    ]) assert.equal(await valid({ ...token, ...patch }), false, JSON.stringify(patch));
});

function guards() {
    const mocks = {
        '@nestjs/passport': { AuthGuard: () => class { async canActivate() { return true; } } },
        '@common/config/app-config/typed-config.service': { TypedConfigService: class {} }, '@common/raw-cache': {}, '@common/types': {},
        '@common/utils/admin-session': session,
        '@libs/contracts/constants': { ROLE: { ADMIN: 'ADMIN', API: 'API' },
            REMNAWAVE_CLIENT_TYPE_HEADER: 'x-client-type', REMNAWAVE_CLIENT_TYPE_BROWSER: 'browser' },
        '@modules/admin/entities/admin.entity': {},
        '@modules/admin/queries/get-admin-by-username': { GetAdminByUsernameQuery: class {} },
        '@modules/api-tokens/entities/api-token.entity': {},
        '@modules/api-tokens/queries/get-token-by-uuid': { GetTokenByUuidQuery: class {} },
        '@modules/auth/interfaces': {},
    };
    return {
        ...load(path.join(root, 'src/common/guards/jwt-guards/def-jwt-guard.ts'), mocks),
        ...load(path.join(root, 'src/common/guards/jwt-guards/optional-jwt-guard.ts'), mocks),
    };
}
const context = request => ({ switchToHttp: () => ({ getRequest: () => request }) });

test('authentication and bearer responses cannot be stored in shared caches', () => {
    const { authResponseCache } = load(path.join(root, 'src/common/middlewares/auth-response-cache.middleware.ts'));
    for (const request of [
        { path: '/api/auth/login', headers: {} },
        { path: '/API/AUTH/oauth2/callback', headers: {} },
        { path: '/api/users', headers: { authorization: 'Bearer test-token' } },
    ]) {
        const headers = {};
        let called = false;
        authResponseCache(request, { setHeader: (name, value) => { headers[name] = value; } }, () => { called = true; });
        assert.equal(headers['Cache-Control'], 'no-store');
        assert.equal(called, true);
    }
    authResponseCache({ path: '/assets/app.js', headers: {} }, { setHeader: () => assert.fail('static cache preserved') }, () => {});
});

test('logout revokes one session across both mandatory and optional guards, preserving other sessions', async () => {
    const { JwtDefaultGuard, OptionalJwtGuard } = guards();
    const active = new Set();
    const cache = { exists: async key => active.has(key), del: async key => active.delete(key) };
    const query = { execute: async () => ({ isOk: true, response: admin }) };
    const guard = new JwtDefaultGuard(query, config, cache);
    const optional = new OptionalJwtGuard(query, config, cache);
    const user = claims();
    const secondUser = claims();
    active.add(session.adminSessionKey(user.jti));
    active.add(session.adminSessionKey(secondUser.jti));
    const request = { user, headers: { 'x-client-type': 'browser' } };
    assert.equal(await guard.canActivate(context(request)), true);
    await optional.canActivate(context(request));
    assert.equal(request.authenticatedFromBrowser, true);
    const { AuthSessionController } = load(path.join(root, 'src/modules/auth/auth-session.controller.ts'), {
        '@common/decorators/roles/roles': { Roles: () => () => {} },
        '@common/decorators/get-jwt-payload': { GetJWTPayload: () => () => {} },
        '@common/guards/jwt-guards/def-jwt-guard': { JwtDefaultGuard },
        '@common/guards/roles': { RolesGuard: class {} }, '@common/raw-cache': {},
        '@common/utils/admin-session': session, '@libs/contracts/constants': { ROLE: { ADMIN: 'ADMIN' } },
        '@libs/contracts/api/controllers/auth': { AUTH_CONTROLLER: 'auth' },
    });
    await new AuthSessionController(cache).logout(user);
    await assert.rejects(guard.canActivate(context(request)), error => error.getStatus() === 401);
    await optional.canActivate(context(request));
    assert.equal(request.authenticatedFromBrowser, false);
    assert.equal(await guard.canActivate(context({ ...request, user: secondUser })), true);
    active.clear();
    await assert.rejects(guard.canActivate(context({ ...request, user: secondUser })), error => error.getStatus() === 401);
});

test('admin checks fail closed when the revocation store is unavailable', async () => {
    const { JwtDefaultGuard, OptionalJwtGuard } = guards();
    const query = { execute: async () => ({ isOk: true, response: admin }) };
    const cache = { exists: async () => { throw new Error('Redis unavailable'); } };
    const request = { user: claims(), headers: { 'x-client-type': 'browser' } };
    for (const Guard of [JwtDefaultGuard, OptionalJwtGuard]) {
        await assert.rejects(new Guard(query, config, cache).canActivate(context(request)), /Redis unavailable/);
    }
});

test('password reset invalidates admin access through both guards', async () => {
    const { JwtDefaultGuard, OptionalJwtGuard } = guards();
    const query = { execute: async () => ({ isOk: true, response: { ...admin, passwordHash: 'changed' } }) };
    const cache = { exists: async () => true };
    const request = { user: claims(), headers: { 'x-client-type': 'browser' } };
    await assert.rejects(new JwtDefaultGuard(query, config, cache).canActivate(context(request)), error => error.getStatus() === 401);
    await new OptionalJwtGuard(query, config, cache).canActivate(context(request));
    assert.equal(request.authenticatedFromBrowser, false);
});

test('real Passport strategy rejects alternate algorithms, tampering, expired and non-expiring JWTs', async () => {
    const { JwtStrategy } = load(path.join(root, 'src/modules/auth/strategies/jwt.strategy.ts'), {
        '@common/config/app-config': {},
    });
    const authenticate = token => new Promise(resolve => {
        const strategy = new JwtStrategy(config);
        strategy.success = user => resolve(user);
        strategy.fail = () => resolve(null);
        strategy.error = () => resolve(null);
        strategy.authenticate({ headers: { authorization: `Bearer ${token}` } });
    });
    const payload = { uuid: admin.uuid, role: 'API', username: null };
    assert.ok(await authenticate(jwt.sign(payload, secret, { expiresIn: '1h' })));
    for (const token of [
        jwt.sign(payload, secret),
        jwt.sign(payload, secret, { expiresIn: -1 }),
        jwt.sign(payload, 'wrong-secret', { expiresIn: '1h' }),
        jwt.sign(payload, secret, { expiresIn: '1h', algorithm: 'HS384' }),
        jwt.sign(payload, null, { algorithm: 'none' }),
        'malformed.token.value',
    ]) assert.equal(await authenticate(token), null);
});
