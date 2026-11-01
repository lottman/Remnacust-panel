const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/widgets/dashboard/subscription-settings/settings/subscription-domain-link.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const ref = { exports: {} };
new Function('require', 'exports', source)(createRequire(filename), ref.exports);
const { cdnSubscriptionLink } = ref.exports;
const base = 'https://cdn.example.test/cdn/11111111-1111-4111-8111-111111111111';
const key = 'fixture_user_key';

test('old links and raw keys convert locally into the selected CDN gateway without duplicating a prefix', () => {
    for (const input of [key, `https://origin.example.test/${key}`, `https://origin.example.test/api/sub/${key}`, `${base}/${key}`])
        assert.equal(cdnSubscriptionLink(base, input), `${base}/${key}`);
    for (const type of require('@remnawave/backend-contract').REQUEST_TEMPLATE_TYPE_VALUES)
        assert.equal(cdnSubscriptionLink(base, `https://origin.example.test/${key}/${type}`), `${base}/${key}/${type}`);
    const device = 'a'.repeat(14) + '.' + 'b'.repeat(43);
    assert.equal(cdnSubscriptionLink(base, `https://origin.example.test/${key}/device/${device}/json`), `${base}/${key}/device/${device}/json`);
});

test('invalid or credential-bearing URLs cannot become ready-to-copy subscription links', () => {
    for (const value of ['', 'short', 'http://origin.example.test/key', 'javascript:alert(1)',
        `https://user:pass@origin.example.test/${key}`, `https://origin.example.test/${key}?token=secret`,
        `https://origin.example.test/${key}#fragment`, `https://origin.example.test/%2f${key}`,
        `https://origin.example.test/${key}/device/invalid`, 'x'.repeat(4097)])
        assert.equal(cdnSubscriptionLink(base, value), null, value);
});
