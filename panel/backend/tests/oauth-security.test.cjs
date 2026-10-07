const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const load = require('./load-typescript.cjs');

const idToken = (claims) => `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
const validClaims = () => ({
    iss: 'https://id.example.test/tenant/issuer', aud: 'fixture-client', sub: 'fixture-subject',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300,
});

async function fixture(claims = {}, githubEmails = []) {
    const filename = path.join(__dirname, '../src/modules/auth/auth.service.ts');
    const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const mocks = {};
    for (const node of ast.statements) {
        if (ts.isImportDeclaration(node) && !node.moduleSpecifier.text.startsWith('node:')) {
            mocks[node.moduleSpecifier.text] = {};
        }
    }
    const arctic = await import('arctic');
    // Synthetic token-endpoint response, not a token submitted through the callback API.
    let activeProvider = 'generic';
    const issuers = {
        generic: 'https://id.example.test/tenant/issuer', pocketid: 'https://id.example.test',
        keycloak: 'https://id.example.test/realms/fixture', telegram: 'https://oauth.telegram.org',
    };
    const exchanges = [];
    const client = { validateAuthorizationCode: async (...args) => {
        exchanges.push(args);
        return { idToken: () => idToken({ ...validClaims(), iss: issuers[activeProvider], ...claims }), accessToken: () => 'fixture-access-token' };
    } };
    const providers = ['github', 'pocketid', 'yandex', 'keycloak', 'generic', 'telegram'];
    const settings = { oauth2Settings: Object.fromEntries(providers.map((provider) => [provider, {
        enabled: true, allowedEmails: ['admin@example.test'], allowedIds: ['fixture-telegram-id'], withPkce: true,
        clientId: 'fixture-client', keycloakDomain: 'id.example.test', realm: 'fixture',
        tokenUrl: 'https://id.example.test/token', plainDomain: 'id.example.test',
        expectedIssuer: 'https://id.example.test/tenant/issuer',
    }])) };
    mocks.arctic = { ...arctic, GitHub: class { constructor() { return client; } } };
    mocks['@nestjs/common'] = require('@nestjs/common');
    mocks.rxjs = require('rxjs');
    mocks['@common/types'] = { ok: (response) => ({ isOk: true, response }), fail: (error) => ({ isOk: false, error }) };
    mocks['@libs/contracts/constants'] = {
        OAUTH2_PROVIDERS: Object.fromEntries(providers.map((p) => [p.toUpperCase(), p])),
        CACHE_KEYS: { OAUTH2_STATE: (state) => state },
    };
    mocks['@libs/contracts/constants/errors'] = { ERRORS: { OAUTH2_AUTHORIZE_ERROR: {}, LOGIN_ERROR: {} } };
    mocks['@modules/remnawave-settings/queries/get-cached-remnawave-settings'] = { GetCachedRemnawaveSettingsQuery: class {} };
    const { AuthService } = load(filename, mocks);
    const service = Object.create(AuthService.prototype);
    const logs = [];
    service.logger = { error: (...args) => logs.push(args) };
    service.emitFailedLoginAttempt = async () => {};
    service.queryBus = { execute: async () => settings };
    service.getGenericOAuth2Client = async () => client;
    service.getKeyCloakClient = async () => client;
    service.getTelegramOAuth2Client = () => client;
    service.httpService = { get: () => require('rxjs').of({ data: githubEmails }) };
    const ceremonies = new Map();
    service.rawCacheService = { getDel: async (key) => {
        const value = ceremonies.get(key);
        ceremonies.delete(key);
        return value ?? null;
    } };
    return { service, exchanges, ceremonies, logs, settings, authorize: async (provider) => {
        activeProvider = provider;
        ceremonies.set('fixture-state', { provider, codeVerifier: 'fixture-verifier' });
        return service.processOAuth2Callback(provider, 'fixture-code', 'fixture-state', '127.0.0.1', 'test');
    } };
}

test('GitHub authorization requires both primary and verified booleans', async () => {
    for (const email of [
        { primary: true, verified: false },
        { primary: true },
        { primary: true, verified: 'true' },
        { primary: false, verified: true },
        { primary: 'true', verified: true },
    ]) {
        const f = await fixture({}, [{ email: 'admin@example.test', ...email }]);
        assert.equal((await f.authorize('github')).isAllowed, false);
    }
    const f = await fixture({}, [{ email: 'admin@example.test', primary: true, verified: true }]);
    assert.equal((await f.authorize('github')).isAllowed, true);
});

test('OIDC email allowlists reject absent, false, and incorrectly typed verification', async () => {
    for (const provider of ['generic', 'pocketid', 'keycloak']) {
        for (const email_verified of [undefined, false, 'true', 1, null]) {
            const f = await fixture({ email: 'admin@example.test', email_verified });
            assert.equal((await f.authorize(provider)).isAllowed, false);
        }
        const allowed = await fixture({ email: 'admin@example.test', email_verified: true });
        assert.equal((await allowed.authorize(provider)).isAllowed, true);
        const denied = await fixture({ email: 'other@example.test', email_verified: true });
        assert.equal((await denied.authorize(provider)).isAllowed, false);
    }
});

test('explicit provider access grant remains independent of email verification and allowlist', async () => {
    for (const provider of ['generic', 'pocketid', 'keycloak']) {
        for (const email_verified of [undefined, false, true]) {
            const f = await fixture({ email: 'other@example.test', email_verified, remnawaveAccess: true });
            assert.equal((await f.authorize(provider)).isAllowed, true);
        }
        for (const remnawaveAccess of [false, 'true', 1]) {
            const f = await fixture({ email: 'other@example.test', email_verified: true, remnawaveAccess });
            assert.equal((await f.authorize(provider)).isAllowed, false);
        }
        const noEmail = await fixture({ remnawaveAccess: true });
        assert.equal((await noEmail.authorize(provider)).isAllowed, false);
    }
});

test('server state is provider-bound and consumed once, including concurrent callbacks', async () => {
    const f = await fixture({ email: 'admin@example.test', email_verified: true });
    f.ceremonies.set('fixture-state', { provider: 'generic', codeVerifier: 'fixture-verifier' });
    const results = await Promise.all([1, 2].map(() => f.service.processOAuth2Callback(
        'generic', 'fixture-code', 'fixture-state', '127.0.0.1', 'test',
    )));
    assert.equal(results.filter((r) => r.isAllowed).length, 1);
    assert.equal(f.exchanges.length, 1);
    assert.equal(f.exchanges[0][2], 'fixture-verifier');
    f.ceremonies.set('fixture-state', { provider: 'github', codeVerifier: null });
    assert.equal((await f.service.processOAuth2Callback('generic', 'code', 'fixture-state', '', '')).isAllowed, false);
    assert.equal(f.exchanges.length, 1);
});

test('OAuth failures never log raw provider errors or token response values', async () => {
    const f = await fixture();
    const sensitive = 'fixture-sensitive-error-value';
    f.service.getStatus = async () => { throw new Error(sensitive); };
    assert.equal((await f.service.oauth2Authorize('generic')).isOk, false);
    assert.equal((await f.service.oauth2Callback('code', 'state', 'generic', '', '')).isOk, false);
    f.service.fetchGenericEmail = async () => { throw { response: { data: sensitive }, toString: () => sensitive }; };
    const result = await f.service.exchangeCodeForEmail('generic', 'code', 'verifier', {});
    assert.equal(result.email, null);
    assert.deepEqual(f.logs, [
        ['OAuth2 authorization failed.'], ['OAuth2 callback failed.'], ['OAuth2 token exchange failed.'],
    ]);
    assert.equal(JSON.stringify({ logs: f.logs, result }).includes(sensitive), false);
});

test('OIDC validates audience, authorized party, NumericDates, issuer presence and subject', async () => {
    const f = await fixture();
    const invalid = [
        { aud: undefined }, { aud: 'other-client' }, { aud: [] }, { aud: 123 },
        { aud: ['other-client'] }, { aud: ['fixture-client', 123], azp: 'fixture-client' },
        { aud: ['fixture-client', 'other-client'] },
        { aud: ['fixture-client', 'other-client'], azp: 'other-client' },
        { azp: 'other-client' }, { azp: null },
        { exp: undefined }, { exp: '9999999999' }, { exp: 0 }, { exp: Date.now() / 1000 - 1 },
        { iat: undefined }, { iat: '1' }, { iat: -1 }, { iat: Date.now() / 1000 + 120 },
        { iat: Date.now() / 1000 + 30, exp: Date.now() / 1000 + 10 },
        { sub: undefined }, { sub: '' }, { sub: 123 }, { sub: ' ' },
        { iss: undefined }, { iss: '' }, { iss: 123 },
    ];
    for (const changes of invalid) {
        assert.throws(() => f.service.decodeAndValidateIdToken(idToken({ ...validClaims(), ...changes }), 'fixture-client'), /Invalid OIDC/);
    }
    for (const changes of [
        {}, { aud: ['fixture-client'] }, { azp: 'fixture-client' },
        { aud: ['fixture-client', 'other-client'], azp: 'fixture-client' },
        { iat: Date.now() / 1000 + 30 },
    ]) {
        assert.equal(f.service.decodeAndValidateIdToken(idToken({ ...validClaims(), ...changes }), 'fixture-client').sub, 'fixture-subject');
    }
    assert.throws(() => f.service.decodeAndValidateIdToken(idToken(validClaims()), null), /Invalid OIDC/);
});

test('every OIDC provider checks protocol claims before trusting an email or explicit access grant', async () => {
    for (const provider of ['generic', 'pocketid', 'keycloak', 'telegram']) {
        const identity = { email: 'other@example.test', remnawaveAccess: true, id: 'fixture-telegram-id' };
        const valid = await fixture(identity);
        assert.equal((await valid.authorize(provider)).isAllowed, true);
        for (const changes of [{ exp: 0 }, { aud: 'other-client' }, { sub: undefined }]) {
            const f = await fixture({ ...identity, ...changes });
            assert.equal((await f.authorize(provider)).isAllowed, false);
        }
        const wrongIssuer = await fixture({ ...identity, iss: 'https://other.example.test' });
        assert.equal((await wrongIssuer.authorize(provider)).isAllowed, false);
    }
});

test('generic issuer is required before exchange and compared without URL normalization', async () => {
    for (const expectedIssuer of [undefined, null, '', 'invalid', 'http://id.example.test',
        'https://user:pass@id.example.test', 'https://id.example.test?tenant=x',
        'https://id.example.test#x', ' https://id.example.test']) {
        const f = await fixture({ email: 'admin@example.test', email_verified: true });
        f.settings.oauth2Settings.generic.expectedIssuer = expectedIssuer;
        assert.equal((await f.authorize('generic')).isAllowed, false);
        assert.equal(f.exchanges.length, 0);
    }
    for (const iss of ['https://id.example.test/tenant/issuer/', 'https://id.example.test/other']) {
        const f = await fixture({ email: 'admin@example.test', email_verified: true, iss });
        assert.equal((await f.authorize('generic')).isAllowed, false);
    }
    const exact = await fixture({ email: 'admin@example.test', email_verified: true });
    assert.equal((await exact.authorize('generic')).isAllowed, true);
});

test('generic token exchange requires HTTPS and preserves arbitrary issuer paths without guessing', async () => {
    const f = await fixture({ email: 'admin@example.test', email_verified: true });
    for (const endpoint of ['http://id.example.test/token', 'file:///token', 'invalid', 'https://user:pass@id.example.test/token', 'https://id.example.test/token#fragment']) {
        f.settings.oauth2Settings.generic.tokenUrl = endpoint;
        assert.equal((await f.authorize('generic')).isAllowed, false);
        assert.equal(f.exchanges.length, 0);
    }
    f.settings.oauth2Settings.generic.tokenUrl = 'https://id.example.test/custom/token';
    assert.equal((await f.authorize('generic')).isAllowed, true);
    assert.equal(f.exchanges[0][0], 'https://id.example.test/custom/token');
});
