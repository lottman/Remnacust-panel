// Dedicated disposable SQL database; Node transport is controlled, not deployed.
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),zlib=require('node:zlib');
const {PrismaClient}=require('@prisma/client'),{TransactionHost}=require('@nestjs-cls/transactional'),k=require('kysely'),load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
assert.ok(!(process.env.RECOVERY_TAIL_TEST_DATABASE_URL&&process.env.RECOVERY_RELEASE_APPROVAL_TEST_DATABASE_URL),'Choose one dedicated fixture');
const url=process.env.RECOVERY_TAIL_TEST_DATABASE_URL||process.env.RECOVERY_RELEASE_APPROVAL_TEST_DATABASE_URL;assert.ok(url);const parsed=new URL(url);
assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'55439');assert.equal(parsed.pathname,process.env.RECOVERY_RELEASE_APPROVAL_TEST_DATABASE_URL?'/remnacust_release_approval_test':'/remnacust_recovery_tail_test');
const prisma=new PrismaClient({datasourceUrl:url});let failCommit=false;
const tx=new TransactionHost({defaultTxOptions:{},getFallbackInstance:()=>prisma,wrapWithTransaction:(opts,fn,set)=>prisma.$transaction(async client=>{set(client);const value=await fn();if(failCommit && (failCommit===true || await failCommit(client))){failCommit=false;throw Error('Injected tail COMMIT failure');}return value;},opts)});
const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(tx),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
const dir=path.join(__dirname,'../src/common/host-policy'),hash=v=>createHash('sha256').update(v).digest('hex');
const mocks={'@common/database':{},'@common/axios':{},'@common/utils/device-identity':load(path.join(__dirname,'../src/common/utils/device-identity.ts')),'@common/utils/nano':load(path.join(__dirname,'../src/common/utils/nano/nano.util.ts'))};
const get=(file,name)=>load(path.join(dir,file),mocks)[name];
const Bank=get('quota-bank-recovery.service.ts','QuotaBankRecoveryService'),Native=get('native-quota-recovery.service.ts','NativeQuotaRecoveryService'),Capture=get('quota-receipt-recovery.service.ts','QuotaReceiptRecoveryService'),Held=get('quota-recovery-policy.service.ts','QuotaRecoveryPolicyService'),Ack=get('quota-recovery-receipt.service.ts','QuotaRecoveryReceiptService'),Tail=get('quota-recovery-tail.service.ts','QuotaRecoveryTailService');
const {frameDigest}=load(path.join(dir,'usage-receipt.ts'));
const banks=new Bank(db,tx),native=new Native(db,tx,banks);
async function money(){return {traffic:await prisma.$queryRaw`SELECT to_jsonb(t)::text AS data FROM user_traffic t ORDER BY id`,pools:await prisma.$queryRaw`SELECT to_jsonb(t)::text AS data FROM xera_quota_reserve_pools t ORDER BY usage_account`,reserves:await prisma.$queryRaw`SELECT to_jsonb(t)::text AS data FROM xera_quota_reserves t ORDER BY id`};}
async function fixture(generation,retained,empty=false){
 const node=randomUUID(),actor=randomUUID(),stream=randomUUID(),oldCore=randomUUID(),liveCore=randomUUID();
 await prisma.$executeRaw`INSERT INTO nodes(uuid,name,address,port) VALUES(${node}::uuid,${'tail-'+node},${node+'.invalid'},2222)`;
 await prisma.$executeRaw`INSERT INTO xera_quota_node_modes(node_uuid,phase,instance_uuid) VALUES(${node}::uuid,'ACTIVE',${stream}::uuid)`;
 const nodeId=(await prisma.$queryRaw`SELECT id FROM nodes WHERE uuid=${node}::uuid`)[0].id;
 await prisma.$executeRaw`INSERT INTO xera_node_usage_streams(stream_id,node_uuid,node_id,expected_core,requested_at,consumption_multiplier) VALUES(${stream}::uuid,${node}::uuid,${nodeId},${oldCore}::uuid,clock_timestamp(),1000000000)`;
 const frame={sequence:'1',coreProcessId:oldCore,capturedAt:'1',stats:[]};
 let journal={version:1,stream,acked:'0',ackDigest:'',pending:frame},mode='normal',calls=0;
 let fence={version:'remnacust-quota-recovery-fence-v1',generation,token:randomUUID(),state:'FENCED',sequence:'1',previous:null};fence.digest=hash([fence.version,fence.generation,fence.token,'FENCED','1','-',''].join('\n'));
 const status={applied:true,quotaRecoveryReceiptsSupported:true,quotaRecoverySamplesSupported:true,quotaRecoveryQuiescenceSupported:true,quotaRecoveryReleasesSupported:true,quotaReservesSupported:true,quotaWatermarksSupported:true,quotaSnapshotsSupported:true,quotaRecoveryFencesSupported:true,quotaJournalSequence:'0',quotaRecoveryPoliciesSupported:true,quotaFencesSupported:true,userQuotaRequired:true,quotaInstanceId:stream,policyRevision:'1',policyGeneration:randomUUID(),coreProcessId:liveCore,quotaRecovery:{version:fence.version,record:fence}};
 const encode=()=>{const body=Buffer.from(JSON.stringify(journal));return Buffer.concat([Buffer.from('REMNACUST-USAGE-1\n'+hash(body)+'\n'),body]);};
 let nativeSamples=0,nodeWitness=null,proofHook=null,releaseController=null,releaseCalls=0;const releaseBodies=[],releaseFiles=new Map();const sampleBodies=[];
 const axios={
  hostQuotaSnapshot:async(_,request)=>{assert.equal(tx.isTransactionActive(),false);const raw=Buffer.from(JSON.stringify({version:'remnacust-quota-snapshots-v1',...request,instance:stream,sequence:0,checkpoint:0,retiredBefore:0,registrationsRequired:true,watermarksRequired:true,policyRevision:status.policyRevision,coreProcessId:status.coreProcessId,recovery:status.quotaRecovery,capturedAt:Date.now(),entries:[]}));return {isOk:true,response:{version:'remnacust-quota-snapshots-v1',encoding:'gzip-base64',bytes:raw.length,sha256:hash(raw),data:zlib.gzipSync(raw).toString('base64')}};},
  usageArchive:async(_,request)=>{assert.equal(tx.isTransactionActive(),false);calls++;const original=encode(),raw=Buffer.from(JSON.stringify({version:'remnacust-usage-archives-v1',...request,capturedAt:Date.now(),journal:{bytes:original.length,sha256:hash(original),data:original.toString('base64')}}));return {isOk:true,response:{version:'remnacust-usage-archives-v1',encoding:'gzip-base64',bytes:raw.length,sha256:hash(raw),data:zlib.gzipSync(raw).toString('base64')}};},
  hostPolicy:async()=>{assert.equal(tx.isTransactionActive(),false);calls++;if(mode==='commit')failCommit=true;return {isOk:true,response:{...status,...(mode==='unapplied'?{applied:false}:{}),...(mode==='unheld'?{policyGeneration:randomUUID()}:{}),...(mode==='unsupported'?{quotaRecoverySamplesSupported:false}:{})}};},
  hostQuotaRecoveryPolicy:async(_,body)=>{assert.equal(tx.isTransactionActive(),false);status.policyRevision=body.policyRevision;status.policyGeneration=randomUUID();return {isOk:true,response:{requestId:body.requestId,coreProcessId:body.coreProcessId,instance:stream,policyRevision:body.policyRevision,policyGeneration:status.policyGeneration,quotaRecovery:status.quotaRecovery}};},
  usageRecoveryQuiescence:async(_,body)=>{assert.equal(tx.isTransactionActive(),false);if(mode==='proofUnavailable')return {isOk:false,code:'NODE_HTTP_TIMEOUT'};const result=await nodeController.quiescenceRecovery(body);if(proofHook){const hook=proofHook;proofHook=null;await hook();}if(mode==='witnessCommit'){mode='normal';failCommit=true;}return {isOk:true,response:result.response};},
  usageRecoverySample:async(_,body)=>{assert.equal(tx.isTransactionActive(),false);sampleBodies.push(structuredClone(body));try{return {isOk:true,response:(await nodeController.sampleRecovery(body)).response};}catch{return {isOk:false,code:'NODE_HTTP_503'};}},
  usageRecoveryAck:async(_,body)=>{assert.equal(tx.isTransactionActive(),false);return {isOk:true,response:(await nodeController.acknowledgeRecovery(body)).response};},
 };
 const nodeRoot=path.resolve(__dirname,'../../../../Remnacust-node/node/src/modules/xray-core');
 const fenceModel=load(path.join(nodeRoot,'quota-recovery-fence.ts'));
 const execFile=()=>{throw Error('Async CLI only');};
 execFile[require('node:util').promisify.custom]=async(binary,args)=>{
  assert.equal(tx.isTransactionActive(),false);
  if(args.includes('--action=ack')){
   assert.ok(journal.pending);const frame=journal.pending;assert.ok(args.includes('--sequence='+frame.sequence));assert.ok(args.includes('--core='+frame.coreProcessId));assert.ok(args.includes('--digest='+frameDigest(frame)));
   const jobs=await prisma.$queryRaw`SELECT request_id FROM xera_quota_recovery_receipt_jobs WHERE node_uuid=${node}::uuid AND source->'receipt'->>'sequence'=${frame.sequence} AND result IS NULL AND lease_owner IS NOT NULL`;
   assert.ok(jobs.length,'ACK delivery intent must commit before the Node command');
   journal.acked=frame.sequence;journal.ackDigest=frameDigest(frame);journal.pending=retained&&frame.sequence==='1'?{sequence:'2',coreProcessId:oldCore,capturedAt:'2',stats:[{name:'user>>>901>>>traffic>>>uplink',value:'3'}]}:null;
   return {stdout:JSON.stringify({stream,sequence:frame.sequence,acknowledged:true})};
  }
  assert.ok(args.includes('--action=sample'));assert.equal(journal.pending,null);
  const prepared=(await prisma.$queryRaw`SELECT p.request_id FROM xera_quota_recovery_tail_preparations p WHERE p.node_uuid=${node}::uuid`)[0];assert.ok(prepared,'SQL intent must commit before native execution');
  const ticket=(await prisma.$queryRaw`SELECT next_sequence::text AS sequence,expected_core::text AS core FROM xera_node_usage_streams WHERE node_uuid=${node}::uuid`)[0];
  assert.ok(args.includes('--sequence='+ticket.sequence));assert.ok(args.includes('--core='+ticket.core));nativeSamples++;
  const next={sequence:ticket.sequence,coreProcessId:ticket.core,capturedAt:String(Date.now()),stats:empty?[]:[{name:'user>>>901>>>traffic>>>uplink',value:'7'}]};journal.pending=next;
  if(mode==='sampleLost')throw Error('Lost response after native persistence');
  return {stdout:JSON.stringify({capability:'remnacust-usage-receipts-v1',stream,...next,digest:frameDigest(next)})};
 };
 const quiescence=load(path.join(nodeRoot,'recovery-quiescence.ts'),{'./quota-recovery-fence':{...fenceModel,privateRead:async()=>nodeWitness?Buffer.from(JSON.stringify(nodeWitness)):null,publishPrivateRecord:async(file,record,validate)=>{await validate();if(mode==='witnessLost')throw Error('Witness write failed');nodeWitness=record;}}});
 const {UsageReceiptController}=load(path.join(nodeRoot,'usage-receipt.controller.ts'),{
  '@common/config/app-config':{},'@common/guards/jwt-guards':{JwtDefaultGuard:class{}},'./xray-process.service':{},
  './core-incarnation':{readCoreIncarnation:async()=>status.coreProcessId},'./quota-ledger':{verifyQuotaLedger:async()=>stream},
  './quota-recovery-fence':{...fenceModel,readRecoveryFenceState:async()=>({version:fence.version,record:fence})},
  './recovery-quiescence':quiescence,'./usage-archive':{readUsageArchiveFile:async()=>encode()},'node:child_process':{execFile},
  'node:fs/promises':{stat:async()=>({isFile:()=>true,size:1024,dev:1,ino:2,mtimeMs:3,ctimeMs:4}),readFile:async()=>Buffer.from('remnacust-usage-receipts-v1')},
 });
 const nodeController=new UsageReceiptController({getStatus:async()=>({up:true,pid:77})},{getOrThrow:()=>'/private/fixture.sock'});
 axios.hostQuotaRecoveryRelease=async(_,body)=>{
  assert.equal(tx.isTransactionActive(),false);releaseCalls++;releaseBodies.push(structuredClone(body));
  const requested=await prisma.$queryRaw`SELECT 1 FROM xera_quota_recovery_release_attempts a JOIN xera_quota_recovery_release_jobs j ON j.request_id=a.request_id WHERE a.request_id=${body.requestId}::uuid AND a.phase='REQUESTED' AND j.lease_owner=a.attempt_id`;
  assert.ok(requested.length,'Release attempt must commit before the Node request');
  if(mode==='releaseUnavailable')return {isOk:false};
  if(!releaseController){
   const memoryFence={...fenceModel,readRecoveryFence:async()=>fence,readRecoveryFenceState:async()=>({version:fence.version,record:fence}),
    privateRead:async file=>file.endsWith('recovery-quiescence.json')?nodeWitness?Buffer.from(JSON.stringify(nodeWitness)):null:releaseFiles.has(file)?Buffer.from(JSON.stringify(releaseFiles.get(file))):null,
    publishPrivateRecord:async(file,record,validate)=>{await validate();if(file.replaceAll('\\','/').endsWith('/recovery.json')){fence=structuredClone(record);status.quotaRecovery={version:fence.version,record:fence};}else releaseFiles.set(file,structuredClone(record));}};
   const fs=require('node:fs/promises');
   const {HostPolicyController}=load(path.join(nodeRoot,'host-policy.controller.ts'),{
    '@common/config/app-config':{},'@common/guards/jwt-guards':{JwtDefaultGuard:class{}},
    '@common/utils/destination-rule':{normalizeDestinationRule:value=>value,isIpDestinationRule:()=>false},'./xray-process.service':{},'./live-core.service':{},
    './quota-recovery-fence':memoryFence,'./usage-archive':{readUsageArchiveFile:async()=>encode()},
    'node:fs/promises':{...fs,readFile:async file=>{
     assert.equal(file,'/var/lib/remnanode/host-policy.json');return JSON.stringify({version:'xera-host-policy-v2',revision:status.policyRevision,generation:status.policyGeneration,expiresAt:Date.now()+90000,
      offlineReserves:'remnacust-quota-reserves-v1',userQuota:'remnacust-user-quota-reserves-v1',legacyGroups:['user:global'],legacyOwners:{'901':{allowed:true,expiresAt:0}},legacyQuotaMultipliers:{'user:global':1000000000},protectedInbounds:[],hosts:{},
      groups:{'user:global':{multiplierScale:1000000000,bytesPerSecond:0,totalBytesPerSecond:0,blockedOwners:{},blockAll:true,fenceAll:true,reserveRequired:true,reserves:{}}}});
    }},
   });
   releaseController=new HostPolicyController({}, {}, {});releaseController.status=async()=>({response:{...status,corePid:77}});
  }
  const result=await releaseController.quotaRecoveryRelease(body);
  if(mode==='releaseLost')return {isOk:false};
  if(mode==='releaseInvalid')return {isOk:true,response:{...result.response,coreProcessId:randomUUID()}};
  return {isOk:true,response:result.response};
 };
 const captures=new Capture(db,tx,axios),held=new Held(db,tx,axios),ack=new Ack(db,tx,axios,native),tail=new Tail(db,tx,axios,captures,native);
 const {QuotaRecoveryService}=load(path.join(__dirname,'../src/common/host-policy/quota-recovery.service.ts'),{'@common/axios':{},'@common/database':{}});const recovery=new QuotaRecoveryService(db,tx,axios,ack);
 const {QuotaExposureClosureService}=load(path.join(__dirname,'../src/common/host-policy/quota-exposure-closure.service.ts'),{'@common/axios':{},'@common/database':{}});const closure=new QuotaExposureClosureService(db,tx,axios,ack,banks);
 const capture=await captures.capture(node,generation,actor),bank=await banks.capture(generation,randomUUID(),actor);
 const draft={generation,sourceRequest:capture.requestId,bankRequest:bank.requestId,allocations:[],accounts:[],note:'Reviewed original empty packet, not a readiness verdict'};
 const preview=await native.preview(node,draft),decision=await native.resolve(node,{...draft,requestId:randomUUID(),planDigest:preview.planDigest},actor);
 await held.stage(node,generation,actor,randomUUID());
 await prisma.$queryRaw`SELECT xera_observe_quota_journal(${node}::uuid,${stream}::uuid,0,${BigInt(status.policyRevision)})`;
 if(empty)await prisma.$executeRaw`INSERT INTO xera_quota_usage_exposures(node_uuid,core_uuid,instance_uuid,kind,key,user_id,first_revision,last_revision,unbounded) VALUES(${node}::uuid,${liveCore}::uuid,${stream}::uuid,'HOST','closure-covered',901,1,1,true)`;
 const acknowledgementRequest=randomUUID();await ack.deliver(node,generation,actor,acknowledgementRequest,decision.requestId);
 return {node,actor,stream,oldCore,liveCore,journal,captures,tail,ack,recovery,closure,setProofHook:hook=>{proofHook=hook;},readQuiescence:body=>axios.usageRecoveryQuiescence({},body),input:{generation,requestId:randomUUID(),acknowledgementRequest,consumptionMultiplier:'1500000000',note:'Reviewed multiplier for the next sample, including retained historical counters'},setMode:value=>{mode=value;},calls:()=>calls,samples:()=>nativeSamples,sampleBodies,releaseBodies,releaseCalls:()=>releaseCalls,releaseState:()=>structuredClone(status.quotaRecovery),setCore:value=>{status.coreProcessId=value;}};
}

module.exports={prisma,tx,db,banks,native,fixture,money,setFailCommit:(predicate=true)=>{failCommit=predicate;}};
