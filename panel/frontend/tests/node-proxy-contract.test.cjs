const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('../../backend/tests/load-typescript.cjs');
const root = path.resolve(__dirname, '..');
const source = load(path.join(root, '../backend/libs/contract/models/socks-proxy.schema.ts'));
const contracts = [
    ['backend', require('../../backend/libs/contract/build/backend')],
    ['backend browser', require('../../backend/libs/contract/build/frontend')],
    ['vendored', require('../vendor/backend-contract/build/backend')],
    ['vendored browser', require('../vendor/backend-contract/build/frontend')],
    ['installed', require('@remnawave/backend-contract')],
];
const cases = [
    ['socks5://proxy.example:1080', true],
    ['socks5://user:pass@[2001:db8::1]:1080', true],
    ['socks5://user:p%40ss@socks_proxy:65535', true],
    ['socks5://proxy.example:0', false],
    ['socks5://proxy.example:99999', false],
    ['socks5://user:%00@proxy.example:1080', false],
    ['socks5://user:%0d%0a@proxy.example:1080', false],
    ['socks5://proxy.example:1080/path', false],
    ['https://proxy.example:1080', false],
    [`socks5://${'é'.repeat(128)}:pass@proxy.example:1080`, false],
];
for (const [name, contract] of contracts) {
    test(`${name} node create/update schemas match the source SOCKS5 parser`, () => {
        for (const [value, expected] of cases) {
            assert.equal(source.SocksProxyUrlSchema.safeParse(value).success, expected);
            for (const command of [contract.CreateNodeCommand, contract.UpdateNodeCommand]) {
                const field = command.RequestBodySchema.shape.proxyUrl;
                assert.equal(field.safeParse(value).success, expected, `${name}: ${value}`);
                assert.equal(field.safeParse(null).success, true);
                assert.equal(field.safeParse(undefined).success, true);
            }
        }
    });
}
