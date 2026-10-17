// Dedicated disposable SQL database; shared Node transport fixture is controlled.
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),k=require('kysely'),load=require('./load-typescript.cjs');
const {prisma,tx,db,banks,native,fixture,money,setFailCommit}=require('./recovery-tail.fixture.cjs');
const dir=path.join(__dirname,'../src/common/host-policy'),hash=value=>createHash('sha256').update(value).digest('hex');
const closureReplays=[];
(async()=>{try{
 assert.equal((await prisma.$queryRaw`SHOW data_directory`)[0].data_directory.replaceAll('\\','/'),'D:/dedik/.remnacust-test-tools/quota-recovery-pg184-20261016/data');
 assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM _prisma_migrations`)[0].n,180n);
 await prisma.$executeRaw`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password)
     VALUES(901,'tail-preserved-user','tail-preserved-user',now()+interval '1 year','fixture',${randomUUID()}::uuid,'fixture') ON CONFLICT(id) DO NOTHING`;
 await prisma.$executeRaw`INSERT INTO user_traffic(id,used_traffic_bytes,lifetime_used_traffic_bytes) VALUES(901,123,456) ON CONFLICT(id) DO NOTHING`;
 await prisma.$executeRaw`INSERT INTO xera_quota_reserve_pools(kind,key,user_id,window_start,expires_at,baseline_bytes,limit_bytes)
     VALUES('HOST','tail-preserved-pool',901,'2026-01-01','2030-01-01',37,1000) ON CONFLICT DO NOTHING`;
 await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;const generation=(await prisma.$queryRaw`SELECT generation FROM xera_quota_restore_state WHERE singleton`)[0].generation;
 for(const retained of [false,true]){
  const f=await fixture(generation,retained),beforeMoney=await money();
  if(!retained)f.input.note='界'.repeat(2000);
  const ticket=()=>prisma.$queryRaw`SELECT next_sequence::text AS sequence,expected_core::text AS core,consumption_multiplier::text AS multiplier,committed_digest AS digest,pending_effects FROM xera_node_usage_streams WHERE node_uuid=${f.node}::uuid`;
  const before=await ticket();
  assert.equal((await f.tail.details(f.node,f.input.acknowledgementRequest,generation)).preparation,null);
  if(!retained){f.setMode('unsupported');await assert.rejects(f.tail.prepare(f.node,f.input,f.actor),/SAMPLE_UNSUPPORTED/);assert.deepEqual(await ticket(),before);f.setMode('normal');}
  await assert.rejects(f.tail.prepare(f.node,{...f.input,acknowledgementRequest:randomUUID()},f.actor),/ACK_REQUIRED/);assert.deepEqual(await ticket(),before);
  await prisma.$executeRaw`UPDATE xera_quota_recovery_receipt_jobs SET lease_owner=${randomUUID()}::uuid,lease_until=clock_timestamp()+interval '1 minute' WHERE request_id=${f.input.acknowledgementRequest}::uuid`;
  await assert.rejects(f.tail.prepare(f.node,f.input,f.actor),/BUSY/);assert.deepEqual(await ticket(),before);
  await prisma.$executeRaw`UPDATE xera_quota_recovery_receipt_jobs SET lease_owner=NULL,lease_until=NULL WHERE request_id=${f.input.acknowledgementRequest}::uuid`;
  await assert.rejects(tx.withTransaction({timeout:10000},()=>f.tail.prepare(f.node,f.input,f.actor)),/standalone/);
  f.setMode('unapplied');await assert.rejects(f.tail.prepare(f.node,f.input,f.actor),/SOURCE_CHANGED/);assert.deepEqual(await ticket(),before);
  f.setMode('unheld');await assert.rejects(f.tail.prepare(f.node,f.input,f.actor),/HELD_POLICY_REQUIRED/);assert.deepEqual(await ticket(),before);
  f.setMode('normal');const saved=structuredClone(f.journal);f.journal.acked='0';f.journal.ackDigest='';f.journal.pending=null;
  await assert.rejects(f.tail.prepare(f.node,f.input,f.actor),/differs/);assert.deepEqual(await ticket(),before);Object.assign(f.journal,saved);
  f.setMode('commit');await assert.rejects(f.tail.prepare(f.node,f.input,f.actor),/COMMIT failure/);assert.deepEqual(await ticket(),before);
  assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_recovery_tail_preparations WHERE request_id=${f.input.requestId}::uuid`)[0].n,0n);
  f.setMode('normal');const result=await f.tail.prepare(f.node,f.input,f.actor),after=await ticket();
  assert.equal(after[0].sequence,'2');assert.equal(after[0].core,retained?f.oldCore:f.liveCore);assert.equal(after[0].multiplier,'1500000000');assert.equal(after[0].digest,null);assert.equal(after[0].pending_effects,null);
  assert.equal(result.plan.requiresSampling,!retained);assert.equal(result.plan.preparedUnder.coreProcessId,f.liveCore);assert.equal(Boolean(result.plan.retainedDigest),retained);
  const savedView=await f.tail.details(f.node,f.input.acknowledgementRequest,generation);assert.equal(savedView.preparation.request,result.request);assert.equal(savedView.sourceRequest,retained?result.source:null);assert.equal(savedView.sourceConflict,false);
  const calls=f.calls();const replays=await Promise.all([f.tail.prepare(f.node,f.input,f.actor),f.tail.prepare(f.node,f.input,f.actor)]);assert.deepEqual(replays,[result,result]);assert.equal(f.calls(),calls,'Known preparation must not read or sample a node again');
  for(const patch of [{consumptionMultiplier:'1'},{note:'A changed reviewed note'},{requestId:randomUUID()}])await assert.rejects(f.tail.prepare(f.node,{...f.input,...patch},f.actor),/REQUEST_CONFLICT/);
  await assert.rejects(f.tail.prepare(f.node,f.input,randomUUID()),/REQUEST_CONFLICT/);
  await assert.rejects(f.tail.execute(f.node,f.input.requestId,generation,randomUUID()),/REQUEST_CONFLICT/);
  if(!retained){
   f.setMode('unsupported');await assert.rejects(f.tail.execute(f.node,f.input.requestId,generation,f.actor),/SAMPLE_UNSUPPORTED/);assert.equal(f.samples(),0);
   f.setMode('sampleLost');await assert.rejects(f.tail.execute(f.node,f.input.requestId,generation,f.actor),/NODE_UNAVAILABLE/);assert.equal(f.samples(),1);assert.equal(f.journal.pending.sequence,'2');
  }
  f.setMode('normal');const captured=await f.tail.execute(f.node,f.input.requestId,generation,f.actor);
  assert.equal(captured.sequence,'2');assert.equal(captured.coreProcessId,retained?f.oldCore:f.liveCore);assert.equal(captured.counters,1);assert.equal(f.samples(),retained?0:1);
  if(retained)assert.equal(captured.sourceRequest,result.source);else{
   const again=await f.tail.execute(f.node,f.input.requestId,generation,f.actor);assert.equal(again.digest,captured.digest);assert.equal(f.samples(),1);assert.deepEqual(f.sampleBodies[0],f.sampleBodies[1]);assert.deepEqual(f.sampleBodies[1],f.sampleBodies[2]);
  }
  const detail=await native.details(f.node,captured.sourceRequest,generation);assert.equal(detail.alreadyCommitted,false);assert.deepEqual(detail.owners,[{u:'901',b:retained?'4':'10',n:f.node}]);
  assert.deepEqual(await ticket(),after,'Capturing next source cannot commit billing or advance its prepared ticket');
  const readback=await f.tail.details(f.node,f.input.acknowledgementRequest,generation);assert.ok(readback.sourceRequest);assert.equal(readback.sourceConflict,false);
  const oldValue=f.journal.pending.stats[0].value;f.journal.pending.stats[0].value=String(BigInt(oldValue)+1n);await f.captures.capture(f.node,generation,f.actor);f.journal.pending.stats[0].value=oldValue;
  const conflict=await f.tail.details(f.node,f.input.acknowledgementRequest,generation);assert.equal(conflict.sourceConflict,true);assert.equal(conflict.sourceRequest,null);
  const beforeConflict=f.calls();await assert.rejects(f.tail.execute(f.node,f.input.requestId,generation,f.actor),/SOURCE_CHANGED/);assert.equal(f.calls(),beforeConflict);
  await assert.rejects(native.details(f.node,captured.sourceRequest,generation),/SOURCE_INVALID/);
  assert.deepEqual(await money(),beforeMoney);assert.equal((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state WHERE singleton`)[0].reconciled_at,null);
  console.log('PASS '+(retained?'retained old-core packet without reset':'prepared fresh sample after lost response')+': actual Node controller + SQL prepared ticket, original capture ready for native import, no second native reset, explicit pricing and no money/release');
 }
 for(const fault of ['normal','witnessLost','witnessCommit']){
  const f=await fixture(generation,false,true),beforeMoney=await money();
  await f.tail.prepare(f.node,f.input,f.actor);f.setMode(fault);
  if(fault==='witnessLost')await assert.rejects(f.tail.execute(f.node,f.input.requestId,generation,f.actor),/NODE_UNAVAILABLE/);
  if(fault==='witnessCommit')await assert.rejects(f.tail.execute(f.node,f.input.requestId,generation,f.actor),/Injected tail COMMIT failure/);
  if(fault!=='normal')assert.equal((await prisma.$queryRaw`SELECT 1 FROM xera_quota_recovery_quiescence WHERE preparation_request=${f.input.requestId}::uuid`).length,0);
  f.setMode('normal');const result=await f.tail.execute(f.node,f.input.requestId,generation,f.actor);
  assert.equal(f.samples(),1);assert.equal(result.counters,0);
  const rows=await prisma.$queryRaw`SELECT witness,witness_digest AS digest FROM xera_quota_recovery_quiescence WHERE preparation_request=${f.input.requestId}::uuid`;
  if(fault==='witnessLost'){assert.equal(result.quiescenceDigest,null);assert.equal(rows.length,0);}
  else{
   assert.equal(rows.length,1);assert.equal(result.quiescenceDigest,rows[0].digest);
   const codec=load(path.join(__dirname,'../src/common/host-policy/recovery-quiescence.ts'));assert.equal(codec.recoveryQuiescenceSchema.safeParse(rows[0].witness).success,true);
   const retry=await f.tail.execute(f.node,f.input.requestId,generation,f.actor);assert.equal(retry.quiescenceDigest,result.quiescenceDigest);assert.equal(f.samples(),1);
   const bank=await banks.capture(generation,randomUUID(),f.actor),draft={generation,sourceRequest:result.sourceRequest,bankRequest:bank.requestId,allocations:[],accounts:[],note:'Final empty frame reviewed before explicit acknowledgement'};
   const planned=await native.preview(f.node,draft),decision=await native.resolve(f.node,{...draft,requestId:randomUUID(),planDigest:planned.planDigest},f.actor);
   assert.equal(await tx.withTransaction({timeout:10000},()=>f.ack.acknowledgedQuiescenceSource(f.node,generation)),null,'Financial import alone is not an ACK');
   await assert.rejects(f.closure.preview(f.node,{generation,bankRequest:bank.requestId,note:'Close covered current-process markers'}),/SOURCE_CHANGED/);
   const pendingReport=await f.recovery.check(f.node,generation,f.actor);assert.ok(pendingReport.report.issues.includes('PENDING_RECEIPT'));assert.equal(pendingReport.report.acknowledgedReceipt,undefined);
   const acked=await f.ack.deliver(f.node,generation,f.actor,randomUUID(),decision.requestId);assert.ok(acked);
   await assert.rejects(f.ack.acknowledgedQuiescenceSource(f.node,generation),/active transaction/);
   const candidate=await tx.withTransaction({timeout:10000},()=>f.ack.acknowledgedQuiescenceSource(f.node,generation));assert.ok(candidate);assert.equal(candidate.witness.digest,result.quiescenceDigest);assert.equal(candidate.decisionRequest,decision.requestId);
   const proof=await f.readQuiescence(f.sampleBodies[0]);assert.equal(proof.isOk,true);assert.equal(codec.recoveryQuiescenceAcknowledged(f.sampleBodies[0],proof.response),true);
   assert.equal(proof.response.journal.acked,'2');assert.equal(proof.response.journal.pending,null);assert.equal(f.samples(),1);
   let closeBank=await banks.capture(generation,randomUUID(),f.actor),closeDraft={generation,bankRequest:closeBank.requestId,note:'Close covered current-process markers, preserving unknown processes'};
   let closePreview=await f.closure.preview(f.node,closeDraft);assert.equal(closePreview.plan.scope.eligible,'1');assert.equal(closePreview.plan.scope.remaining,'0');
   const staleApproval={...closeDraft,requestId:randomUUID(),planDigest:closePreview.planDigest};
   await prisma.$executeRaw`UPDATE xera_quota_usage_exposures SET last_revision=2 WHERE node_uuid=${f.node}::uuid AND key='closure-covered'`;
   await assert.rejects(f.closure.resolve(f.node,staleApproval,f.actor),/STALE_PLAN/);
   closeBank=await banks.capture(generation,randomUUID(),f.actor);closeDraft={...closeDraft,bankRequest:closeBank.requestId};closePreview=await f.closure.preview(f.node,closeDraft);
   const closeApproval={...closeDraft,requestId:randomUUID(),planDigest:closePreview.planDigest};
   f.setMode('proofUnavailable');await assert.rejects(f.closure.resolve(f.node,closeApproval,f.actor),/NODE_UNAVAILABLE/);f.setMode('normal');
   await assert.rejects(f.closure.resolve(f.node,{...closeApproval,planDigest:'e'.repeat(64)},f.actor),/STALE_PLAN/);
   f.setMode('witnessCommit');await assert.rejects(f.closure.resolve(f.node,closeApproval,f.actor),/Injected tail COMMIT failure/);
   assert.equal((await prisma.$queryRaw`SELECT 1 FROM xera_quota_usage_exposures WHERE node_uuid=${f.node}::uuid`).length,1);
   assert.equal((await prisma.$queryRaw`SELECT 1 FROM xera_quota_recovery_exposure_closures WHERE request_id=${closeApproval.requestId}::uuid`).length,0);
   f.setProofHook(async()=>{await f.closure.resolve(f.node,closeApproval,f.actor);throw Error('Lost outer observation after concurrent exact commit');});
   const closed=await f.closure.resolve(f.node,closeApproval,f.actor);assert.equal(closed.plan.scope.eligible,'1');
   f.setProofHook(async()=>{throw Error('Committed replay must not contact the Node');});assert.deepEqual(await f.closure.resolve(f.node,closeApproval,f.actor),closed);f.setProofHook(null);
   closureReplays.push({f,input:closeApproval,result:closed});
   await assert.rejects(f.closure.resolve(f.node,{...closeApproval,note:'Different reason cannot reuse the request'},f.actor),/REQUEST_CONFLICT/);
   assert.equal((await prisma.$queryRaw`SELECT 1 FROM xera_quota_usage_exposures WHERE node_uuid=${f.node}::uuid`).length,0);
   const checked=await f.recovery.check(f.node,generation,f.actor);assert.deepEqual(checked.report.issues,[]);assert.equal(checked.report.acknowledgedReceipt.digest,proof.response.witness.frame.digest);
   await prisma.$executeRaw`INSERT INTO xera_quota_usage_exposures(node_uuid,core_uuid,instance_uuid,kind,key,user_id,first_revision,last_revision,unbounded) VALUES(${f.node}::uuid,${f.oldCore}::uuid,${f.stream}::uuid,'USER','global',901,1,1,true)`;
   await prisma.$executeRaw`INSERT INTO xera_quota_usage_exposures(node_uuid,core_uuid,instance_uuid,kind,key,user_id,first_revision,last_revision,unbounded,exposed_at)
       SELECT ${f.node}::uuid,${f.liveCore}::uuid,${f.stream}::uuid,'HOST','covered-again',901,1,1,true,s.requested_at-interval '1 second' FROM xera_node_usage_streams s WHERE s.node_uuid=${f.node}::uuid`;
   await prisma.$executeRaw`INSERT INTO xera_quota_usage_exposures(node_uuid,core_uuid,instance_uuid,kind,key,user_id,first_revision,last_revision,unbounded,exposed_at)
       VALUES(${f.node}::uuid,${f.liveCore}::uuid,${f.stream}::uuid,'HOST','future-revision',901,1,9223372036854775807,true,'2026-01-01'),
       (${f.node}::uuid,${f.liveCore}::uuid,${f.stream}::uuid,'HOST','after-sample',901,1,1,true,clock_timestamp()),
       (${f.node}::uuid,${f.liveCore}::uuid,${randomUUID()}::uuid,'HOST','other-instance',901,1,1,true,'2026-01-01')`;
   await prisma.$executeRaw`INSERT INTO xera_quota_usage_exposures(node_uuid,core_uuid,instance_uuid,kind,key,user_id,first_revision,last_revision,unbounded,exposed_at,fenced_at,fenced_sequence)
       VALUES(${f.node}::uuid,${f.liveCore}::uuid,${f.stream}::uuid,'HOST','future-sequence',901,1,1,true,'2026-01-01',clock_timestamp(),3)`;
   const secondBank=await banks.capture(generation,randomUUID(),f.actor),secondDraft={...closeDraft,bankRequest:secondBank.requestId},secondPreview=await f.closure.preview(f.node,secondDraft);
   assert.equal(secondPreview.plan.scope.eligible,'1');assert.equal(secondPreview.plan.scope.remaining,'5');
   const second=await f.closure.resolve(f.node,{...secondDraft,requestId:randomUUID(),planDigest:secondPreview.planDigest},f.actor);assert.equal(second.plan.scope.remaining,'5');
   assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_usage_exposures WHERE node_uuid=${f.node}::uuid`)[0].n,5n);
   const noneBank=await banks.capture(generation,randomUUID(),f.actor),noneDraft={...closeDraft,bankRequest:noneBank.requestId},none=await f.closure.preview(f.node,noneDraft);assert.equal(none.plan.scope.eligible,'0');
   await assert.rejects(f.closure.resolve(f.node,{...noneDraft,requestId:randomUUID(),planDigest:none.planDigest},f.actor),/NOTHING_TO_CLOSE/);
   assert.equal((await f.closure.details(f.node,generation,closed.requestId)).requestId,closed.requestId);
   await assert.rejects(f.closure.details(randomUUID(),generation,closed.requestId),/NODE_MISSING/);
   await prisma.$executeRaw`INSERT INTO xera_quota_recovery_exposure_closures(request_id,generation,node_uuid,actor_uuid,witness_request,acknowledgement_request,bank_request,request_digest,plan_digest,plan_text,created_at)
       SELECT gen_random_uuid(),generation,node_uuid,actor_uuid,witness_request,acknowledgement_request,bank_request,request_digest,plan_digest,plan_text,
       '2026-01-01 00:00:00.123000+00'::timestamptz+n*interval '1 microsecond' FROM xera_quota_recovery_exposure_closures CROSS JOIN generate_series(1,21)n WHERE request_id=${closed.requestId}::uuid`;
   const page1=await f.closure.list(f.node,generation),page2=await f.closure.list(f.node,generation,page1.nextAfter);assert.equal(page1.entries.length,20);assert.equal(page2.entries.length,3);assert.equal(page2.nextAfter,null);assert.equal(new Set([...page1.entries,...page2.entries].map(row=>row.requestId)).size,23);
   await assert.rejects(f.closure.list(randomUUID(),generation,closed.requestId),/SOURCE_CHANGED/);
   const exposed=await f.recovery.check(f.node,generation,f.actor);assert.ok(exposed.report.issues.includes('USAGE_EXPOSURE'));assert.equal(exposed.report.issues.includes('PENDING_RECEIPT'),false);assert.ok(exposed.report.acknowledgedReceipt);
   const original=structuredClone(f.journal),old=rows[0].witness;
   Object.assign(f.journal,{acked:old.request.prior.sequence,ackDigest:old.request.prior.digest,pending:{sequence:old.frame.sequence,coreProcessId:old.frame.coreProcessId,capturedAt:old.frame.capturedAt,stats:[]}});
   const restored=await f.recovery.check(f.node,generation,f.actor);assert.ok(restored.report.issues.includes('PENDING_RECEIPT'));assert.equal(restored.report.acknowledgedReceipt,undefined);
   Object.assign(f.journal,original);
   f.setProofHook(()=>f.tail.prepare(f.node,{...f.input,requestId:randomUUID(),acknowledgementRequest:acked.requestId},f.actor));
   const raced=await f.recovery.check(f.node,generation,f.actor);assert.ok(raced.report.issues.includes('STATE_CHANGED'));assert.ok(raced.report.issues.includes('PENDING_RECEIPT'));assert.equal(raced.report.acknowledgedReceipt,undefined);
   const following=await f.recovery.check(f.node,generation,f.actor);assert.ok(following.report.issues.includes('PENDING_RECEIPT'));assert.equal(following.report.acknowledgedReceipt,undefined);assert.equal(f.samples(),1);



  }
  assert.deepEqual(await money(),beforeMoney);assert.equal((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state WHERE singleton`)[0].reconciled_at,null);
  console.log('PASS empty-after-fence proof '+fault+': durable binding, no extra sampling, money and pause unchanged');
 }
 for(const statement of ['UPDATE xera_quota_recovery_exposure_closures SET actor_uuid=gen_random_uuid()','DELETE FROM xera_quota_recovery_exposure_closures','TRUNCATE xera_quota_recovery_exposure_closures'])await assert.rejects(prisma.$executeRawUnsafe(statement),/immutable/);
 for(const statement of ['UPDATE xera_quota_recovery_quiescence SET witness_digest=repeat(\'a\',64)','DELETE FROM xera_quota_recovery_quiescence','TRUNCATE xera_quota_recovery_quiescence,xera_quota_recovery_exposure_closures'])await assert.rejects(prisma.$executeRawUnsafe(statement),/immutable/);
 for(const statement of ['UPDATE xera_quota_recovery_tail_preparations SET actor_uuid=gen_random_uuid()','DELETE FROM xera_quota_recovery_tail_preparations','TRUNCATE xera_quota_recovery_tail_preparations,xera_quota_recovery_quiescence,xera_quota_recovery_exposure_closures'])await assert.rejects(prisma.$executeRawUnsafe(statement),/immutable/);
 // An endpoint can be deleted while original financial streams or a planned
 // transition remain. The roster must retain them across every keyset page.
 const orphanNative=Array.from({length:53},()=>randomUUID()),orphanLegacy=randomUUID(),orphanRevision=randomUUID(),orphanDesired=randomUUID();
 const beforeRosterMoney=await money();
 for(const node of orphanNative)await prisma.$executeRaw`INSERT INTO xera_node_usage_streams(stream_id,node_uuid,node_id,expected_core,requested_at,consumption_multiplier) VALUES(${randomUUID()}::uuid,${node}::uuid,901,${randomUUID()}::uuid,clock_timestamp(),1)`;
 await prisma.$executeRaw`INSERT INTO xera_legacy_usage_streams(stream_id,node_uuid,node_id,uncertain_since) VALUES(${randomUUID()}::uuid,${orphanLegacy}::uuid,901,clock_timestamp())`;
 await prisma.$executeRaw`INSERT INTO xera_node_policy_revisions(node_uuid,revision) VALUES(${orphanRevision}::uuid,1)`;
 await prisma.$executeRaw`INSERT INTO xera_quota_transitions(kind,key,user_id,source,phase,finite,limit_bytes,window_start,budget_epoch,desired_nodes)
     VALUES('HOST',${'orphan-'+randomUUID()},901,${'a'.repeat(64)},'RECOVERY',true,100,'2026-01-01',${randomUUID()}::uuid,ARRAY[${orphanDesired}::uuid,${orphanNative[0]}::uuid,NULL,${orphanDesired}::uuid])`;
 const roster=[];let rosterAfter;
 do{const page=await closureReplays[0].f.recovery.status(rosterAfter);assert.ok(page.nodes.length<=50);roster.push(...page.nodes);rosterAfter=page.nextAfter;}while(rosterAfter);
 assert.equal(new Set(roster.map(row=>row.uuid)).size,roster.length);assert.ok(roster.every(row=>typeof row.uuid==='string'));
 for(const node of [...orphanNative,orphanLegacy,orphanRevision,orphanDesired]){
   const row=roster.find(row=>row.uuid===node);assert.ok(row,'Original liability cannot disappear with a missing endpoint');assert.equal(row.name,null);assert.equal(row.report,null);
 }
 assert.deepEqual(await money(),beforeRosterMoney);
 const {RECOVERY_NODE_SOURCES}=load(path.join(dir,'quota-recovery-roster.ts'));
 const {RECOVERY_BANK_TABLES}=load(path.join(dir,'quota-recovery-bank.ts'));
 const financialNodeTables=await prisma.$queryRaw`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='node_uuid' AND table_name=ANY(${RECOVERY_BANK_TABLES}::text[])`;
 for(const row of financialNodeTables)assert.ok(RECOVERY_NODE_SOURCES.includes(row.table_name),'Bank node source missing from roster: '+row.table_name);
 console.log('PASS recovery roster retains endpoint-less native/uncertain legacy/revision/desired-transition nodes across 50-row pages; financial bank node-source coverage and unchanged money');
 const {readRecoveryObligations,requireSettledRecoveryObligations}=load(path.join(dir,'quota-recovery-obligations.ts'));
 const initialObligations=await readRecoveryObligations(db,generation);assert.ok(BigInt(initialObligations.nativeTickets)>=53n);assert.ok(BigInt(initialObligations.legacyStreams)>=1n);
 assert.throws(()=>requireSettledRecoveryObligations(initialObligations),/nativeTickets/);
 const legacyReceipt=hash(randomUUID());await prisma.$executeRaw`INSERT INTO xera_legacy_usage_jobs(receipt,digest,payload) VALUES(${legacyReceipt},${hash('original legacy queue payload')},'[]'::jsonb)`;
 const withLegacyJob=await readRecoveryObligations(db,generation);assert.equal(BigInt(withLegacyJob.legacyJobs),BigInt(initialObligations.legacyJobs)+1n);
 const financialStatus=await closureReplays[0].f.recovery.status();assert.deepEqual(financialStatus.financial,withLegacyJob);
 assert.equal(await readRecoveryObligations(db,randomUUID()),null);
 await prisma.$executeRaw`UPDATE xera_node_usage_streams SET committed_digest=${'a'.repeat(64)},pending_effects='{}'::jsonb WHERE node_uuid=${orphanNative[0]}::uuid`;
 const withOutbox=await readRecoveryObligations(db,generation);assert.equal(BigInt(withOutbox.nativeTickets),BigInt(withLegacyJob.nativeTickets)-1n);assert.equal(BigInt(withOutbox.nativeEffects),BigInt(withLegacyJob.nativeEffects)+1n);
 assert.throws(()=>requireSettledRecoveryObligations(withOutbox),/nativeEffects/);
 // Observe active delivery workers and a zero-ceiling yet unsealed reserve in
 // one real SQL transaction, then roll everything back without issuing RPC.
 await assert.rejects(tx.withTransaction({timeout:10000},async()=>{
   const request=randomUUID(),node=orphanNative[1],owner=randomUUID();
   await k.sql`INSERT INTO xera_quota_coordinator(id,lease_owner,lease_until) VALUES(1,${owner}::uuid,clock_timestamp()+interval '1 hour') ON CONFLICT(id) DO UPDATE SET lease_owner=excluded.lease_owner,lease_until=excluded.lease_until`.execute(db.kysely);
   await k.sql`INSERT INTO xera_quota_recovery_policy_jobs(request_id,generation,node_uuid,actor_uuid,connection_hash,payload,lease_owner,lease_until)
       VALUES(${request}::uuid,${generation}::uuid,${node}::uuid,${owner}::uuid,${'a'.repeat(64)},${JSON.stringify({requestId:request,generation})}::jsonb,${owner}::uuid,clock_timestamp()+interval '1 hour')`.execute(db.kysely);
   await k.sql`INSERT INTO xera_quota_reserves(kind,key,user_id,window_start,budget_epoch,node_uuid,instance_uuid,ceiling_bytes,registration_required)
       SELECT kind,key,user_id,window_start,budget_epoch,${node}::uuid,${randomUUID()}::uuid,0,false FROM xera_quota_reserve_pools ORDER BY usage_account LIMIT 1`.execute(db.kysely);
   const held=await readRecoveryObligations(db,generation);assert.ok(BigInt(held.activeWorkers)>=2n);assert.equal(BigInt(held.recoveryDeliveries),BigInt(withOutbox.recoveryDeliveries)+1n);assert.equal(BigInt(held.unsettledReserves),BigInt(withOutbox.unsettledReserves)+1n);assert.ok(BigInt(held.exposures)>0n);
   assert.throws(()=>requireSettledRecoveryObligations(held),/unsettledReserves.*activeWorkers/);
   throw Error('Rollback obligation observation fixture');
 }),/Rollback obligation observation fixture/);
 assert.deepEqual(await readRecoveryObligations(db,generation),withOutbox);

 assert.deepEqual(await money(),beforeRosterMoney);
 console.log('PASS global obligation counters include off-page native tickets, durable outbox and legacy queue jobs; missing generation is unknown, status exposes exact strings and money is unchanged');

 const request=randomUUID(),actor=randomUUID();await banks.capture(generation,request,actor);assert.equal((await banks.compare(request,generation)).matches,true);
 const parts=[];let cursor=-1;do{const page=await banks.parts(request,cursor);parts.push(...page.entries);cursor=page.nextAfter;}while(cursor!==null);const expected=Number((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_recovery_tail_preparations`)[0].n);assert.ok(expected>=2);assert.equal(parts.filter(p=>p.section==='xera_quota_recovery_tail_preparations').reduce((sum,p)=>sum+p.rows,0),expected);
 const witnessCount=Number((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_recovery_quiescence`)[0].n);assert.ok(witnessCount>=2);assert.equal(parts.filter(p=>p.section==='xera_quota_recovery_quiescence').reduce((sum,p)=>sum+p.rows,0),witnessCount);
 const closureCount=Number((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_recovery_exposure_closures`)[0].n);assert.ok(closureCount>=46);assert.equal(parts.filter(p=>p.section==='xera_quota_recovery_exposure_closures').reduce((sum,p)=>sum+p.rows,0),closureCount);
 await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;for(const replay of closureReplays){replay.f.setProofHook(async()=>{throw Error('Historical replay must be independent from current generation and Node');});assert.deepEqual(await replay.f.closure.resolve(replay.f.node,replay.input,replay.f.actor),replay.result);}
 console.log('PASS immutable tail preparation is included in the financial recovery bank; historical decision and ACK rows remain intact');
}finally{await db.kysely.destroy();await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
