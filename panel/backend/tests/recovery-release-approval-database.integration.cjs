const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {prisma,tx,db,banks,native,fixture,money,setFailCommit}=require('./recovery-tail.fixture.cjs'),load=require('./load-typescript.cjs');
const dir=path.join(__dirname,'../src/common/host-policy'),hash=value=>createHash('sha256').update(value).digest('hex');
const {QuotaRecoveryReleaseService}=load(path.join(dir,'quota-recovery-release.service.ts'),{'@common/database':{},'@common/axios':{}});
const {QuotaReleaseDeliveryService}=load(path.join(dir,'quota-release-delivery.service.ts'),{'@common/database':{},'@common/axios':{}});
const {readRecoveryObligations}=load(path.join(dir,'quota-recovery-obligations.ts'));
const states=['active','wait','paused','delayed','prioritized','waiting-children','failed'];
let busy=false,offline=false,queueReads=0,nodeReleaseCalls=0,queueServer='a'.repeat(40);
const cutover={recoveryQueueProof:async()=>{assert.equal(tx.isTransactionActive(),false);queueReads++;if(offline)throw Error('Queue unavailable');return {version:'remnacust-usage-queue-proof-v1',scope:'recovery',serverRunId:queueServer,database:15,observedAt:new Date().toISOString(),entries:['node','user'].flatMap(queue=>states.map(state=>({queue,state,key:'fixture:'+queue+':'+state,count:busy&&queue==='user'&&state==='delayed'?'1':'0'})))}}};
(async()=>{try{
 assert.equal(new URL(process.env.RECOVERY_RELEASE_APPROVAL_TEST_DATABASE_URL).pathname,'/remnacust_release_approval_test');assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM _prisma_migrations`)[0].n,180n);
 assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM nodes`)[0].n,0n,'Use a fresh dedicated release approval DB');
 await prisma.$executeRaw`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password) VALUES(901,'release-test-user','release-test-user',now()+interval '1 year','fixture',${randomUUID()}::uuid,'fixture')`;
 await prisma.$executeRaw`INSERT INTO user_traffic(id,used_traffic_bytes,lifetime_used_traffic_bytes) VALUES(901,123,456)`;
 await prisma.$executeRaw`INSERT INTO xera_quota_reserve_pools(kind,key,user_id,window_start,expires_at,baseline_bytes,limit_bytes) VALUES('HOST','approval-preserved-pool',901,'2026-01-01','2030-01-01',37,1000)`;
 await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;const generation=(await prisma.$queryRaw`SELECT generation FROM xera_quota_restore_state`)[0].generation,actor=randomUUID(),fixtures=[];
 for(let index=0;index<2;index++){
  const f=await fixture(generation,false,true);fixtures.push(f);await f.tail.prepare(f.node,f.input,f.actor);const execution=await f.tail.execute(f.node,f.input.requestId,generation,f.actor);
  const bank=await banks.capture(generation,randomUUID(),f.actor),draft={generation,sourceRequest:execution.sourceRequest,bankRequest:bank.requestId,allocations:[],accounts:[],note:'Review exact empty sample before release approval'};
  const preview=await native.preview(f.node,draft),decision=await native.resolve(f.node,{...draft,requestId:randomUUID(),planDigest:preview.planDigest},f.actor);await f.ack.deliver(f.node,generation,f.actor,randomUUID(),decision.requestId);
  const markerBank=await banks.capture(generation,randomUUID(),f.actor),markerDraft={generation,bankRequest:markerBank.requestId,note:'Close only proved current-process exposure before global approval'},markerPlan=await f.closure.preview(f.node,markerDraft);await f.closure.resolve(f.node,{...markerDraft,requestId:randomUUID(),planDigest:markerPlan.planDigest},f.actor);
 }
 const byAddress=new Map(fixtures.map(f=>[f.node+'.invalid',f.ack.axios]));
 const axios={hostPolicy:(opts,...args)=>byAddress.get(opts.address).hostPolicy(opts,...args),usageRecoveryQuiescence:(opts,...args)=>byAddress.get(opts.address).usageRecoveryQuiescence(opts,...args),hostQuotaRecoveryRelease:()=>{nodeReleaseCalls++;throw Error('Approval must not dispatch');}};
 const receipts={acknowledgedQuiescenceSource:async(node,gen)=>fixtures.find(f=>f.node===node).ack.acknowledgedQuiescenceSource(node,gen)};
 const recovery={check:(node,gen,who)=>fixtures.find(f=>f.node===node).recovery.check(node,gen,who)};
 const service=new QuotaRecoveryReleaseService(db,tx,axios,banks,receipts,recovery,cutover);
 axios.hostQuotaRecoveryRelease=(opts,...args)=>{nodeReleaseCalls++;return byAddress.get(opts.address).hostQuotaRecoveryRelease(opts,...args)};
 const delivery=new QuotaReleaseDeliveryService(db,tx,axios,banks,cutover);
 const before=await money();await assert.rejects(banks.captureInTransaction(generation,randomUUID(),actor),/active transaction/);
 assert.ok(Object.values(await readRecoveryObligations(db,generation)).every(value=>value==='0'));
 const bank=await banks.capture(generation,randomUUID(),actor),draft={requestId:randomUUID(),generation,bankRequest:bank.requestId,note:'Approve exact reviewed nodes with paused policies and no new funding'};
 busy=true;await assert.rejects(service.preview(draft,actor),/require recovery/);busy=false;offline=true;await assert.rejects(service.preview(draft,actor),/Queue unavailable/);offline=false;
 const preview=await service.preview(draft,actor);assert.equal(preview.plan.nodes.length,2);assert.equal(preview.approved,false);
 const retryPreview=await service.preview(draft,actor);assert.equal(retryPreview.planDigest,preview.planDigest,'Fresh check timestamps must not change the approved financial plan');
 const approval={...draft,planDigest:preview.planDigest};
 await assert.rejects(service.approve({...approval,planDigest:'0'.repeat(64)},actor),/STALE_PLAN/);
 setFailCommit(async client=>(await client.$queryRaw`SELECT 1 FROM xera_quota_recovery_release_approvals WHERE request_id=${draft.requestId}::uuid`).length>0);
 await assert.rejects(service.approve(approval,actor),/Injected tail COMMIT failure/);
 assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_recovery_release_approvals`)[0].n,0n);assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_recovery_release_jobs`)[0].n,0n);
 const saved=await service.approve(approval,actor);assert.equal(saved.request,draft.requestId);assert.equal(saved.planDigest,preview.planDigest);assert.equal(nodeReleaseCalls,0);
 const jobs=await prisma.$queryRaw`SELECT * FROM xera_quota_recovery_release_jobs ORDER BY node_uuid`;assert.equal(jobs.length,2);assert.ok(jobs.every(job=>job.result===null));
 assert.equal((await banks.compare(bank.requestId,generation)).matches,false,'Original bank predates own saved intents');assert.equal((await banks.compare(saved.baseline,generation)).matches,true,'Post-intent baseline includes exact immutable approval and jobs');
 assert.equal((await readRecoveryObligations(db,generation)).recoveryDeliveries,'2');
 console.log('PASS real source capture/import/ACK/quiescence/checks -> global approval and exact two-node jobs + post-intent bank atomic commit; rollback leaves no partial authorization; no release RPC or money mutation');
 const first=jobs[0],second=jobs[1],firstNode=fixtures.find(f=>f.node===first.node_uuid),secondNode=fixtures.find(f=>f.node===second.node_uuid);
 const multiplierBefore=(await prisma.$queryRaw`SELECT consumption_multiplier FROM nodes WHERE uuid=${first.node_uuid}::uuid`)[0].consumption_multiplier;
 await prisma.$executeRaw`UPDATE nodes SET consumption_multiplier=consumption_multiplier+1 WHERE uuid=${first.node_uuid}::uuid`;
 await assert.rejects(delivery.deliver(first.request_id,actor),/SOURCE_CHANGED/);
 await prisma.$executeRaw`UPDATE nodes SET consumption_multiplier=${multiplierBefore} WHERE uuid=${first.node_uuid}::uuid`;
 await prisma.$executeRaw`UPDATE nodes SET port=port+1 WHERE uuid=${first.node_uuid}::uuid`;
 await assert.rejects(delivery.deliver(first.request_id,actor),/SOURCE_CHANGED/);
 await prisma.$executeRaw`UPDATE nodes SET port=port-1 WHERE uuid=${first.node_uuid}::uuid`;
 queueServer='b'.repeat(40);await assert.rejects(delivery.deliver(first.request_id,actor),/SOURCE_CHANGED/);queueServer='a'.repeat(40);
 busy=true;await assert.rejects(delivery.deliver(first.request_id,actor),/require recovery/);busy=false;
 assert.equal(nodeReleaseCalls,0,'Changed financial baseline, endpoint, queue source or pending work must block before release RPC');
 assert.equal((await delivery.details(first.request_id)).attempts.length,0);
 firstNode.setMode('releaseLost');await assert.rejects(delivery.deliver(first.request_id,actor),/NODE_UNAVAILABLE/);
 assert.equal(firstNode.releaseState().record.state,'RELEASED');assert.equal((await delivery.details(first.request_id)).acknowledgement,null);
 const lost=await delivery.details(first.request_id);assert.equal(lost.attempts.length,1);assert.equal(lost.attempts[0].outcome.confirmed,false);
 firstNode.setMode('normal');const recovered=await delivery.deliver(first.request_id,actor);assert.equal(typeof recovered.attemptId,'string');assert.equal(recovered.acknowledgement.quotaRecovery.record.sequence,'2');assert.deepEqual(firstNode.releaseBodies[0],firstNode.releaseBodies[1]);
 const callsBefore=nodeReleaseCalls;assert.equal((await delivery.deliver(first.request_id,actor)).attemptId,null);assert.equal(nodeReleaseCalls,callsBefore,'Committed historical ACK needs no additional Node call');
 const observed=await delivery.deliver(first.request_id,actor,true);assert.equal(observed.alreadyAcknowledged,false);assert.equal(observed.acknowledgement.quotaRecovery.record.digest,recovered.acknowledgement.quotaRecovery.record.digest);
 const page=await delivery.list(saved.request);assert.equal(page.entries.length,2);await assert.rejects(delivery.list(saved.request,randomUUID()),/JOB_MISSING/);await assert.rejects(delivery.details(first.request_id,randomUUID()),/JOB_MISSING/);
 // A final SQL failure leaves a durable requested attempt and unknown Node
 // outcome, never a fabricated result. Expiry is advanced only in this fixture.
 setFailCommit(async client=>(await client.$queryRaw`SELECT 1 FROM xera_quota_recovery_release_jobs WHERE request_id=${second.request_id}::uuid AND result IS NOT NULL`).length>0);
 await assert.rejects(delivery.deliver(second.request_id,actor),/Injected tail COMMIT failure/);
 assert.equal(secondNode.releaseState().record.state,'RELEASED');assert.equal((await delivery.details(second.request_id)).acknowledgement,null);
 await assert.rejects(delivery.deliver(second.request_id,actor),/BUSY/);
 await prisma.$executeRaw`UPDATE xera_quota_recovery_release_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=${second.request_id}::uuid`;
 secondNode.setMode('releaseInvalid');await assert.rejects(delivery.deliver(second.request_id,actor),/INVALID_ACK/);assert.equal((await delivery.details(second.request_id)).acknowledgement,null);
 secondNode.setMode('normal');await delivery.deliver(second.request_id,actor);assert.deepEqual(secondNode.releaseBodies[0],secondNode.releaseBodies[1]);assert.deepEqual(secondNode.releaseBodies[1],secondNode.releaseBodies[2]);
 for(const job of jobs){
  await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_release_jobs SET payload=jsonb_set(payload,'{journalDigest}',to_jsonb(${'f'.repeat(64)}::text)) WHERE request_id=${job.request_id}::uuid`,/immutable/);
  assert.equal((await banks.compare(saved.baseline,generation)).matches,true,'Attempts, leases and confirmed delivery results are control state');
  await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_release_jobs SET result=NULL WHERE request_id=${job.request_id}::uuid`,/immutable/);
 }
 await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_release_attempts SET details='{}'::jsonb`,/immutable/);
 await assert.rejects(prisma.$executeRaw`TRUNCATE xera_quota_recovery_release_attempts CASCADE`,/immutable/);
 // An expired attempt cannot overwrite or clear a later worker's result.
 const originalRelease=axios.hostQuotaRecoveryRelease;let stealOnce=true;
 axios.hostQuotaRecoveryRelease=async(opts,...args)=>{
  const response=await originalRelease(opts,...args);
  if(stealOnce){stealOnce=false;await prisma.$executeRaw`UPDATE xera_quota_recovery_release_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=${first.request_id}::uuid`;const winner=await delivery.deliver(first.request_id,actor,true);assert.equal(typeof winner.attemptId,'string');}
  return response;
 };
 await assert.rejects(delivery.deliver(first.request_id,actor,true),/LEASE_LOST/);axios.hostQuotaRecoveryRelease=originalRelease;
 const afterSteal=await delivery.details(first.request_id);assert.equal(afterSteal.acknowledgement.quotaRecovery.record.digest,recovered.acknowledgement.quotaRecovery.record.digest);assert.ok(afterSteal.attempts.some(row=>row.outcome?.error==='LEASE_LOST'));
 const auditDetails={actor,payload:first.payload,previous:first.previous,baselineRequest:saved.baseline};
 await assert.rejects(prisma.$executeRaw`INSERT INTO xera_quota_recovery_release_attempts(attempt_id,phase,request_id,details) VALUES(${randomUUID()}::uuid,'OBSERVED',${first.request_id}::uuid,'{"confirmed":true}'::jsonb)`,/original intent/);
 await assert.rejects(prisma.$executeRaw`INSERT INTO xera_quota_recovery_release_attempts(attempt_id,phase,request_id,details) VALUES(${randomUUID()}::uuid,'REQUESTED',${first.request_id}::uuid,${JSON.stringify({...auditDetails,baselineRequest:randomUUID()})}::jsonb)`,/approved intent/);
 // Synthetic display-only attempts test dense microsecond keyset pagination.
 for(let n=1;n<=21;n++){
  const id=randomUUID();await prisma.$executeRaw`INSERT INTO xera_quota_recovery_release_attempts(attempt_id,phase,request_id,details,created_at) VALUES(${id}::uuid,'REQUESTED',${first.request_id}::uuid,${JSON.stringify(auditDetails)}::jsonb,'2026-01-01 00:00:00.123000+00'::timestamptz+${n}*interval '1 microsecond')`;
  await prisma.$executeRaw`INSERT INTO xera_quota_recovery_release_attempts(attempt_id,phase,request_id,details) VALUES(${id}::uuid,'OBSERVED',${first.request_id}::uuid,'{"confirmed":false,"error":"NODE_UNAVAILABLE","acknowledgement":null}'::jsonb)`;
 }
 const history1=await delivery.details(first.request_id),history2=await delivery.details(first.request_id,history1.nextAfter);assert.equal(history1.attempts.length,20);assert.equal(history2.attempts.length,6);assert.equal(history2.nextAfter,null);assert.equal(new Set([...history1.attempts,...history2.attempts].map(row=>row.attempt)).size,26);
 // An actual fresh Node lookup after restart must reject the historical ACK.
 const beforeRestart=nodeReleaseCalls;firstNode.setCore(randomUUID());await assert.rejects(delivery.deliver(first.request_id,actor,true),/SOURCE_CHANGED/);assert.equal(nodeReleaseCalls,beforeRestart);
 assert.equal((await delivery.details(first.request_id)).acknowledgement.quotaRecovery.record.digest,recovered.acknowledgement.quotaRecovery.record.digest);
 console.log('PASS SQL delivery intents precede actual Node release controller; lost reply, final COMMIT rollback, lease expiry, invalid ACK and exact retry preserve original operation; fresh restart check rejects old proof');
 firstNode.setCore(firstNode.liveCore);assert.equal((await readRecoveryObligations(db,generation)).recoveryDeliveries,'0');
 await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_release_approvals SET actor_uuid=gen_random_uuid()`,/immutable/);
 await assert.rejects(prisma.$executeRaw`DELETE FROM xera_quota_recovery_release_jobs`,/immutable/);
 await assert.rejects(prisma.$executeRaw`TRUNCATE xera_quota_recovery_release_attempts,xera_quota_recovery_release_jobs,xera_quota_recovery_release_approvals CASCADE`,/immutable/);
 const originalMultiplier=(await prisma.$queryRaw`SELECT consumption_multiplier FROM nodes WHERE uuid=${fixtures[0].node}::uuid`)[0].consumption_multiplier;
 await prisma.$executeRaw`UPDATE nodes SET consumption_multiplier=consumption_multiplier+1 WHERE uuid=${fixtures[0].node}::uuid`;assert.equal((await banks.compare(saved.baseline,generation)).matches,false,'Other financial changes must still invalidate the post-intent baseline');
 await prisma.$executeRaw`UPDATE nodes SET consumption_multiplier=${originalMultiplier} WHERE uuid=${fixtures[0].node}::uuid`;assert.equal((await banks.compare(saved.baseline,generation)).matches,true);
 const missingId=randomUUID(),missingGeneration=randomUUID(),extraBank=await banks.capture(generation,randomUUID(),actor);
 const audit=(await prisma.$queryRaw`SELECT observations,queue_proof FROM xera_quota_recovery_release_approvals WHERE request_id=${saved.request}::uuid`)[0];
 const incomplete={...preview.plan,requestId:missingId,generation:missingGeneration},incompleteText=JSON.stringify(incomplete);
 await assert.rejects(tx.withTransaction({isolationLevel:'RepeatableRead',timeout:10000},async()=>{
  await require('kysely').sql`INSERT INTO xera_quota_recovery_release_approvals(request_id,generation,actor_uuid,bank_request,baseline_request,request_digest,plan_digest,plan_text,observations,queue_proof)
   VALUES(${missingId}::uuid,${missingGeneration}::uuid,${actor}::uuid,${bank.requestId}::uuid,${extraBank.requestId}::uuid,${hash('incomplete graph test')},${hash(incompleteText)},${incompleteText},${JSON.stringify(audit.observations)}::jsonb,${JSON.stringify(audit.queue_proof)}::jsonb)`.execute(db.kysely);
 }),/release delivery graph differs/);
 assert.equal((await prisma.$queryRaw`SELECT 1 FROM xera_quota_recovery_release_approvals WHERE request_id=${missingId}::uuid`).length,0,'A valid-looking approval cannot commit without its exact delivery graph');
 assert.deepEqual(await money(),before);assert.equal((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state`)[0].reconciled_at,null);
 // Finalization uses NEW confirmed delivery attempts, not saved results.
 const {QuotaRecoveryFinalizationService}=load(path.join(dir,'quota-recovery-finalization.service.ts'),{'@common/database':{}});
 const finalizer=new QuotaRecoveryFinalizationService(db,tx,banks,cutover,delivery);
 const finishInput={requestId:randomUUID(),approvalRequest:saved.request,note:'Resume only after fresh Node acknowledgements and complete financial checks'};
 const staleCore=firstNode.liveCore;
 firstNode.setCore(randomUUID());await assert.rejects(finalizer.finalize(finishInput,actor),/SOURCE_CHANGED/);firstNode.setCore(staleCore);
 assert.equal((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state`)[0].reconciled_at,null);
 assert.equal((await prisma.$queryRaw`SELECT result FROM xera_quota_recovery_finalizations WHERE request_id=${finishInput.requestId}::uuid`)[0].result,null);
 await assert.rejects(finalizer.finalize({...finishInput,note:'Changing an existing intent must fail'},actor),/REQUEST_CONFLICT/);
 await assert.rejects(finalizer.finalize(finishInput,randomUUID()),/REQUEST_CONFLICT/);
 setFailCommit(async client=>(await client.$queryRaw`SELECT 1 FROM xera_quota_recovery_finalizations WHERE request_id=${finishInput.requestId}::uuid AND result IS NOT NULL`).length>0);
 await assert.rejects(finalizer.finalize(finishInput,actor),/Injected tail COMMIT failure/);
 assert.equal((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state`)[0].reconciled_at,null);
 assert.equal((await prisma.$queryRaw`SELECT result FROM xera_quota_recovery_finalizations WHERE request_id=${finishInput.requestId}::uuid`)[0].result,null);
 const requestedFinalization=(await prisma.$queryRaw`SELECT details FROM xera_quota_recovery_finalization_attempts WHERE request_id=${finishInput.requestId}::uuid AND phase='REQUESTED' ORDER BY created_at DESC LIMIT 1`)[0].details;
 const orphanFinalAttempt=randomUUID();
 await assert.rejects(tx.withTransaction({timeout:10000},async()=>{
  await require('kysely').sql`INSERT INTO xera_quota_recovery_finalization_attempts(attempt_id,phase,request_id,details) VALUES(${orphanFinalAttempt}::uuid,'REQUESTED',${finishInput.requestId}::uuid,${JSON.stringify(requestedFinalization)}::jsonb)`.execute(db.kysely);
  await require('kysely').sql`INSERT INTO xera_quota_recovery_finalization_attempts(attempt_id,phase,request_id,details) VALUES(${orphanFinalAttempt}::uuid,'OBSERVED',${finishInput.requestId}::uuid,'{"confirmed":true}'::jsonb)`.execute(db.kysely);
 }),/confirmed finalization has no completion/);
 const expiryOwner=randomUUID();await prisma.$executeRaw`UPDATE xera_quota_recovery_finalizations SET lease_owner=${expiryOwner}::uuid,lease_until=clock_timestamp()+interval '1 hour' WHERE request_id=${finishInput.requestId}::uuid`;
 await assert.rejects(finalizer.finalize(finishInput,actor),/BUSY/);
 await prisma.$executeRaw`UPDATE xera_quota_recovery_finalizations SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=${finishInput.requestId}::uuid`;
 const beforeFinalQueue=axios.hostQuotaRecoveryRelease;let finalQueueCalls=0;
 axios.hostQuotaRecoveryRelease=async(...args)=>{const result=await beforeFinalQueue(...args);if(++finalQueueCalls===2)busy=true;return result;};
 await assert.rejects(finalizer.finalize(finishInput,actor),/require recovery/);axios.hostQuotaRecoveryRelease=beforeFinalQueue;busy=false;
 assert.equal((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state`)[0].reconciled_at,null);
 const {QuotaFinalizationDispatchService}=load(path.join(dir,'quota-finalization-dispatch.service.ts'),{'@common/database':{}});
 const dispatcher=()=>new QuotaFinalizationDispatchService(db,tx,finalizer);
 setFailCommit(async client=>(await client.$queryRaw`SELECT 1 FROM xera_quota_recovery_finalization_dispatches WHERE request_id=${finishInput.requestId}::uuid`).length>0);
 await assert.rejects(finalizer.enqueue(finishInput,actor),/Injected tail COMMIT failure/);
 assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_recovery_finalization_dispatches`)[0].n,0n);
 const beforeEnqueue=nodeReleaseCalls;assert.equal((await finalizer.enqueue(finishInput,actor)).state,'QUEUED');assert.equal(nodeReleaseCalls,beforeEnqueue,'Queueing must not execute node RPC');
 assert.equal((await finalizer.enqueue(finishInput,actor)).state,'QUEUED');assert.equal((await finalizer.details(finishInput.requestId)).dispatch.attempts,'0');
 if(process.env.RECOVERY_RELEASE_TEST_SCENARIO==='restore-during-queue'){
  const moneyBeforeRestore=await money(),callsBeforeRestore=nodeReleaseCalls;
  await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;
  assert.equal(await dispatcher().runOne(),true);
  assert.equal((await finalizer.details(finishInput.requestId)).dispatch.state,'FAILED');
  assert.equal((await finalizer.details(finishInput.requestId)).dispatch.error,'NOT_PENDING');
  assert.equal(nodeReleaseCalls,callsBeforeRestore,'An old queued generation must not dispatch Node commands');
  assert.equal((await finalizer.details(finishInput.requestId)).result,null);
  assert.deepEqual(await money(),moneyBeforeRestore);
  await assert.rejects(finalizer.enqueue(finishInput,actor),/NOT_PENDING/);
  console.log('PASS a queued operation from an earlier restore generation fails without Node RPC, reconciliation or financial edits');
  return;
 }
 // Another worker takes over only after both leases expire. Its failure must
 // survive the stale worker's late completion path.
 const originalDispatchRelease=axios.hostQuotaRecoveryRelease;let stealDispatch=true,newerDispatchError;
 axios.hostQuotaRecoveryRelease=async(...args)=>{
  const response=await originalDispatchRelease(...args);
  if(stealDispatch){stealDispatch=false;
   await prisma.$executeRaw`UPDATE xera_quota_recovery_finalization_dispatches SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=${finishInput.requestId}::uuid`;
   await prisma.$executeRaw`UPDATE xera_quota_recovery_finalizations SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=${finishInput.requestId}::uuid`;
   assert.equal(await dispatcher().runOne(),true);
   const newer=(await finalizer.details(finishInput.requestId)).dispatch;assert.equal(newer.state,'FAILED');assert.ok(['BUSY','NOT_READY'].includes(newer.error));newerDispatchError=newer.error;
  }
  return response;
 };
 assert.equal(await dispatcher().runOne(),true);axios.hostQuotaRecoveryRelease=originalDispatchRelease;
 assert.equal((await finalizer.details(finishInput.requestId)).dispatch.error,newerDispatchError,'Stale owner must not overwrite newer outcome');
 assert.equal((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state`)[0].reconciled_at,null);
 assert.equal((await finalizer.enqueue(finishInput,actor)).state,'QUEUED','Explicit same-body retry requeues failed work');
 const abandoned=await dispatcher().claim();assert.ok(abandoned);assert.equal(await dispatcher().runOne(),false,'Active queue owner must not be stolen');
 await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_finalization_dispatches SET lease_owner=gen_random_uuid(),attempts=attempts+1 WHERE request_id=${finishInput.requestId}::uuid`,/active lease/);
 await prisma.$executeRaw`UPDATE xera_quota_recovery_finalization_dispatches SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=${finishInput.requestId}::uuid`;
 setFailCommit(async client=>(await client.$queryRaw`SELECT 1 FROM xera_quota_recovery_finalization_dispatches WHERE request_id=${finishInput.requestId}::uuid AND state='COMPLETED'`).length>0);
 const finishCalls=nodeReleaseCalls;await assert.rejects(dispatcher().runOne(),/Injected tail COMMIT failure/);
 const finished=(await finalizer.details(finishInput.requestId)).result;assert.ok(finished,'Financial completion must survive a lost queue outcome commit');
 assert.equal((await finalizer.details(finishInput.requestId)).dispatch.state,'RUNNING');
 const afterFinancialFinish=nodeReleaseCalls;
 await prisma.$executeRaw`UPDATE xera_quota_recovery_finalization_dispatches SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=${finishInput.requestId}::uuid`;
 assert.equal(await dispatcher().runOne(),true);assert.equal(nodeReleaseCalls,afterFinancialFinish,'Known financial result must not resend Node commands');
 assert.equal((await finalizer.details(finishInput.requestId)).dispatch.state,'COMPLETED');
 assert.equal((await finalizer.enqueue(finishInput,actor)).state,'COMPLETED');
 await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_finalization_dispatches SET state='QUEUED' WHERE request_id=${finishInput.requestId}::uuid`,/immutable/);
 console.log('PASS durable enqueue executes no RPC; active leases resist theft, expired work resumes, stale outcome cannot replace newer failure, and lost queue COMMIT replays completed financial result without Node RPC');
 assert.equal(nodeReleaseCalls-finishCalls,2,'Every node must be freshly acknowledged');
 assert.equal(finished.generation,generation);assert.equal(finished.requestId,finishInput.requestId);
 const liveCoordinator=(await prisma.$queryRaw`SELECT phase,generation,lease_owner,roster,allocation_cursor FROM xera_quota_coordinator WHERE id=1`)[0];
 assert.equal(liveCoordinator.phase,'PREFLIGHT');assert.equal(liveCoordinator.generation,finished.coordinatorGeneration);assert.equal(liveCoordinator.lease_owner,null);assert.deepEqual(liveCoordinator.roster,[]);assert.equal(liveCoordinator.allocation_cursor,0n);
 assert.ok((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state`)[0].reconciled_at);
 assert.deepEqual(await money(),before,'Handoff must not mint new credit or alter billed usage');
 const afterFinishCalls=nodeReleaseCalls;assert.deepEqual(await finalizer.finalize(finishInput,actor),finished);assert.equal(nodeReleaseCalls,afterFinishCalls);
 await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_recovery_finalizations SET result=NULL,completed_at=NULL WHERE request_id=${finishInput.requestId}::uuid`,/immutable/);
 await assert.rejects(prisma.$executeRaw`TRUNCATE xera_quota_recovery_finalization_checks`,/immutable/);
 console.log('PASS finalization reobserves all nodes; restart and final COMMIT rollback preserve quarantine; atomic PREFLIGHT handoff leaves money unchanged; completed intent replay is offline');
 // A new restore must quarantine again, while completed historical operations
 // remain replayable without granting authority in this generation.
 await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;
 assert.deepEqual(await finalizer.finalize(finishInput,actor),finished);
 const observedQueues=queueReads;cutover.recoveryQueueProof=()=>{throw Error('Known result must not consult queues')};recovery.check=()=>{throw Error('Known result must not consult nodes')};
 assert.deepEqual(await service.approve(approval,actor),saved);assert.equal(queueReads,observedQueues);await assert.rejects(service.approve({...approval,note:'Changed reason cannot reuse an approved operation'},actor),/REQUEST_CONFLICT/);await assert.rejects(service.approve(approval,randomUUID()),/REQUEST_CONFLICT/);
 await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;assert.deepEqual(await service.approve(approval,actor),saved);assert.ok(nodeReleaseCalls>0);
 console.log('PASS immutable approved graph and result guards; leases/confirmed results preserve baseline, real financial edits invalidate it, exact historical replay is offline and no reconciliation/funding is fabricated');
}finally{await db.kysely.destroy();await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1});
