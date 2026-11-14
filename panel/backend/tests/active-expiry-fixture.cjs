const path = require('node:path');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const delivery = require('./subscription-delivery-fixture.cjs');
const root = path.join(__dirname, '..');
const contract = load(
    path.join(root, 'libs/contract/models/subscription-settings/custom-remarks.schema.ts'),
);
const constants = require('../libs/contract/build/backend/constants');
const schemaPath = '@libs/contracts/models/subscription-settings/custom-remarks.schema';
const active = load(path.join(root, 'src/modules/subscription/utils/active-expiry-remarks.ts'), {
    [schemaPath]: contract,
});
const directory = path.join(root, 'src/common/utils/templates');
const variables = load(path.join(directory, 'template-variables.ts'), {
    '@libs/contracts/constants': constants,
    '@libs/contracts/constants/templates/template-keys': load(
        path.join(root, 'libs/contract/constants/templates/template-keys.ts'),
    ),
});
const parser = load(path.join(directory, 'template-parser.ts'), {
    './template-variables': variables,
});
const { TemplateEngine } = load(path.join(directory, 'replace-templates-values.ts'), {
    '@common/utils/frozen-user-lifetime': load(path.join(directory, '../frozen-user-lifetime.ts')),
    '@libs/contracts/constants': constants,
    '../bytes': load(path.join(directory, '../bytes/pretty-bytes.util.ts')),
    '../geofile-request-context': load(path.join(directory, '../geofile-request-context.ts')),
    '../get-next-traffic-reset-at.util': load(
        path.join(directory, '../get-next-traffic-reset-at.util.ts'),
        { '@libs/contracts/constants': constants },
    ),
    './get-next-location-reset-at': load(path.join(directory, 'get-next-location-reset-at.ts')),
    './template-parser': parser,
    './template-variables': variables,
});
const action = load(path.join(directory, 'render-subscription-action.ts'), {
    [schemaPath]: contract,
    './replace-templates-values': { TemplateEngine },
});
const { ResolveProxyConfigService } = source(
    'modules/subscription-template/resolve-proxy/resolve-proxy-config.service.ts',
    {
        '@libs/contracts/constants': constants,
        '@modules/hosts/utils/host-traffic-limit': source(
            'modules/hosts/utils/host-traffic-limit.ts',
        ),
        '@modules/subscription/utils/registration-blocked-remarks': source(
            'modules/subscription/utils/registration-blocked-remarks.ts',
            {
                '@common/utils/templates/is-text-remark': load(
                    path.join(directory, 'is-text-remark.ts'),
                ),
            },
        ),
        '@modules/subscription/utils/compose-status-hwid-remarks': source(
            'modules/subscription/utils/compose-status-hwid-remarks.ts',
            {
                '@common/utils/templates/is-text-remark': load(
                    path.join(directory, 'is-text-remark.ts'),
                ),
            },
        ),
        '@common/utils/templates/is-text-remark': load(path.join(directory, 'is-text-remark.ts')),
        '@common/utils/templates/replace-templates-values': { TemplateEngine },
        '@common/utils/templates/render-subscription-action': action,
        '../../subscription/utils/active-expiry-remarks': active,
        '@common/helpers/xray-config': {
            resolveInboundAndPublicKey: async () => new Map(),
            resolveInboundAndMlDsa65PublicKey: async () => new Map(),
            resolveEncryptionFromDecryption: async () => new Map(),
        },
    },
);
class Response {
    constructor(value) {
        Object.assign(this, value);
    }
}
class GetUserByUniqueFieldQuery {
    constructor(field, includeOptions) {
        Object.assign(this, { field, includeOptions });
    }
}
class GetHostsForUserQuery {
    constructor(...args) {
        this.args = args;
    }
}
class GetCachedSubscriptionSettingsQuery {}
class GetCachedExternalSquadSettingsQuery {}
const { SubscriptionService } = source('modules/subscription/subscription.service.ts', {
    '@integration-modules/notifications/interfaces': {},
    '@libs/contracts/constants': constants,
    '@common/types': {
        ok: (response) => ({ isOk: true, response }),
        fail: (error) => ({ isOk: false, ...error }),
    },
    '@common/utils/convert-type': load(path.join(directory, '../convert-type.ts')),
    '@modules/hosts/utils/host-traffic-limit': source('modules/hosts/utils/host-traffic-limit.ts'),
    '@common/utils/templates/replace-templates-values': { TemplateEngine },
    '@common/utils/templates/render-subscription-action': action,
    '@common/utils/templates/safe-template-header': load(
        path.join(directory, 'safe-template-header.ts'),
    ),
    '@modules/users/queries/get-user-by-unique-field': { GetUserByUniqueFieldQuery },
    '@modules/subscription-settings/queries/get-cached-subscrtipion-settings': {
        GetCachedSubscriptionSettingsQuery,
    },
    '@modules/external-squads/queries/get-cached-external-squad-settings': {
        GetCachedExternalSquadSettingsQuery,
    },
    '@modules/users/models': { GetFullUserResponseModel: Response },
    '@common/utils/frozen-user-lifetime': load(path.join(directory, '../frozen-user-lifetime.ts')),
    '@common/utils/bytes/pretty-bytes.util': load(
        path.join(directory, '../bytes/pretty-bytes.util.ts'),
    ),
    '../hosts/queries/get-hosts-for-user': { GetHostsForUserQuery },
    './utils/active-expiry-remarks': active,
    './utils/get-user-info.headers': {
        getSubscriptionUserInfo: () => ({ upload: 0, download: 0, total: 0, expire: 0 }),
        getSubscriptionRefillDate: () => undefined,
    },
    './utils/host-policy-ping': { applyHostPolicyPing() {} },
    './utils/registration-blocked-remarks': source(
        'modules/subscription/utils/registration-blocked-remarks.ts',
        {
            '@common/utils/templates/is-text-remark': load(
                path.join(directory, 'is-text-remark.ts'),
            ),
        },
    ),
    '../../common/utils/geofile-request-context': load(
        path.join(directory, '../geofile-request-context.ts'),
    ),
    '../../common/utils/subscription-domain-url': load(
        path.join(directory, '../subscription-domain-url.ts'),
    ),
    './models': Object.fromEntries(
        [
            'SubscriptionWithConfigResponse',
            'SubscriptionNotFoundResponse',
            'SubscriptionUnavailableResponse',
            'RawSubscriptionWithHostsResponse',
            'SubscriptionRawResponse',
        ].map((name) => [name, Response]),
    ),
});
const { RenderTemplatesService } = source(
    'modules/subscription-template/render-templates.service.ts',
    {
        '@libs/contracts/constants': constants,
        './constants/config-types': load(
            path.join(root, 'src/modules/subscription-template/constants/config-types.ts'),
            { '@libs/contracts/constants': constants },
        ),
        './geofiles/automatic-xray-delivery': load(
            path.join(
                root,
                'src/modules/subscription-template/geofiles/automatic-xray-delivery.ts',
            ),
            {
                ...delivery.mocks,
                '../generators/client-pool': delivery.pool,
                './client-pool': delivery.pool,
            },
        ),
    },
);
const { XrayGeneratorService } = source(
    'modules/subscription-template/generators/xray.generator.service.ts',
);
const uuid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rule = (overrides = {}) => ({
    id: uuid(1),
    enabled: true,
    daysBeforeExpiry: 3,
    scope: 'all',
    internalSquadUuids: [],
    externalSquadUuids: [],
    remarks: ['Before {{USERNAME}}', '{HOSTS}', 'After'],
    ...overrides,
});
function fixture({ rules = [rule()], hosts, templates = {}, members = [uuid(102)] } = {}) {
    const user = {
        id: 42n,
        status: 'ACTIVE',
        username: 'fixture',
        expireAt: new Date(Date.now() + 86400000),
        shortUuid: 'fixture42',
        activeInternalSquads: [],
        externalSquadUuid: null,
        vlessUuid: uuid(42),
        ssPassword: 'scoped-password',
        createdAt: new Date('2026-01-01'),
        trafficLimitBytes: 0n,
        trafficLimitStrategy: 'NO_RESET',
        userTraffic: { usedTrafficBytes: 0n, lifetimeUsedTrafficBytes: 0n },
    };
    const settings = {
        isShowCustomRemarks: true,
        customRemarks: {
            ...contract.DEFAULT_SUBSCRIPTION_REMARKS,
            ...(rules === null ? {} : { activeExpiry: { rules } }),
        },
        hwidSettings: { enabled: false },
        customResponseHeaders: {},
        randomizeHosts: false,
    };
    hosts ??= [
        host(1),
        host(2, { denied: true }),
        host(3, {
            excludeFromSubscriptionTypes: [
                'CLASH',
                'MIHOMO',
                'STASH',
                'SINGBOX',
                'XRAY_JSON',
                'XRAY_BASE64',
            ],
        }),
        host(4, { tags: ['excluded'] }),
        host(5, { trafficPaused: true }),
        host(6, { onlyWhenInactive: true }),
    ];
    const prepared = [];
    const resolver = new ResolveProxyConfigService(
        { getOrThrow: () => 'sub.example.test' },
        {
            prepare: async (_user, list) => {
                prepared.push(list.map((h) => h.uuid));
                return new Map(list.map((h) => [h.uuid, h.denied ? null : user]));
            },
            prepareAutoselect: async () => new Map(),
        },
    );
    resolver.buildResolvedProxyConfig = ({ inputHost, finalRemark, user: scoped }) => ({
        ...delivery.host(inputHost.index, finalRemark),
        address: inputHost.address,
        protocolOptions: { password: scoped.ssPassword, method: 'aes-128-gcm' },
        transport: inputHost.transport ?? 'tcp',
        metadata: {
            ...delivery.host(inputHost.index).metadata,
            uuid: inputHost.uuid,
            tags: inputHost.tags,
            isDisabled: false,
            isHidden: !!inputHost.isHidden,
            excludeFromSubscriptionTypes: inputHost.excludeFromSubscriptionTypes,
        },
        clientOverrides: { mapper: {}, ...inputHost.clientOverrides },
    });
    const templateService = {
        getCachedTemplateByType: async (type) =>
            structuredClone(
                templates[type] ??
                    (type === 'SINGBOX'
                        ? { outbounds: [] }
                        : type === 'XRAY_JSON'
                          ? { outbounds: [] }
                          : { proxies: [], 'proxy-groups': [] }),
            ),
    };
    const [singbox, mihomo, clash, xrayJson] = delivery.generators(templateService);
    const links = new XrayGeneratorService();
    const render = new RenderTemplatesService(resolver, mihomo, clash, links, singbox, xrayJson, {
        retireRoutingProfileRevision: async () => null,
    });
    const service = Object.create(SubscriptionService.prototype);
    const queries = [];
    Object.assign(service, {
        logger: {
            error(error) {
                throw error;
            },
            warn() {},
        },
        subPublicDomain: 'sub.example.test',
        renderTemplatesService: render,
        resolveProxyConfigService: resolver,
        xrayGeneratorService: links,
        queryBus: {
            execute: async (query) => {
                queries.push(query);
                if (query instanceof GetCachedSubscriptionSettingsQuery) return settings;
                if (query instanceof GetUserByUniqueFieldQuery)
                    return {
                        isOk: true,
                        response: query.field.id
                            ? { ...user, activeInternalSquads: members.map((id) => ({ uuid: id })) }
                            : user,
                    };
                if (query instanceof GetHostsForUserQuery) return { isOk: true, response: hosts };
                throw new Error('Unexpected query: ' + query.constructor.name);
            },
        },
        deviceAccess: {
            enabled: false,
            registrationDenied: async () => false,
            hasBlockedDevice: async () => false,
        },
        applyMaybeExternalSquadOverrides: async () => ({ subscriptionSettings: settings }),
        checkAndUpsertHwidUserDevice: async () => {},
        updateAndReportSubscriptionRequest: async () => {},
        getUserInfo: async (_user, links) => ({ links }),
    });
    const context = (type) => ({
        subscriptionSettings: settings,
        matchedResponseType: type,
        isExtendedClient: false,
        headersToApply: {},
        excludeHostsByTags: new Set(['excluded']),
        userAgent: '',
    });
    const plan = () => service.getActiveExpiryPlan(user, settings);
    return {
        user,
        settings,
        hosts,
        resolver,
        render,
        service,
        queries,
        prepared,
        context,
        plan,
        links,
        templateService,
    };
}
function host(index, overrides = {}) {
    return {
        index,
        uuid: uuid(index + 10),
        remark: 'Host ' + index,
        address: `node-${index}.example.test`,
        tags: [],
        tagTrafficLimits: [],
        rawInbound: {},
        onlyWhenInactive: false,
        alwaysAvailable: false,
        excludeFromSubscriptionTypes: [],
        ...overrides,
    };
}
module.exports = {
    fixture,
    host,
    rule,
    uuid,
    active,
    contract,
    load,
    root,
    source,
    TemplateEngine,
    GetUserByUniqueFieldQuery,
    GetHostsForUserQuery,
    regex: delivery.regex,
};
