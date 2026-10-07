const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { mergeNodeIntegrations, resolveIntegrationConfig } = load(path.join(__dirname, '../src/modules/node-integrations/utils/merge-node-integrations.util.ts'), {
    '@common/utils/certs': { resolvePemCerts: value => value },
});
test('integration merge preserves precedence without invoking prototype setters', () => {
    const source = JSON.parse('{"__proto__":{"injected":true},"constructor":"value","alpha":1}');
    const result = mergeNodeIntegrations([resolveIntegrationConfig(source), { alpha: 2 }]);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.injected, undefined);
    assert.equal(result.alpha, 2);
    assert.equal(Object.hasOwn(result, '__proto__'), true);
    assert.equal(Object.prototype.injected, undefined);
    assert.equal(source.alpha, 1);
});
test('integration resolver ignores inherited certificates and invalid root input', () => {
    assert.deepEqual(resolveIntegrationConfig(Object.create({ certs: 'inherited' })), {});
    for (const value of [null, false, 'str', []]) assert.deepEqual(resolveIntegrationConfig(value), {});
});
