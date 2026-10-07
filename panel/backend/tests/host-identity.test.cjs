const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync(
    path.join(__dirname, '../src/common/utils/host-identity.ts'),
    'utf8',
);
const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', output)(require, mod, mod.exports);
const { hostCredentials, parseHostIdentity } = mod.exports;
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const parent = '33333333-3333-4333-8333-333333333333';

test('host credentials cannot be reused for another host, owner, device or subscription epoch', () => {
    const original = hostCredentials('test-only-secret', 42n, first, 'DEVICE00001', parent);
    assert.deepEqual(
        original,
        hostCredentials('test-only-secret', 42n, first, 'DEVICE00001', parent),
    );
    for (const alternative of [
        hostCredentials('test-only-secret', 42n, second, 'DEVICE00001', parent),
        hostCredentials('test-only-secret', 43n, first, 'DEVICE00001', parent),
        hostCredentials('test-only-secret', 42n, first, 'DEVICE00002', parent),
        hostCredentials('test-only-secret', 42n, first, null, parent),
        hostCredentials('test-only-secret', 42n, first, 'DEVICE00001', second),
        hostCredentials('different-test-secret', 42n, first, 'DEVICE00001', parent),
    ])
        for (const field of ['username', 'vlessUuid', 'trojanPassword', 'ssPassword'])
            assert.notEqual(original[field], alternative[field]);
    assert.deepEqual(parseHostIdentity(original.username), { userId: '42', hostUuid: first });
    assert.match(
        original.vlessUuid,
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
});
test('statistics parser rejects malformed and legacy identities, preserves large owner IDs', () => {
    for (const value of [
        '42',
        '42~abcdef',
        '0~' + 'a'.repeat(24) + '~h' + first.replaceAll('-', ''),
        '42~' + 'a'.repeat(24) + '~h' + first.replaceAll('-', '') + 'junk',
        '-1~' + 'a'.repeat(24) + '~h' + first.replaceAll('-', ''),
    ])
        assert.equal(parseHostIdentity(value), null);
    const identity = hostCredentials('test', 9223372036854775807n, first, null, parent);
    assert.equal(parseHostIdentity(identity.username).userId, '9223372036854775807');
    assert.throws(() => hostCredentials('test', 0n, first, null, parent));
    assert.throws(() => hostCredentials('test', 42n, 'not-a-host', null, parent));
});
