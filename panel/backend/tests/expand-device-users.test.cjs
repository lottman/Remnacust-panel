const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/modules/users/queries/get-prepared-config-with-users/expand-device-users.ts');
const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { expandDeviceUsers } = compiled.exports;

const user = { id: 1n, vlessUuid: 'shared', trojanPassword: 'trojan', ssPassword: 'ss', tags: ['inbound'] };
const keys = (_, hwid) => ({ username: `1~${hwid}`, vlessUuid: `key-${hwid}`, trojanPassword: `trojan-${hwid}`, ssPassword: `ss-${hwid}` });

test('full reload preserves shared and personal access while no device is blocked', () => {
    const identities = expandDeviceUsers([user], [{ userId: 1n, hwid: 'phone', blocked: false }], keys);
    assert.deepEqual(identities.map((item) => item.id), [1n, '1~phone']);
    assert.equal(identities[1].vlessUuid, 'key-phone');
});

test('full reload removes shared and blocked credentials but keeps other devices', () => {
    const identities = expandDeviceUsers([user], [
        { userId: 1n, hwid: 'phone', blocked: true },
        { userId: 1n, hwid: 'laptop', blocked: false },
    ], keys);
    assert.deepEqual(identities.map((item) => item.id), ['1~laptop']);
    assert.equal(identities[0].vlessUuid, 'key-laptop');
});
