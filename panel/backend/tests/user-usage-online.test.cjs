const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const { test } = require('node:test');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '..');
const filename = path.join(root, 'src/queue/_nodes/processors/record-user-usage.processor.ts');
const mocks = {};
for (const node of ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true).statements) {
    if (ts.isImportDeclaration(node)) mocks[node.moduleSpecifier.text] = {};
}
mocks['@nestjs/bullmq'] = { Processor: () => (value) => value, WorkerHost: class {} };
mocks['@queue/queue.enum'] = { QUEUES_NAMES: { NODES: { RECORD_USER_USAGE: 'usage' } } };
mocks['../constants/nodes-job-name.constant'] = { NODES_JOB_NAMES: { RECORD_USER_USAGE: 'usage' } };
mocks['@libs/contracts/constants'] = {
    CACHE_KEYS: { NODE_USERS_ONLINE: (id) => `online:${id}` }, CACHE_KEYS_TTL: { NODE_USERS_ONLINE: 30 },
    EVENTS: { USER: { FIRST_CONNECTED: 'FIRST_CONNECTED' } }, EXPORT_TO_STREAM_KEYS: { USER_USAGE: 'export' },
};
const Processor = load(filename, mocks).RecordUserUsageQueueProcessor;
const {UsageEffectsService}=load(path.join(root,'src/common/host-policy/usage-effects.service.ts'),{
    '@common/config/app-config':{},'@common/raw-cache':{},'@queue/_users/users-queues.service':{},'./durable-usage.service':{},
    '@libs/contracts/constants':mocks['@libs/contracts/constants'],'@libs/contracts/models':{},
});
const Legacy = load(path.join(root,'src/common/host-policy/legacy-usage.service.ts'), {
    '@common/axios': {}, '@common/database': {}, './durable-usage.service': {}, './host-usage.service': {}, './usage-journal.service': {},
});
const nano = load(path.join(root, 'src/common/utils/nano/nano.util.ts'));
const job = {data:{nodeUuid:'node',nodeId:'1',connectionOpts:{},consumptionMultiplier:'1000000000'}};
const receipt='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-7';
const sample={owners:[{id:'42',bytes:'100'}],firstConnected:['42'],capturedAt:'1792000000000'};
function fixture() {
    const calls={online:[],freshness:[],notifications:[],export:[],order:[]};
    const processor=Object.create(Processor.prototype);
    Object.assign(processor,{
        legacyUsage:{collect:async()=>{calls.order.push('legacy');return null;}},
        durableUsage:{collect:async(_node,effects)=>{calls.order.push('native');await effects(receipt,sample);return {requestedAt:1792000000000,coreProcessId:'core',sequence:'7'};}},
        logger:{error(){},warn(){}}, configService:{getOrThrow:()=>false},
        usersQueuesService:{fireUserEventBulk:async(...args)=>calls.notifications.push(args), updateUserUsage:()=>assert.fail('No new monetary queue job')},
        rawCacheService:{set:async(...args)=>{(args[0].startsWith('online:')?calls.online:calls.freshness).push(args);},xaddUsageReceiptOnce:async(...args)=>calls.export.push(args)},
    });
    processor.usageEffects={apply:(...args)=>new UsageEffectsService(processor.configService,processor.usersQueuesService,processor.rawCacheService).apply(...args)};
    return {processor,calls};
}
test('fractional billing preserves byte precision above the Number safe range',()=>{
    assert.equal(nano.multiplyConsumption('1500000000',9007199254740993n),13510798882111489n);
    assert.equal(nano.multiplyConsumption('500000000',101),50n);
});
test('native collection follows legacy drain and emits only nonmonetary effects',async()=>{
    const {processor,calls}=fixture();await processor.process(job);
    assert.deepEqual(calls.order,['legacy','native']);assert.equal(calls.online[0][1],1);
    assert.equal(calls.notifications[0][1],receipt);assert.equal(calls.freshness[0][1].durable,true);
});
test('a staged legacy response is completed before another native or legacy reset',async()=>{
    const {processor,calls}=fixture();
    processor.legacyUsage.collect=async(_node,effects)=>{await effects(receipt,{...sample,firstConnected:[]});return {requestedAt:1792000000000,coreProcessId:null};};
    processor.durableUsage.collect=()=>assert.fail('No second read');
    await processor.process(job);assert.equal(calls.freshness[0][1].durable,false);assert.equal(calls.online[0][1],1);
});
test('failed collection clears stale online and rejects the Bull job for retry',async()=>{
    for(const mode of ['legacy','native']){
        const {processor,calls}=fixture();processor[mode==='legacy'?'legacyUsage':'durableUsage'].collect=async()=>{throw Error('Uncertain response');};
        await assert.rejects(processor.process(job),/Uncertain response/);
        assert.equal(calls.online.at(-1)[1],0);assert.deepEqual(calls.freshness,[]);
        if(mode==='legacy')assert.deepEqual(calls.order,[]);
    }
});
test('receipt-bound exports retain original raw bytes and sequence',async()=>{
    const {processor,calls}=fixture();processor.configService={getOrThrow:key=>key==='EXPORT_TO_STREAM_ENABLED'?true:10000};
    await processor.process(job);assert.equal(calls.export.length,1);
    assert.equal(calls.export[0][2].records,'42:100');assert.equal(calls.export[0][3],receipt.slice(0,-2));assert.equal(calls.export[0][4],'7');
});
test('empty snapshots show no active users',async()=>{
    const {processor,calls}=fixture();processor.durableUsage.collect=async(_node,effects)=>{await effects(receipt,{...sample,owners:[],firstConnected:[]});return {requestedAt:1,coreProcessId:'core'};};
    await processor.process(job);assert.equal(calls.online[0][1],0);assert.deepEqual(calls.notifications,[]);
});
test('legacy payload parser preserves exact string counters and only canonical continuity proof',()=>{
    const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    for(const core of [id,null,undefined,'invalid',123]){
        const snap=Legacy.legacySnapshot({users:[{username:'42',uplink:'9007199254740993',downlink:0}],coreProcessId:core});
        assert.equal(snap.stats[0].value,'9007199254740993');assert.equal(snap.coreProcessId,core===id?id:null);
    }
});
test('legacy parser rejects rounding, negative, duplicate and malformed counters before billing',()=>{
    for(const value of [Number.MAX_SAFE_INTEGER+1,-1,1.1,NaN,Infinity,'01','-1','9223372036854775808',null]){
        assert.throws(()=>Legacy.legacySnapshot({users:[{username:'42',uplink:value,downlink:0}]}));
    }
    const row={username:'42',uplink:1,downlink:2};assert.throws(()=>Legacy.legacySnapshot({users:[row,row]}),/duplicate/);
    assert.throws(()=>Legacy.legacySnapshot({users:[{...row,username:'42>>>traffic>>>uplink'}]}),/identity/);
    assert.deepEqual(Legacy.legacySnapshot({users:[]}).stats,[]);
});
