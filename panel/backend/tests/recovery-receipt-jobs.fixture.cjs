// Invoked by the real native recovery SQL fixture after its financial COMMIT.
const assert = require('node:assert/strict');
const {randomUUID,createHash} = require('node:crypto');
const path = require('node:path');
const load = require('./load-typescript.cjs');
module.exports = async ({prisma,db,tx,native,node,stream,core,generation,actor,decision,ackSource,state,setFailCommit}) => {
 const mocks={'@common/database':{},'@common/axios':{}};
 const dir=path.join(__dirname,'../src/common/host-policy');
 const {QuotaRecoveryReceiptService}=load(path.join(dir,'quota-recovery-receipt.service.ts'),mocks);
 const {QuotaRecoveryPolicyService}=load(path.join(dir,'quota-recovery-policy.service.ts'),mocks);
 await prisma.$executeRaw`INSERT INTO xera_quota_node_modes(node_uuid,phase,instance_uuid) VALUES(${node}::uuid,'ACTIVE',${stream}::uuid)`;
 const fence={version:'remnacust-quota-recovery-fence-v1',generation,token:randomUUID(),state:'FENCED',sequence:'1',previous:null};
 fence.digest=createHash('sha256').update([fence.version,fence.generation,fence.token,fence.state,fence.sequence,'-',''].join('\n')).digest('hex');
 const status={applied:true,quotaRecoveryReceiptsSupported:true,quotaRecoveryPoliciesSupported:true,quotaFencesSupported:true,userQuotaRequired:true,quotaInstanceId:stream,policyRevision:'1',policyGeneration:randomUUID(),coreProcessId:core,quotaRecovery:{version:fence.version,record:fence}};
 let mode='lost',calls=[],entered,release;
 const axios={
  hostPolicy:async()=>{assert.equal(tx.isTransactionActive(),false);return {isOk:true,response:structuredClone(status)};},
  hostQuotaRecoveryPolicy:async(_,body)=>{
   assert.equal(tx.isTransactionActive(),false);
   status.policyRevision=body.policyRevision;status.policyGeneration=randomUUID();
   return {isOk:true,response:{requestId:body.requestId,coreProcessId:body.coreProcessId,instance:body.instance,policyRevision:body.policyRevision,policyGeneration:status.policyGeneration,quotaRecovery:structuredClone(status.quotaRecovery)}};
  },
  usageRecoveryAck:async(_,body)=>{
   assert.equal(tx.isTransactionActive(),false);calls.push(structuredClone(body));
   const job=(await prisma.$queryRaw`SELECT source FROM xera_quota_recovery_receipt_jobs WHERE request_id=${body.requestId}::uuid`)[0];
   assert.equal(job.source.receipt.digest,ackSource.receipt.digest);
   const attempt=(await prisma.$queryRaw`SELECT details FROM xera_quota_recovery_receipt_attempts WHERE request_id=${body.requestId}::uuid AND phase='REQUESTED' ORDER BY created_at DESC LIMIT 1`)[0];
   assert.deepEqual(attempt.details.payload,body);
   const response={version:'remnacust-recovery-usage-ack-v1',...body,alreadyAcknowledged:calls.length>1,acknowledgement:{stream,sequence:body.receipt.sequence,acknowledged:true},journal:{stream,acked:body.receipt.sequence,ackDigest:body.receipt.digest,digest:'b'.repeat(64),pending:null},recovery:structuredClone(fence)};
   delete response.receipt;
   if(mode==='lost')return {isOk:false,code:'NODE_HTTP_TIMEOUT'};
   if(mode==='blocked'){entered();await new Promise(r=>release=r);}
   if(mode==='commit')setFailCommit();
   return {isOk:true,response};
  },
 };
 const held=new QuotaRecoveryPolicyService(db,tx,axios),service=new QuotaRecoveryReceiptService(db,tx,axios,native);
 const financial=await state(),request=randomUUID();
 await assert.rejects(service.deliver(node,generation,actor,request,decision),/HELD_POLICY_REQUIRED/);assert.equal(calls.length,0);
 await held.stage(node,generation,actor,randomUUID());
 await assert.rejects(service.deliver(node,generation,actor,request,decision),/NODE_UNAVAILABLE/);
 assert.equal(calls.length,1);assert.deepEqual(await state(),financial);
 await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_receipt_jobs SET result='{}' WHERE request_id=${request}::uuid`,/check constraint/);
 const first=calls[0];
 status.coreProcessId=randomUUID();mode='ok';
 await assert.rejects(service.deliver(node,generation,actor,request,decision),/HELD_POLICY_REQUIRED/);assert.equal(calls.length,1);
 await held.stage(node,generation,actor,randomUUID());
 const result=await service.deliver(node,generation,actor,request,decision);
 assert.equal(result.acknowledgement.alreadyAcknowledged,true);assert.equal(calls[1].coreProcessId,status.coreProcessId);assert.notEqual(calls[1].coreProcessId,first.coreProcessId);
 assert.deepEqual(calls[1].receipt,first.receipt);assert.equal(calls[1].receipt.coreProcessId,core);assert.equal(calls[1].sourceDigest,first.sourceDigest);
 assert.equal((await service.deliver(node,generation,actor,request,decision)).alreadyAcknowledged,true);assert.equal(calls.length,2);
 await assert.rejects(service.deliver(node,generation,randomUUID(),request,decision),/REQUEST_CONFLICT/);
 await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_receipt_jobs SET source='{}' WHERE request_id=${request}::uuid`,/immutable/);
 await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_receipt_jobs SET result=NULL WHERE request_id=${request}::uuid`,/immutable/);
 await assert.rejects(prisma.$executeRaw`INSERT INTO xera_quota_recovery_receipt_attempts(attempt_id,phase,request_id,details) VALUES(${randomUUID()}::uuid,'OBSERVED',${request}::uuid,'{}')`,/original intent/);
 const history=await service.details(node,request);assert.equal(history.attempts.length,2);assert.equal(history.attempts.filter(a=>a.details.confirmed).length,1);
 assert.deepEqual(history.attempts.map(a=>a.payload.receipt),[first.receipt,first.receipt]);
 await assert.rejects(service.details(randomUUID(),request),/JOB_MISSING/);
 await assert.rejects(service.details(node,request,randomUUID()),/JOB_MISSING/);
 for(let i=0;i<21;i++)await prisma.$executeRaw`INSERT INTO xera_quota_recovery_receipt_attempts(attempt_id,phase,request_id,details) VALUES(${randomUUID()}::uuid,'REQUESTED',${request}::uuid,'{}')`;
 const page=await service.details(node,request),tail=await service.details(node,request,page.nextAfter);
 assert.equal(page.attempts.length,20);assert.equal(tail.attempts.length,3);assert.equal(tail.nextAfter,null);assert.equal(new Set([...page.attempts,...tail.attempts].map(a=>a.id)).size,23);
 assert.equal((await service.list(node,generation,decision)).entries.length,1);
 assert.equal((await service.list(node,generation,randomUUID())).entries.length,0);
 await assert.rejects(service.list(node,generation,decision,randomUUID()),/JOB_MISSING/);
 for(let i=0;i<21;i++)await prisma.$executeRaw`INSERT INTO xera_quota_recovery_receipt_jobs(request_id,generation,node_uuid,actor_uuid,decision_request,connection_hash,source)
     SELECT ${randomUUID()}::uuid,generation,node_uuid,actor_uuid,decision_request,connection_hash,source FROM xera_quota_recovery_receipt_jobs WHERE request_id=${request}::uuid`;
 const jobsPage=await service.list(node,generation,decision),jobsTail=await service.list(node,generation,decision,jobsPage.nextAfter);
 assert.equal(jobsPage.entries.length,20);assert.equal(jobsTail.entries.length,2);assert.equal(jobsTail.nextAfter,null);
 assert.equal(new Set([...jobsPage.entries,...jobsTail.entries].map(j=>j.requestId)).size,22);
 console.log('PASS durable receipt intent precedes RPC; lost reply rebinds LIVE core only after matching held policy; original financial source and frame core never change');
 const rollback=randomUUID(),beforeCalls=calls.length;
 setFailCommit();await assert.rejects(service.deliver(node,generation,actor,rollback,decision),/COMMIT failure/);assert.equal(calls.length,beforeCalls);
 assert.equal((await prisma.$queryRaw`SELECT count(*)::int AS n FROM xera_quota_recovery_receipt_jobs WHERE request_id=${rollback}::uuid`)[0].n,0);
 mode='commit';await assert.rejects(service.deliver(node,generation,actor,rollback,decision),/COMMIT failure/);
 assert.equal((await prisma.$queryRaw`SELECT result FROM xera_quota_recovery_receipt_jobs WHERE request_id=${rollback}::uuid`)[0].result,null);
 await prisma.$executeRaw`UPDATE xera_quota_recovery_receipt_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=${rollback}::uuid`;
 mode='ok';await service.deliver(node,generation,actor,rollback,decision);
 const concurrent=randomUUID();mode='blocked';const wait=new Promise(r=>entered=r),running=service.deliver(node,generation,actor,concurrent,decision);await wait;
 await assert.rejects(service.deliver(node,generation,actor,randomUUID(),decision),/BUSY/);
 await assert.rejects(held.stage(node,generation,actor,randomUUID()),/BUSY/);
 release();await running;mode='ok';
 assert.deepEqual(await state(),financial);
 assert.equal((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state WHERE singleton`)[0].reconciled_at,null);
 for(const statement of ['DELETE FROM xera_quota_recovery_receipt_jobs','TRUNCATE xera_quota_recovery_receipt_jobs CASCADE','DELETE FROM xera_quota_recovery_receipt_attempts','TRUNCATE xera_quota_recovery_receipt_attempts'])await assert.rejects(prisma.$executeRawUnsafe(statement),/immutable/);
 console.log('PASS SQL prepare/observation COMMIT failures retain retry semantics; receipt and held-policy deliveries exclude each other; ACK never bills, releases the gate or grants credit');
};
