const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { nodeSupportsPlugins } = load(path.join(__dirname, '../src/common/utils/node-version.ts'));
test('independent Remnacust versions keep plugins without accepting outdated upstream nodes', () => {
    for (const version of ['1.1.1-remnacust', '1.2.0-remnacust', '2.7.0', '3.4.1'])
        assert.equal(nodeSupportsPlugins(version), true, version);
    for (const version of ['1.1.1', '1.1.0-remnacust', '2.6.9', 'broken', ''])
        assert.equal(nodeSupportsPlugins(version), false, version);
});

test('feature versions accept wire suffixes without confusing upstream and Remnacust numbering', () => {
    assert.equal(nodeSupportsPlugins('3.4.1-security-20260927-r11'), true);
    assert.equal(nodeSupportsPlugins('v3.4.1'), true);
    assert.equal(nodeSupportsPlugins('1.1.1-remnacust+linux.amd64'), true);
    for (const version of [undefined, null, 3, 'foo3.4.1', '1.1.1+remnacust'])
        assert.equal(nodeSupportsPlugins(version), false);
});
