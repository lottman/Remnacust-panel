const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const load = require('../../backend/tests/load-typescript.cjs');
const { createPanelBuildLifecycle, PANEL_BUILD_SESSION_KEY, PANEL_BUILD_URL_PARAM, PANEL_UI_CACHE_KEYS } =
    load(path.join(__dirname, '../src/shared/utils/panel-build-lifecycle.ts'), {}, { crypto: webcrypto });

const metadata = version => ({ version, git: { backend: { commitSha: 'a'.repeat(40) }, frontend: { commitSha: 'b'.repeat(40) } }, build: { time: '2026-11-05T00:00:00Z', number: '1' } });
function storage(entries = {}) {
    const data = new Map(Object.entries(entries));
    return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function browser(local = storage(), session = storage(), href = 'https://panel.example.test/dashboard/management/hosts?filter=test#item', beforeReload) {
    const reloads = [];
    let cleared = 0;
    let mutations = 0;
    const lifecycle = createPanelBuildLifecycle({
        localStorage: () => local, sessionStorage: () => session,
        location: { href, replace: url => reloads.push(url) },
        client: { clear: () => cleared++, isMutating: () => mutations }, beforeReload,
    });
    return { accept: lifecycle, reloads, local, session, get cleared() { return cleared; }, set mutations(value) { mutations = value; } };
}

test('first migration resets UI caches while preserving auth, saved templates, licence and recovery intents', async () => {
    const preserved = { sessionStore: 'token', miscStore: 'accepted', 'x-rmnw-users-table-templates': 'saved', 'quota-recovery-operation': 'pending', 'other-app': 'value' };
    const local = storage({ ...preserved, ...Object.fromEntries(PANEL_UI_CACHE_KEYS.map(key => [key, 'stale'])) });
    const tab = browser(local);
    assert.equal(await tab.accept(metadata('1.1.7.98')), true);
    for (const key of PANEL_UI_CACHE_KEYS) assert.equal(local.getItem(key), null);
    for (const [key, value] of Object.entries(preserved)) assert.equal(local.getItem(key), value);
    assert.equal(tab.cleared, 1);
    const next = new URL(tab.reloads[0]);
    assert.equal(next.origin, 'https://panel.example.test');
    assert.equal(next.pathname, '/dashboard/management/hosts');
    assert.equal(next.searchParams.get('filter'), 'test');
    assert.match(next.searchParams.get(PANEL_BUILD_URL_PARAM), /^[a-f0-9]{64}$/);
    assert.equal(next.hash, '#item');
    assert.equal(await tab.accept(metadata('1.1.7.98')), false);
    assert.equal(await browser(local, tab.session, next.href).accept(metadata('1.1.7.98')), false);
    assert.equal(await browser(local).accept(metadata('1.1.7.98')), false);
});

test('each existing tab reloads on an update even if another tab already acknowledged it', async () => {
    const local = storage();
    const first = browser(local);
    await first.accept(metadata('1.1.7.97'));
    const second = browser(local);
    await second.accept(metadata('1.1.7.97'));
    assert.equal(await first.accept(metadata('1.1.7.98')), true);
    assert.equal(await second.accept(metadata('1.1.7.98')), true);
    assert.equal(await first.accept(metadata('1.1.7.97')), true);
});

test('blocked browser storage uses an opaque URL marker to prevent reload loops', async () => {
    const denied = new Proxy({}, { get: () => () => { throw new Error('storage denied'); } });
    const first = browser(denied, denied);
    assert.equal(await first.accept(metadata('1.1.7.98')), true);
    const next = browser(denied, denied, first.reloads[0]);
    assert.equal(await next.accept(metadata('1.1.7.98')), false);
    assert.equal(next.reloads.length, 0);
});

test('in-flight mutations defer reset and concurrent build checks cause one reload', async () => {
    const tab = browser();
    tab.mutations = 1;
    assert.equal(await tab.accept(metadata('1.1.7.98')), false);
    assert.equal(tab.cleared, 0);
    tab.mutations = 0;
    const result = await Promise.all([tab.accept(metadata('1.1.7.98')), tab.accept(metadata('1.1.7.98'))]);
    assert.equal(result.filter(Boolean).length, 1);
    assert.equal(tab.reloads.length, 1);
});

test('malformed metadata does not clear data or navigate', async () => {
    const tab = browser();
    assert.equal(await tab.accept({}), false);
    assert.equal(tab.cleared, 0);
    assert.equal(tab.reloads.length, 0);
});

test('a build reload waits for recovery persistence before clearing UI state', async () => {
    let finish, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const pending = new Promise(resolve => { finish = resolve; });
    const local = storage({ [PANEL_UI_CACHE_KEYS[0]]: 'existing' });
    const tab = browser(local, storage(), undefined, async () => { entered(); await pending; });
    const updating = tab.accept(metadata('1.1.7.98'));
    await ready;
    assert.equal(tab.cleared, 0); assert.equal(tab.reloads.length, 0);
    assert.equal(local.getItem(PANEL_UI_CACHE_KEYS[0]), 'existing');
    finish(); assert.equal(await updating, true); assert.equal(tab.reloads.length, 1);
});

test('failed recovery persistence does not acknowledge a build or discard editor memory', async () => {
    let failed = true;
    const tab = browser(storage(), storage(), undefined, async () => { if (failed) throw Error('draft blocked'); });
    await assert.rejects(tab.accept(metadata('1.1.7.98')), /draft blocked/);
    assert.equal(tab.cleared, 0); assert.equal(tab.reloads.length, 0);
    failed = false; assert.equal(await tab.accept(metadata('1.1.7.98')), true);
});

test('a mutation starting during the recovery flush postpones the reload', async () => {
    let finish, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const pending = new Promise(resolve => { finish = resolve; });
    const tab = browser(storage(), storage(), undefined, async () => { entered(); await pending; });
    const updating = tab.accept(metadata('1.1.7.98'));
    await ready; tab.mutations = 1; finish();
    assert.equal(await updating, false); assert.equal(tab.cleared, 0);
    tab.mutations = 0; assert.equal(await tab.accept(metadata('1.1.7.98')), true);
});
