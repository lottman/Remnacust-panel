const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const panel = load(path.join(__dirname, '../src/common/utils/cdn-request-header.ts'));
const page = load(path.join(__dirname, '../../../subscription-page/backend/src/common/utils/cdn-request-header.ts'));
const uuid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

const secret = 'fixture-secret-a';
test('names are stable per installation and differ across IDs and private installation keys', () => {
    assert.equal(panel.cdnRequestHeaderName(uuid, secret), 'X-630a7485a002c4c616a8c558');
    assert.equal(page.cdnRequestHeaderName(uuid, secret), panel.cdnRequestHeaderName(uuid, secret));
    assert.notEqual(panel.cdnRequestHeaderName(uuid, secret), panel.cdnRequestHeaderName(other, secret));
    assert.notEqual(panel.cdnRequestHeaderName(uuid, secret), panel.cdnRequestHeaderName(uuid, 'fixture-secret-b'));
    assert.match(panel.cdnRequestHeaderName(uuid, secret), /^X-[a-f0-9]{24}$/);
});

for (const [name, api] of [['panel', panel], ['page', page]]) {
    test(name + ' consumes neutral and legacy selectors, preserving unrelated headers', () => {
        const key = api.cdnRequestHeaderName(uuid, secret).toLowerCase();
        for (const selected of [{ [key]: uuid }, { 'x-remnacust-cdn': uuid }, { [key]: uuid, 'x-remnacust-cdn': uuid }]) {
            const headers = { ...selected, 'user-agent': 'client', 'x-trace-id': other };
            assert.deepEqual(api.consumeCdnSelector(headers), { uuid, invalid: false, ...(selected[key] ? { name: key } : {}) });
            assert.deepEqual(headers, { 'user-agent': 'client', 'x-trace-id': other });
        }
        assert.deepEqual(api.consumeCdnSelector(undefined), { uuid: undefined, invalid: false });
    });
    test(name + ' rejects malformed, duplicated and conflicting selectors', () => {
        const key = api.cdnRequestHeaderName(uuid, secret).toLowerCase();
        for (const headers of [
            { [key]: 'https://evil.test' }, { [key]: '' }, { [key]: [uuid, uuid] },
            { [key]: uuid + ', ' + uuid },
            { [key]: uuid, 'x-remnacust-cdn': other },
            { [key]: uuid, [api.cdnRequestHeaderName(other, secret)]: other },
        ]) assert.equal(api.consumeCdnSelector(headers).invalid, true);
    });
}
