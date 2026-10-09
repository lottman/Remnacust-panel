const assert = require('node:assert/strict');
const { test } = require('node:test');
const { source } = require('./upstream-filter-fixture.cjs');
const { XrayJsonGeneratorService } = source(
    'modules/subscription-template/generators/xray-json.generator.service.ts',
    {
        '../host-mapper': { applyHostMapper: outbound => outbound },
        '@common/utils': { isNonEmptyObject: value => value && Object.keys(value).length > 0 },
    },
);

function host(uuid, isHidden = true) {
    return {
        protocol: 'vless', address: `${uuid}.example.com`, port: 443,
        protocolOptions: { id: '00000000-0000-4000-8000-000000000001', flow: '' },
        transport: 'xhttp', transportOptions: { host: `${uuid}.example.com`, path: '/tunnel', mode: 'packet-up' },
        security: 'tls', securityOptions: { serverName: `${uuid}.example.com`, fingerprint: 'firefox' },
        streamOverrides: {}, mux: {}, finalRemark: uuid,
        metadata: { uuid, isHidden, tags: [], excludeFromSubscriptionTypes: [] },
        clientOverrides: { mapper: { xrayJson: null } },
    };
}

async function generate(hosts, values, selectFrom) {
    const template = {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }, { tag: 'block', protocol: 'blackhole' }],
        remnawave: { injectHosts: [{ selector: { type: 'uuids', values }, tagPrefix: 'p', ...(selectFrom && { selectFrom }) }] },
        burstObservatory: { subjectSelector: ['p'] },
    };
    const generator = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => template });
    return JSON.parse(await generator.generateConfig({ hosts, isExtendedClient: false }));
}

test('all three hidden XHTTP/TLS hosts are injected in selector order into one visible profile', async () => {
    const configs = await generate(
        [host('recipient', false), host('vkcdn'), host('ddos-guard'), host('yccdn')],
        ['ddos-guard', 'vkcdn', 'yccdn'],
    );
    assert.equal(configs.length, 1);
    const proxies = configs[0].outbounds.filter(outbound => outbound.protocol === 'vless');
    assert.deepEqual(proxies.map(outbound => outbound.tag), ['p', 'p-2', 'p-3']);
    assert.deepEqual(proxies.map(outbound => outbound.settings.vnext[0].address),
        ['ddos-guard.example.com', 'vkcdn.example.com', 'yccdn.example.com']);
    assert.ok(proxies.every(outbound => outbound.streamSettings.network === 'xhttp' && outbound.streamSettings.security === 'tls'));
    assert.deepEqual(configs[0].outbounds.slice(3).map(outbound => outbound.tag), ['direct', 'block']);
    assert.deepEqual(configs[0].burstObservatory.subjectSelector, ['p']);
    assert.equal(configs[0].remnawave, undefined);
});

test('default hidden-only selection does not inject visible copies with the same remark', async () => {
    const visible = host('visible-vkcdn', false);
    visible.finalRemark = 'vkcdn';
    const [config] = await generate([host('recipient', false), host('ddos-guard'), visible], ['ddos-guard', 'vkcdn']);
    assert.deepEqual(config.outbounds.filter(outbound => outbound.protocol === 'vless').map(outbound => outbound.settings.vnext[0].address), ['ddos-guard.example.com']);
});

test('ALL selection supports visible and hidden hosts but excludes the recipient itself', async () => {
    const [config] = await generate([host('recipient', false), host('ddos-guard'), host('vkcdn', false), host('yccdn')],
        ['recipient', 'ddos-guard', 'vkcdn', 'yccdn'], 'ALL');
    assert.deepEqual(config.outbounds.filter(outbound => outbound.protocol === 'vless').map(outbound => outbound.tag), ['p', 'p-2', 'p-3']);
});

test('UUIDs unavailable in the resolved subscription cannot bypass upstream access filtering', async () => {
    const [config] = await generate([host('recipient', false), host('ddos-guard')], ['ddos-guard', 'vkcdn', 'yccdn'], 'ALL');
    assert.deepEqual(config.outbounds.filter(outbound => outbound.protocol === 'vless').map(outbound => outbound.settings.vnext[0].address), ['ddos-guard.example.com']);
});
