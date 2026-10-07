const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { createStore } = require('zustand/vanilla');
const load = require('../../backend-3.4.4-xera/tests/load-typescript.cjs');

function fixture(pauseAt) {
    let release, reached, logout;
    const entered = new Promise(resolve => { reached = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const rawKeys = [];
    const keyBytes = () => { const raw = new Uint8Array(32).fill(7); rawKeys.push(raw); return raw; };
    const wait = async name => { if (name === pauseAt) { reached(); await gate; } };
    let meta = { id: 'vault', wrappedDataKey: { kind: 'key' }, passcode: { attempts: 0, salt: '', wrapped: { kind: 'inner' } } };
    const db = {
        getVaultMeta: async () => meta,
        putVaultMeta: async value => { await wait('putVaultMeta'); meta = { ...value, id: 'vault' }; },
        getDeviceKey: async () => ({}), getOrCreateDeviceKey: async () => ({}),
        clearVault: async () => {}, destroyVault: async () => { await wait('destroyVault'); meta = null; },
        putNodeKeys: async () => {}, putKnownHosts: async () => {},
        putSnippets: async () => {}, putConnectionProfiles: async () => {},
    };
    const crypto = {
        PASSCODE_MAX_ATTEMPTS: 3, PASSCODE_MIN_LENGTH: 8,
        isValidPasscode: () => true, generateSalt: () => new Uint8Array(16),
        generateDataKey: keyBytes, toBase64: () => '', fromBase64: () => new Uint8Array(),
        deriveKeyEncryptionKey: async () => { await wait('seed'); return {}; },
        derivePasscodeKey: async () => { await wait('passcode'); return {}; },
        importDataKey: async () => { await wait('importDataKey'); return { kind: 'data' }; },
        deriveIndexKey: async () => { await wait('deriveIndexKey'); return { kind: 'index' }; },
        encrypt: async () => ({ kind: 'key' }),
        decrypt: async (_key, blob) => {
            if (blob.kind === 'inner') return new TextEncoder().encode('{"kind":"key"}');
            if (blob.kind === 'payload') return new TextEncoder().encode('{"keys":[],"hosts":[]}');
            return keyBytes();
        },
    };
    const { useSshVaultStore: store } = load(path.join(__dirname, '../src/entities/ssh-vault/use-ssh-vault-store.ts'), {
        zustand: { create: () => creator => createStore(creator) },
        'zustand/middleware': { devtools: creator => creator },
        '@shared/api/hooks': { evaluateVault: async () => '' },
        '@shared/emitters': { logoutEvents: { subscribe: listener => { logout = listener; } } },
        './ssh-crypto': crypto,
        './ssh-private-key': {},
        './ssh-vault.db': db,
        './vault-backup-file': {
            decodeVaultFile: () => ({ createdAt: '', wrappedDataKey: { kind: 'key' }, payload: { kind: 'payload' } }),
            unpadPayload: data => data, vaultFileAad: () => '',
        },
    });
    return { store, actions: store.getState().actions, entered, release, rawKeys, logout: () => logout() };
}

const operations = {
    seed: actions => actions.unlock('synthetic recovery phrase'),
    passcode: actions => actions.unlockWithPasscode('testcode'),
    create: actions => actions.create('synthetic recovery phrase', 'testcode'),
    import: actions => actions.importVault(new Uint8Array(), 'synthetic recovery phrase'),
};

for (const [name, run] of Object.entries(operations)) {
    test(`${name} cannot restore key material after logout during an awaited crypto operation`, async () => {
        const f = fixture('deriveIndexKey');
        const operation = run(f.actions);
        await f.entered;
        f.logout();
        assert.equal(f.store.getState().status, 'locked');
        f.release();
        const result = await operation;
        assert.notEqual(result, true);
        assert.equal(f.store.getState().status, 'locked');
        assert.equal(f.store.getState().dataKey, null);
        assert.equal(f.store.getState().indexKey, null);
        assert(f.rawKeys.length > 0);
        for (const raw of f.rawKeys) assert(raw.every(byte => byte === 0));
    });
    test(`${name} still unlocks without cancellation and lock erases retained raw keys`, async () => {
        const f = fixture();
        await run(f.actions);
        assert.equal(f.store.getState().status, 'unlocked');
        assert(f.store.getState().dataKey);
        f.actions.lock();
        for (const raw of f.rawKeys) assert(raw.every(byte => byte === 0));
    });
}

test('logout during passcode evaluation never commits the completed unlock', async () => {
    const f = fixture('passcode');
    const operation = f.actions.unlockWithPasscode('testcode');
    await f.entered;
    f.logout();
    f.release();
    assert.equal(await operation, false);
    assert.equal(f.store.getState().status, 'locked');
    for (const raw of f.rawKeys) assert(raw.every(byte => byte === 0));
});

test('reset immediately removes live keys while IndexedDB deletion is pending', async () => {
    const f = fixture('destroyVault');
    await f.actions.unlock('synthetic recovery phrase');
    const reset = f.actions.reset();
    await f.entered;
    assert.equal(f.store.getState().dataKey, null);
    for (const raw of f.rawKeys) assert(raw.every(byte => byte === 0));
    f.release();
    await reset;
    assert.equal(f.store.getState().status, 'absent');
});
