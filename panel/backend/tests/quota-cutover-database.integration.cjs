// Run after legacy-usage-database.integration.cjs, using only its disposable DB.
const assert=require('node:assert/strict');const path=require('node:path');const crypto=require('node:crypto');
const {PrismaClient}=require('@prisma/client');const {TransactionHost}=require('@nestjs-cls/transactional');
const {Queue,Worker}=require('bullmq');const Redis=require('ioredis');const k=require('kysely');const load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url=process.env.LEGACY_USAGE_TEST_DATABASE_URL,redisUrl=process.env.QUOTA_CUTOVER_TEST_REDIS_URL;assert.ok(url&&redisUrl);
for(const [value,port,db] of [[url,'55439','/remnacust_legacy_usage_test'],[redisUrl,'56381','/15']]){const u=new URL(value);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,port);assert.equal(u.pathname,db);}
const prisma=new PrismaClient({datasourceUrl:url}),redis=new Redis(redisUrl,{maxRetriesPerRequest:null});
const prefix='cutover-audit-'+crypto.randomUUID();
const users=new Queue('USERS_UPDATE_USERS_USAGE_QUEUE',{prefix,connection:redis});
const nodes=new Queue('NODES_RECORD_USER_USAGE_QUEUE',{prefix,connection:redis});let worker;
const N='cccccccc-cccc-4ccc-8ccc-cccccccccccc',I='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',C='ff29ee68-a625-4160-9573-cc17de317a5d';
const transactions=new TransactionHost({defaultTxOptions:{},getFallbackInstance:()=>prisma,wrapWithTransaction:(opts,fn,set)=>prisma.$transaction(async tx=>{set(tx);return fn();},opts)});
const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(transactions),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
const mocks={'@common/axios':{},'@common/config/app-config':{},'@common/database':{},'@common/raw-cache':{},
    '@queue/_nodes/nodes-queues.service':{},'@queue/_users/users-queues.service':{},'./usage-effects.service':{},
    '@common/utils/device-identity':load(path.join(__dirname,'../src/common/utils/device-identity.ts')),
    '@common/utils/host-identity':load(path.join(__dirname,'../src/common/utils/host-identity.ts')),
    '@common/utils/nano':load(path.join(__dirname,'../src/common/utils/nano/nano.util.ts'))};
const {DurableUsageService}=load(path.join(__dirname,'../src/common/host-policy/durable-usage.service.ts'),mocks);
const {HostUsageService}=load(path.join(__dirname,'../src/common/host-policy/host-usage.service.ts'),mocks);
const {LegacyUsageService}=load(path.join(__dirname,'../src/common/host-policy/legacy-usage.service.ts'),{...mocks,'./durable-usage.service':{DurableUsageService},'./host-usage.service':{HostUsageService}});
const {QuotaCutoverService}=load(path.join(__dirname,'../src/common/host-policy/quota-cutover.service.ts'),{...mocks,'./durable-usage.service':{DurableUsageService},'./legacy-usage.service':{LegacyUsageService}});
const {BulkUpdateUserUsedTrafficBuilder}=load(path.join(__dirname,'../src/modules/users/builders/bulk-update-user-used-traffic/bulk-update-user-used-traffic.builder.ts'));
const {LegacyBillingService}=load(path.join(__dirname,'../src/common/host-policy/legacy-billing.service.ts'),{...mocks,
    '@modules/users/builders/bulk-update-user-used-traffic':{BulkUpdateUserUsedTrafficBuilder},'@libs/contracts/constants':{EVENTS:{USER:{FIRST_CONNECTED:'first'}}}});
