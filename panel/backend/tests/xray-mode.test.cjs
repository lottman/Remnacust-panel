const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { lastValueFrom, of } = require('rxjs');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src/common/xray-mode');
const policy = load(path.join(root, 'xray-mode-policy.ts'));
const { stockHostPolicy } = load(path.join(root, 'stock-host-policy.ts'));
const { XrayModeService } = load(path.join(root, 'xray-mode.service.ts'), { '@common/database/prisma.service': {} });
const { XrayModeInterceptor } = load(path.join(root, 'xray-mode.interceptor.ts'), {
    '@common/database/prisma.service': {}, './xray-mode.service': {},
});

test('stock configuration detection covers custom transports and mandatory policies with bounded complexity', () => {
    const config = { inbounds: [{ protocol: 'olcrtc', streamSettings: { network: 'xera-http' } }], routing: { rules: [{ webhook: {} }] }, remnacustUserQuotaRequired: true };
    assert.deepEqual(policy.customCoreConfigPaths(config), ['inbounds.0.protocol', 'inbounds.0.streamSettings.network', 'remnacustUserQuotaRequired', 'routing.rules.0.webhook']);
    assert.deepEqual(policy.customCoreConfigPaths({inbounds:[{protocol:'vless',streamSettings:{network:'xhttp'}}]}),[]);
    const deep = {}; let node = deep;
    for (let i = 0; i < 80; i++) node = node.next = {};
    assert.deepEqual(policy.customCoreConfigPaths(deep), ['configuration-complexity-limit']);
    const cycle = {}; cycle.self = cycle;
    assert.deepEqual(policy.customCoreConfigPaths(cycle), []);
});

test('global flavor replaces only delivered core selectors and never mutates saved profiles', () => {
    const input = { geodata: { core: { url: 'https://example.test/core' }, geosite: 'site.dat' }, remnacustProfileGraphs: { graphs: [{ config: { geodata: { core: {}, geoip: 'ip.dat' } } }] } };
    const copy = structuredClone(input);
    const output = policy.withCoreFlavor(input, 'custom');
    assert.deepEqual(input, copy);
    assert.deepEqual(output.geodata, {geosite:'site.dat',remnacustCoreFlavor:'custom'});
    assert.deepEqual(output.remnacustProfileGraphs.graphs[0].config.geodata,{geoip:'ip.dat',remnacustCoreFlavor:'custom'});
});

test('stock mode preserves the stored host policy while disabling its effective extensions', () => {
    class Host {}
    const input = Object.assign(new Host(), {speedLimitMbps:100,domainRules:{mode:'ALLOW'},effectiveLimitBytes:100n,tagTrafficLimits:[{limitBytes:30n}],alwaysAvailable:true});
    const output = stockHostPolicy(input);
    assert.ok(output instanceof Host);
    assert.equal(output.speedLimitMbps,null); assert.equal(output.effectiveLimitBytes,0n);
    assert.deepEqual(output.tagTrafficLimits,[]); assert.equal(output.alwaysAvailable,false);
    assert.equal(input.speedLimitMbps,100); assert.equal(input.effectiveLimitBytes,100n);
});

test('mode snapshots reject stale prepared configuration after a concurrent mode change', async () => {
    let state = {mode:'custom',revision:1};
    const service = new XrayModeService({$queryRaw:async()=>[{...state}]});
    await service.withSnapshot(async()=>{
        assert.equal(await service.isCustom(),true);
        state={mode:'default',revision:2};
        assert.equal(await service.isCustom(),true);
        await assert.rejects(service.assertCurrent(),error=>error.getResponse().code==='XRAY_SETTINGS_CHANGED');
    });
    assert.equal(await service.isCustom(),false);
});

test('default transition cannot discard live port plans or quota journals', async () => {
    const tx = {$queryRaw:async(strings)=>strings.join('').includes('FOR UPDATE')?[{mode:'custom',revision:0}]:strings.join('').includes('xera_quota_node_modes')?[{uuid:'node',name:'saved quota'}]:[]};
    const service = new XrayModeService({$transaction:async(work)=>work(tx)});
    await assert.rejects(service.change('default',0),error=>error.getResponse().code==='DEFAULT_XRAY_BLOCKED');
});

for (const path of ['/api/hosts','/API/HOSTS','/api/hosts/bulk/update']) test('API stock gate blocks custom limits including case variants: '+path,async()=>{
    const guard = new XrayModeInterceptor({isCustom:async()=>false},{hosts:{findUnique:async()=>null}});
    const request={method:'PATCH',path,body:{speedLimitMbps:20}};
    await assert.rejects(guard.intercept({switchToHttp:()=>({getRequest:()=>request})},{handle:()=>of('ok')}),error=>error.getResponse().code==='CUSTOM_XRAY_REQUIRED');
});

test('stock mode permits ordinary host edits, clearing limits, and unchanged stored settings',async()=>{
    const uuid='44444444-4444-4444-8444-444444444444';
    const guard = new XrayModeInterceptor({isCustom:async()=>false},{hosts:{findUnique:async()=>({speedLimitMbps:20})}});
    for(const body of [{remark:'New name'},{speedLimitMbps:0},{uuid,speedLimitMbps:20,remark:'Independent edit'}]) {
        const stream=await guard.intercept({switchToHttp:()=>({getRequest:()=>({method:'PATCH',path:'/api/hosts',body})})},{handle:()=>of('ok')});
        assert.equal(await lastValueFrom(stream),'ok');
    }
});

test('an ignored config field cannot shadow a custom template payload', async()=>{
    const guard=new XrayModeInterceptor({isCustom:async()=>false},{});
    const request={method:'PATCH',path:'/api/subscription-templates',body:{config:{},templateJson:{outbounds:[{streamSettings:{network:'xera-http'}}]}}};
    await assert.rejects(guard.intercept({switchToHttp:()=>({getRequest:()=>request})},{handle:()=>of('ok')}),error=>error.getResponse().code==='CUSTOM_XRAY_REQUIRED');
});

test('bulk limits cannot borrow unchanged settings from an unrelated single-host UUID', async()=>{
    const guard=new XrayModeInterceptor({isCustom:async()=>false},{hosts:{findUnique:async()=>({deviceSpeedLimitMbps:5})}});
    const request={method:'PATCH',path:'/api/hosts/bulk/update',body:{uuid:'44444444-4444-4444-8444-444444444444',uuids:['55555555-5555-4555-8555-555555555555'],deviceSpeedLimitMbps:5}};
    await assert.rejects(guard.intercept({switchToHttp:()=>({getRequest:()=>request})},{handle:()=>of('ok')}),error=>error.getResponse().code==='CUSTOM_XRAY_REQUIRED');
});

test('durable settings dispatch retries after queue failure and acknowledges only successful enqueue',async()=>{
    const {XrayModeApplyTask}=load(path.join(__dirname,'../src/scheduler/tasks/xray-mode-apply.task.ts'),{'@common/xray-mode/xray-mode.service':{},'@queue/_nodes':{}});
    let pending=7,fail=true,acks=0,calls=0;
    const task = new XrayModeApplyTask({pendingApply:async()=>pending,markQueued:async revision=>{assert.equal(revision,7);acks++;pending=undefined;}},{startAllNodesWithoutDeduplication:async()=>{calls++;if(fail)throw Error('Redis unavailable');}});
    await task.run(); assert.equal(acks,0); assert.equal(pending,7);
    fail=false; await task.run(); assert.equal(acks,1);
    await task.run(); assert.equal(calls,2);
});
