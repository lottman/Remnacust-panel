const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const file = path.join(__dirname, '../../frontend/src/shared/utils/bytes/pretty-bytes/pretty-bytes.util.ts');
const { prettifyBytesUtil, prettySiBytesUtil, prettySiRealtimeBytesUtil } = load(file);
test('decimal strings from API display zero counters rather than blank statistics', () => {
    assert.equal(prettifyBytesUtil('0', true), '0');
    assert.equal(prettifyBytesUtil(0, true), '0');
    assert.equal(prettifyBytesUtil('0'), undefined);
    assert.equal(prettySiBytesUtil('0', true), '0 B');
    assert.equal(prettySiRealtimeBytesUtil('0', true), '0 B/s');
    assert.equal(prettifyBytesUtil('1024', true), prettifyBytesUtil(1024, true));
});
