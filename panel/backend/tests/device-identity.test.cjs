const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const filename = path.join(__dirname, '..', 'src', 'common', 'utils', 'device-identity.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleRef = { exports: {} };
new Function('require', 'module', 'exports', output)(require, moduleRef, moduleRef.exports);
const { deviceCredentials, deviceLinkToken, verifyDeviceLinkToken, usageOwner } = moduleRef.exports;

test('each device gets stable, independent credentials', () => {
    const a = deviceCredentials('private-secret', 42n, 'AAAAAAAAAA', 'parent-key-1');
    const b = deviceCredentials('private-secret', 42n, 'BBBBBBBBBB', 'parent-key-1');
    assert.deepEqual(a, deviceCredentials('private-secret', 42n, 'AAAAAAAAAA', 'parent-key-1'));
    assert.notEqual(a.vlessUuid, b.vlessUuid);
    assert.notEqual(a.trojanPassword, b.trojanPassword);
    assert.notEqual(a.ssPassword, b.ssPassword);
    assert.match(a.vlessUuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(usageOwner(a.username), '42');
    assert.equal(usageOwner('42'), '42');
    assert.equal(usageOwner('42~invalid'), null);
    const rotated = deviceCredentials('private-secret', 42n, 'AAAAAAAAAA', 'parent-key-2');
    assert.equal(rotated.username, a.username);
    assert.notEqual(rotated.vlessUuid, a.vlessUuid);
    assert.notEqual(rotated.trojanPassword, a.trojanPassword);
});

test('personal link cannot be reused for another subscription or modified', () => {
    const token = deviceLinkToken('private-secret', 'subscription-a', 42n, 'AAAAAAAAAA');
    assert.equal(verifyDeviceLinkToken('private-secret', 'subscription-a', 42n, token), 'AAAAAAAAAA');
    assert.equal(verifyDeviceLinkToken('private-secret', 'subscription-b', 42n, token), null);
    assert.equal(verifyDeviceLinkToken('private-secret', 'subscription-a', 43n, token), null);
    assert.equal(verifyDeviceLinkToken('private-secret', 'subscription-a', 42n, token + 'x'), null);
});
