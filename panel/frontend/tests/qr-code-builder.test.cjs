const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/shared/ui/qr-code-builder/qr-svg.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

test('subscription and connection QR codes have an explicit four-module quiet zone', async () => {
    const uqr = await import('uqr');
    const module = { exports: {} };
    new Function('require', 'exports', source)(name => name === 'uqr' ? uqr : createRequire(filename)(name), module.exports);
    for (const value of ['https://subscription.example.test/fixture_key', 'https://cdn.example.test/fixture_key',
        'vless://00000000-0000-4000-8000-000000000001@node.example.test:443?security=tls&type=xhttp#Fixture']) {
        const svg = module.exports.qrSvg(value, '#000000', '#FFFFFF');
        const expected = uqr.encode(value, { border: 4 });
        assert.equal(typeof svg, 'string');
        assert(svg.includes(`viewBox="0 0 ${expected.size * 10} ${expected.size * 10}"`));
        assert(svg.includes('fill="#000000"'));
        assert(svg.includes('fill="#FFFFFF"'));
        for (let i = 0; i < 4; i++) {
            assert(expected.data[i].every(bit => !bit));
            assert(expected.data[expected.size - 1 - i].every(bit => !bit));
        }
    }
});

test('empty, missing and oversized values do not crash a user modal', async () => {
    const uqr = await import('uqr');
    const module = { exports: {} };
    new Function('require', 'exports', source)(() => uqr, module.exports);
    for (const value of ['', ' ', undefined, null, 'x'.repeat(5000)])
        assert.equal(module.exports.qrSvg(value, '#000000', '#FFFFFF'), null);
});
