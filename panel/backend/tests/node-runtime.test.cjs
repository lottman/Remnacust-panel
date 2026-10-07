const test=require('node:test'), assert=require('node:assert/strict'), path=require('node:path');
const load=require('./load-typescript.cjs');
const {nodeSource}=require('./component-paths.cjs');
const metrics=load(path.join(nodeSource,'src/modules/stats/runtime-metrics.ts'));
test('CPU deltas, stopped collection and missing disks never invent readings',async()=>{
    const cpu=(idle,user)=>({times:{idle,user,nice:0,sys:0,irq:0}});
    assert.equal(metrics.cpuUsage([cpu(20,10)],[cpu(25,25)]),75);
    assert.equal(metrics.cpuUsage([],[]),null);
    assert.equal(metrics.cpuUsage([cpu(20,10)],[cpu(20,10)]),null);
    const missing=await metrics.collectDisk(path.join(__dirname,'nonexistent-audit-disk'));
    assert.equal(missing.totalBytes,null);assert.equal(missing.error,'unavailable');
    const system=await metrics.collectRuntimeSystem();
    assert.ok(system.memory.totalBytes>0);assert.ok(system.cpu.cores>0);
    assert.equal(await metrics.bounded(new Promise(()=>{}),5),null);
});
test('node runtime keeps system metrics when Xray and network statistics are unavailable',async()=>{
    const {RuntimeService}=load(path.join(nodeSource,'src/modules/stats/runtime.service.ts'),{
        '@nestjs/common':require('@nestjs/common'),'@nestjs/cqrs':{},
        '@remnawave/xtls-sdk':{},'@remnawave/xtls-sdk-nestjs':{InjectXtls:()=>()=>{}},
        '@common/utils/read-core-version':{readCoreVersion:async()=>({semver:'26.7.28',raw:'Xray 26.7.28 custom'})},
        '../network-stats/queries/get-interface-stats/get-interface-stats.query':{GetInterfaceStatsQuery:class {}},
        '../xray-core/xray-process.service':{}, './runtime-metrics':metrics,
    });
    let calls=0;
    const service=new RuntimeService({stats:{getSysStats:async()=>{calls++;return {isOk:false}}}},
        {execute:async()=>{throw new Error('not ready')}},{getStatus:async()=>({up:false,pid:null,raw:'false -1'})});
    const [a,b]=await Promise.all([service.get(),service.get()]);
    assert.equal(a,b);assert.equal(calls,1);assert.ok(a.system.memory.totalBytes>0);
    assert.equal(a.system.network,null);assert.equal(a.xray.state,'stopped');
    assert.equal(a.xray.uptimeSeconds,null);assert.equal(a.xray.statsAvailable,false);
    const {NodeRuntimeSchema}=require('../libs/contract/build/backend/commands');
    assert.ok(NodeRuntimeSchema.safeParse(a).success);
});
test('panel runtime validates remote data, preserves unknowns and never probes a disabled node',async()=>{
    const contract=require('../libs/contract/build/backend/commands');
    const {NodeRuntimeService}=load(path.join(__dirname,'../src/modules/nodes/node-runtime.service.ts'),{
        '@nestjs/cqrs':{},'@common/axios':{},'@libs/contracts/commands':contract,
        '@common/helpers/error-handler.helper':{errorHandler:r=>{if(!r.isOk)throw Error('not found');return r.response}},
        './queries/get-node-by-uuid/get-node-by-uuid.query':{GetNodeByUuidQuery:class{}},'./node-health-log.service':{},
    });
    const uuid='db816b98-d289-47a0-9b0f-8994d816c30c';let probes=0;
    const node={uuid,isDisabled:false,isConnected:true};
    let remote={isOk:false};
    const service=new NodeRuntimeService({execute:async()=>({isOk:true,response:node})},
        {nodeRuntime:async()=>{probes++;return remote}},{list:async()=>[]});
    const missing=await service.get(uuid);assert.equal(missing.response.runtime,null);
    assert.equal(missing.response.reason,'unavailable_or_unsupported');
    remote={isOk:true,response:{cpu:0,password:'must not leak'}};
    const invalid=await service.get(uuid);assert.equal(invalid.response.reason,'invalid_node_response');
    assert.ok(!JSON.stringify(invalid).includes('must not leak'));
    node.isDisabled=true;const disabled=await service.get(uuid);
    assert.equal(probes,2);assert.equal(disabled.response.reason,'disabled');
    assert.ok(contract.GetNodeRuntimeCommand.ResponseSchema.safeParse(disabled).success);
});
