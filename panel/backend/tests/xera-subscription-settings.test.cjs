const assert = require('node:assert/strict');
const test = require('node:test');
const { source } = require('./upstream-filter-fixture.cjs');

const { ResolveProxyConfigService } = source('modules/subscription-template/resolve-proxy/resolve-proxy-config.service.ts');
const resolver = Object.create(ResolveProxyConfigService.prototype);

test('Xera subscription retains client options and removes server tuning at both supported locations', () => {
    for (const extra of [false, true]) {
        const options = {
            serverMaxBufferedBytes: 67108864, serverMaxSessions: 128,
            serverMaxHeaderBytes: 32768, h2Params: { MaxConcurrentStreams: 128 },
            xPaddingMethod: 'tokenish', xPaddingBytes: '96-192',
            sessionIDPlacement: 'header', sessionIDKey: 'X-Stream', seqPlacement: 'query', seqKey: 'part',
            uplinkHTTPMethod: 'POST', uplinkDataPlacement: 'body',
            customDownlinkPadding: { header: 'X-Local-Profile', token: 'synthetic-test-token', uplink: true },
            xmux: { hKeepAlivePeriod: -1 },
            downloadSettings: { address: 'download.example.test', port: 443, network: 'xera-http' },
        };
        const settings = { path: '/connect', host: 'cdn.example.test', mode: 'stream-auto',
            ...(extra ? { extra: options } : options) };
        const original = structuredClone(settings);
        const result = resolver.resolveXeraHttp(settings, { path: null, host: null });
        assert.equal(result.transport, 'xera-http');
        assert.deepEqual(settings, original);
        const expected = structuredClone(original);
        const target = extra ? expected.extra : expected;
        for (const key of ['serverMaxBufferedBytes', 'serverMaxSessions', 'serverMaxHeaderBytes', 'h2Params']) delete target[key];
        assert.deepEqual(result.transportOptions.settings, expected);
    }
});

test('missing host overrides preserve profile values; explicit overrides still apply', () => {
    const settings = { path: '/original', host: 'original.example.test', mode: 'stream-auto' };
    assert.deepEqual(resolver.resolveXeraHttp(settings, {}).transportOptions.settings, settings);
    resolver.resolveRandomizedValue = value => value;
    assert.deepEqual(resolver.resolveXeraHttp(settings, { path: '/client', host: 'edge.example.test' }).transportOptions.settings,
        { ...settings, path: '/client', host: 'edge.example.test' });
});

test('Xray JSON and connection links deliver the same resolved Xera client settings', async () => {
    const { XrayJsonGeneratorService } = source('modules/subscription-template/generators/xray-json.generator.service.ts', {
        '@common/utils': { isNonEmptyObject: value => value && Object.keys(value).length > 0 },
        '../host-mapper': { applyHostMapper: value => value },
    });
    const { XrayGeneratorService } = source('modules/subscription-template/generators/xray.generator.service.ts');
    const transport = resolver.resolveXeraHttp({
        path: '/connect', mode: 'stream-auto', extra: {
            serverMaxSessions: 128, h2Params: { MaxConcurrentStreams: 128 },
            xPaddingMethod: 'tokenish', customDownlinkPadding: {
                header: 'X-Local-Profile', token: 'synthetic-test-token', uplink: true,
            }, xmux: { hKeepAlivePeriod: -1 },
        },
    }, { path: null, host: null });
    const host = {
        ...transport, protocol: 'vless',
        protocolOptions: { id: '00000000-0000-4000-8000-000000000001', encryption: 'none' },
        address: 'node.example.test', port: 443, security: 'none', securityOptions: {},
        finalRemark: 'Synthetic Xera', streamOverrides: { sockopt: null, finalMask: null }, mux: null,
        metadata: { uuid: '00000000-0000-4000-8000-000000000002', tags: [], isHidden: false, excludeFromSubscriptionTypes: [] },
        clientOverrides: { mapper: { xrayJson: null, xrayBase64: null }, serverDescription: null },
    };
    const json = JSON.parse(await new XrayJsonGeneratorService({
        getCachedTemplateByType: async () => ({ outbounds: [] }),
    }).generateConfig({ hosts: [host], isExtendedClient: false }));
    assert.equal(json.length, 1);
    assert.equal(json[0].outbounds[0].streamSettings.network, 'xera-http');
    assert.deepEqual(json[0].outbounds[0].streamSettings.xeraHttpSettings, transport.transportOptions.settings);
    const links = new XrayGeneratorService().generateLinks([host], false);
    assert.equal(links.length, 1);
    const url = new URL(links[0]);
    assert.equal(url.searchParams.get('type'), 'xera-http');
    assert.deepEqual(JSON.parse(url.searchParams.get('xeraSettings')), transport.transportOptions.settings);
});
