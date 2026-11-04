const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const schema = load(path.join(__dirname, '../libs/contract/models/subscription-settings/custom-remarks.schema.ts'));
const text = source('common/utils/templates/is-text-remark.ts');
const compose = source('modules/subscription/utils/compose-status-hwid-remarks.ts');
const registration = source('modules/subscription/utils/registration-blocked-remarks.ts', { '@common/utils/templates/is-text-remark': text });
const { ResolveProxyConfigService } = source('modules/subscription-template/resolve-proxy/resolve-proxy-config.service.ts', {
    '@libs/contracts/constants': require('../libs/contract/build/backend/constants'),
    '@modules/hosts/utils/host-traffic-limit': source('modules/hosts/utils/host-traffic-limit.ts'),
    '@modules/subscription/utils/compose-status-hwid-remarks': compose,
    '@modules/subscription/utils/registration-blocked-remarks': registration,
    '@common/utils/templates/is-text-remark': text,
    '@common/utils/templates/replace-templates-values': { TemplateEngine: { createUserValueMap: () => ({}), replace: value => value } },
    '@common/helpers/xray-config': {
        resolveInboundAndPublicKey: async () => new Map(), resolveInboundAndMlDsa65PublicKey: async () => new Map(), resolveEncryptionFromDecryption: async () => new Map(),
    },
});

test('old settings gain frozen remarks without changing saved text or requiring a new order', () => {
    const { frozenUsers, ...old } = schema.DEFAULT_SUBSCRIPTION_REMARKS;
    const saved = { ...old, disabledUsers: ['Saved disabled'], subscriptionAndHwidRemarkOrder: ['EXPIRED', 'DISABLED', 'HWID_BLOCKED'] };
    const parsed = schema.CustomRemarksSchema.parse(saved);
    assert.deepEqual(parsed.frozenUsers, frozenUsers);
    assert.deepEqual(parsed.disabledUsers, ['Saved disabled']);
    assert.deepEqual(parsed.subscriptionAndHwidRemarkOrder, saved.subscriptionAndHwidRemarkOrder);
    assert(schema.CustomRemarksSchema.safeParse({ ...parsed, subscriptionAndHwidRemarkOrder: ['FROZEN', 'EXPIRED', 'DISABLED', 'HWID_REGISTRATION_BLOCKED', 'HWID_BLOCKED'] }).success);
    assert(!schema.CustomRemarksSchema.safeParse({ ...parsed, subscriptionAndHwidRemarkOrder: ['FROZEN', 'FROZEN', 'EXPIRED', 'DISABLED', 'HWID_BLOCKED'] }).success);
});

test('frozen, expired, disabled and limited users receive only permitted exception hosts at the configured marker', async () => {
    for (const status of ['FROZEN', 'EXPIRED', 'DISABLED', 'LIMITED']) {
        const user = { id: 42n, status, expireAt: new Date(Date.now() + 86400000), vlessUuid: 'parent' };
        const remarks = ['Before', '{{FREE_HOST}}', 'After'];
        const settings = { isShowCustomRemarks: true, customRemarks: { ...schema.DEFAULT_SUBSCRIPTION_REMARKS, frozenUsers: remarks, expiredUsers: remarks, disabledUsers: remarks, limitedUsers: remarks } };
        let prepared;
        const resolver = new ResolveProxyConfigService({ getOrThrow: () => 'sub.example.test' }, { prepare: async (_user, hosts) => {
            prepared = hosts;
            return new Map(hosts.map(host => [host.uuid, { ...user, vlessUuid: 'scoped-exception' }]));
        } });
        resolver.buildResolvedProxyConfig = ({ inputHost, user }) => ({ finalRemark: inputHost.remark, credential: user.vlessUuid, clientOverrides: {} });
        const hosts = [
            { uuid: 'normal', remark: 'Normal', tags: [], tagTrafficLimits: [], alwaysAvailable: false, onlyWhenInactive: false, rawInbound: {} },
            { uuid: 'exception', remark: 'Support', tags: [], tagTrafficLimits: [], alwaysAvailable: true, onlyWhenInactive: true, rawInbound: {} },
        ];
        const result = await resolver.resolveProxyConfig({ user, subscriptionSettings: settings, hosts });
        assert.deepEqual(prepared.map(host => host.uuid), ['exception'], status);
        assert.deepEqual(result.map(host => host.finalRemark), ['Before', 'Support', 'After'], status);
        assert.equal(result[1].credential, 'scoped-exception');
        const blocked = await resolver.resolveProxyConfig({ user, subscriptionSettings: settings, hosts, fallbackOptions: { showHwidBlockedRemarks: true } });
        assert(blocked.every(host => host.address === '0.0.0.0'), status + ' must not bypass a device block');
        user.status = 'ACTIVE';
        assert.deepEqual((await resolver.resolveProxyConfig({ user, subscriptionSettings: settings, hosts })).map(host => host.finalRemark), ['Normal']);
    }
});

