require('reflect-metadata');
const path = require('node:path');
const common = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const { mocks, pool, regex } = require('./client-pool-fixture.cjs');
const constants = require('../libs/contract/build/backend/constants');
const root = path.join(__dirname, '../src');
const generatorRoot = path.join(root, 'modules/subscription-template/generators');
const logger = { error() {}, warn() {}, log() {} };
const models = {
    ...source('modules/subscription/models/subscription-with-config.response.model.ts'),
    ...source('modules/subscription/models/subscription-not-found.response.model.ts'),
    ...source('modules/subscription/models/subscription-raw.response.model.ts'),
};
const { SubscriptionTemplateService } = source(
    'modules/subscription-template/subscription-template.service.ts',
    {
        '@libs/contracts/constants': constants,
        '@common/utils': {
            YAML_MERGE_SCHEMA: source('common/utils/yaml-merge-schema.util.ts').YAML_MERGE_SCHEMA,
        },
    },
);
const generatorMocks = {
    ...mocks,
    './client-pool': pool,
    '@common/utils': {
        isNonEmptyObject: (value) => !!value && Object.keys(value).length > 0,
        parseIntRangeUtil: (value) => [Number(value)],
    },
    '@libs/contracts/constants': constants,
    '../host-mapper': {
        applyHostMapper: source(
            'modules/subscription-template/host-mapper/apply-host-mapper.util.ts',
        ).applyHostMapper,
    },
};
const classes = [
    ['singbox', 'SingBoxGeneratorService'],
    ['mihomo', 'MihomoGeneratorService'],
    ['clash', 'ClashGeneratorService'],
    ['xray-json', 'XrayJsonGeneratorService'],
].map(
    ([file, name]) =>
        load(path.join(generatorRoot, file + '.generator.service.ts'), generatorMocks)[name],
);
const { RenderTemplatesService } = source(
    'modules/subscription-template/render-templates.service.ts',
    {
        '@libs/contracts/constants': constants,
        './constants/config-types': load(
            path.join(root, 'modules/subscription-template/constants/config-types.ts'),
            { '@libs/contracts/constants': constants },
        ),
        './geofiles/automatic-xray-delivery': load(
            path.join(root, 'modules/subscription-template/geofiles/automatic-xray-delivery.ts'),
            { ...mocks, '../generators/client-pool': pool, './client-pool': pool },
        ),
        './geofiles/xray-geofile-delivery': load(
            path.join(root, 'modules/subscription-template/geofiles/xray-geofile-delivery.ts'),
            { ...mocks, '../generators/client-pool': pool },
        ),
    },
);
const { SubscriptionService } = source('modules/subscription/subscription.service.ts', {
    '@integration-modules/notifications/interfaces': {},
    '@libs/contracts/constants': constants,
    '@modules/users/queries/get-user-by-unique-field': { GetUserByUniqueFieldQuery: class {} },
    '../hosts/queries/get-hosts-for-user': { GetHostsForUserQuery: class {} },
    '@modules/hosts/utils/host-traffic-limit': load(
        path.join(root, 'modules/hosts/utils/host-traffic-limit.ts'),
    ),
    '../../common/utils/geofile-request-context': load(
        path.join(root, 'common/utils/geofile-request-context.ts'),
    ),
    '../../common/utils/subscription-domain-url': load(
        path.join(root, 'common/utils/subscription-domain-url.ts'),
    ),
    './models': models,
});

function host(index = 0, remark = 'node-' + index) {
    return {
        protocol: 'shadowsocks',
        protocolOptions: { password: 'fixture-password', method: 'aes-128-gcm' },
        address: 'node.example.test',
        port: 443,
        transport: 'tcp',
        transportOptions: {},
        security: 'none',
        securityOptions: {},
        finalRemark: remark,
        streamOverrides: { finalMask: null, sockopt: null },
        mux: null,
        clientOverrides: { mapper: { mihomo: null, singbox: null, xray: null } },
        metadata: {
            uuid: '10000000-0000-4000-8000-' + String(index).padStart(12, '0'),
            tags: [],
            isHidden: false,
            excludeFromSubscriptionTypes: [],
        },
    };
}