let pending=null,ack=0,legacyCalls=0;
const axios={getUsersStats:()=>{legacyCalls++;assert.fail('No destructive legacy API after fence');},hostPolicy:async()=>({isOk:true,response:{applied:true,policyRevision:'1',usageReceiptsSupported:true,quotaInstanceId:I,coreProcessId:C}}),usageReceipt:async(_opts,request)=>{
    if(request.action==='sample'){
        if(!pending){assert.equal(BigInt(request.sequence),BigInt(ack)+1n);const frame={sequence:request.sequence,coreProcessId:C,capturedAt:String(Date.now()),stats:[]};pending={...frame,stream:I,capability:'remnacust-usage-receipts-v1',digest:crypto.createHash('sha256').update(JSON.stringify(frame)).digest('hex')};}
        return {isOk:true,response:pending};
    }
    assert.equal(request.digest,pending.digest);ack=Number(request.sequence);pending=null;
    return {isOk:true,response:{stream:I,sequence:request.sequence,acknowledged:true}};
}};
const durable=new DurableUsageService(db,axios,transactions,{getOrThrow:key=>key==='USER_USAGE_IGNORE_BELOW_BYTES'?0n:true});
const hostUsage=new HostUsageService(db,{hgetallParsed:async()=>({})},transactions);
// This fixture is already fenced; any attempt to start a new legacy reset fails.
const legacy=new LegacyUsageService(db,axios,transactions,durable,hostUsage,{prepare:()=>assert.fail('No legacy capture after fence'),capture:()=>assert.fail('No legacy capture after fence'),markUncertain:()=>assert.fail('No unfinished request in this fixture')});
const billing=new LegacyBillingService(db,transactions,{fireUserEventBulk:async()=>{}});
const cutover=new QuotaCutoverService(db,transactions,legacy,durable,{apply:async()=>{}},{queues:{recordUserUsage:nodes}},{queues:{updateUsersUsage:users}},billing);
const node={nodeUuid:N,nodeId:901n,opts:{address:'127.0.0.1',port:2222,proxyUrl:null},multiplier:'1000000000'};
const mode=async()=>(await prisma.$queryRaw`SELECT * FROM xera_quota_node_modes WHERE node_uuid=${N}::uuid`)[0];
const delay=()=>new Promise(resolve=>setTimeout(resolve,5));
(async()=>{try{
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users WHERE username IN ('host-policy-u1','host-policy-u2')`)[0].n,2n);
    await Promise.all([users.waitUntilReady(),nodes.waitUntilReady()]);
    const states=[[nodes,'active','list'],...['active','wait','paused'].map(s=>[users,s,'list']),...['delayed','prioritized','waiting-children','failed'].map(s=>[users,s,'zset'])];
    assert.equal(await cutover.oldQueuesIdle(),true);
    for(const [queue,state,type] of states){const key=queue.toKey(state);try{
        if(type==='list')await redis.rpush(key,'audit-job');else await redis.zadd(key,1,'audit-job');
        assert.equal(await cutover.oldQueuesIdle(),false,state+' must block debt proof');
    }finally{await redis.del(key);}}
    console.log('PASS atomic actual Valkey proof covers active node jobs and every outstanding monetary queue state');

    await prisma.$executeRaw`UPDATE xera_quota_node_modes SET initial_drained_at=NULL,initial_drain_sequence=NULL,legacy_usage_drained_at=NULL,
        initial_core=${C}::uuid,fenced_core=${C}::uuid,fenced_revision=1,fenced_source=repeat('a',64),fenced_at=clock_timestamp()-interval '2 seconds' WHERE node_uuid=${N}::uuid`;
    await assert.rejects(cutover.drain([node]),/requires recovery/);
    assert.equal((await mode()).legacy_usage_drained_at,null);assert.equal((await mode()).initial_drained_at,null);
    // Explicitly reconcile this synthetic uncertain fixture, not a production reset.
    await prisma.$executeRaw`UPDATE xera_legacy_usage_streams SET uncertain_since=NULL WHERE node_uuid=${N}::uuid`;
    const queued=await users.add('old-billing',{u:'902',b:'10',n:N});
    assert.equal(await cutover.drain([node]),false);
    assert.equal((await mode()).legacy_usage_drained_at,null);assert.equal((await mode()).initial_drained_at,null,'first native frame is not old global queue proof');
    const before=(await prisma.$queryRaw`SELECT used_traffic_bytes AS n FROM user_traffic WHERE id=902`)[0].n;
    let finish;const completed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Actual Bull worker did not finish')),10000);finish=()=>{clearTimeout(timer);resolve();};});
    worker=new Worker(users.name,async job=>{assert.equal(job.id,queued.id);await prisma.$executeRaw`UPDATE user_traffic SET used_traffic_bytes=used_traffic_bytes+10,lifetime_used_traffic_bytes=lifetime_used_traffic_bytes+10 WHERE id=902`;},{prefix,connection:redis});
    worker.on('completed',finish);worker.on('failed',(_job,error)=>console.error(error));
    await completed;await worker.close();worker=null;
    assert.equal((await prisma.$queryRaw`SELECT used_traffic_bytes AS n FROM user_traffic WHERE id=902`)[0].n,before+10n);
    assert.equal(await cutover.drain([node]),true);
    const proven=await mode();assert.ok(proven.legacy_usage_drained_at instanceof Date);assert.equal(proven.initial_drained_at,null);
    await delay();await durable.collect(node,async()=>{});
    const drained=await mode();assert.ok(drained.initial_drained_at>proven.legacy_usage_drained_at);assert.ok(drained.initial_drain_sequence>0n);assert.equal(legacyCalls,0);
    const marker=drained.legacy_usage_drained_at;await cutover.drain([node]);assert.deepEqual((await mode()).legacy_usage_drained_at,marker,'retries must not move the barrier after initial debt proof');
    console.log('PASS actual Bull queue prevents premature SQL proof; only a later native frame completes global debt cutover, with stable retry markers');

    // A received old job may outlive Redis retention. Even an empty synthetic
    // job must be explicitly committed before its durable intent disappears.
    await prisma.$executeRaw`INSERT INTO xera_legacy_usage_jobs(receipt,digest,payload) VALUES(repeat('1',64),repeat('2',64),'[]'::jsonb)`;
    await assert.rejects(cutover.drain([node]),/payload requires recovery/);
    await assert.rejects(prisma.$queryRaw`SELECT * FROM xera_allocate_quota_reserves('USER','global',901,ARRAY[${N}::uuid],0,${JSON.stringify({[N]:I})}::jsonb)`,/not proven/);
    await prisma.$executeRaw`UPDATE xera_legacy_usage_jobs SET digest=${crypto.createHash('sha256').update('[]').digest('hex')} WHERE receipt=repeat('1',64)`;
    assert.equal(await cutover.drain([node]),true);
    assert.equal((await prisma.$queryRaw`SELECT applied FROM xera_legacy_usage_jobs WHERE receipt=repeat('1',64)`)[0].applied,true);
    console.log('PASS an expired Redis job cannot hide a still-unapplied SQL billing intent from cutover or the allocator');

    await assert.rejects(cutover.drain([node,node]),/roster/);
    await assert.rejects(transactions.withTransaction({},()=>cutover.drain([node])),/standalone/);
    const original=await mode();await prisma.$executeRaw`UPDATE xera_quota_node_modes SET fenced_core='ef29ee68-a625-4160-9573-cc17de317a5d'::uuid WHERE node_uuid=${N}::uuid`;
    await assert.rejects(cutover.drain([node]),/requires recovery/);assert.deepEqual((await mode()).legacy_usage_drained_at,original.legacy_usage_drained_at);
    await prisma.$executeRaw`UPDATE xera_quota_node_modes SET fenced_core=${C}::uuid WHERE node_uuid=${N}::uuid`;
    console.log('PASS changed core identity, duplicate roster and caller transaction cannot fabricate a drain proof');
}finally{
    if(worker)await worker.close();await Promise.all([users.close(),nodes.close()]);
    let cursor='0';do{const [next,keys]=await redis.scan(cursor,'MATCH',prefix+':*','COUNT',100);cursor=next;if(keys.length){assert.ok(keys.every(key=>key.startsWith(prefix+':')));await redis.del(...keys);}}while(cursor!=='0');
    await redis.quit();await db.kysely.destroy();await prisma.$disconnect();
}})().catch(error=>{console.error(error);process.exitCode=1;});
