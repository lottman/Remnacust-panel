// Financial settlement in a dedicated disposable database, with real native evidence.
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),{TransactionHost}=require('@nestjs-cls/transactional'),k=require('kysely'),load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url=process.env.QUOTA_RECOVERY_SETTLEMENT_TEST_DATABASE_URL;assert.ok(url);const parsed=new URL(url);
assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'55439');assert.equal(parsed.pathname,'/remnacust_recovery_settlement_test');
const prisma=new PrismaClient({datasourceUrl:url});let failCommit=false;
const tx=new TransactionHost({defaultTxOptions:{},getFallbackInstance:()=>prisma,wrapWithTransaction:(opts,fn,set)=>prisma.$transaction(async client=>{set(client);const result=await fn();if(failCommit){failCommit=false;throw Error("Injected bank COMMIT failure");}return result;},opts)});
const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(tx),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
const crypto=require('node:crypto'),zlib=require('node:zlib');
const {QuotaBankRecoveryService}=load(path.join(__dirname,'../src/common/host-policy/quota-bank-recovery.service.ts'),{'@common/database':{}});
const {QuotaRecoverySettlementService}=load(path.join(__dirname,'../src/common/host-policy/quota-recovery-settlement.service.ts'),{'@common/database':{}});
const {QuotaRecoveryEvidenceWriter}=load(path.join(__dirname,'../src/common/host-policy/quota-recovery-evidence.ts'));
const {decodeRecoverySnapshot}=load(path.join(__dirname,'../src/common/host-policy/quota-recovery-snapshot.ts'));
const model=load(path.join(__dirname,'../src/common/host-policy/quota-recovery-settlement-plan.ts'));
const banks=new QuotaBankRecoveryService(db,tx),service=new QuotaRecoverySettlementService(db,tx,banks);
const actor=randomUUID(),node=randomUUID(),instance=randomUUID(),core=randomUUID(),g1=randomUUID(),g2=randomUUID(),pool=randomUUID();
const expiry='2030-01-01 00:00:00.123456+00',expiryMs=1893456000123;
const traffic=async()=>JSON.stringify(await prisma.$queryRaw`SELECT row_to_json(t)::text AS data FROM user_traffic t ORDER BY id`);
const grant=async id=>(await prisma.$queryRaw`SELECT closed_usage_bytes::text AS used,closed_revision::text AS revision FROM xera_quota_reserves WHERE id=${id}::uuid`)[0];
const currentGeneration=async()=>(await prisma.$queryRaw`SELECT generation FROM xera_quota_restore_state WHERE singleton AND reconciled_at IS NULL`)[0].generation;
async function evidence(generation,closed=true){
 const request=randomUUID(),raw=Buffer.from(JSON.stringify({version:'remnacust-quota-snapshots-v1',generation,requestId:request,instance,sequence:25,checkpoint:10,retiredBefore:0,registrationsRequired:true,watermarksRequired:true,policyRevision:'10',coreProcessId:core,capturedAt:Date.now(),entries:[g1,g2].sort().map(id=>({id,group:'host:'+pool,owner:'901',ceiling:'100',reserved:id===g1?'7':'11',expiresAt:expiryMs,closed,prepared:true,activated:true,scale:100}))}));
 const snapshot=await decodeRecoverySnapshot({version:'remnacust-quota-snapshots-v1',encoding:'gzip-base64',bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex'),data:zlib.gzipSync(raw).toString('base64')},{generation,requestId:request});
 await tx.withTransaction({isolationLevel:'RepeatableRead'},async()=>{const writer=new QuotaRecoveryEvidenceWriter(db,{generation,requestId:request,node,actor,metadataDigest:'a'.repeat(64)},snapshot,()=>tx.isTransactionActive());await writer.append('STATE',[JSON.stringify({node,fixture:'irreversible closure'})]);await writer.finish({issues:['SETTLEMENT_REQUIRED'],databaseGrants:'2',nodeGrants:2,unknownGrants:0,missingGrants:0,exposureCount:'0',instance,sequence:'25',policyRevision:'10',journalDigest:snapshot.digest});});
 return request;
}
(async()=>{try{
 for(const id of [901,903]){await prisma.$executeRaw`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password) VALUES(${id}::bigint,${'s-'+id},${'s-'+id},now()+interval '1 year','fixture',${randomUUID()}::uuid,'fixture')`;await prisma.$executeRaw`INSERT INTO user_traffic(id) VALUES(${id}::bigint)`;}
 await prisma.$executeRaw`INSERT INTO nodes(uuid,name,address,port) VALUES(${node}::uuid,${'settlement-'+node},${node+'.invalid'},2222)`;
 await prisma.$executeRaw`INSERT INTO xera_node_policy_revisions(node_uuid,revision) VALUES(${node}::uuid,20)`;
 await prisma.$executeRaw`INSERT INTO xera_quota_reserve_pools(kind,key,user_id,window_start,expires_at,baseline_bytes,limit_bytes) VALUES('HOST',${pool},901,'2026-01-01',${expiry}::timestamptz,0,1000)`;
 for(const id of [g1,g2])await prisma.$executeRaw`INSERT INTO xera_quota_reserves(id,kind,key,user_id,window_start,node_uuid,instance_uuid,ceiling_bytes,retired_at) VALUES(${id}::uuid,'HOST',${pool},901,'2026-01-01',${node}::uuid,${instance}::uuid,200,CASE WHEN ${id}=${g1} THEN clock_timestamp() ELSE NULL END)`;
 await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;let generation=await currentGeneration();
 const sourceRequest=await evidence(generation),activeRequest=await evidence(generation,false),bank=await banks.capture(generation,randomUUID(),actor),before=await traffic();
 const draft=ids=>model.settlementDraft.parse({generation,bankRequest:bank.requestId,sourceRequest,ids,note:'Reviewed actual immutable native quota closure'});
 const first=draft([g1]),preview=await service.preview(node,first);assert.equal(preview.plan.totalReturned,'193');assert.equal(preview.plan.changes[0].grant.expiresAt,'2030-01-01 00:00:00.123456+00');
 await assert.rejects(service.preview(node,{...first,sourceRequest:activeRequest}),/BINDING_CHANGED/);
 await assert.rejects(service.preview(randomUUID(),first),/SOURCE_MISSING/);
 const second=draft([g2]),secondPreview=await service.preview(node,second),secondApproval={...second,requestId:randomUUID(),planDigest:secondPreview.planDigest};
 failCommit=true;await assert.rejects(service.resolve(node,secondApproval,actor),/COMMIT failure/);assert.equal((await grant(g2)).used,null);assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_recovery_settlements WHERE request_id=${secondApproval.requestId}::uuid`)[0].n,0n);
 console.log('PASS real native evidence and full bank bind the financial preview, reject active/cross-node sources, preserve microsecond expiry and roll back closure with its audit on failed commit');
 const original=(await prisma.$queryRaw`SELECT used_traffic_bytes::text AS value FROM user_traffic WHERE id=903`)[0].value;
 try{await prisma.$executeRaw`UPDATE user_traffic SET used_traffic_bytes=used_traffic_bytes+1 WHERE id=903`;await assert.rejects(service.resolve(node,{...first,requestId:randomUUID(),planDigest:preview.planDigest},actor),/STALE_PLAN/);assert.equal((await grant(g1)).used,null);}finally{await prisma.$executeRaw`UPDATE user_traffic SET used_traffic_bytes=${original}::bigint WHERE id=903`;}
 const approval={...first,requestId:randomUUID(),planDigest:preview.planDigest};
 const [result,duplicate]=await Promise.all([service.resolve(node,approval,actor),service.resolve(node,approval,actor)]);assert.deepEqual(duplicate,result);
 assert.deepEqual(await grant(g1),{used:'7',revision:'10'});assert.equal(result.plan.totalReturned,'193');assert.equal(await traffic(),before);
 await assert.rejects(service.resolve(node,{...approval,note:'Changed reviewed operation reason'},actor),/REQUEST_CONFLICT/);
 await assert.rejects(service.preview(node,second),/STALE_PLAN/);
 console.log('PASS changed global bank prevents execution; concurrent identical approval settles exactly once and returns unused liability without billing users, notifications or releasing the restore barrier');
 await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;generation=await currentGeneration();const fresh=await banks.capture(generation,randomUUID(),actor);
 const historical={...second,generation,bankRequest:fresh.requestId},historicalPreview=await service.preview(node,historical);
 assert.notEqual(historicalPreview.plan.source.generation,generation);assert.equal(historicalPreview.plan.totalReturned,'189');
 await service.resolve(node,{...historical,requestId:randomUUID(),planDigest:historicalPreview.planDigest},actor);assert.equal((await grant(g2)).used,'11');
 assert.equal(await traffic(),before);assert.equal((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state WHERE singleton`)[0].reconciled_at,null);
 for(const command of ['UPDATE xera_quota_recovery_settlements SET actor_uuid=gen_random_uuid()','DELETE FROM xera_quota_recovery_settlements','TRUNCATE xera_quota_recovery_settlements'])await assert.rejects(prisma.$executeRawUnsafe(command),/immutable/);
 assert.deepEqual(await service.resolve(node,approval,actor),result);await assert.rejects(tx.withTransaction({},()=>service.preview(node,historical)),/standalone/);
 const archived=await banks.capture(generation,randomUUID(),actor);
 assert.equal((await banks.compare(archived.requestId,generation)).matches,true);
 const journal=await prisma.$queryRaw`SELECT digest,row_count AS rows FROM xera_quota_recovery_bank_parts WHERE request_id=${archived.requestId}::uuid AND section='xera_quota_recovery_settlements'`;
 assert.equal(journal.length,1);assert.equal(journal[0].rows,2);
 const originalAudit=await banks.download(archived.requestId,journal[0].digest);
 const auditText=zlib.gunzipSync(originalAudit.data).toString('utf8');
 assert(auditText.includes(approval.requestId));assert(auditText.includes(result.planDigest));
 console.log('PASS irreversible historical closure can be used with a fresh current-generation bank; audit stays immutable, historical retry stays idempotent and all user counters and pause remain unchanged');
 console.log('PASS a new global bank archives both settlement audit records and their original plan digests and still compares identically');
}finally{await db.kysely.destroy();await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
