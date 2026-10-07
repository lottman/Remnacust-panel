const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function load(filename, resolve = require) {
    const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', output)(resolve, ref, ref.exports);
    return ref.exports;
}
const defaults = load('prisma/seed/default/hwid-settings.ts');
const { seedSubscriptionSettings } = load('prisma/seed/seeders/8_seed-subscription-settings.ts', (name) => {
    if (name === '../default') return defaults;
    if (name === 'consola') return { default: { start() {}, success() {} } };
    if (name === '@libs/contracts/models') return { CustomRemarksSchema: { safeParseAsync: async () => ({ success: true }) } };
    return require(name);
});

test('HWID is enabled when env is absent or empty; false is explicit and invalid values fail', () => {
    assert.equal(defaults.DEFAULT_HWID_SETTINGS.enabled, true);
    assert.equal(defaults.getDefaultHwidSettings('').enabled, true);
    assert.equal(defaults.getDefaultHwidSettings('true').enabled, true);
    assert.equal(defaults.getDefaultHwidSettings('false').enabled, false);
    assert.throws(() => defaults.getDefaultHwidSettings('FALSE'), /HWID_ENABLED_DEFAULT/);
    const first = defaults.getDefaultHwidSettings('true');
    first.fallbackDeviceLimit = 1;
    assert.equal(defaults.getDefaultHwidSettings('true').fallbackDeviceLimit, 999);
});

test('fresh installations seed enabled HWID without an env override; explicit false remains possible', async () => {
    const previous = process.env.HWID_ENABLED_DEFAULT;
    try {
        for (const override of [undefined, '', 'true', 'false']) {
            if (override === undefined) delete process.env.HWID_ENABLED_DEFAULT;
            else process.env.HWID_ENABLED_DEFAULT = override;
            let created;
            await seedSubscriptionSettings({ subscriptionSettings: {
                findFirst: async () => null,
                create: async ({ data }) => { created = data; },
            } });
            assert.equal(created.hwidSettings.enabled, override !== 'false');
        }
    } finally {
        if (previous === undefined) delete process.env.HWID_ENABLED_DEFAULT;
        else process.env.HWID_ENABLED_DEFAULT = previous;
    }
});

test('startup does not overwrite saved HWID choices or per-device limits', async () => {
    for (const enabled of [false, true]) {
        const updates = [];
        const existing = { uuid: 'existing', hwidSettings: { enabled, fallbackDeviceLimit: 3, maxDevicesAnnounce: '3 devices' } };
        await seedSubscriptionSettings({ subscriptionSettings: {
            findFirst: async () => existing,
            update: async (update) => updates.push(update),
        } });
        assert.deepEqual(updates, []);
        assert.equal(existing.hwidSettings.enabled, enabled);
        assert.equal(existing.hwidSettings.fallbackDeviceLimit, 3);
    }
});

test('missing legacy HWID settings are initialized without replacing other settings', async () => {
    const updates = [];
    await seedSubscriptionSettings({ subscriptionSettings: {
        findFirst: async () => ({ uuid: 'legacy', hwidSettings: null }),
        update: async (update) => updates.push(update),
    } });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].where.uuid, 'legacy');
    assert.deepEqual(Object.keys(updates[0].data), ['hwidSettings']);
    assert.equal(updates[0].data.hwidSettings.enabled, true);
});
