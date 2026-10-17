// Called only after an actual pg_restore into the owned disposable restore DB.
const assert=require('node:assert/strict');const path=require('node:path');const {PrismaClient}=require('@prisma/client');
const {TransactionHost}=require('@nestjs-cls/transactional');const k=require('kysely');const load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url=process.env.USAGE_RESTORE_REPLAY_DATABASE_URL;assert.ok(url);const target=new URL(url);
assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55439');assert.equal(target.pathname,'/remnacust_usage_receipts_restore');
const prisma=new PrismaClient({datasourceUrl:url});const tx=new TransactionHost({defaultTxOptions:{},getFallbackInstance:()=>prisma,
    wrapWithTransaction:(opts,fn,set)=>prisma.$transaction(async client=>{set(client);return fn();},opts)});
const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(tx),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
const {BulkUpdateUserUsedTrafficBuilder}=load(path.join(__dirname,'../src/modules/users/builders/bulk-update-user-used-traffic/bulk-update-user-used-traffic.builder.ts'));
const mocks={'@common/database':{},'@common/axios':{},'@common/config/app-config':{},'@common/raw-cache':{},
    '@queue/_users/users-queues.service':{},'@libs/contracts/constants':{EVENTS:{USER:{FIRST_CONNECTED:'first'}}},
    '@modules/users/builders/bulk-update-user-used-traffic':{BulkUpdateUserUsedTrafficBuilder},
    '@common/utils/device-identity':load(path.join(__dirname,'../src/common/utils/device-identity.ts')),
    '@common/utils/host-identity':load(path.join(__dirname,'../src/common/utils/host-identity.ts')),
    '@common/utils/nano':load(path.join(__dirname,'../src/common/utils/nano/nano.util.ts'))};
const {LegacyBillingService}=load(path.join(__dirname,'../src/common/host-policy/legacy-billing.service.ts'),mocks);
const {DurableUsageService}=load(path.join(__dirname,'../src/common/host-policy/durable-usage.service.ts'),mocks);
const {HostUsageService}=load(path.join(__dirname,'../src/common/host-policy/host-usage.service.ts'),mocks);
const {UsageJournalService}=load(path.join(__dirname,'../src/common/host-policy/usage-journal.service.ts'),mocks);
const {LegacyUsageService}=load(path.join(__dirname,'../src/common/host-policy/legacy-usage.service.ts'),mocks);
const journal=new UsageJournalService({getOrThrow:()=>url});
(async()=>{try{
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users WHERE username IN ('host-policy-u1','host-policy-u2')`)[0].n,2n);
    const used=async()=>(await prisma.$queryRaw`SELECT used_traffic_bytes AS n FROM user_traffic WHERE id=901`)[0].n;
    const before=await used(),billing=new LegacyBillingService(db,tx,{fireUserEventBulk:async()=>{}});
    assert.equal(await billing.replayPending(),2);assert.equal(await used(),before+9007199254740993n);
    assert.equal(await billing.replayPending(),0);assert.equal(await used(),before+9007199254740993n);
    const config={getOrThrow:key=>key==='USER_USAGE_IGNORE_BELOW_BYTES'?0n:true};
    const axios={getUsersStats:()=>assert.fail('Known restored data must not reset a remote counter')};
    const native=new DurableUsageService(db,axios,tx,config),hosts=new HostUsageService(db,{hgetallParsed:async()=>({})},tx);
    const legacy=new LegacyUsageService(db,axios,tx,native,hosts,journal);
    const node={nodeUuid:'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',nodeId:903n,opts:{address:'127.0.0.1',port:1,proxyUrl:null},multiplier:'1000000000'};
    const previous=(await prisma.$queryRaw`SELECT uncertain_since FROM xera_legacy_usage_streams WHERE node_uuid=${node.nodeUuid}::uuid`)[0].uncertain_since;
    assert.ok(previous instanceof Date);
    await legacy.collect(node,async()=>{},true);assert.equal(await used(),before+9007199254740993n+13510798882111489n,'The captured original 1.5 multiplier survives backup and a later node setting');
    assert.equal(await legacy.collect(node,async()=>{},true),null);assert.equal(await used(),before+22517998136852482n);
    assert.deepEqual((await prisma.$queryRaw`SELECT uncertain_since FROM xera_legacy_usage_streams WHERE node_uuid=${node.nodeUuid}::uuid`)[0].uncertain_since,previous);
    console.log('PASS restored SQL-only legacy debt and captured snapshots resume once without Redis, a node RPC, rounding or clearing an unknown interval');
}finally{await journal.onModuleDestroy();await db.kysely.destroy();await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
