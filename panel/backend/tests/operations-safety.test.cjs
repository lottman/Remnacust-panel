const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const U = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('diagnostics classify failures without exposing node errors and do not probe disabled nodes', async () => {
    const { NodeDiagnosticsService, transportFailure } = source(
        'modules/nodes/node-diagnostics.service.ts',
        {
            '@common/helpers/error-handler.helper': { errorHandler: (r) => r.response },
            './queries/get-node-by-uuid/get-node-by-uuid.query': { GetNodeByUuidQuery: class {} },
        },
    );
    for (const [input, code] of [
        ['ECONNREFUSED', 'refused'],
        ['ETIMEDOUT', 'timeout'],
        ['ENOTFOUND', 'dns'],
        ['certificate expired secret=private', 'certificate'],
        ['401 unauthorized', 'authorization'],
    ])
        assert.equal(transportFailure(input), code);
    let probes = 0;
    const node = { isDisabled: true };
    const service = new NodeDiagnosticsService(
        { execute: async () => ({ response: node }) },
        {
            getSystemStats: async () => {
                probes++;
                return { isOk: false, message: 'ECONNREFUSED secret=private' };
            },
        },
        { incrementWithTtl: async () => 1, get: async () => null },
        { get: async () => ({ status: 'PENDING' }) },
    );
    const disabled = await service.inspect(U);
    assert.equal(probes, 0);
    assert.equal(disabled.checks[0].status, 'skipped');
    node.isDisabled = false;
    const failure = await service.inspect(U);
    assert.equal(probes, 1);
    assert.equal(failure.checks[0].code, 'refused');
    assert.equal(JSON.stringify(failure).includes('private'), false);
    assert.equal(failure.checks.find((c) => c.id === 'configuration').status, 'warning');
    service.cache.incrementWithTtl = async () => 3;
    await assert.rejects(service.inspect(U), (e) => e.getStatus() === 429);
    assert.equal(probes, 1, 'rate limit rejects before the network call');
});

test('a changed profile cannot be applied using the hash from a different preview', async () => {
    const { NodePortPlansService } = source('modules/nodes/node-port-plans.service.ts', {
        './node-port-plans.schema': load(
            path.join(__dirname, '../src/modules/nodes/node-port-plans.schema.ts'),
        ),
    });
    const service = new NodePortPlansService(
        {},
        { isTransactionActive: () => false, withTransaction: async (_options, action) => action() },
        {
            dispatch: () => {
                throw Error('must not dispatch');
            },
        },
    );
    const request = { enabled: false, expectedRevision: '1', profileUuid: U, activeInbounds: [U] };
    service.state = async () => ({
        revision: '1',
        enabled: false,
        profileUuid: U,
        activeInbounds: [U],
    });
    let prepared = { bindings: [], config: { inbounds: [], outbounds: [] } };
    service.prepare = async () => prepared;
    const preview = await service.preview(U, request);
    assert.match(preview.reviewHash, /^[a-f0-9]{64}$/);
    prepared = {
        ...prepared,
        config: { inbounds: [], outbounds: [{ tag: 'changed', protocol: 'freedom' }] },
    };
    await assert.rejects(
        service.save(U, { ...request, reviewHash: preview.reviewHash }),
        (e) => e.code === 'STALE_REVIEW',
    );
});

test('host credential preview never inserts identities or synchronizes live nodes', async () => {
    const { HostAccessService } = source('common/host-policy/host-access.service.ts', {
        '@common/utils/bounded-work-queue': { BoundedWorkQueue: class {} },
    });
    const service = Object.create(HostAccessService.prototype);
    service.db = new Proxy(
        {},
        {
            get() {
                throw Error('unexpected database write');
            },
        },
    );
    service.policies = {
        scopes: async () => ({ protectedInboundIds: new Set([U]) }),
        keys: () => ({ vlessUuid: 'scoped-fixture-key' }),
    };
    let allowed = new Set([U]);
    service.checkAccess = async () => allowed;
    service.synchronizeUser = () => {
        throw Error('unexpected live synchronization');
    };
    const user = {
        id: 1n,
        vlessUuid: 'parent',
        hostIdentityContext: { hwid: 'device', parentVlessUuid: 'parent', preview: true },
    };
    const result = await service.prepare(user, [{ uuid: U, configProfileInboundUuid: U }]);
    assert.equal(result.get(U).vlessUuid, 'scoped-fixture-key');
    allowed = new Set();
    assert.equal(
        (await service.prepare(user, [{ uuid: U, configProfileInboundUuid: U }])).get(U),
        null,
    );
});

