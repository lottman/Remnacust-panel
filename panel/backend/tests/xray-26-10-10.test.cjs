const test = require('node:test');
const assert = require('node:assert/strict');
const {source} = require('./upstream-filter-fixture.cjs');
const {XRayConfig} = source('common/helpers/xray-config/xray-config.validator.ts', {
    './ss-cipher': source('common/helpers/xray-config/ss-cipher.ts'),
});
const {XrayJsonGeneratorService} = source('modules/subscription-template/generators/xray-json.generator.service.ts', {
    './inject-host-selection': source('modules/subscription-template/generators/inject-host-selection.ts'),
    '../host-mapper': {applyHostMapper: outbound => outbound},
    '@common/utils': {isNonEmptyObject: value => value && Object.keys(value).length > 0},
});
const inline = code => 'base64:' + Buffer.from(code).toString('base64');

test('XDNS DoH resolver, fronting and QUIC parameters survive real profile preparation', () => {
    const settings={domains:[{names:['mask.example.test']}],resolvers:[{
        addrs:['https://resolver.example.test/dns-query'],worker:4,
        tlsConfig:{serverName:'front.example.test',alpn:['h3']},quicConfig:{congestion:'bbr',bbrProfile:'aggressive'},
    },{type:'udp',settings:{addr:'127.0.0.1:5353'}}]};
    const raw={inbounds:[{tag:'IN',protocol:'vless',port:443,settings:{decryption:'none',clients:[]}}],outbounds:[{tag:'direct',protocol:'freedom',streamSettings:{
        finalmask:{udp:[{type:'xdns',settings}]}}}]};
    const profile=new XRayConfig(structuredClone(raw));
    profile.replaceSnippets(new Map());
    const prepared=profile.getSortedConfig();
    assert.deepEqual(prepared.outbounds[0].streamSettings.finalmask.udp[0].settings,settings);
    const before=profile.getConfigHash();
    prepared.outbounds[0].streamSettings.finalmask.udp[0].settings.resolvers[0].worker=8;
    assert.notEqual(profile.getConfigHash(),before);
    assert.equal(settings.resolvers[0].worker,4);
});

test('Lua DNS/routing and TLS root selection survive profile preparation and affect its hash', () => {
    const raw = {
        inbounds: [{tag:'IN',protocol:'vless',port:443,settings:{decryption:'none',clients:[{id:'old'}]}}],
        outbounds: [{tag:'direct',protocol:'freedom',streamSettings:{security:'tls',tlsSettings:{useSystemCA:true}}}],
        dns: {servers:['localhost'],script:inline('function HandleDNSQuery(domain, option) return {} end')},
        routing: {script:inline('function PickRoute(ctx) return "direct" end')},
    };
    const profile = new XRayConfig(structuredClone(raw));
    profile.cleanInboundClients(false);
    profile.replaceSnippets(new Map());
    const prepared = profile.getSortedConfig();
    assert.deepEqual(prepared.dns,raw.dns);
    assert.deepEqual(prepared.routing,raw.routing);
    assert.equal(prepared.outbounds[0].streamSettings.tlsSettings.useSystemCA,true);
    const originalHash = profile.getConfigHash();
    prepared.routing.script=inline('function PickRoute(ctx) return "other" end');
    assert.notEqual(profile.getConfigHash(),originalHash);
    assert.equal(raw.inbounds[0].settings.clients.length,1,'Source profile was not mutated');
});

test('MASQUE XMUX survives the real resolver and JSON generator without exposing inbound auth', () => {
    const {ResolveProxyConfigService}=source('modules/subscription-template/resolve-proxy/resolve-proxy-config.service.ts', {
        '@common/helpers/xray-config/ss-cipher': source('common/helpers/xray-config/ss-cipher.ts'),
    });
    const settings={network:'masque',security:'tls',masqueSettings:{path:'/ip/',
        headers:{Authorization:'inbound-secret','X-Route':'public'},
        xmux:{maxConnections:2,hMaxReusableSecs:'100-200'}}};
    const resolver=new ResolveProxyConfigService({getOrThrow:()=> 'example.test'},{});
    const user={id:42n,xrayUsername:'42~device',vlessUuid:'personal'};
    const protocol=resolver.resolveProtocolOptions({}, {protocol:'masque',settings:{}}, user);
    const transport=resolver.resolveTransport(settings,{},protocol,user);
    const generated=new XrayJsonGeneratorService({}).buildTransportEntry(transport);
    assert.deepEqual(generated.masqueSettings.xmux,settings.masqueSettings.xmux);
    assert.deepEqual(generated.masqueSettings.headers,{'X-Route':'public'});
    assert.equal(generated.masqueSettings.pass,'personal');
    assert.equal(settings.masqueSettings.headers.Authorization,'inbound-secret');
});

test('JSON template scripts remain unchanged when generating a normal host subscription', async () => {
    const template={dns:{servers:['localhost'],script:inline('dns')},routing:{script:inline('routing')},outbounds:[{
        tag:'warp',protocol:'masque',settings:{address:'example.test',port:443},streamSettings:{network:'masque',security:'tls',
            masqueSettings:{warp:{privateKey:'fixture-private',publicKey:'fixture-public',address:['10.0.0.2/32']},xmux:{maxConnections:2}}}}]};
    const generator=new XrayJsonGeneratorService({getCachedTemplateByType:async()=>structuredClone(template)});
    const host={protocol:'vless',address:'example.test',port:443,protocolOptions:{id:'aaaaaaaa-1111-4111-8111-111111111111',flow:''},
        transport:'tcp',transportOptions:{},security:'none',streamOverrides:{},mux:{},finalRemark:'test',
        metadata:{excludeFromSubscriptionTypes:[]},clientOverrides:{mapper:{xrayJson:null}}};
    const output=JSON.parse(await generator.generateConfig({hosts:[host],isExtendedClient:false}));
    assert.equal(output.length,1);
    assert.deepEqual(output[0].dns,template.dns);
    assert.deepEqual(output[0].routing,template.routing);
    assert.deepEqual(output[0].outbounds[1],template.outbounds[0]);
    assert.equal(output[0].outbounds[0].protocol,'vless');
});
