const test = require('node:test');
const assert = require('node:assert/strict');
const { source } = require('./upstream-filter-fixture.cjs');
const constants = require('../libs/contract/build/backend/constants');
const { RenderTemplatesService } = source('modules/subscription-template/render-templates.service.ts', {
    '@libs/contracts/constants': constants,
    './constants/config-types': { SUBSCRIPTION_CONFIG_TYPES: { XRAY_JSON: { CONTENT_TYPE: 'application/json' } } },
    './geofiles/xray-geofile-delivery': { xrayGeofileClient: () => undefined },
    './geofiles/automatic-xray-delivery': { automaticXrayDelivery: async ({ generate }) => ({ subscription: await generate(), inline: true }) },
});
const { XrayJsonGeneratorService } = source('modules/subscription-template/generators/xray-json.generator.service.ts', {
    '../host-mapper': { applyHostMapper: value => value },
    '@common/utils': { isNonEmptyObject: value => value && Object.keys(value).length > 0 },
});
function host() {
    return {
        protocol: 'vless', address: 'support.example.test', port: 443,
        protocolOptions: { id: '11111111-1111-4111-8111-111111111111', flow: '' },
        transport: 'tcp', transportOptions: {}, security: 'tls', securityOptions: { serverName: 'support.example.test' },
        streamOverrides: {}, mux: {}, finalRemark: 'Support',
        metadata: { uuid: '22222222-2222-4222-8222-222222222222', alwaysAvailable: true, isHidden: false, excludeFromSubscriptionTypes: [], domainRules: { mode: 'ALLOW_ONLY', domains: ['t.me', '149.154.160.0/20', '2001:b28:f23d::/48'] } },
        clientOverrides: { mapper: { xrayJson: null }, xrayJsonTemplate: { remnacust: { geofiles: [{ id: 'unavailable-file' }] } } },
    };
}

test('inactive JSON delivers an exception without preparing shared or assigned geofiles', async () => {
    const generator = new XrayJsonGeneratorService({
        getCachedTemplateByType: async () => { throw Error('shared geofile cannot be delivered'); },
        prepareClientTemplate: async () => { throw Error('assigned geofile cannot be delivered'); },
    });
    for (const extended of [false, true]) {
        const [config] = JSON.parse(await generator.generateConfig({ hosts: [host()], isExtendedClient: extended, subscriptionInactive: true }));
        assert.equal(config.remarks, 'Support');
        assert.deepEqual(config.inbounds, [], 'INCY must recognize this as a full config and retain host routing');
        assert.equal(config.outbounds[0].settings.vnext[0].address, 'support.example.test');
        assert.equal(config.outbounds[0].streamSettings.security, 'tls');
        assert.deepEqual(config.routing.rules, [
            { domain: ['domain:t.me'], outboundTag: 'proxy' },
            { ip: ['149.154.160.0/20', '2001:b28:f23d::/48'], outboundTag: 'proxy' },
            { network: 'tcp,udp', outboundTag: 'block' },
        ]);
        assert(config.outbounds.some(o => o.tag === 'block' && o.protocol === 'blackhole'));
        assert.equal(config.remnacust, undefined);
        assert.equal(config.meta?.alwaysAvailable, extended ? true : undefined);
    }
});

test('active JSON retains assigned and shared templates while DENY separates domain and IP rules', async () => {
    const template = { outbounds: [{ tag: 'direct', protocol: 'freedom' }], dns: { servers: ['localhost'] }, routing: { rules: [{ network: 'tcp', outboundTag: 'direct' }] } };
    const generator = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => template });
    const input = host();
    delete input.clientOverrides.xrayJsonTemplate;
    input.metadata.domainRules.mode = 'DENY';
    const [config] = JSON.parse(await generator.generateConfig({ hosts: [input], isExtendedClient: false }));
    assert.deepEqual(config.dns, template.dns);
    assert.deepEqual(config.routing.rules, [
        { domain: ['domain:t.me'], outboundTag: 'block' },
        { ip: ['149.154.160.0/20', '2001:b28:f23d::/48'], outboundTag: 'block' },
        ...template.routing.rules,
    ]);
    assert.deepEqual(template.routing.rules, [{ network: 'tcp', outboundTag: 'direct' }]);
});

test('the renderer isolates inactive JSON by account status and expiry without changing active templates', async () => {
    for (const [status, expired, expected] of [['EXPIRED', false, true], ['FROZEN', false, true], ['DISABLED', false, true], ['LIMITED', false, true], ['ACTIVE', true, true], ['ACTIVE', false, false]]) {
        const renderer = Object.create(RenderTemplatesService.prototype);
        renderer.resolveProxyConfigService = { resolveProxyConfig: async () => [host()] };
        let actual;
        renderer.xrayJsonGeneratorService = { generateConfig: async options => { actual = options.subscriptionInactive; return '[]'; } };
        await renderer.generateSubscription({
            user: { id: 42n, status, expireAt: new Date(expired ? 0 : Date.now() + 86400000) },
            srrContext: { matchedResponseType: 'XRAY_JSON', userAgent: 'fixture', subscriptionSettings: {} },
        });
        assert.equal(actual, expected, `${status}, expired=${expired}`);
    }
});
