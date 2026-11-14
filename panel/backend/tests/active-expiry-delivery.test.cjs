const test = require('node:test');
const assert = require('node:assert/strict');
const yaml = require('js-yaml');
const {
    fixture,
    rule,
    uuid,
    host,
    regex,
    GetUserByUniqueFieldQuery,
} = require('./active-expiry-fixture.cjs');
test.after(() => regex.configuredRegex.close());

function presentation(headers) {
    return JSON.parse(Buffer.from(headers['x-era-subscription-presentation'], 'base64').toString());
}

function names(type, subscription) {
    if (type === 'XRAY_BASE64')
        return Buffer.from(subscription, 'base64')
            .toString()
            .split('\n')
            .filter(Boolean)
            .map((link) => decodeURIComponent(link.slice(link.lastIndexOf('#') + 1)));
    if (type === 'XRAY_JSON') return JSON.parse(subscription).map((config) => config.remarks);
    if (type === 'SINGBOX')
        return JSON.parse(subscription)
            .outbounds.filter((outbound) => outbound.server)
            .map((outbound) => outbound.tag);
    return yaml.load(subscription).proxies.map((proxy) => proxy.name);
}

for (const type of ['XRAY_BASE64', 'XRAY_JSON', 'MIHOMO', 'STASH', 'CLASH', 'SINGBOX']) {
    test(`${type}: active notes surround only authorized, format-supported real configs`, async () => {
        const f = fixture();
        const response = await f.service.getSubscriptionByShortUuid(
            f.context(type),
            f.user.shortUuid,
        );
        assert.deepEqual(names(type, response.body), ['Before fixture', 'Host 1', 'After']);
        assert.deepEqual(presentation(response.headers), [
            { kind: 'text', text: 'Before fixture' },
            { kind: 'hosts' },
            { kind: 'text', text: 'After' },
        ]);
        assert.deepEqual(f.prepared, [[uuid(11), uuid(12), uuid(13)]]);
        assert(!response.body.includes('node-2.example.test'));
        assert.equal(
            f.queries.filter(
                (query) => query instanceof GetUserByUniqueFieldQuery && query.field.id,
            ).length,
            0,
        );
    });
}

test('selected internal scope fetches authoritative membership once despite the unhydrated user relation', async () => {
    const f = fixture({ rules: [rule({ scope: 'selected', internalSquadUuids: [uuid(102)] })] });
    assert.deepEqual(f.user.activeInternalSquads, []);
    const response = await f.service.getSubscriptionByShortUuid(
        f.context('XRAY_JSON'),
        f.user.shortUuid,
    );
    assert.deepEqual(names('XRAY_JSON', response.body), ['Before fixture', 'Host 1', 'After']);
    const membership = f.queries.filter(
        (query) => query instanceof GetUserByUniqueFieldQuery && query.field.id,
    );
    assert.equal(membership.length, 1);
    assert.equal(membership[0].includeOptions.activeInternalSquads, true);
});

test('HTTPS actions render consistently in body and header without interpreting rendered JSON as a proxy', async () => {
    const action = JSON.stringify({
        type: 'link',
        text: '{{USERNAME}}',
        buttonText: 'Renew',
        url: 'https://example.test/?user={{USERNAME}}',
    });
    const f = fixture({ rules: [rule({ remarks: [action, '{HOSTS}'] })] });
    f.user.username = '{"finalRemark":"INJECTED","address":"private.example.test"}';
    const response = await f.service.getSubscriptionByShortUuid(
        f.context('XRAY_JSON'),
        f.user.shortUuid,
    );
    assert.deepEqual(names('XRAY_JSON', response.body), [f.user.username + ' · Renew', 'Host 1']);
    const items = presentation(response.headers);
    assert.equal(items[0].text, f.user.username);
    assert.equal(new URL(items[0].url).searchParams.get('user'), f.user.username);
    const configs = JSON.parse(response.body);
    assert.equal(configs[0].outbounds[0].settings.servers[0].address, '0.0.0.0');
});