test('frozen remarks follow configured priority against HWID blocks and registration notices', () => {
    const customRemarks = { ...schema.DEFAULT_SUBSCRIPTION_REMARKS, frozenUsers: ['Paused', '{{FREE_HOST}}'], subscriptionAndHwidRemarkOrder: ['HWID_BLOCKED', 'HWID_REGISTRATION_BLOCKED', 'FROZEN', 'EXPIRED', 'DISABLED'] };
    assert.deepEqual(compose.composeStatusAndHwidRemarks('FROZEN', ['Paused'], ['Blocked'], customRemarks), ['Blocked', 'Paused']);
    const frozen = { status: 'FROZEN', expireAt: new Date(0) };
    assert.deepEqual(registration.registrationBlockedRemarks(frozen, { customRemarks }), ['New device registration is disabled']);
    customRemarks.subscriptionAndHwidRemarkOrder = ['FROZEN', 'HWID_BLOCKED', 'HWID_REGISTRATION_BLOCKED', 'EXPIRED', 'DISABLED'];
    assert.deepEqual(registration.registrationBlockedRemarks(frozen, { customRemarks }), ['Paused']);
    assert.deepEqual(compose.composeStatusAndHwidRemarks('FROZEN', ['Paused'], ['Blocked'], customRemarks), ['Paused', 'Blocked']);
});

test('inactive status never disguises a device limit or unsupported HWID as an empty subscription', async () => {
    const resolver = new ResolveProxyConfigService({ getOrThrow: () => 'sub.example.test' }, { prepare: async () => { throw Error('denied devices must not get keys'); } });
    for (const status of ['FROZEN', 'EXPIRED', 'DISABLED', 'LIMITED']) {
        const user = { id: 42n, status, expireAt: new Date(Date.now() + 86400000) };
        const remarks = ['Saved status', '{{FREE_HOST}}'];
        const settings = { isShowCustomRemarks: true, customRemarks: { ...schema.DEFAULT_SUBSCRIPTION_REMARKS,
            frozenUsers: remarks, expiredUsers: remarks, disabledUsers: remarks, limitedUsers: remarks,
            HWIDMaxDevicesExceeded: ['Saved device limit'], HWIDNotSupported: ['Saved HWID warning'] } };
        for (const [flag, warning] of [['showHwidMaxDeviceRemarks', 'Saved device limit'], ['showHwidNotSupportedRemarks', 'Saved HWID warning']]) {
            for (const combine of [true, false]) {
                settings.customRemarks.combineSubscriptionAndHwidRemarks = combine;
                const configs = await resolver.resolveProxyConfig({ user, subscriptionSettings: settings, hosts: [], fallbackOptions: { [flag]: true } });
                assert.deepEqual(configs.map(c => c.finalRemark), combine ? ['Saved status', warning] : [warning], `${status}: ${flag}`);
                assert(configs.every(c => c.address === '0.0.0.0' && c.port === 1));
            }
        }
    }
});
