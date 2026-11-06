const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('../../backend/tests/load-typescript.cjs');
const { EditorRecoveryController, recoveryOwner } = load(path.join(__dirname, '../src/shared/utils/editor-recovery-controller.ts'), {
    './editor-recovery-store': {},
});
const { registerEditorRecovery, flushEditorRecoveries } = load(path.join(__dirname, '../src/shared/utils/editor-recovery-flush.ts'));
const scope = { owner: 'aaaaaaaa-1111-4111-8111-111111111111', kind: 'profile', id: 'profile' };
function fixture() {
    let record = null;
    let fail = false;
    let gate;
    const calls = [];
    const open = async (_, initial) => {
        let baseline = initial;
        return {
            read: async () => record,
            write: async code => {
                calls.push(code);
                if (gate) await gate;
                if (fail) throw Object.assign(Error('blocked'), { code: 'unavailable' });
                record = code === baseline ? null : { code, updatedAt: Date.now() };
            },
            discard: async () => { record = null; },
            saved: async next => { baseline = next; record = null; },
        };
    };
    return { open, calls, get record() { return record; }, set record(value) { record = value; }, set fail(value) { fail = value; }, set gate(value) { gate = value; } };
}
function controller(f) { return new EditorRecoveryController(scope, 'saved', f.open); }

test('owner scope follows administrator identity, not the token value or API-token identity', () => {
    const token = payload => 'header.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature';
    assert.equal(recoveryOwner(token({ role: 'ADMIN', uuid: scope.owner, exp: 1 })), scope.owner);
    assert.equal(recoveryOwner(token({ role: 'ADMIN', uuid: scope.owner, exp: 2 })), scope.owner);
    for (const value of [token({ role: 'API', uuid: scope.owner }), token({ role: 'ADMIN', uuid: '../other' }), 'bad', 'x'.repeat(40000)]) assert.equal(recoveryOwner(value), null);
});

test('opening shows a prior copy without applying it; unmodified mounts do not erase it', async () => {
    const f = fixture(); f.record = { code: '{invalid', updatedAt: 123 };
    const c = controller(f);
    await c.start(); c.track('saved'); await c.flush();
    assert.equal(c.getSnapshot().entry.code, '{invalid');
    assert.deepEqual(f.calls, []);
});

test('rapid edits coalesce and a successful save removes their recovery copy', async () => {
    const f = fixture(), c = controller(f);
    c.track('first'); c.track('last'); await c.flush();
    assert.deepEqual(f.calls, ['last']);
    assert.equal(f.record.code, 'last');
    await c.saved('last', 'last');
    assert.equal(f.record, null); assert.equal(c.getSnapshot().entry, null);
});

test('typing or undo after submitting a save is preserved against its later response', async () => {
    for (const newer of ['newer edits', 'saved']) {
        const f = fixture(), c = controller(f);
        c.track('submitted'); await c.flush();
        c.track(newer);
        await c.saved('submitted', 'submitted');
        assert.equal(f.record.code, newer);
        await c.flush();
    }
});

test('an edit while persistence is in flight is flushed before completion', async () => {
    const f = fixture(), c = controller(f);
    let release; f.gate = new Promise(resolve => { release = resolve; });
    c.track('first'); const writing = c.flush();
    while (!f.calls.length) await new Promise(resolve => setImmediate(resolve));
    c.track('latest'); release();
    await writing; assert.equal(f.record.code, 'latest');
});

test('write failure remains visible and blocks reload until a later successful retry', async () => {
    const f = fixture(), c = controller(f); f.fail = true;
    c.track('keep me');
    const unregister = registerEditorRecovery(c.flush);
    try {
        await assert.rejects(flushEditorRecoveries());
        assert.equal(c.getSnapshot().error, 'unavailable');
        f.fail = false;
        await flushEditorRecoveries();
        assert.equal(f.record.code, 'keep me');
        assert.equal(c.getSnapshot().status, 'ready');
    } finally { unregister(); }
});

test('discard cancels pending autosave and new user edits can create a fresh copy', async () => {
    const f = fixture(), c = controller(f);
    c.track('discard'); await c.discard(); await c.flush();
    assert.equal(f.record, null);
    c.track('new text'); await c.flush(); assert.equal(f.record.code, 'new text');
});

test('a new server baseline retires queued old edits rather than promoting them', async () => {
    const f = fixture(), c = controller(f);
    c.track('old unsaved');
    await c.rebase('new server version'); await c.flush();
    assert.deepEqual(f.calls, []);
    c.track('new edit'); await c.flush(); assert.equal(f.record.code, 'new edit');
});

test('only a confirmed server save may retire a stale session and preserve newer typing', async () => {
    const f = fixture();
    let opens = 0;
    const c = new EditorRecoveryController(scope, 'saved', async (...args) => {
        const session = await f.open(...args);
        if (++opens === 1) session.saved = async () => { throw Object.assign(Error('another tab saved'), { code: 'stale' }); };
        return session;
    });
    c.track('submitted'); await c.flush(); c.track('newer');
    await c.saved('submitted', 'submitted');
    assert.equal(opens, 2);
    assert.equal(f.record.code, 'newer');
    assert.equal(c.getSnapshot().status, 'ready');
});
