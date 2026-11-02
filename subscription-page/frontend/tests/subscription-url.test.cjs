const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/shared/utils/construct-subscription-url/construct-subscription-url.tsx');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleRef = { exports: {} };
new Function('require', 'exports', code)(createRequire(filename), moduleRef.exports);
const { constructSubscriptionUrl } = moduleRef.exports;
const key = 'fixture_key';

test('copy, QR and app import URLs retain the domain and public prefix used to open the page', () => {
    for (const host of ['subscription.example.test', 'cdn-a.example.test', 'cdn-b.example.test']) {
        for (const prefix of ['', '/sub', '/cdn/11111111-1111-4111-8111-111111111111']) {
            const base = `https://${host}${prefix}/${key}`;
            assert.equal(constructSubscriptionUrl(base + '?source=page#section', key), base);
            assert.equal(constructSubscriptionUrl(base + '/json', key), base + '/json');
        }
    }
    assert.equal(constructSubscriptionUrl(`https://user:private@cdn-a.example.test/${key}`, key), `https://cdn-a.example.test/${key}`);
});

test('personal device links retain their identity instead of becoming a shared subscription', () => {
    const token = 'a'.repeat(14) + '.' + 'b'.repeat(43);
    const value = `https://cdn-a.example.test/sub/${key}/device/${token}`;
    assert.equal(constructSubscriptionUrl(value, key), value);
    assert.equal(constructSubscriptionUrl(value + '/json?source=page', key), value + '/json');
});
