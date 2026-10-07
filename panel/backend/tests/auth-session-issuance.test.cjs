const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { JwtService } = require('@nestjs/jwt');
const load = require('./load-typescript.cjs');

const session = load(path.join(__dirname, '../src/common/utils/admin-session.ts'));
const ok = (response) => ({ isOk: true, response });
const secret = 'local-test-fixture-only';

function fixture() {
    const filename = path.join(__dirname, '../src/modules/auth/auth.service.ts');
    const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const mocks = {};
    for (const node of ast.statements) {
        if (ts.isImportDeclaration(node) && !node.moduleSpecifier.text.startsWith('node:')) {
            mocks[node.moduleSpecifier.text] = {};
        }
    }
    mocks['@nestjs/common'] = require('@nestjs/common');
    mocks['@common/types'] = { ok, fail: (error) => ({ isOk: false, error }) };
    mocks['@common/utils/admin-session'] = session;
    mocks['@libs/contracts/constants'] = {
        ROLE: { ADMIN: 'ADMIN' }, CACHE_KEYS: { PASSKEY_AUTHENTICATION_CHALLENGE: (v) => v },
    };
    mocks['@libs/contracts/constants/errors'] = { ERRORS: { FORBIDDEN: {}, LOGIN_ERROR: {} } };
    mocks['@modules/admin/queries/find-passkey-by-id-and-uuid'] = { FindPasskeyByIdAndAdminUuidQuery: class {} };
    mocks['@modules/admin/commands/update-passkey'] = { UpdatePasskeyCommand: class {} };
    mocks['@simplewebauthn/server'] = {
        verifyAuthenticationResponse: async () => ({ verified: true, authenticationInfo: { newCounter: 2 } }),
    };
    mocks['./model'] = { OAuth2CallbackResponseModel: class { constructor(data) { Object.assign(this, data); } } };
    const service = Object.create(load(filename, mocks).AuthService.prototype);
    service.logger = { error() {} };
    service.jwtSecret = secret;
    service.jwtLifetime = 1;
    service.jwtService = new JwtService({ secret });
    service.activeSessions = new Map();
    service.rawCacheService = { setString: async (key, value, ttl) => {
        service.activeSessions.set(key, { value, ttl });
    } };
    service.emitLoginSuccess = async () => {};
    service.emitFailedLoginAttempt = async () => {};
    service.getStatus = async () => ok({
        isLoginAllowed: true, isRegisterAllowed: true,
        authentication: { password: { enabled: true }, oauth2: { providers: { generic: true } } },
    });
    service.verifyPassword = async () => true;
    service.hashPassword = async () => 'registration-fixture-hash';
    return service;
}

test('all four admin authentication paths issue claims accepted by current session validation', async () => {
    const ids = new Set();
    for (const method of ['login', 'register', 'oauth2Callback', 'verifyPasskeyAuthentication']) {
        const service = fixture();
        const admin = { uuid: `fixture-${method}`, username: `admin-${method}`, passwordHash: `fixture-hash-${method}` };
        service.getAdminByUsername = async () => method === 'register' ? { isOk: false } : ok(admin);
        service.createAdmin = async () => ok(admin);
        service.getFirstAdmin = async () => ok(admin);
        service.processOAuth2Callback = async () => ({ isAllowed: true, email: 'admin@example.test' });
        service.rawCacheService.getDelString = async () => admin.uuid;
        service.queryBus = { execute: async () => ok({
            id: 'fixture-key', publicKey: new Uint8Array(), counter: 1n, getTransports: () => [],
        }) };
        service.commandBus = { execute: async () => ok({}) };
        let args;
        if (method === 'login' || method === 'register') {
            args = [{ username: admin.username, password: 'fixture-password' }, '127.0.0.1', 'test'];
        } else if (method === 'oauth2Callback') {
            args = ['fixture-code', 'fixture-state', 'generic', '127.0.0.1', 'test'];
        } else {
            args = [
                { response: { id: 'fixture-key', response: { clientDataJSON: Buffer.from('{"challenge":"fixture"}').toString('base64url') } } },
                { passkeySettings: { enabled: true, rpId: 'example.test', origin: 'https://example.test' } },
                '127.0.0.1', 'test',
            ];
        }
        const result = await service[method](...args);
        assert.equal(result.isOk, true, method);
        const payload = service.jwtService.verify(result.response.accessToken);
        assert.equal(payload.role, 'ADMIN');
        const isActive = async (key) => service.activeSessions.get(key)?.value === '1';
        assert.deepEqual(service.activeSessions.get(session.adminSessionKey(payload.jti)), { value: '1', ttl: 3600 });
        assert.equal(payload.exp - payload.iat, 3600);
        assert.equal(await session.isAdminSessionCurrent(payload, admin, secret, isActive), true, method);
        assert.equal(await session.isAdminSessionCurrent(payload, { ...admin, passwordHash: 'changed' }, secret, isActive), false);
        assert.equal('passwordHash' in payload, false);
        assert.equal(ids.has(payload.jti), false);
        ids.add(payload.jti);

        service.activeSessions.clear();
        assert.equal(await session.isAdminSessionCurrent(payload, admin, secret, isActive), false, method);
        service.rawCacheService.setString = async () => { throw new Error('Redis unavailable'); };
        const failed = await service[method](...args);
        assert.equal(failed.isOk, false, method);
        assert.equal(failed.response?.accessToken, undefined);
    }
});

test('token issuance waits for the active-session write to finish', async () => {
    const service = fixture();
    let release;
    const written = new Promise((resolve) => { release = resolve; });
    service.rawCacheService.setString = async () => written;
    let returned = false;
    const issuing = service.issueAdminToken({ uuid: 'fixture', username: 'admin', passwordHash: 'fixture-hash' })
        .then((token) => { returned = true; return token; });
    await new Promise(setImmediate);
    assert.equal(returned, false);
    release();
    await issuing;
    assert.equal(returned, true);
});

test('unknown usernames perform password hashing work before failing without issuing a session', async () => {
    const service = fixture();
    service.getAdminByUsername = async () => ({ isOk: false });
    const order = [];
    service.hashPassword = async (password) => {
        assert.equal(password, 'fixture-password');
        order.push('hash');
    };
    service.emitFailedLoginAttempt = async () => { order.push('failure'); };
    const result = await service.login({ username: 'unknown', password: 'fixture-password' }, '', '');
    assert.equal(result.isOk, false);
    assert.deepEqual(order, ['hash', 'failure']);
    assert.equal(service.activeSessions.size, 0);
});
