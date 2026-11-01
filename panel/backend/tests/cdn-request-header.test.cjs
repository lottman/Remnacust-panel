const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const panel = load(path.join(__dirname, '../src/common/utils/cdn-request-header.ts'));
const page = load(path.join(__dirname, '../../../subscription-page/backend/src/common/utils/cdn-request-header.ts'));
const uuid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

test('each CDN has a stable neutral name, identical in independently deployed panel and page', () => {
    assert.equal(panel.cdnRequestHeaderName(uuid), 'X-b696de253bef3af261369640');
    assert.equal(page.cdnRequestHeaderName(uuid), panel.cdnRequestHeaderName(uuid));
    assert.notEqual(panel.cdnRequestHeaderName(uuid), panel.cdnRequestHeaderName(other));
    assert.match(panel.cdnRequestHeaderName(uuid), /^X-[a-f0-9]{24}$/);
});

for (const [name, api] of [['panel', panel], ['page', page]]) {
    test(name + ' consumes neutral and legacy selectors, preserving unrelated headers', () => {
        const key = api.cdnRequestHeaderName(uuid).toLowerCase();
        for (const selected of [{ [key]: uuid }, { 'x-remnacust-cdn': uuid }, { [key]: uuid, 'x-remnacust-cdn': uuid }]) {
            const headers = { ...selected, 'user-agent': 'client', 'x-trace-id': other };
            assert.deepEqual(api.consumeCdnSelector(headers), { uuid, invalid: false });
            assert.deepEqual(headers, { 'user-agent': 'client', 'x-trace-id': other });
        }
        assert.deepEqual(api.consumeCdnSelector(undefined), { uuid: undefined, invalid: false });
    });
    test(name + ' rejects malformed, duplicated, mismatched and conflicting selectors', () => {
        const key = api.cdnRequestHeaderName(uuid).toLowerCase();
        for (const headers of [
            { [key]: 'https://evil.test' }, { [key]: '' }, { [key]: [uuid, uuid] },
            { [key]: uuid + ', ' + uuid }, { [key]: other },
            { [key]: uuid, 'x-remnacust-cdn': other },
            { [key]: uuid, [api.cdnRequestHeaderName(other)]: other },
        ]) assert.equal(api.consumeCdnSelector(headers).invalid, true);
    });
}
