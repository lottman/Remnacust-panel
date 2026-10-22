const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { decryptLink } = require('@incy/link-encoder/sync');
const filename = path.join(__dirname, '../src/shared/utils/template-engine.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const ref = { exports: {} };
new Function('require', 'module', 'exports', compiled)(createRequire(filename), ref, ref.exports);
const { TemplateEngine } = ref.exports;

test('INCY placeholder produces a real encrypted link that restores the original subscription URL', () => {
    const url = 'https://subscription.example.test/user?token=private-fixture';
    const result = TemplateEngine.formatWithMetaInfo('{{INCY_CRYPT1_LINK}}', { subscriptionUrl: url, username: 'fixture' });
    assert.match(result, /^incy:\/\/crypt1\//);
    assert.equal(result.includes(url), false);
    assert.equal(decryptLink(result).url, url);
});

test('ordinary placeholders remain intact and encryption is lazy', () => {
    assert.equal(TemplateEngine.formatWithMetaInfo('{{USERNAME}} {{SUBSCRIPTION_LINK}} {{UNKNOWN}}', { subscriptionUrl: '', username: 'fixture' }), 'fixture  {{UNKNOWN}}');
});
