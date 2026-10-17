// Run after recovery-release-approval-database.integration.cjs on its dedicated fixture.
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {prisma,tx,db,money}=require('./recovery-tail.fixture.cjs'),load=require('./load-typescript.cjs'),dir=path.join(__dirname,'../src/common/host-policy'),{sql}=require('kysely');
(async()=>{try{
 const {QuotaRecoveryReleaseService}=load(path.join(dir,'quota-recovery-release.service.ts'),{'@common/database':{},'@common/axios':{}});
 const {QuotaRecoveryFinalizationService}=load(path.join(dir,'quota-recovery-finalization.service.ts'),{'@common/database':{},'@common/axios':{}});
 const {QuotaReleaseDeliveryService}=load(path.join(dir,'quota-release-delivery.service.ts'),{'@common/database':{},'@common/axios':{}});
 const before=await money(),row=(await prisma.$queryRaw`SELECT * FROM xera_quota_recovery_finalizations WHERE result IS NOT NULL`)[0];assert.ok(row,'First run the finalization fixture');
 const service=new QuotaRecoveryReleaseService(db,tx),fin=new QuotaRecoveryFinalizationService(db,tx),delivery=new QuotaReleaseDeliveryService(db,tx);
 const status=await service.status(row.generation);assert.equal(status.request,row.approval_request);assert.equal(status.total,'2');assert.equal(status.acknowledged,'2');assert.equal(status.finalization,row.request_id);
 const details=await fin.details(row.request_id);assert.equal(details.approvalRequest,status.request);assert.equal(details.result.requestId,row.request_id);assert.equal(details.total,'2');assert.ok(details.attempts.length>=3);assert.ok(details.attempts.every(a=>BigInt(a.checked)<=2n));
 await assert.rejects(fin.details(row.request_id,randomUUID()),/APPROVAL_MISSING/);
 const jobs=await delivery.list(status.request);assert.equal(jobs.entries.length,2);assert.ok(jobs.entries.every(j=>j.name.startsWith('tail-')));
 const rollback=new Error('Rollback display-only history proof');let paging;
 await assert.rejects(tx.withTransaction({timeout:30000},async()=>{
  const context=(await sql`SELECT details FROM xera_quota_recovery_finalization_attempts WHERE request_id=${row.request_id}::uuid AND phase='REQUESTED' LIMIT 1`.execute(db.kysely)).rows[0].details;
  for(let i=1;i<=25;i++){
   const id=randomUUID();await sql`INSERT INTO xera_quota_recovery_finalization_attempts(attempt_id,phase,request_id,details,created_at) VALUES(${id}::uuid,'REQUESTED',${row.request_id}::uuid,${JSON.stringify(context)}::jsonb,'2026-01-01 00:00:00.123000+00'::timestamptz+${i}*interval '1 microsecond')`.execute(db.kysely);
   await sql`INSERT INTO xera_quota_recovery_finalization_attempts(attempt_id,phase,request_id,details) VALUES(${id}::uuid,'OBSERVED',${row.request_id}::uuid,'{"confirmed":false,"error":"UNVERIFIED"}'::jsonb)`.execute(db.kysely);
  }
  const one=await fin.details(row.request_id),two=await fin.details(row.request_id,one.nextAfter);
  assert.equal(one.attempts.length,20);assert.equal(two.attempts.length,details.attempts.length+5);assert.equal(two.nextAfter,null);
  assert.equal(new Set([...one.attempts,...two.attempts].map(a=>a.attempt)).size,details.attempts.length+25);
  paging=[one.attempts.length,two.attempts.length];throw rollback;
 }),error=>error===rollback);
 assert.equal((await fin.details(row.request_id)).attempts.length,details.attempts.length,'Synthetic history must roll back');
 assert.deepEqual(await money(),before);console.log(JSON.stringify({status:true,finalizationAttempts:details.attempts.length,historyPages:paging,scopedCursor:true,nodeNames:true,noMoneyMutation:true}));
}finally{await db.kysely.destroy();await prisma.$disconnect();}})().catch(e=>{console.error(e);process.exitCode=1});
