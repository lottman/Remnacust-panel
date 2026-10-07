const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const ref = { exports: {} };
const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/common/guards/jwt-guards/def-jwt-guard.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
}).outputText;
new Function('require', 'module', 'exports', output)((id) => {
    if (id === '@nestjs/common') return { Injectable: () => (value) => value, Inject: () => () => {}, forwardRef: callback => ({ forwardRef: callback }) };
    if (id === '@nestjs/passport') return { AuthGuard: () => class { async canActivate() { return true; } } };
    if (id === '@common/config/app-config/typed-config.service') return { TypedConfigService: class {} };
    if (id === '@common/raw-cache') return { RawCacheService: class {} };
    if (id === '@common/utils/admin-session') return {
        isAdminSessionCurrent: async () => assert.fail('API tokens must not use admin-session validation'),
    };
    if (id.endsWith('/constants')) return { ROLE: { API: 'API', ADMIN: 'ADMIN' } };
    if (id.endsWith('/get-token-by-uuid')) return { GetTokenByUuidQuery: class {} };
    return {};
}, ref, ref.exports);
const { JwtDefaultGuard } = ref.exports;
test('deleted tokens cannot be reused after a successful authorization', async () => {
    let token = { isOk: true, response: { scopes: ['*'], expireAt: new Date(Date.now() + 60_000) } };
    const guard = new JwtDefaultGuard({ execute: async () => token });
    const request = { user: { role: 'API', uuid: 'token' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    assert.equal(await guard.canActivate(context), true);
    token = { isOk: false };
    assert.equal(await guard.canActivate(context), false);
});
test('current database expiry and scopes take precedence over token payload', async () => {
    const token = { isOk: true, response: { scopes: ['users:read'], expireAt: new Date(Date.now() + 60_000) } };
    const guard = new JwtDefaultGuard({ execute: async () => token });
    const request = { user: { role: 'API', uuid: 'token', scopes: ['*'] } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    assert.equal(await guard.canActivate(context), true);
    assert.deepEqual(request.user.scopes, ['users:read']);
    token.response.expireAt = new Date(0);
    assert.equal(await guard.canActivate(context), false);
});
