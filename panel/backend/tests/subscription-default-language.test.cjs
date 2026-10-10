const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const contract = load(path.join(__dirname, '../libs/contract/models/subscription-settings/custom-remarks.schema.ts'));
const { CustomRemarksSchema, DEFAULT_SUBSCRIPTION_REMARKS } = contract;
const { seedSubscriptionSettings } = load(path.join(__dirname, '../prisma/seed/seeders/8_seed-subscription-settings.ts'), {
    '@prisma/client': {},
    consola: { start() {}, success() {} },
    '@libs/contracts/models': contract,
    '../default': { getDefaultHwidSettings: () => ({ enabled: false }) },
});

test('fresh installation and omitted optional fields use English subscription content', async () => {
    let created;
    await seedSubscriptionSettings({ subscriptionSettings: {
        findFirst: async () => null,
        create: async ({ data }) => { created = data; },
    } });
    for (const [key, value] of Object.entries(DEFAULT_SUBSCRIPTION_REMARKS)) {
        assert.deepEqual(created.customRemarks[key], value);
        assert.ok(value.every(text => !/[\u0400-\u04ff]/.test(text)), key);
    }
    const { HWIDRegistrationBlocked: _registration, hostTrafficPaused: _paused, ...old } = created.customRemarks;
    const parsed = CustomRemarksSchema.parse(old);
    assert.deepEqual(parsed.HWIDRegistrationBlocked, ['New device registration is disabled']);
    assert.deepEqual(parsed.hostTrafficPaused, ['Traffic is temporarily paused']);
});

test('upgrade fills missing defaults without translating or replacing saved remarks', async () => {
    const saved = { ...DEFAULT_SUBSCRIPTION_REMARKS, expiredUsers: ['Мой текст'], HWIDRegistrationBlocked: [], hostTrafficPaused: ['Моя пауза'] };
    const { hostTrafficLimit: _limit, ...old } = saved;
    let updated;
    await seedSubscriptionSettings({ subscriptionSettings: {
        findFirst: async () => ({ uuid: 'test', hwidSettings: {}, customRemarks: old }),
        update: async ({ data }) => { updated = data.customRemarks; },
    } });
    assert.deepEqual(updated.expiredUsers, ['Мой текст']);
    assert.deepEqual(updated.HWIDRegistrationBlocked, []);
    assert.deepEqual(updated.hostTrafficPaused, ['Моя пауза']);
    assert.deepEqual(updated.hostTrafficLimit, ['Host traffic limit reached']);
    const parsed = CustomRemarksSchema.parse({ ...saved });
    assert.deepEqual(parsed.expiredUsers, ['Мой текст']);
    assert.deepEqual(parsed.hostTrafficPaused, ['Моя пауза']);
});

test('runtime registration fallback is English and still respects saved wording', () => {
    const { registrationBlockedRemarks } = load(path.join(__dirname, '../src/modules/subscription/utils/registration-blocked-remarks.ts'), {
        '@common/utils/templates/is-text-remark': load(path.join(__dirname, '../src/common/utils/templates/is-text-remark.ts')),
    });
    const user = { status: 'ACTIVE', expireAt: new Date(Date.now() + 86400000) };
    assert.deepEqual(registrationBlockedRemarks(user, { customRemarks: {} }), ['New device registration is disabled']);
    assert.deepEqual(registrationBlockedRemarks(user, { customRemarks: { HWIDRegistrationBlocked: ['Мой текст'] } }), ['Мой текст']);
});