test('device preview renders through production subscription logic without device or history writes', async () => {
    class UserQuery {}
    class DeviceQuery {}
    class HostsQuery {}
    class SettingsQuery {}
    class DevicesQuery {}
    class Config {
        constructor(value) {
            Object.assign(this, value);
        }
    }
    class Missing {}
    const { SubscriptionService } = source('modules/subscription/subscription.service.ts', {
        '@integration-modules/notifications/interfaces': {},
        '@modules/users/queries/get-user-by-unique-field': { GetUserByUniqueFieldQuery: UserQuery },
        '@modules/hwid-user-devices/queries/check-hwid-exists/check-hwid-exists.query': {
            CheckHwidExistsQuery: DeviceQuery,
        },
        '@modules/hwid-user-devices/queries/get-user-devices.query': {
            GetUserDevicesQuery: DevicesQuery,
        },
        '@modules/subscription-settings/queries/get-cached-subscrtipion-settings': {
            GetCachedSubscriptionSettingsQuery: SettingsQuery,
        },
        '../hosts/queries/get-hosts-for-user': { GetHostsForUserQuery: HostsQuery },
        '@libs/contracts/constants': {
            USERS_STATUS: { ACTIVE: 'ACTIVE', DISABLED: 'DISABLED', EXPIRED: 'EXPIRED' },
        },
        '@modules/hosts/utils/host-traffic-limit': {
            isHostTrafficLimited: () => false,
            isHostTrafficPaused: () => false,
        },
        '@modules/subscription-template/constants': {
            isExtendedClient: () => true,
            isJsonSubscriptionFallbackSupported: () => true,
        },
        './models': {
            SubscriptionWithConfigResponse: Config,
            SubscriptionNotFoundResponse: Missing,
            SubscriptionUnavailableResponse: Missing,
        },
    });
    const user = {
        id: 1n,
        shortUuid: 'fixture',
        vlessUuid: U,
        status: 'ACTIVE',
        expireAt: new Date(Date.now() + 86400000),
    };
    const settings = {
        hwidSettings: { enabled: true },
        customRemarks: {},
        customResponseHeaders: {},
        responseRules: {},
        serveJsonAtBaseSubscription: true,
    };
    const hosts = [
        {
            uuid: U,
            remark: 'Test host',
            tags: [],
            excludeFromSubscriptionTypes: [],
            xrayJsonTemplateUuid: null,
            speedLimitMbps: 20,
            deviceSpeedLimitMbps: 10,
        },
    ];
    const device = {
        hwid: 'fixture-device',
        userAgent: 'Happ/3.0',
        platform: 'android',
        blocked: false,
    };
    const forbidden = () => {
        throw Error('preview performed a live mutation');
    };
    const service = Object.create(SubscriptionService.prototype);
    Object.assign(service, {
        subPublicDomain: 'sub.example.test',
        logger: { error: forbidden },
        queryBus: {
            execute: async (query) =>
                query instanceof UserQuery
                    ? { isOk: true, response: user }
                    : query instanceof DevicesQuery
                      ? [device]
                      : query instanceof SettingsQuery
                        ? settings
                        : query instanceof DeviceQuery
                          ? { isOk: true, response: { exists: true, blocked: false } }
                          : query instanceof HostsQuery
                            ? { isOk: true, response: hosts }
                            : forbidden(),
        },
        deviceAccess: {
            enabled: true,
            registrationDenied: async () => false,
            credentials: () => ({ vlessUuid: 'device-key' }),
            linkToken: () => 'token',
            register: forbidden,
        },
        srrMatcher: {
            matchRules: async () => ({
                matched: true,
                responseType: 'XRAY_JSON',
                matchedRule: { name: 'Happ' },
            }),
        },
        applyMaybeExternalSquadOverrides: async () => ({ subscriptionSettings: settings }),
        getUserProfileHeadersInfo: () => ({}),
        checkHwidDeviceLimit: forbidden,
        checkAndUpsertHwidUserDevice: forbidden,
        updateAndReportSubscriptionRequest: forbidden,
        renderTemplatesService: {
            generateSubscription: async ({ user, hosts, srrContext }) => {
                assert.equal(user.hostIdentityContext.preview, true);
                assert.equal(user.vlessUuid, 'device-key');
                assert.equal(hosts.length, 1);
                srrContext.headersToApply = { routing: 'fixture-routing-profile' };
                return { subscription: '{"fixture":true}', contentType: 'application/json' };
            },
        },
    });
    const report = await service.previewDevice(1n, device.hwid, 'base', undefined, true);
    assert.equal(report.geofileDelivery, 'downloadProfile');
    assert.equal(report.rule, 'Happ');
    assert.equal(report.hosts[0].included, true);
    assert.equal(report.config, '{"fixture":true}');
    assert.equal(user.hostIdentityContext, undefined, 'original user was not modified');
    await assert.rejects(
        service.previewDevice(1n, 'unknown-device', 'base'),
        /Registered device not found/,
    );
});