function generators(templates) {
    return classes.map((Generator) => {
        const generator = new Generator(templates);
        generator.logger = logger;
        return generator;
    });
}

function templateService(repository, cache) {
    const service = new SubscriptionTemplateService(repository, cache, {});
    service.logger = logger;
    return service;
}

function subscriptionService(templates, hosts = [host()]) {
    const [sing, mihomo, clash, xray] = generators(templates);
    const resolver = { resolveProxyConfig: async () => hosts };
    const render = new RenderTemplatesService(resolver, mihomo, clash, {}, sing, xray, {
        retireRoutingProfileRevision: async () => null,
    });
    const service = Object.create(SubscriptionService.prototype);
    const settings = {
        hwidSettings: { enabled: false },
        customRemarks: { emptyHosts: [] },
        customResponseHeaders: {},
    };
    const user = {
        id: 1n,
        status: 'ACTIVE',
        expireAt: new Date(Date.now() + 86400000),
        shortUuid: 'fixture123',
    };
    Object.assign(service, {
        logger,
        subPublicDomain: 'subscription.example.test',
        queryBus: {
            execute: async (query) => ({
                isOk: true,
                response: query.constructor.name === 'GetUserByUniqueFieldQuery' ? user : [],
            }),
        },
        deviceAccess: { enabled: false, registrationDenied: async () => false },
        renderTemplatesService: render,
        applyMaybeExternalSquadOverrides: async () => ({ subscriptionSettings: settings }),
        checkAndUpsertHwidUserDevice: async () => {},
        updateAndReportSubscriptionRequest: async () => {},
        getUserProfileHeadersInfo: () => ({}),
    });
    return { service, settings };
}

async function httpController(service, settings = {}) {
    const { Endpoint } = source('common/decorators/base-endpoint/base-endpoint.ts', {
        '@common/decorators/scopes': source('common/decorators/scopes/scopes.ts'),
    });
    const filter = load(path.join(root, 'common/exception/http-exception.filter.ts'), {
        '@common/utils/http-log-path': load(path.join(root, 'common/utils/http-log-path.ts')),
    });
    const budget = load(path.join(root, 'common/middlewares/subscription-budget.middleware.ts'));
    const { SubscriptionController } = source(
        'modules/subscription/controllers/subscription.controller.ts',
        {
            '@common/decorators/base-endpoint': { Endpoint },
            '@common/decorators/get-srr-context': {
                GetSrrContext: common.createParamDecorator((_data, ctx) => ({
                    matchedResponseType:
                        ctx.switchToHttp().getRequest().params.clientType ?? 'SINGBOX',
                    subscriptionSettings: settings,
                    userAgent: 'fixture-client',
                })),
            },
            '@common/exception/http-exception.filter': filter,
            '@common/exception/public-http-exception.filter': load(
                path.join(root, 'common/exception/public-http-exception.filter.ts'),
            ),
            '@common/helpers/error-handler.helper': { errorHandler: (result) => result.response },
            '@common/middlewares/subscription-budget.middleware': budget,
            '@libs/contracts/api': require('../libs/contract/build/backend/api'),
            '@libs/contracts/commands': require('../libs/contract/build/backend/commands'),
            '../models': models,
            '../utils/send-subscription-body': load(
                path.join(root, 'modules/subscription/utils/send-subscription-body.ts'),
            ),
        },
    );
    const serviceToken = Symbol('subscription-service');
    const encryptionToken = Symbol('subscription-encryption');
    common.Inject(serviceToken)(SubscriptionController, undefined, 0);
    common.Inject(encryptionToken)(SubscriptionController, undefined, 1);
    class Root {}
    common.Module({
        controllers: [SubscriptionController],
        providers: [
            { provide: serviceToken, useValue: service },
            { provide: encryptionToken, useValue: {} },
        ],
    })(Root);
    const app = await NestFactory.create(Root, { logger: false });
    app.use(
        load(path.join(root, 'common/middlewares/auth-response-cache.middleware.ts'))
            .authResponseCache,
    );
    app.use(budget.subscriptionBudget());
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    return { app, base: await app.getUrl() };
}

module.exports = {
    generators,
    templateService,
    subscriptionService,
    httpController,
    host,
    models,
    pool,
    mocks,
    regex,
    generatorRoot,
    load,
};
