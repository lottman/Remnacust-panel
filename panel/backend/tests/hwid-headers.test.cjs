const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const filename = path.join(__dirname, '..', 'src', 'common', 'utils', 'extract-hwid-headers', 'extract-hwid-headers.util.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleRef = { exports: {} };
const localRequire = (name) => name.includes('truncate-header')
    ? { truncateHeader: (value) => value }
    : require(name);
new Function('require', 'module', 'exports', output)(localRequire, moduleRef, moduleRef.exports);
const { extractHwidHeaders } = moduleRef.exports;

test('Happ x-hwid and INCY X-Device-ID resolve to the same device', () => {
    const hwid = 'AB12CD34-EF56-7890-AB12-CD34EF567890';
    assert.equal(extractHwidHeaders({ headers: { 'x-hwid': hwid } }).hwid, hwid);
    assert.equal(extractHwidHeaders({ headers: { 'x-device-id': hwid } }).hwid, hwid);
    assert.equal(extractHwidHeaders({ headers: { 'x-hwid': hwid, 'x-device-id': hwid } }).hwid, hwid);
});

test('conflicting device headers are rejected', () => {
    assert.equal(extractHwidHeaders({ headers: {
        'x-hwid': 'AB12CD34-EF56-7890-AB12-CD34EF567890',
        'x-device-id': 'CD34EF56-AB12-7890-CD34-EF56AB127890',
    } }), null);
});
