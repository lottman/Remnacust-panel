const { test } = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../libs/contract/build/backend');
const frontend = require('../../frontend/vendor/backend-contract/build/backend');
const at = '2026-01-01T00:00:00.000Z';
function fixture() {
    return { response: {
        user: {
            id: 1, shortUuid: 'fixture', username: 'fixture', status: 'ACTIVE',
            trafficLimitBytes: 0, trafficLimitStrategy: Object.values(contract.RESET_PERIODS)[0], expireAt: at,
            telegramId: null, email: null, description: null, tag: null, hwidDeviceLimit: 1,
            externalSquadUuid: null, trojanPassword: '', vlessUuid: '', ssPassword: '',
            lastTriggeredThreshold: 0, subRevokedAt: null, lastTrafficResetAt: null, createdAt: at, updatedAt: at,
            subscriptionUrl: 'https://sub.example.test/fixture', activeInternalSquads: [],
            userTraffic: { usedTrafficBytes: 0, lifetimeUsedTrafficBytes: 0, onlineAt: null, firstConnectedAt: null, lastConnectedNodeUuid: null },
        },
        convertedUserInfo: { daysLeft: 0, trafficLimit: '0 B', trafficUsed: '0 B', lifetimeTrafficUsed: '0 B',
            hwidCheckup: { subscriptionAllowed: false, maxDeviceReached: true, hwidNotSupported: false, limitBypassed: false } },
        headers: {}, resolvedProxyConfigs: [],
    } };
}

test('raw inspection accepts a deliberately redacted key only when device access was denied', () => {
    for (const library of [contract, frontend]) {
        for (const status of ['ACTIVE', 'EXPIRED', 'FROZEN', 'DISABLED', 'LIMITED']) {
            const value = fixture();
            value.response.user.status = status;
            const parsed = library.GetRawSubscriptionByShortUuidCommand.ResponseSchema.safeParse(value);
            assert.equal(parsed.success, true, parsed.error?.message);
            assert.equal(parsed.data.response.user.vlessUuid, '');
        }
        for (const check of [null, { ...fixture().response.convertedUserInfo.hwidCheckup, subscriptionAllowed: true }]) {
            const value = fixture();
            value.response.convertedUserInfo.hwidCheckup = check;
            assert.equal(library.GetRawSubscriptionByShortUuidCommand.ResponseSchema.safeParse(value).success, false);
        }
    }
});

test('normal users still require a valid GUID and raw inspection rejects malformed nonempty keys', () => {
    const value = fixture();
    assert.equal(contract.ExtendedUsersSchema.safeParse(value.response.user).success, false);
    value.response.user.vlessUuid = 'not-a-guid';
    assert.equal(contract.GetRawSubscriptionByShortUuidCommand.ResponseSchema.safeParse(value).success, false);
    value.response.user.vlessUuid = '11111111-1111-4111-8111-111111111111';
    value.response.convertedUserInfo.hwidCheckup = null;
    assert.equal(contract.GetRawSubscriptionByShortUuidCommand.ResponseSchema.safeParse(value).success, true);
});
