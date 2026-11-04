const test = require('node:test');
const assert = require('node:assert/strict');
const { source } = require('./upstream-filter-fixture.cjs');
const { RenderTemplatesService } = source(
    'modules/subscription-template/render-templates.service.ts',
    {
        '@libs/contracts/constants': { USERS_STATUS: { ACTIVE: 'ACTIVE' } },
        './constants/config-types': {
            SUBSCRIPTION_CONFIG_TYPES: { XRAY_JSON: { CONTENT_TYPE: 'application/json' } },
        },
        './geofiles/xray-geofile-delivery': { xrayGeofileClient: () => 'incy' },
        './geofiles/automatic-xray-delivery': {
            automaticXrayDelivery: async ({ generate }) => {
                await generate();
                return { subscription: await generate({ mode: 'dat' }), inline: true };
            },
        },
    },
);

const make = (uuid, scoped = false) => ({
    credential: scoped ? 'scoped:' + uuid : 'parent',
    metadata: {
        uuid,
        configProfileInboundUuid: 'inbound',
        isDisabled: false,
        excludeFromSubscriptionTypes: [],
    },
    clientOverrides: { hostScoped: scoped },
});
const params = () => ({
    hosts: ['owner', 'source'].map((uuid) => ({ uuid, configProfileInboundUuid: 'inbound' })),
    user: { id: 1n, status: 'ACTIVE', expireAt: new Date('2099-01-01') },
    srrContext: {
        matchedResponseType: 'XRAY_JSON',
        userAgent: 'fixture',
        subscriptionSettings: {},
    },
});

test('first routed subscription refreshes direct credentials once and reuses pool selection across DAT rerenders', async () => {
    const service = Object.create(RenderTemplatesService.prototype);
    let bound = false,
        preparations = 0,
        selections = 0,
        refreshes = 0,
        generated = 0;
    service.resolveProxyConfigService = {
        resolveProxyConfig: async (options) => {
            if (options.selectionOnly) {
                selections++;
                return [make('source')];
            }
            if (options.quotaOwnerHost) {
                preparations++;
                assert.equal(options.quotaOwnerHost.uuid, 'owner');
                bound = true;
                return [make('recipient-route', true)];
            }
            refreshes++;
            return [make('owner', bound), make('source', bound)];
        },
    };
    let selectionCache;
    service.xrayJsonGeneratorService = {
        generateConfig: async (options) => {
            generated++;
            if (selectionCache) assert.equal(selectionCache, options.autoselectSelections);
            selectionCache = options.autoselectSelections;
            assert.equal((await options.autoselectCandidates()).length, 1);
            const selected = await options.bindAutoselect('owner', ['source']);
            assert.equal(selected[0].credential, 'scoped:recipient-route');
            return JSON.stringify(options.hosts.map((host) => host.credential));
        },
    };
    const seen = [];
    const result = await service.generateSubscription({
        ...params(),
        onResolvedHosts: (ids) => seen.push(ids),
    });
    assert.deepEqual(JSON.parse(result.subscription), ['scoped:owner', 'scoped:source']);
    assert.equal(refreshes, 2);
    assert.equal(preparations, 1);
    assert.equal(selections, 1);
    assert.equal(generated, 3);
    assert.deepEqual(seen, [
        ['owner', 'source'],
        ['owner', 'source'],
    ]);
});

test('ordinary JSON does not resolve source candidates or register route credentials', async () => {
    const service = Object.create(RenderTemplatesService.prototype);
    let reads = 0;
    service.resolveProxyConfigService = {
        resolveProxyConfig: async (options) => {
            assert.equal(options.selectionOnly, undefined);
            assert.equal(options.quotaOwnerHost, undefined);
            reads++;
            return [make('owner')];
        },
    };
    service.xrayJsonGeneratorService = { generateConfig: async () => '[]' };
    await service.generateSubscription(params());
    assert.equal(reads, 1);
});