test('notes-only mode neither prepares credentials nor reinjects real hosts through YAML/Singbox pools or Xray injectors', async () => {
    const pool = {
        mode: 'all',
        selectFrom: 'ALL',
        selector: { type: 'uuids', values: [uuid(11)] },
    };
    const group = { name: 'pool', type: 'select', proxies: [], remnawave: { pool } };
    const templates = {
        MIHOMO: { proxies: [], 'proxy-groups': [group] },
        CLASH: { proxies: [], 'proxy-groups': [group] },
        STASH: { proxies: [], 'proxy-groups': [group] },
        SINGBOX: {
            outbounds: [{ tag: 'pool', type: 'selector', outbounds: [], remnawave: { pool } }],
        },
        XRAY_JSON: {
            outbounds: [],
            remnawave: { injectHosts: [pool], addVirtualHostAsOutbound: true },
        },
    };
    for (const type of ['XRAY_BASE64', 'XRAY_JSON', 'MIHOMO', 'STASH', 'CLASH', 'SINGBOX']) {
        const f = fixture({ rules: [rule({ remarks: ['Notes only'] })], templates });
        const response = await f.service.getSubscriptionByShortUuid(
            f.context(type),
            f.user.shortUuid,
        );
        assert.deepEqual(names(type, response.body), ['Notes only'], type);
        assert.deepEqual(
            presentation(response.headers),
            [{ kind: 'text', text: 'Notes only' }],
            type,
        );
        assert(
            f.prepared.every((batch) => batch.length === 0),
            type,
        );
        const decoded =
            type === 'XRAY_BASE64'
                ? Buffer.from(response.body, 'base64').toString()
                : response.body;
        assert(!decoded.includes('node-1.example.test'), type);
        assert(!decoded.includes('scoped-password'), type);
    }
});

test('resolver does not decorate credential candidates, denied responses or inactive users', async () => {
    const f = fixture();
    for (const key of [
        'showHwidMaxDeviceRemarks',
        'showHwidNotSupportedRemarks',
        'showHwidBlockedRemarks',
        'showHwidRegistrationBlockedRemarks',
        'respondWithRemarks',
    ]) {
        const plan = await f.plan();
        const result = await f.resolver.resolveProxyConfig({
            user: f.user,
            subscriptionSettings: f.settings,
            hosts: f.hosts,
            activeExpiryPlan: plan,
            fallbackOptions: { [key]: key === 'respondWithRemarks' ? ['Forced denial'] : true },
        });
        assert(
            result.every((config) => config.address === '0.0.0.0'),
            key,
        );
        assert.equal(plan.items, undefined, key);
    }
    for (const options of [{ selectionOnly: true }, { quotaOwnerHost: f.hosts[0] }]) {
        const plan = await f.plan();
        const result = await f.resolver.resolveProxyConfig({
            user: f.user,
            subscriptionSettings: f.settings,
            hosts: [f.hosts[0]],
            activeExpiryPlan: plan,
            ...options,
        });
        assert.equal(plan.items, undefined);
        assert(result.every((config) => !config.metadata.activeExpiryRemark));
    }
    for (const status of ['EXPIRED', 'DISABLED', 'LIMITED', 'FROZEN']) {
        const plan = await f.plan();
        const result = await f.resolver.resolveProxyConfig({
            user: { ...f.user, status },
            subscriptionSettings: f.settings,
            hosts: [],
            activeExpiryPlan: plan,
        });
        assert.equal(plan.items, undefined);
        assert(result.every((config) => !config.metadata.activeExpiryRemark));
    }
});

test('zero authorized hosts and format rejection cannot restore a host at the marker', async () => {
    const f = fixture({ hosts: [host(1, { denied: true })] });
    const response = await f.service.getSubscriptionByShortUuid(
        f.context('XRAY_JSON'),
        f.user.shortUuid,
    );
    assert.deepEqual(names('XRAY_JSON', response.body), ['Before fixture', 'After']);
    const unsupported = fixture({ hosts: [host(1, { transport: 'kcp' })] });
    const singbox = await unsupported.service.getSubscriptionByShortUuid(
        unsupported.context('SINGBOX'),
        unsupported.user.shortUuid,
    );
    assert.deepEqual(names('SINGBOX', singbox.body), ['Before fixture', 'After']);
});

