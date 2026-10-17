// An explicitly named, empty loopback database only. No real node is called.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {PrismaClient}=require('@prisma/client');
const {TransactionHost}=require('@nestjs-cls/transactional');
const k=require('kysely');
const load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url=process.env.LEGACY_USAGE_TEST_DATABASE_URL;assert.ok(url,'Set LEGACY_USAGE_TEST_DATABASE_URL');
const target=new URL(url);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55439');assert.ok(['/remnacust_legacy_usage_test','/remnacust_legacy_recovery_test'].includes(target.pathname));
const mainUrl=new URL(url);mainUrl.searchParams.set('connection_limit','1');
const prisma=new PrismaClient({datasourceUrl:mainUrl.toString()});
const N='cccccccc-cccc-4ccc-8ccc-cccccccccccc',I='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',C='ff29ee68-a625-4160-9573-cc17de317a5d',H='11111111-1111-4111-8111-111111111111';
const host='901~0123456789abcdef01234567~h'+H.replaceAll('-','');
let rejectCommit=false;
// Use the installed CLS transaction host, including its real independent context.
const transactions=new TransactionHost({defaultTxOptions:{},getFallbackInstance:()=>prisma,
    wrapWithTransaction:(opts,fn,set)=>prisma.$transaction(async tx=>{set(tx);const result=await fn();if(rejectCommit){rejectCommit=false;throw Error('simulated commit failure');}return result;},opts)});
const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(transactions),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
const baseMocks={'@common/axios':{},'@common/config/app-config':{},'@common/database':{},
    '@common/utils/device-identity':load(path.join(__dirname,'../src/common/utils/device-identity.ts')),
    '@common/utils/host-identity':load(path.join(__dirname,'../src/common/utils/host-identity.ts')),
    '@common/utils/nano':load(path.join(__dirname,'../src/common/utils/nano/nano.util.ts'))};
