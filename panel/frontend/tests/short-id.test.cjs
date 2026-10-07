const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const filename = require('node:path').join(__dirname, '../src/widgets/dashboard/config-profiles/keypair-generator/short-id.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const moduleRef = {exports: {}};
new Function('exports', 'module', source)(moduleRef.exports, moduleRef);
const {generateShortId} = moduleRef.exports;
test('REALITY shortId uses eight secure random bytes and preserves leading zeros in hex', () => {
    let calls = 0;
    const value = generateShortId({getRandomValues: bytes => {
        calls++;assert.equal(bytes.length,8);bytes.set([0,1,15,16,127,128,254,255]);return bytes;
    }});
    assert.equal(value,'00010f107f80feff');assert.equal(calls,1);
    assert.match(generateShortId(), /^[0-9a-f]{16}$/);
});
test('a missing secure random source fails without an insecure fallback', () => {
    assert.throws(()=>generateShortId({getRandomValues:()=>{throw Error('unavailable');}}),/unavailable/);
});