test('body and header use the same capped plan while a terminal host marker survives Unicode overflow', async () => {
    const f = fixture({
        rules: [
            rule({ remarks: [...Array.from({ length: 23 }, () => '界'.repeat(500)), '{HOSTS}'] }),
        ],
        hosts: [host(1)],
    });
    const response = await f.service.getSubscriptionByShortUuid(
        f.context('XRAY_JSON'),
        f.user.shortUuid,
    );
    const items = presentation(response.headers);
    assert(Buffer.byteLength(JSON.stringify(items)) <= 4500);
    assert.equal(items.at(-1).kind, 'hosts');
    assert.equal(names('XRAY_JSON', response.body).length, items.length);
    assert.equal(names('XRAY_JSON', response.body).at(-1), 'Host 1');
});

test('raw and info delivery apply the same active-expiry rule and old missing JSON keeps legacy delivery', async () => {
    const f = fixture({ hosts: [host(1)] });
    const raw = await f.service.getRawSubscriptionByShortUuid(
        f.user.shortUuid,
        false,
        null,
        'fixture',
    );
    assert(raw.isOk);
    assert.deepEqual(
        raw.response.resolvedProxyConfigs.map((config) => config.finalRemark),
        ['Before fixture', 'Host 1', 'After'],
    );
    assert.deepEqual(presentation(raw.response.headers), [
        { kind: 'text', text: 'Before fixture' },
        { kind: 'hosts' },
        { kind: 'text', text: 'After' },
    ]);
    const info = await f.service.getSubscriptionInfo({
        userEntity: f.user,
        authenticated: true,
        subscriptionSettingsRaw: f.settings,
    });
    assert(info.isOk);
    assert.deepEqual(
        names('XRAY_BASE64', Buffer.from(info.response.links.join('\n')).toString('base64')),
        ['Before fixture', 'Host 1', 'After'],
    );
    const old = fixture({ rules: null, hosts: [host(1)] });
    const response = await old.service.getSubscriptionByShortUuid(
        old.context('XRAY_JSON'),
        old.user.shortUuid,
    );
    assert.deepEqual(names('XRAY_JSON', response.body), ['Host 1']);
    assert.equal(response.headers['x-era-subscription-presentation'], undefined);
});

test('external squad custom remarks remain a full override, including old objects, explicit clear and null inheritance', async () => {
    const f = fixture();
    delete f.service.applyMaybeExternalSquadOverrides;
    const global = structuredClone(f.settings);
    for (const externalRemarks of [
        null,
        { ...f.settings.customRemarks, activeExpiry: { rules: [] } },
        { expiredUsers: ['External legacy'] },
    ]) {
        f.service.queryBus.execute = async () => ({
            customRemarks: externalRemarks,
            responseHeadersRemove: [],
            responseHeadersAdd: {},
        });
        const result = await f.service.applyMaybeExternalSquadOverrides(f.settings, uuid(201));
        assert.deepEqual(
            result.subscriptionSettings.customRemarks,
            externalRemarks ?? global.customRemarks,
        );
        assert.deepEqual(f.settings, global);
    }
});

test('registration and explicit response denials bypass active-rule selection and host expansion', async () => {
    for (const registration of [true, false]) {
        const f = fixture({
            rules: [rule({ scope: 'selected', internalSquadUuids: [uuid(102)] })],
        });
        f.service.deviceAccess.registrationDenied = async () => registration;
        const context = f.context('XRAY_JSON');
        if (!registration) context.respondWithRemarks = ['Forced denial'];
        const response = await f.service.getSubscriptionByShortUuid(context, f.user.shortUuid);
        assert(
            !names('XRAY_JSON', response.body).some(
                (name) => name === 'Before fixture' || name === 'Host 1',
            ),
        );
        assert.equal(
            f.queries.filter(
                (query) => query instanceof GetUserByUniqueFieldQuery && query.field.id,
            ).length,
            0,
        );
        assert.deepEqual(f.prepared, []);
        assert(!presentation(response.headers).some((item) => item.kind === 'hosts'));
    }
});