const {DurableUsageService}=load(path.join(__dirname,'../src/common/host-policy/durable-usage.service.ts'),baseMocks);
const {LegacyUsageService}=load(path.join(__dirname,'../src/common/host-policy/legacy-usage.service.ts'),{...baseMocks,'./durable-usage.service':{DurableUsageService}});
const node={nodeUuid:N,nodeId:901n,opts:{address:'127.0.0.1',port:2222,proxyUrl:null},multiplier:'1500000000'};
let readCalls=0,failRead=false,failSQL=false,failEffects=false,afterRead=null;
let users=[];const outbox=[];
const axios={getUsersStats:async()=>{readCalls++;const response={users,coreProcessId:C};users=[];if(failRead){failRead=false;return {isOk:false};}if(failSQL){failSQL=false;rejectCommit=true;}await afterRead?.();return {isOk:true,response};}};
let threshold=0n,history=true;
const biller=new DurableUsageService(db,axios,transactions,{getOrThrow:key=>key==='USER_USAGE_IGNORE_BELOW_BYTES'?threshold:key==='SERVICE_DISABLE_USER_USAGE_RECORDS'?!history:undefined});
const {HostUsageService}=load(path.join(__dirname,'../src/common/host-policy/host-usage.service.ts'),{...baseMocks,'@common/raw-cache':{},'@common/types':{}});
const {UsageJournalService}=load(path.join(__dirname,'../src/common/host-policy/usage-journal.service.ts'),baseMocks);
const journal=new UsageJournalService({getOrThrow:()=>url});
const pendingHosts={};
const hostUsage=new HostUsageService(db,{hgetallParsed:async()=>({...pendingHosts}),createPipeline:()=>{let id;return {hdel:(_key,value)=>id=value,exec:async()=>{delete pendingHosts[id];return [[null,1]];}};}},transactions);
const service=new LegacyUsageService(db,axios,transactions,biller,hostUsage,journal);
const effect=async(receipt,value)=>{outbox.push({receipt,value});if(failEffects){failEffects=false;throw Error('notification outage');}};
const collect=(overrides={})=>service.collect({...node,...overrides},effect);
const traffic=async(id=901)=>(await prisma.$queryRaw`SELECT used_traffic_bytes AS used,lifetime_used_traffic_bytes AS lifetime FROM user_traffic WHERE id=${id}::bigint`)[0];
const state=async()=>(await prisma.$queryRaw`SELECT * FROM xera_legacy_usage_streams WHERE node_uuid=${N}::uuid`)[0];
const hostBytes=async()=>BigInt((await prisma.$queryRaw`SELECT COALESCE(sum(total_bytes),0)::text AS n FROM xera_host_quota_usage WHERE user_id=901 AND host_uuid=${H}::uuid`)[0].n);
(async()=>{try{
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n,0n,'Refuse existing users');
    await prisma.$transaction(async tx=>{const seed=fs.readFileSync(path.join(__dirname,'fixtures/host-policy-seed.sql'),'utf8').replace('BEGIN;','');for(const stmt of seed.split(';').filter(v=>v.trim()))await tx.$executeRawUnsafe(stmt);await tx.$executeRaw`INSERT INTO user_traffic(id) VALUES(901),(902)`;});
    users=[{username:host,uplink:7,downlink:11},{username:'901',uplink:2,downlink:0},{username:'902',uplink:3,downlink:0}];
    failEffects=true;await assert.rejects(collect(),/notification outage/);
    assert.equal((await traffic()).used,30n);assert.equal(await hostBytes(),18n);assert.equal((await state()).applied,true);
    const original=outbox[0];await collect({multiplier:'9000000000'});
    assert.equal(readCalls,1);assert.equal((await traffic()).used,30n);assert.equal((await state()).payload,null);
    assert.equal(outbox[1].receipt,original.receipt);assert.deepEqual(outbox[1].value,original.value);assert.equal(original.value.owners.length,2);
    assert.equal((await prisma.$queryRaw`SELECT total_bytes FROM nodes_user_usage_history WHERE user_id=901`)[0].total_bytes,20n);
    console.log('PASS SQL host/global/history commit together; notification retry does not read/reset or bill twice');

    pendingHosts['fd29ee68-a625-4160-9573-cc17de317a5d']={day:new Date().toISOString().slice(0,10),records:[{userId:'901',hostUuid:H,bytes:'5'}]};
    await hostUsage.drain(901n);await hostUsage.drain(901n);
    assert.equal(await hostBytes(),23n);assert.equal((await traffic()).used,30n);assert.deepEqual(pendingHosts,{});
    console.log('PASS pre-upgrade Redis host receipts drain once without duplicating global billing');

    users=[{username:host,uplink:'10',downlink:'0'}];failSQL=true;
    await assert.rejects(collect(),/simulated commit failure/);
    assert.equal((await traffic()).used,30n);assert.equal(await hostBytes(),23n);assert.equal((await state()).payload.stats[0].value,'10');assert.equal((await state()).applied,false);
    await collect({multiplier:'9000000000'});assert.equal(readCalls,2);assert.equal((await traffic()).used,45n);assert.equal(await hostBytes(),33n);
    assert.equal((await state()).next_sequence,3n);
    console.log('PASS independently committed payload survives actual outer transaction rollback and retains its original multiplier');

    threshold=100n;users=[{username:'901',uplink:40,downlink:0},{username:'901~'+'a'.repeat(24),uplink:30,downlink:40},{username:'901~'+'b'.repeat(24),uplink:70,downlink:0},{username:'902',uplink:9,downlink:0}];
    await collect();assert.equal((await traffic()).used,315n);assert.equal((await traffic(902)).used,4n);
    assert.equal(outbox.at(-1).value.owners[0].bytes,'180');assert.equal(outbox.at(-1).value.owners.length,2);
    threshold=0n;history=false;users=[{username:'901',uplink:100,downlink:0}];await collect({multiplier:'0'});
    assert.equal((await traffic()).used,315n);assert.equal(outbox.at(-1).value.owners[0].bytes,'100');
    console.log('PASS shared/device identities aggregate before threshold; zero multiplier preserves raw visibility without billing');

    users=[{username:'901',uplink:'9007199254740993',downlink:0}];await collect();
    assert.equal((await traffic()).used,315n+13510798882111489n);
    console.log('PASS exact string counters and fractional billing above JavaScript safe integer range');

    users=[{username:'901',uplink:2,downlink:0}];failEffects=true;await assert.rejects(collect(),/notification outage/);
    const callsBefore=readCalls,usedBefore=(await traffic()).used;let count=0,release;const gate=new Promise(resolve=>release=resolve);
    const concurrentEffects=async()=>{if(++count===2)release();await gate;};
    await Promise.all([service.collect(node,concurrentEffects),service.collect(node,concurrentEffects)]);
    assert.equal(count,2);assert.equal(readCalls,callsBefore);assert.equal((await traffic()).used,usedBefore);
    console.log('PASS concurrent replay of the same durable legacy outbox cannot debit twice');

    users=[{username:'901',uplink:4,downlink:0}];failSQL=true;await assert.rejects(collect(),/commit failure/);
    await prisma.$executeRaw`INSERT INTO xera_quota_node_modes(node_uuid,phase,instance_uuid) VALUES(${N}::uuid,'FENCING',${I}::uuid)`;
    const callsBeforeManaged=readCalls;await collect();assert.equal(readCalls,callsBeforeManaged);assert.equal(await collect(),null);
    await prisma.$executeRaw`DELETE FROM xera_quota_node_modes WHERE node_uuid=${N}::uuid`;
    users=[{username:'901',uplink:99,downlink:0}];failRead=true;await assert.rejects(collect(),/unproven/);
    const beforeUnknown=(await traffic()).used;await collect();assert.equal((await traffic()).used,beforeUnknown);assert.ok((await state()).uncertain_since instanceof Date);
    await prisma.$executeRaw`UPDATE users SET traffic_limit_bytes=10000 WHERE id=901`;
    await prisma.$executeRaw`INSERT INTO xera_quota_node_modes(node_uuid,phase,instance_uuid,user_quota,initial_core,initial_drained_at,initial_drain_sequence,legacy_usage_drained_at)
        VALUES(${N}::uuid,'FENCING',${I}::uuid,true,${C}::uuid,now(),1,now()-interval '1 second')`;
    await assert.rejects(prisma.$queryRaw`SELECT * FROM xera_allocate_quota_reserves('USER','global',901,ARRAY[${N}::uuid],0,${JSON.stringify({[N]:I})}::jsonb)`,/not proven/);
    console.log('PASS managed mode drains known legacy debt without a new reset; unknown reset never fabricates cutover proof or blocks ordinary collection');

    const {BulkUpdateUserUsedTrafficBuilder}=load(path.join(__dirname,'../src/modules/users/builders/bulk-update-user-used-traffic/bulk-update-user-used-traffic.builder.ts'));
    let commands=0,queueFail=false,commandFail=false,notifications=[];
    const queueService={fireUserEventBulk:async(payload,receipt)=>{notifications.push({payload,receipt});if(queueFail){queueFail=false;throw Error('old queue notification outage');}}};
    const {LegacyBillingService}=load(path.join(__dirname,'../src/common/host-policy/legacy-billing.service.ts'),{
        '@common/database':{},'@libs/contracts/constants':{EVENTS:{USER:{FIRST_CONNECTED:'first'}}},
        '@modules/users/builders/bulk-update-user-used-traffic':{BulkUpdateUserUsedTrafficBuilder},'@queue/_users/users-queues.service':{},
    });
    const billing=new LegacyBillingService(db,transactions,queueService),bill=billing.bill.bind(billing);
    billing.bill=async payload=>{commands++;if(commandFail){commandFail=false;throw Error('Legacy usage SQL billing failed');}return bill(payload);};
    const {UpdateUsersUsageQueueProcessor}=load(path.join(__dirname,'../src/queue/_users/processors/update-users-usage.processor.ts'),{
        '@nestjs/bullmq':{Processor:()=>v=>v,WorkerHost:class{}},'@common/database':{},'@common/types':{ok:response=>({isOk:true,response})},
        '@libs/contracts/constants':{EVENTS:{USER:{FIRST_CONNECTED:'first'}}},'@queue/_users/users-queues.service':{},
        '@queue/queue.enum':{QUEUES_NAMES:{USERS:{UPDATE_USERS_USAGE:'old'}}},'../constants/users-job-name.constant':{USERS_JOB_NAMES:{UPDATE_USERS_USAGE:'old'}},
        '@modules/users/commands/bulk-increment-used-traffic':{BulkIncrementUsedTrafficCommand:class{constructor(userUsageList){this.userUsageList=userUsageList;}}},
        '@common/host-policy/legacy-billing.service':{LegacyBillingService},
    });
    const processor=new UpdateUsersUsageQueueProcessor(billing);
    processor.logger={error(){},warn(){}};
    await prisma.$executeRaw`UPDATE user_traffic SET first_connected_at=NULL WHERE id=902`;
    const oldJob={name:'old',queueName:'USERS_UPDATE_USERS_USAGE_QUEUE',id:'17',timestamp:1792000000000,data:[{u:'902',b:'10',n:N}]};
    const oldBefore=(await traffic(902)).used;queueFail=true;await assert.rejects(processor.process(oldJob),/notification outage/);
    assert.equal((await traffic(902)).used,oldBefore+10n);assert.equal(commands,1);
    await processor.process(oldJob);await Promise.all([processor.process(oldJob),processor.process(oldJob)]);
    assert.equal((await traffic(902)).used,oldBefore+10n);assert.equal(commands,1);assert.equal(notifications[0].receipt,notifications[1].receipt);
    await assert.rejects(processor.process({...oldJob,data:[{...oldJob.data[0],b:'11'}]}),/changed after billing/);
    commandFail=true;await assert.rejects(processor.process({...oldJob,id:'18'}),/billing failed/);
    assert.equal((await traffic(902)).used,oldBefore+10n);
    const debt=(await prisma.$queryRaw`SELECT payload FROM xera_legacy_usage_jobs WHERE NOT applied`);
    assert.equal(debt.length,1);assert.deepEqual(debt[0].payload,oldJob.data,'SQL retains unapplied debt even if the failed Redis job expires');
    assert.equal(await billing.replayPending(),1,'Accepted debt recovers from SQL without the original Redis job');
    await processor.process({...oldJob,id:'18'});assert.equal((await traffic(902)).used,oldBefore+20n);
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_legacy_usage_jobs WHERE NOT applied`)[0].n,0n);
    await processor.process({...oldJob,timestamp:oldJob.timestamp+1});assert.equal((await traffic(902)).used,oldBefore+30n,'Redis job ID reuse with a new timestamp is a different job');
    console.log('PASS old queue job retry/concurrency/payload binding/command rollback preserve exactly-once SQL billing and replayable notifications');

    const orphan='99999999-9999-4999-8999-999999999999';
    const snapshot={stats:[{name:`user>>>${host}>>>traffic>>>uplink`,value:'4'}],capturedAt:String(Date.now()),coreProcessId:C};
    await prisma.$executeRaw`INSERT INTO xera_legacy_usage_streams(stream_id,node_uuid,node_id,requested_at,consumption_multiplier,payload)
        VALUES('89898989-8989-4989-8989-898989898989'::uuid,${orphan}::uuid,903,clock_timestamp(),1500000000,${JSON.stringify(snapshot)}::jsonb)`;
    const prior=(await traffic()).used;
    await service.collect({...node,nodeUuid:orphan,nodeId:903n},effect,true);
    assert.equal((await traffic()).used,prior+6n);
    assert.equal((await prisma.$queryRaw`SELECT last_connected_node_uuid FROM user_traffic WHERE id=901`)[0].last_connected_node_uuid,null);
    assert.equal((await prisma.$queryRaw`SELECT total_bytes FROM xera_host_quota_usage WHERE node_id=903`)[0].total_bytes,4n);
    await processor.process({...oldJob,id:'deleted-node',data:[{u:'902',b:'5',n:orphan}]});
    assert.equal((await traffic(902)).used,oldBefore+35n);
    assert.equal((await prisma.$queryRaw`SELECT last_connected_node_uuid FROM user_traffic WHERE id=902`)[0].last_connected_node_uuid,null);
    const commandsBefore=commands;await assert.rejects(processor.process({...oldJob,id:'duplicate',data:[oldJob.data[0],oldJob.data[0]]}),/duplicate owner/);assert.equal(commands,commandsBefore);
    console.log('PASS deleting a node cannot strand its captured usage or queued global billing on a foreign key; duplicate owners are rejected before SQL');

    // The normal fixture is retained for the subsequent live-queue cutover test.
    if(target.pathname==='/remnacust_legacy_recovery_test'){
    commandFail=true;await assert.rejects(processor.process({...oldJob,id:'restore-unapplied'}),/billing failed/);
    const unapplied=(await prisma.$queryRaw`SELECT receipt FROM xera_legacy_usage_jobs WHERE NOT applied`)[0].receipt;
    await prisma.$executeRaw`UPDATE user_traffic SET first_connected_at=NULL WHERE id=902`;
    queueFail=true;await assert.rejects(processor.process({...oldJob,id:'restore-events'}),/notification outage/);
    const applied=(await prisma.$queryRaw`SELECT receipt FROM xera_legacy_usage_jobs WHERE applied AND pending_users IS NOT NULL`)[0].receipt;
    const legacyEffectNode={...node,nodeUuid:'79797979-7979-4979-8979-797979797979',nodeId:904n};
    users=[{username:'901',uplink:3,downlink:0}];failEffects=true;await assert.rejects(service.collect(legacyEffectNode,effect),/notification outage/);
    const admin=new PrismaClient({datasourceUrl:url});
    const racingNode={...node,nodeUuid:'78787878-7878-4878-8878-787878787878',nodeId:905n};
    const usedBeforeRestore=(await traffic()).used;
    try{
        afterRead=()=>admin.$queryRaw`SELECT xera_quarantine_restored_quotas()`;
        users=[{username:'901',uplink:41,downlink:0}];
        await assert.rejects(service.collect(racingNode,effect),/restore|reconcil|recovery/i);
    }finally{afterRead=null;await admin.$disconnect();}
    assert.equal((await traffic()).used,usedBeforeRestore);
    const captured=(await prisma.$queryRaw`SELECT payload,applied FROM xera_legacy_usage_streams WHERE node_uuid=${racingNode.nodeUuid}::uuid`)[0];
    assert.equal(captured.applied,false);assert.equal(captured.payload.stats[0].value,'41','Reset response survives independently although billing was refused');
    console.log('PASS restore begun during legacy reset retains the captured original payload without billing or emitting effects');

    const untouched=async()=>JSON.stringify(await prisma.$queryRaw`SELECT jsonb_build_object(
        'traffic',(SELECT jsonb_agg(to_jsonb(t)) FROM user_traffic t),
        'jobs',(SELECT jsonb_agg(to_jsonb(j)) FROM xera_legacy_usage_jobs j),
        'streams',(SELECT jsonb_agg(to_jsonb(s)) FROM xera_legacy_usage_streams s),
        'hostUsage',(SELECT jsonb_agg(to_jsonb(h)) FROM xera_host_quota_usage h),
        'hostReceipts',(SELECT jsonb_agg(to_jsonb(r)) FROM xera_host_usage_receipts r),
        'restore',(SELECT jsonb_agg(to_jsonb(q)) FROM xera_quota_restore_state q))::text AS state`);
    const stable=await untouched(),readsHeld=readCalls,commandsHeld=commands,notificationsHeld=notifications.length,effectsHeld=outbox.length;
    pendingHosts['76767676-7676-4676-8676-767676767676']={day:new Date().toISOString().slice(0,10),records:[{userId:'901',hostUuid:H,bytes:'13'}]};
    const heldRedis=JSON.stringify(pendingHosts);
    for(const action of [()=>billing.settle(unapplied),()=>billing.settle(applied),()=>billing.replayPending(),
        ()=>service.collect(racingNode,effect),()=>service.collect(legacyEffectNode,effect),
        ()=>hostUsage.drain(901n),()=>hostUsage.record(901n,[]),
        ()=>hostUsage.collect(901n,async()=>assert.fail('No reset while restore is pending'))])
        await assert.rejects(action(),/restore|reconcil|recovery/i);
    assert.equal(readCalls,readsHeld);assert.equal(commands,commandsHeld);assert.equal(notifications.length,notificationsHeld);assert.equal(outbox.length,effectsHeld);
    assert.equal(JSON.stringify(pendingHosts),heldRedis);assert.equal(await untouched(),stable);
    const archived=await billing.prepare({...oldJob,id:'accepted-during-restore'});
    assert.match(archived,/^[a-f0-9]{64}$/);await assert.rejects(billing.settle(archived),/restore|reconcil|recovery/i);
    assert.deepEqual((await prisma.$queryRaw`SELECT payload,applied FROM xera_legacy_usage_jobs WHERE receipt=${archived}`)[0],{payload:oldJob.data,applied:false});
    assert.equal((await traffic()).used,usedBeforeRestore);
    console.log('PASS quarantine holds unapplied and applied SQL jobs, event retries, legacy/host collectors and Redis ACK; newly accepted jobs retain only their original intent');
    }
    console.log('PASS all legacy collection scenarios complete with connection_limit=1 on the main pool');
}finally{await journal.onModuleDestroy();await db.kysely.destroy();await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
