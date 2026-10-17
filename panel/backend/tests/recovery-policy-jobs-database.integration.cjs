// Standalone disposable PostgreSQL fixture. No public server or production node.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {randomUUID,createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {PrismaClient}=require('@prisma/client'),{TransactionHost}=require('@nestjs-cls/transactional'),k=require('kysely'),load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url=process.env.RECOVERY_POLICY_TEST_DATABASE_URL;assert.ok(url);const parsed=new URL(url);
assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'55439');assert.ok(['/remnacust_recovery_policy_jobs_test','/remnacust_recovery_policy_receipt_test','/remnacust_tail_policy_regression_test'].includes(parsed.pathname));
const prisma=new PrismaClient({datasourceUrl:url});let failCommit=false;
const tx=new TransactionHost({defaultTxOptions:{},getFallbackInstance:()=>prisma,wrapWithTransaction:(opts,fn,set)=>prisma.$transaction(async client=>{set(client);const result=await fn();if(failCommit){failCommit=false;throw Error('Injected finish commit failure');}return result;},opts)});
const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(tx),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
const source=n=>path.join(__dirname,'../src/common/host-policy',n);
const {QuotaRecoveryPolicyService}=load(source('quota-recovery-policy.service.ts'),{'@common/database':{},'@common/axios':{}});
const hash=v=>createHash('sha256').update(v).digest('hex');
async function snapshot(excluded=[]) {
 const result={};
 for(const {name} of await prisma.$queryRaw`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename`) {
  if(excluded.includes(name)) continue;
  assert.match(name,/^[a-zA-Z0-9_]+$/);
  const rows=await prisma.$queryRawUnsafe(`SELECT to_jsonb(t)::text AS body FROM "${name}" t ORDER BY to_jsonb(t)::text`);
  result[name]=hash(rows.map(r=>r.body).join('\n'));
 }
 return result;
}
(async()=>{try{
 assert.equal((await prisma.$queryRaw`SHOW data_directory`)[0].data_directory.replaceAll('\\','/'),'D:/dedik/.remnacust-test-tools/quota-recovery-pg184-20261016/data');
 const before=await snapshot();const history=await prisma.$queryRaw`SELECT * FROM _prisma_migrations ORDER BY migration_name`;assert.equal(history.length,171);
 const migration='20261016190000_recovery_policy_jobs',file=path.join(__dirname,'../prisma/migrations',migration,'migration.sql');
 const sha=hash(fs.readFileSync(file));
 execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-h','127.0.0.1','-p','55439','-U','postgres','-d',parsed.pathname.slice(1),'-v','ON_ERROR_STOP=1','-1','-f',file,'-c',`INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES('${randomUUID()}','${sha}',now(),'${migration}',now(),1)`],{stdio:'pipe'});
 const after=await snapshot(['xera_quota_recovery_policy_jobs','xera_quota_recovery_policy_attempts','_prisma_migrations']);
 const oldData={...before};delete oldData._prisma_migrations;assert.deepEqual(after,oldData);
 assert.deepEqual(await prisma.$queryRaw`SELECT * FROM _prisma_migrations WHERE migration_name<>${migration} ORDER BY migration_name`,history);
 console.log('PASS migration 171 -> 172 preserves every existing table row and historical migration record');
 const receiptMigration='20261017010000_recovery_receipt_jobs',receiptFile=path.join(__dirname,'../prisma/migrations',receiptMigration,'migration.sql');
 execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-h','127.0.0.1','-p','55439','-U','postgres','-d',parsed.pathname.slice(1),'-v','ON_ERROR_STOP=1','-1','-f',receiptFile,'-c',`INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES('${randomUUID()}','${hash(fs.readFileSync(receiptFile))}',now(),'${receiptMigration}',now(),1)`],{stdio:'pipe'});
 const tailMigration='20261017020000_recovery_tail_preparations',tailFile=path.join(__dirname,'../prisma/migrations',tailMigration,'migration.sql');
 execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-h','127.0.0.1','-p','55439','-U','postgres','-d',parsed.pathname.slice(1),'-v','ON_ERROR_STOP=1','-1','-f',tailFile,'-c',`INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES('${randomUUID()}','${hash(fs.readFileSync(tailFile))}',now(),'${tailMigration}',now(),1)`],{stdio:'pipe'});
 const node=randomUUID(),instance=randomUUID(),core=randomUUID(),actor=randomUUID();
 await prisma.$executeRaw`INSERT INTO nodes(uuid,name,address,port) VALUES(${node}::uuid,${'stage-'+node},${node+'.invalid'},2222)`;
 await prisma.$executeRaw`INSERT INTO xera_quota_node_modes(node_uuid,phase,instance_uuid) VALUES(${node}::uuid,'ACTIVE',${instance}::uuid)`;
 await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;
 let generation=(await prisma.$queryRaw`SELECT generation FROM xera_quota_restore_state WHERE singleton`)[0].generation;
 const fence={version:'remnacust-quota-recovery-fence-v1',generation,token:randomUUID(),state:'FENCED',sequence:'1',previous:null};
 const digest=()=>{fence.digest=hash([fence.version,fence.generation,fence.token,fence.state,fence.sequence,fence.previous??'-',''].join('\n'));};digest();
 const status={applied:true,quotaRecoveryPoliciesSupported:true,quotaFencesSupported:true,userQuotaRequired:true,quotaInstanceId:instance,policyRevision:'9007199254740993',coreProcessId:core,quotaRecovery:{version:fence.version,record:fence}};
 let calls=[],reads=0,mode='lost',entered,release;
 const service=new QuotaRecoveryPolicyService(db,tx,{
  hostPolicy:async()=>{assert.equal(tx.isTransactionActive(),false);reads++;return {isOk:true,response:structuredClone(status)};},
  hostQuotaRecoveryPolicy:async(_,body)=>{
   assert.equal(tx.isTransactionActive(),false);calls.push(structuredClone(body));
   const jobs=await prisma.$queryRaw`SELECT payload FROM xera_quota_recovery_policy_jobs WHERE request_id=${body.requestId}::uuid`;
   assert.deepEqual(jobs[0].payload,body);
   const requested=await prisma.$queryRaw`SELECT count(*)::int AS count FROM xera_quota_recovery_policy_attempts WHERE request_id=${body.requestId}::uuid AND phase='REQUESTED'`;
   assert.ok(requested[0].count>0);
   status.policyRevision=body.policyRevision;
   const reply={requestId:body.requestId,coreProcessId:body.coreProcessId,instance:body.instance,policyRevision:body.policyRevision,policyGeneration:randomUUID(),quotaRecovery:structuredClone(status.quotaRecovery)};
   const currentMode=mode;
   if(currentMode==='blocked'){entered();await new Promise(r=>release=r);}
   if(currentMode==='lost')return {isOk:false,code:'NODE_HTTP_TIMEOUT'};
   if(currentMode==='commit')failCommit=true;
   if(currentMode==='new-generation')await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;
   return {isOk:true,response:reply};
  },
 });
 const excluded=['xera_quota_recovery_policy_jobs','xera_quota_recovery_policy_attempts','xera_node_policy_revisions'];
 const financial=await snapshot(excluded);const request=randomUUID();
 await assert.rejects(service.stage(node,generation,actor,request),/NODE_UNAVAILABLE/);
 const firstBody=structuredClone(calls[0]);assert.equal(firstBody.policyRevision,'9007199254740994');assert.deepEqual(await snapshot(excluded),financial);
 await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_policy_jobs SET result='{}' WHERE request_id=${request}::uuid`,/check constraint/);
 mode='ok';const result=await service.stage(node,generation,actor,request);assert.equal(result.alreadyAcknowledged,false);assert.equal(calls.length,2);assert.deepEqual(calls[1],firstBody);assert.equal(reads,1);
 assert.equal((await service.stage(node,generation,actor,request)).alreadyAcknowledged,true);assert.equal(calls.length,2);
 await assert.rejects(service.stage(node,generation,randomUUID(),request),/REQUEST_CONFLICT/);
 assert.deepEqual(await snapshot(excluded),financial);
 assert.equal((await prisma.$queryRaw`SELECT count(*)::int AS count FROM xera_quota_recovery_policy_attempts WHERE request_id=${request}::uuid`)[0].count,4);
 console.log('PASS lost response retries exact persisted body and BIGINT revision; success is idempotent and no quota, usage or global barrier changes');
 const details=await service.details(node,request);assert.equal(details.attempts.length,2);assert.equal(details.acknowledgement.requestId,request);
 assert.equal(details.attempts.filter(a=>a.details.confirmed).length,1);
 await assert.rejects(service.details(randomUUID(),request),/JOB_MISSING/);
 await assert.rejects(service.details(node,request,randomUUID()),/JOB_MISSING/);
 await assert.rejects(prisma.$executeRaw`INSERT INTO xera_quota_recovery_policy_attempts(attempt_id,phase,request_id,details) VALUES(${randomUUID()}::uuid,'OBSERVED',${request}::uuid,'{}')`,/original intent/);
 for(let n=0;n<25;n++)await prisma.$executeRaw`INSERT INTO xera_quota_recovery_policy_attempts(attempt_id,phase,request_id,details) VALUES(${randomUUID()}::uuid,'REQUESTED',${request}::uuid,'{}')`;
 const page1=await service.details(node,request),page2=await service.details(node,request,page1.nextAfter);
 assert.equal(page1.attempts.length,20);assert.equal(page2.attempts.length,7);assert.equal(page2.nextAfter,null);
 assert.equal(new Set([...page1.attempts,...page2.attempts].map(a=>a.id)).size,27);
 console.log('PASS job history is node-bound, immutable, intent-bound and paginated without dropping attempts');
 assert.equal((await service.list(node,generation)).entries.length,1);
 assert.equal((await service.list(randomUUID(),generation)).entries.length,0);
 await assert.rejects(service.list(node,generation,randomUUID()),/JOB_MISSING/);
 for(let n=0;n<21;n++){
  const id=randomUUID();const payload={...firstBody,requestId:id};
  await prisma.$executeRaw`INSERT INTO xera_quota_recovery_policy_jobs(request_id,generation,node_uuid,actor_uuid,connection_hash,payload)
    SELECT ${id}::uuid,generation,node_uuid,actor_uuid,connection_hash,${JSON.stringify(payload)}::jsonb FROM xera_quota_recovery_policy_jobs WHERE request_id=${request}::uuid`;
 }
 const jobs1=await service.list(node,generation),jobs2=await service.list(node,generation,jobs1.nextAfter);
 assert.equal(jobs1.entries.length,20);assert.equal(jobs2.entries.length,2);assert.equal(jobs2.nextAfter,null);
 assert.equal(new Set([...jobs1.entries,...jobs2.entries].map(j=>j.requestId)).size,22);
 assert.ok(jobs2.entries.some(j=>j.acknowledged));
 assert.deepEqual(await snapshot(excluded),financial);
 console.log('PASS saved operations are node/generation bound, discoverable after reload and paginated 20/2 without loss');


 for(const statement of ["UPDATE xera_quota_recovery_policy_jobs SET actor_uuid=gen_random_uuid()", "UPDATE xera_quota_recovery_policy_jobs SET payload='{}'", "UPDATE xera_quota_recovery_policy_jobs SET result=NULL WHERE result IS NOT NULL", "DELETE FROM xera_quota_recovery_policy_jobs", "TRUNCATE xera_quota_recovery_policy_jobs CASCADE", "DELETE FROM xera_quota_recovery_policy_attempts", "TRUNCATE xera_quota_recovery_policy_attempts"])
  await assert.rejects(prisma.$executeRawUnsafe(statement),/immutable/);
 const stale=randomUUID();mode='blocked';let ready=new Promise(r=>entered=r);const old=service.stage(node,generation,actor,stale);await ready;
 await assert.rejects(service.stage(node,generation,actor,stale),/BUSY/);
 await prisma.$executeRaw`UPDATE xera_quota_recovery_policy_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=${stale}::uuid`;
 mode='ok';await service.stage(node,generation,actor,stale);release();await assert.rejects(old,/LEASE_LOST/);
 assert.deepEqual(calls.at(-1),calls.at(-2));
 assert.equal((await prisma.$queryRaw`SELECT count(*)::int AS count FROM xera_quota_recovery_policy_attempts WHERE request_id=${stale}::uuid AND phase='OBSERVED'`)[0].count,2);
 console.log('PASS concurrent attempts are leased; expired worker cannot overwrite a later confirmed delivery, and both observations are retained');
 const commitRequest=randomUUID();mode='commit';await assert.rejects(service.stage(node,generation,actor,commitRequest),/Injected finish commit failure/);
 await prisma.$executeRaw`UPDATE xera_quota_recovery_policy_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=${commitRequest}::uuid`;
 mode='ok';await service.stage(node,generation,actor,commitRequest);assert.deepEqual(calls.at(-1),calls.at(-2));
 assert.deepEqual(await snapshot(excluded),financial);
 console.log('PASS acknowledgement followed by SQL rollback is recovered by exact-body retry without new credit or a new revision');
 mode='new-generation';const superseded=randomUUID();await assert.rejects(service.stage(node,generation,actor,superseded),/SOURCE_CHANGED/);
 assert.equal((await prisma.$queryRaw`SELECT result FROM xera_quota_recovery_policy_jobs WHERE request_id=${superseded}::uuid`)[0].result,null);
 await assert.rejects(service.stage(node,generation,actor,superseded),/NOT_PENDING/);
 console.log('PASS a new restore generation during RPC preserves observation but cannot publish a successful job');
 generation=(await prisma.$queryRaw`SELECT generation FROM xera_quota_restore_state WHERE singleton`)[0].generation;
 const {QuotaBankRecoveryService}=load(source('quota-bank-recovery.service.ts'),{'@common/database':{},'@common/axios':{}});
 const bank=new QuotaBankRecoveryService(db,tx),bankRequest=randomUUID();
 await bank.capture(generation,bankRequest,actor);
 assert.equal((await bank.compare(bankRequest,generation)).matches,true);
 await prisma.$executeRaw`UPDATE xera_quota_recovery_policy_jobs SET lease_owner=${randomUUID()}::uuid,lease_until=clock_timestamp()+interval '1 second' WHERE request_id=${request}::uuid`;
 assert.equal((await bank.compare(bankRequest,generation)).matches,true);
 const parts=[];let cursor=-1;
 do{const page=await bank.parts(bankRequest,cursor);parts.push(...page.entries);cursor=page.nextAfter;}while(cursor!==null);
 assert.ok(parts.some(p=>p.section==='xera_quota_recovery_policy_jobs'));
 console.log('PASS full recovery bank includes stable policy intent/results and ignores transient lease renewals');

}finally{await db.kysely.destroy();await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
