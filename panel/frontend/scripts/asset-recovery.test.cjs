const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/utils/asset-recovery.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(options = {}) {
    let reloads = 0, requests = 0;
    const store = new Map();
    const document = src => ({ querySelector: () => ({ getAttribute: () => src }) });
    const context = { exports: {}, URL, AbortSignal, Promise,
        document: document('/assets/old.js'), navigator: { onLine: true },
        location: { origin: 'https://panel.test', pathname: '/dashboard/management/olcrtc', reload: () => reloads++ },
        sessionStorage: { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v) },
        DOMParser: class { parseFromString(src) { return document(src); } },
        fetch: async () => { requests++; if (options.failure) throw Error('network');
            return { ok: true, headers: { get: () => options.contentType || 'text/html' }, text: async () => options.next || '/assets/new.js' }; },
    };
    vm.runInNewContext(compiled, context);
    return { ...context.exports, context, get reloads() { return reloads; }, get requests() { return requests; } };
}
test('deployment recovers stale entry once and coalesces simultaneous chunk failures', async () => {
    const f = fixture();
    assert.deepEqual(await Promise.all([f.recoverUpdatedAssets(), f.recoverUpdatedAssets()]), [true, true]);
    assert.equal(f.reloads, 1); assert.equal(f.requests, 1);
    assert.equal(await f.recoverUpdatedAssets(), false); assert.equal(f.reloads, 1);
});
test('unchanged, foreign, offline, unavailable and non-HTML responses never reload', async () => {
    for (const options of [{ next: '/assets/old.js' }, { next: 'https://other.test/new.js' }, { failure: true }, { contentType: 'application/json' }]) {
        const f = fixture(options); assert.equal(await f.recoverUpdatedAssets(), false); assert.equal(f.reloads, 0);
    }
    const f = fixture(); f.context.navigator.onLine = false;
    assert.equal(await f.recoverUpdatedAssets(), false); assert.equal(f.requests, 0);
});
test('unavailable session storage cannot cause a reload loop', async () => {
    const f = fixture(); f.context.sessionStorage.setItem = () => { throw Error('denied'); };
    assert.equal(await f.recoverUpdatedAssets(), false); assert.equal(f.reloads, 0);
});
test('successful imports do not fetch HTML; actual application errors are preserved', async () => {
    const f = fixture({ next: '/assets/old.js' });
    assert.equal(await f.loadWithAssetRecovery(async () => 42), 42); assert.equal(f.requests, 0);
    const error = Error('component');
    await assert.rejects(f.loadWithAssetRecovery(async () => { throw error; }), e => e === error);
    assert.equal(f.reloads, 0);
});
