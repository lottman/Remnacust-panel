const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');

function fixture(get) {
    return load(path.join(__dirname, '../src/shared/api/hooks/xray-mode.ts'), {
        '@tanstack/react-query': {}, '../axios': { instance: { get } },
    });
}

test('actual mode loader shares the exact pending promise and publishes only validated server mode', async () => {
    let resolve, calls = 0;
    const pending = new Promise(done => { resolve = done; });
    const mode = fixture((url, options) => {
        calls++; assert.equal(url, '/api/nodes/core-management/settings'); assert.equal(options.timeout, 15000);
        return pending;
    });
    const first = mode.loadXrayMode();
    assert.equal(first, mode.loadXrayMode()); assert.equal(calls, 1);
    assert.equal(mode.selectedXrayMode(), 'custom');
    resolve({ data: { response: { mode: 'default', revision: 2 } } });
    assert.deepEqual(await first, { mode: 'default', revision: 2 });
    assert.equal(mode.selectedXrayMode(), 'default');
});

test('invalid settings and transport errors release the pending promise without publishing a fallback mode', async () => {
    let state = { mode: 'default', revision: 2 };
    const mode = fixture(async () => { if (state instanceof Error) throw state; return { data: { response: state } }; });
    await mode.loadXrayMode();
    for (const invalid of [{ mode: 'custom', revision: -1 }, { mode: 'other', revision: 3 }, Error('settings offline')]) {
        state = invalid; await assert.rejects(mode.loadXrayMode());
        assert.equal(mode.selectedXrayMode(), 'default');
    }
    state = { mode: 'custom', revision: 3 };
    await mode.loadXrayMode(); assert.equal(mode.selectedXrayMode(), 'custom');
});
