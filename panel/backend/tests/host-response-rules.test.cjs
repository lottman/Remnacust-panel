const assert = require('node:assert/strict');
const test = require('node:test');
const yaml = require('js-yaml');
const { fixture, host, regex } = require('./active-expiry-fixture.cjs');
test.after(() => regex.configuredRegex.close());
function names(type, body) {
    if (type === 'XRAY_BASE64')
        return Buffer.from(body, 'base64')
            .toString()
            .split('\n')
            .filter(Boolean)
            .map((link) => decodeURIComponent(link.slice(link.lastIndexOf('#') + 1)));
    if (type === 'XRAY_JSON') return JSON.parse(body).map((profile) => profile.remarks);
    if (type === 'SINGBOX')
        return JSON.parse(body)
            .outbounds.filter((item) => item.server)
            .map((item) => item.tag);
    return yaml.load(body).proxies.map((item) => item.name);
}
for (const type of ['XRAY_BASE64', 'XRAY_JSON', 'MIHOMO', 'CLASH', 'STASH', 'SINGBOX']) {
    test(
        type +
            ': selected response rules restrict the real personalized subscription before credentials are prepared',
        async () => {
            const hosts = [
                host(1),
                host(2, { includeInSrrRules: ['phone'] }),
                host(3, { includeInSrrRules: ['desktop'] }),
                host(4, { includeInSrrRules: ['RAW'] }),
                host(5, { includeInSrrRules: ['phone'], denied: true }),
            ];
            const f = fixture({ rules: null, hosts });
            for (const [name, expected] of [
                ['phone', ['Host 1', 'Host 2']],
                ['desktop', ['Host 1', 'Host 3']],
                ['unknown', ['Host 1']],
            ]) {
                const context = { ...f.context(type), matchedRuleName: name };
                const response = await f.service.getSubscriptionByShortUuid(
                    context,
                    f.user.shortUuid,
                );
                assert.deepEqual(names(type, response.body), expected);
                const prepared = f.prepared.at(-1);
                assert.ok(!prepared.includes(hosts[name === 'desktop' ? 1 : 2].uuid));
                assert.ok(!prepared.includes(hosts[3].uuid));
            }
        },
    );
}
test('RAW has its own response rule and an empty list preserves the old behavior', async () => {
    const f = fixture({
        rules: null,
        hosts: [
            host(1, { includeInSrrRules: [] }),
            host(2, { includeInSrrRules: ['phone'] }),
            host(3, { includeInSrrRules: ['RAW'] }),
        ],
    });
    const options = { hosts: f.hosts, user: f.user, subscriptionSettings: f.settings };
    assert.deepEqual(
        (await f.render.generateRawSubscription(options)).map((item) => item.finalRemark),
        ['Host 1', 'Host 3'],
    );
    assert.deepEqual(
        (await f.resolver.resolveProxyConfig(options)).map((item) => item.finalRemark),
        ['Host 1', 'Host 2', 'Host 3'],
    );
});
test('autoselect candidate discovery and explicit quota rebinding cannot reintroduce a host excluded by the response rule', async () => {
    const owner = host(1, { includeInSrrRules: ['phone'] });
    const allowed = host(2, { includeInSrrRules: ['phone'] });
    const denied = host(3, { includeInSrrRules: ['desktop'] });
    const f = fixture({ rules: null, hosts: [owner] });
    const prepared = [];
    f.resolver.hostAccess.prepareAutoselect = async (_user, _owner, list) => {
        prepared.push(list.map((item) => item.uuid));
        return new Map(list.map((item) => [item.uuid, f.user]));
    };
    let checks = 0;
    f.render.xrayJsonGeneratorService = {
        generateConfig: async (options) => {
            assert.deepEqual(
                (await options.autoselectCandidates()).map((item) => item.metadata.uuid),
                [allowed.uuid],
            );
            assert.deepEqual(
                (await options.bindAutoselect(owner.uuid, [allowed.uuid, denied.uuid])).map(
                    (item) => item.metadata.uuid,
                ),
                [allowed.uuid],
            );
            checks++;
            return '[]';
        },
    };
    await f.render.generateSubscription({
        srrContext: { ...f.context('XRAY_JSON'), matchedRuleName: 'phone' },
        user: f.user,
        hosts: [owner],
        autoselectHosts: [allowed, denied],
    });
    assert.ok(checks > 0);
    assert.ok(prepared.length > 0);
    assert.ok(prepared.every((ids) => !ids.includes(denied.uuid)));
});
test('host response-rule contracts support omission and explicit clear while rejecting null and malformed values', () => {
    const {
        HostsSchema,
        CreateHostCommand,
        UpdateHostCommand,
    } = require('../libs/contract/build/backend');
    assert.deepEqual(HostsSchema.shape.includeInSrrRules.parse(undefined), []);
    for (const command of [CreateHostCommand, UpdateHostCommand]) {
        const schema = command.RequestBodySchema.pick({ includeInSrrRules: true });
        assert.deepEqual(schema.parse({}), {});
        assert.deepEqual(schema.parse({ includeInSrrRules: [] }), { includeInSrrRules: [] });
        assert.deepEqual(schema.parse({ includeInSrrRules: ['phone', 'RAW'] }), {
            includeInSrrRules: ['phone', 'RAW'],
        });
        for (const value of [null, 'phone', [1], [{}]])
            assert.equal(schema.safeParse({ includeInSrrRules: value }).success, false);
    }
});
