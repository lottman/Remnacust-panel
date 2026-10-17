const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {PrismaClient}=require('@prisma/client');const {TransactionHost}=require('@nestjs-cls/transactional');const k=require('kysely');const load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url=process.env.QUOTA_COORDINATOR_TEST_DATABASE_URL;assert.ok(url);const parsed=new URL(url);
assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'55439');assert.equal(parsed.pathname,'/remnacust_coordinator_test');
const prisma=new PrismaClient({datasourceUrl:url});
let rejectCommit=false;
const tx=new TransactionHost({defaultTxOptions:{},getFallbackInstance:()=>prisma,wrapWithTransaction:(opts,fn,set)=>prisma.$transaction(async client=>{set(client);const result=await fn();if(rejectCommit){rejectCommit=false;throw Error('Simulated commit failure');}return result;},opts)});
const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(tx),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
const N1='cccccccc-cccc-4ccc-8ccc-cccccccccccc',N2='ffffffff-ffff-4fff-8fff-ffffffffffff',I1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',I2='abababab-abab-4bab-8bab-abababababab',C1='ff29ee68-a625-4160-9573-cc17de317a5d',C2='ef29ee68-a625-4160-9573-cc17de317a5d',H='11111111-1111-4111-8111-111111111111';
const username='901~0123456789abcdef01234567~h'+H.replaceAll('-','');
const frameDigest=frame=>crypto.createHash('sha256').update(JSON.stringify(frame).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))).digest('hex');
const remote=new Map([[N1,{instance:I1,core:C1,revision:'0',body:null,pending:null,acked:0,values:{[`user>>>${username}>>>traffic>>>uplink`]:'12'}}],[N2,{instance:I2,core:C2,revision:'0',body:null,pending:null,acked:0,values:{[`user>>>${username}>>>traffic>>>downlink`]:'10'}}]]);
let loseRegistrationProofOnce=true,lostRegistrationProof=0;
let stalePolicyStatus=false,wrongPolicyInstance=false,failProofCommit=false,supersedeProof=false,loseExposureOnce=false;
let unsupported=N2,missingUsage=false,unavailable=null,preflightGate=null,entered,deliveries=0,syncRequests=0,loseSampleOnce=N1,lostSamples=0,loseUnfenceOnce=true,lostDeliveries=0;
const axios={hostPolicy:async(node,body)=>{
    if(node.uuid===unavailable)return {isOk:false};
    if(preflightGate&&!body){entered();await preflightGate;}
    const state=remote.get(node.uuid);assert.ok(state,node.uuid);
    if(body){
        assert.equal(tx.isTransactionActive(),false,'Policy delivery must follow SQL commit');
        assert.equal(body.userQuota,'remnacust-user-quota-reserves-v1');
        assert.equal(body.offlineReserves,'remnacust-quota-reserves-v1');
        const intent=(await prisma.$queryRaw`SELECT desired_revision,desired_source,desired_policy,applied_revision FROM xera_quota_node_modes WHERE node_uuid=${node.uuid}::uuid`)[0];
        const proof=load(path.join(__dirname,'../src/common/host-policy/quota-policy-proof.ts')).quotaPolicyProof(body);
        assert.equal(intent.desired_revision,BigInt(body.revision));assert.equal(intent.desired_source,proof.source);assert.deepEqual(intent.desired_policy,proof.proof);assert.notEqual(intent.applied_revision,intent.desired_revision,'Prepared intent is not an applied ACK');
        const exposures=await prisma.$queryRaw`SELECT lower(kind)||':'||key AS scope,user_id::text AS owner FROM xera_quota_usage_exposures WHERE node_uuid=${node.uuid}::uuid AND core_uuid=${state.core}::uuid AND instance_uuid=${state.instance}::uuid AND last_revision=${body.revision}::bigint`;
        for(const [scope,owners] of Object.entries(proof.proof.scopes))for(const [owner,value] of Object.entries(owners))
            if(value[0]==='U'||(value[0]==='R'&&value[4]))assert.ok(exposures.some(e=>e.scope===scope&&e.owner===owner),'Potential outside-grant usage must be committed BEFORE delivery, not just on ACK');
        const stored=await prisma.$queryRaw`SELECT d.usage_account::text AS account,p.user_id::text AS owner FROM xera_quota_usage_deliveries d JOIN xera_quota_reserve_pools p USING(usage_account) WHERE d.node_uuid=${node.uuid}::uuid AND d.instance_uuid=${state.instance}::uuid AND d.last_revision=${body.revision}::bigint`;
        for(const group of Object.values(body.groups))for(const [owner,account] of Object.entries(group.unreservedAccounts??{}))assert.ok(stored.some(row=>row.account===account&&row.owner===owner),'Account/price provenance must be COMMITTED before node HTTP');
        assert.ok(BigInt(body.revision)>BigInt(state.revision));
        state.ledger??=new Map();const present=new Set();
        for(const item of body.registrations??[]){
            const grant=item.grant,old=state.ledger.get(grant.id);
            const intent=(await prisma.$queryRaw`SELECT registration_revision,registration_action,activation_revision FROM xera_quota_reserves WHERE id=${grant.id}::uuid`)[0];
            assert.equal(intent.registration_revision,BigInt(body.revision));assert.equal(intent.registration_action,item.action);
            if(item.allowMissing)assert.equal(intent.activation_revision,null,'Only SQL never-activated credit can assert a missing cancellation');
            if(!old&&item.action==='cancel'&&!item.allowMissing)throw Error('Previously activated quota is missing; recovery required');
            if(item.action==='prepare')assert.ok(!old?.closed&&!old?.activated,'Used or closed credit cannot be staged');
            state.ledger.set(grant.id,{id:grant.id,group:item.group,owner:item.owner,expiresAt:grant.expiresAt,ceiling:grant.ceiling,reserved:old?.reserved??'0',closed:item.action==='cancel',prepared:true,activated:old?.activated??false,scale:item.scale});
        }
        for(const [group,wire] of Object.entries(body.groups))for(const [owner,grant] of Object.entries(wire.reserves??{})){
            present.add(grant.id);const old=state.ledger.get(grant.id);assert.ok(!old?.closed,'A sealed local grant ID cannot be reopened');
            if(grant.registrationRequired){assert.ok(old?.prepared,'Activation must follow a separate durable stage');const [stored]=await prisma.$queryRaw`SELECT registered_revision,activation_revision FROM xera_quota_reserves WHERE id=${grant.id}::uuid`;assert.ok(stored.registered_revision<BigInt(body.revision));assert.ok(stored.activation_revision<=BigInt(body.revision));}
            state.ledger.set(grant.id,{...old,id:grant.id,group,owner,expiresAt:grant.expiresAt,ceiling:grant.ceiling,reserved:old?.reserved??'0',closed:false,...(grant.registrationRequired?{activated:true}:{})});
        }
        for(const grant of state.ledger.values())if(!present.has(grant.id)&&(!grant.prepared||grant.activated))grant.closed=true;
        state.journalSequence=(state.journalSequence??0)+1;state.revision=body.revision;state.body=body;state.awaitingProof=true;deliveries++;
        if(loseExposureOnce){loseExposureOnce=false;return {isOk:false};}
        if(loseUnfenceOnce && body.groups['user:global'].fenceAll!==true){loseUnfenceOnce=false;lostDeliveries++;return {isOk:false};}
        return {isOk:true,response:{version:'xera-host-policy-v2',supported:true,applied:true,userQuotaRequired:true}};
    }
    const proving=state.awaitingProof===true;state.awaitingProof=false;
    if(loseRegistrationProofOnce&&proving&&state.body.registrations?.some(item=>item.action==='prepare')){loseRegistrationProofOnce=false;lostRegistrationProof++;rejectCommit=true;}
    if(failProofCommit&&proving){failProofCommit=false;rejectCommit=true;}
    if(supersedeProof&&proving){
        supersedeProof=false;
        const newer=structuredClone(state.body);newer.groups['host:'+H].fencedOwners={'901':true};
        const proof=load(path.join(__dirname,'../src/common/host-policy/quota-policy-proof.ts')).quotaPolicyProof(newer);
        await prisma.$transaction(async other=>{
            await other.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${node.uuid},20260927))`;
            const [revision]=await other.$queryRaw`SELECT xera_next_host_policy_revision(${node.uuid}::uuid,${state.revision}::bigint) AS value`;
            await other.$executeRaw`UPDATE xera_quota_node_modes SET desired_revision=${revision.value}::bigint,desired_source=${proof.source},desired_policy=${JSON.stringify(proof.proof)}::jsonb WHERE node_uuid=${node.uuid}::uuid`;
        });
    }
    return {isOk:true,response:{version:'xera-host-policy-v2',supported:true,applied:true,policyRevisionsSupported:true,policyRevision:stalePolicyStatus&&proving?'0':state.revision,
        quotaReservesSupported:node.uuid!==unsupported,quotaRegistrationsSupported:true,quotaWatermarksSupported:true,quotaJournalSequence:String(state.journalSequence??0),quotaFencesSupported:true,unreservedUsageSupported:!missingUsage,coreIncarnationSupported:true,usageReceiptsSupported:true,userQuotaReservesSupported:true,
        userQuotaRequired:!!state.body,coreProcessId:state.core,quotaInstanceId:wrongPolicyInstance&&proving?I2:state.instance,offlineReserves:state.body?.offlineReserves??null}};
},hostQuotaState:async(node,request)=>{
    if(node.uuid===unavailable)return {isOk:false};const state=remote.get(node.uuid),entries=[],missingIds=[];
    for(const id of request.ids){const entry=state.ledger?.get(id);if(entry)entries.push({...entry});else missingIds.push(id);}
    return {isOk:true,response:{instance:state.instance,sequence:state.journalSequence??0,policyRevision:state.revision,entries,missingIds,nextAfter:null}};
},getUsersStats:()=>assert.fail('No new legacy reset after fencing'),usageReceipt:async(node,request)=>{
    assert.equal(tx.isTransactionActive(),false,'Native receipt transport must not hold financial SQL locks');
    const state=remote.get(node.uuid);assert.equal(request.stream,state.instance);
    if(request.action==='sample'){
        if(!state.pending){assert.equal(BigInt(request.sequence),BigInt(state.acked)+1n);const frame={sequence:request.sequence,coreProcessId:state.core,capturedAt:String(Date.now()),stats:Object.entries(state.values).map(([name,value])=>({name,value})).sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)))};state.values={};state.pending={...frame,stream:state.instance,capability:'remnacust-usage-receipts-v1',digest:frameDigest(frame)};}
        if(loseSampleOnce===node.uuid){loseSampleOnce=null;lostSamples++;return {isOk:false};}
        return {isOk:true,response:state.pending};
    }
    assert.equal(request.digest,state.pending.digest);state.acked=Number(request.sequence);state.pending=null;
    return {isOk:true,response:{stream:state.instance,sequence:request.sequence,acknowledged:true}};
}};
const cacheValues=new Map(),cache={get:async key=>cacheValues.get(key)??null,set:async(key,value)=>cacheValues.set(key,value),del:async key=>cacheValues.delete(key)};
const mocks={'@common/axios':{},'@common/database':{},'@common/raw-cache':{},'@common/config/app-config':{},'@common/config/app-config/typed-config.service':{TypedConfigService:class{}},
    '@queue/_nodes/nodes-queues.service':{},'@queue/_users/users-queues.service':{},
    '@common/utils/host-identity':load(path.join(__dirname,'../src/common/utils/host-identity.ts')),
    '@common/utils/device-identity':load(path.join(__dirname,'../src/common/utils/device-identity.ts')),
    '@common/utils/nano':load(path.join(__dirname,'../src/common/utils/nano/nano.util.ts'))};
const {HostPolicyService}=load(path.join(__dirname,'../src/common/host-policy/host-policy.service.ts'),mocks);
const {DurableUsageService}=load(path.join(__dirname,'../src/common/host-policy/durable-usage.service.ts'),mocks);
const {QuotaCutoverService}=load(path.join(__dirname,'../src/common/host-policy/quota-cutover.service.ts'),mocks);
const {QuotaCoordinatorService}=load(path.join(__dirname,'../src/common/host-policy/quota-coordinator.service.ts'),{...mocks,'./host-policy.service':{HostPolicyService,HOST_POLICY_VERSION:'xera-host-policy-v2'}});
const policies=new HostPolicyService(db,axios,cache,{getOrThrow:()=> 'fixture-secret-not-a-production-key'},tx);
policies.requestSync=()=>{syncRequests++;};
const usage=new DurableUsageService(db,axios,tx,{getOrThrow:key=>key==='USER_USAGE_IGNORE_BELOW_BYTES'?0n:true});
const effects={apply:async()=>{}};
const queueFor=prefix=>({toKey:state=>prefix+state,getBackend:()=>({connection:{client:Promise.resolve({status:'ready',isCluster:false,options:{db:15},info:async()=> 'run_id:'+ 'a'.repeat(40)+'\r\nrole:master\r\n',defineCommand(){},runCommand:async(_name,args)=>Array(args.length/2).fill('0')})}})});
const usersQueue=queueFor('audit-users:');
const cutover=new QuotaCutoverService(db,tx,{collect:async()=>null},usage,effects,{queues:{recordUserUsage:queueFor('audit-nodes:')}},{queues:{updateUsersUsage:usersQueue}},{replayPending:async()=>0});
const Settlement=load(path.join(__dirname,'../src/common/host-policy/quota-settlement.service.ts'),mocks).QuotaSettlementService;
const Transfer=load(path.join(__dirname,'../src/common/host-policy/quota-transition.service.ts'),{...mocks,'./host-policy.service':{HostPolicyService}}).QuotaTransitionService;
const coordinatorTransfers=new Transfer(db,tx,policies,usage,new Settlement(db,axios,cache,tx),effects,axios);
const coordinator=()=>new QuotaCoordinatorService(db,tx,axios,policies,cutover,usage,effects,coordinatorTransfers);
let service=coordinator();service.logger={warn(){}};
const counts=async()=> (await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserves`)[0].n;
const coordinateUntil=async(condition)=>{for(let step=0;step<30;step++){await service.tick();if(await condition())return;}assert.fail(JSON.stringify(await service.status()));};
(async()=>{try{
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n,0n,'Refuse existing users');
    await prisma.$transaction(async t=>{
        const seed=fs.readFileSync(path.join(__dirname,'fixtures/host-policy-seed.sql'),'utf8').replace('BEGIN;','');for(const stmt of seed.split(';').filter(v=>v.trim()))await t.$executeRawUnsafe(stmt);
        await t.$executeRaw`INSERT INTO nodes(id,uuid,name,address,is_connected,active_config_profile_uuid) VALUES(902,${N2}::uuid,'coordinator-second','127.0.0.2',true,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`;
        await t.$executeRaw`UPDATE nodes SET is_connected=true,active_config_profile_uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',consumption_multiplier=1500000000 WHERE id=901`;
        await t.$executeRaw`INSERT INTO config_profile_inbounds_to_nodes(config_profile_inbound_uuid,node_uuid) VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',${N2}::uuid)`;
        await t.$executeRaw`INSERT INTO xera_host_identities(user_id,host_uuid,device_key,hwid,parent_vless_uuid) VALUES(901,${H}::uuid,'',NULL,'dddddddd-dddd-4ddd-8ddd-dddddddddddd')`;
        await t.$executeRaw`INSERT INTO user_traffic(id,used_traffic_bytes) VALUES(901,100),(902,0)`;
        await t.$executeRaw`UPDATE users SET traffic_limit_bytes=CASE WHEN id=901 THEN 1000 ELSE 2000 END`;
        await t.$executeRaw`UPDATE hosts SET user_traffic_limit_bytes=1000 WHERE uuid=${H}::uuid`;
        await t.$executeRaw`INSERT INTO xera_host_tag_limits(tag,user_traffic_limit_bytes,traffic_multiplier) VALUES('alpha',500,1)`;
    });
    await service.tick();assert.equal((await service.status()).phase,'PREFLIGHT');assert.equal(await counts(),0n);assert.equal(deliveries,0,'Unsupported nodes must be detected before any fleet fence');
    unsupported=null;missingUsage=true;await service.tick();assert.equal((await service.status()).phase,'PREFLIGHT');assert.equal(deliveries,0,'Unreserved usage compatibility must be proven before any fence');missingUsage=false;unavailable=N2;await service.tick();assert.equal((await service.status()).phase,'PREFLIGHT');assert.equal(deliveries,0);unavailable=null;
    console.log('PASS unsupported or unreachable participants leave ordinary legacy service untouched and cannot receive credit');

    rejectCommit=true;await service.tick();assert.equal(await counts(),0n);assert.equal(deliveries,0);
    console.log('PASS a failed preflight SQL commit cannot begin a fleet fence or issue a reserve');

    let release,arrive;const firstCall=new Promise(resolve=>arrive=resolve);preflightGate=new Promise(resolve=>release=resolve);entered=arrive;
    const first=service.tick();await firstCall;assert.equal(await coordinator().tick(),false,'A second scheduler cannot steal a live SQL lease');release();preflightGate=null;await first;
    service=coordinator();service.logger={warn(){}};
    for(let attempt=0;attempt<15;attempt++){
        await service.tick();const current=await service.status();if(current.phase==='ACTIVE'&&current.nodes.every(node=>node.stage==='ACTIVE'))break;
    }
    const current=await service.status();assert.equal(current.phase,'ACTIVE',JSON.stringify(current));assert.ok(current.nodes.every(node=>node.stage==='ACTIVE'),JSON.stringify(current));
    assert.equal((await prisma.$queryRaw`SELECT used_traffic_bytes AS n FROM user_traffic WHERE id=901`)[0].n,128n);
    assert.equal(lostSamples,1);assert.equal(lostDeliveries,1);
    const grants=await prisma.$queryRaw`SELECT kind,key,user_id,ceiling_bytes,node_uuid,id FROM xera_quota_reserves ORDER BY kind,key,user_id,node_uuid`;
    assert.equal(grants.length,8);assert.deepEqual(grants.filter(g=>g.kind==='USER'&&g.user_id===901n).map(g=>g.ceiling_bytes),[436n,436n]);
    assert.deepEqual(grants.filter(g=>g.kind==='HOST').map(g=>g.ceiling_bytes),[489n,489n]);assert.deepEqual(grants.filter(g=>g.kind==='TAG').map(g=>g.ceiling_bytes),[239n,239n]);
    assert.ok(syncRequests>0);for(const state of remote.values()){assert.equal(state.body.groups['user:global'].fenceAll,undefined);assert.equal(state.body.groups['user:global'].reserves['901'].ceiling,'436');}
    const proofs=await prisma.$queryRaw`SELECT phase,initial_core,fenced_core,initial_drained_at,legacy_usage_drained_at FROM xera_quota_node_modes`;
    assert.ok(proofs.every(row=>row.phase==='ACTIVE'&&row.initial_core===row.fenced_core&&row.initial_drained_at>row.legacy_usage_drained_at));
    assert.equal(lostRegistrationProof,1,'A lost registration SQL ACK must be retried without issuing new credit');
    const registeredRows=await prisma.$queryRaw`SELECT registration_required,registered_revision,activation_revision FROM xera_quota_reserves`;
    assert.ok(registeredRows.every(row=>row.registration_required&&row.registered_revision>0n&&row.activation_revision>row.registered_revision));
    const grantIdentity=grants[0].id;
    await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_reserves SET activation_revision=NULL WHERE id=${grantIdentity}::uuid`,/cannot be rewritten/);
    await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_reserves SET registered_revision=NULL,registered_sequence=NULL WHERE id=${grantIdentity}::uuid`,/cannot be rewritten/);
    console.log('PASS lost post-registration SQL ACK retries the same durable staged credit and committed activation history cannot be cleared');
    console.log('PASS two-node USER/HOST/TAG cutover bills initial debt, commits exact shared budgets and only then releases the fence');
    console.log('PASS lost native sample and lost unfence acknowledgement replay committed state without duplicate money or grant allocation');

    await service.tick();await service.tick();assert.deepEqual((await prisma.$queryRaw`SELECT id,ceiling_bytes FROM xera_quota_reserves ORDER BY id`),grants.map(g=>({id:g.id,ceiling_bytes:g.ceiling_bytes})).sort((a,b)=>a.id.localeCompare(b.id)));
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserve_operations`)[0].n,0n,'No zero-credit operation is appended on ordinary polling');
    console.log('PASS scheduler restart and repeated ACTIVE passes keep grant IDs, ceilings and bounded operation history');

    await prisma.$transaction(async t=>{await t.$executeRaw`UPDATE users SET last_traffic_reset_at=clock_timestamp() WHERE id=901`;await t.$executeRaw`UPDATE user_traffic SET used_traffic_bytes=0 WHERE id=901`;await t.$executeRaw`UPDATE nodes SET is_connected=false WHERE uuid=${N2}::uuid`;});
    await coordinateUntil(async()=> (await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserves WHERE kind='USER' AND user_id=901 AND budget_epoch=xera_current_quota_epoch(kind,key,user_id,window_start)`)[0].n===2n);
    const fresh=await prisma.$queryRaw`SELECT g.id,g.ceiling_bytes FROM xera_quota_reserves g WHERE kind='USER' AND user_id=901
        AND budget_epoch=xera_current_quota_epoch(kind,key,user_id,window_start)`;
    assert.equal(fresh.length,2);assert.ok(fresh.every(g=>g.ceiling_bytes===500n));assert.ok(fresh.every(g=>!grants.some(old=>old.id===g.id)));
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserves WHERE kind='USER' AND user_id=901`)[0].n,4n);
    console.log('PASS reset allocates a new committed epoch without waiting for an offline recipient or reclaiming its old reserve');

    await prisma.$executeRaw`UPDATE users SET traffic_limit_bytes=1200 WHERE id=901`;
    await coordinateUntil(async()=> (await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserves WHERE kind='USER' AND user_id=901 AND budget_epoch=xera_current_quota_epoch(kind,key,user_id,window_start) AND ceiling_bytes=600`)[0].n===2n);
    const topped=await prisma.$queryRaw`SELECT g.id,g.ceiling_bytes FROM xera_quota_reserves g WHERE kind='USER' AND user_id=901
        AND budget_epoch=xera_current_quota_epoch(kind,key,user_id,window_start)`;
    assert.ok(topped.every(g=>g.ceiling_bytes===600n));assert.ok(topped.every(g=>fresh.some(old=>old.id===g.id)));
    console.log('PASS an increased finite limit adds only the newly authorized credit and preserves current grant IDs');

    const old=grants.find(g=>g.kind==='HOST'&&g.node_uuid===N2);await prisma.$queryRaw`SELECT xera_retire_quota_reserve(${old.id}::uuid)`;
    assert.equal((await prisma.$queryRaw`SELECT closed_usage_bytes FROM xera_quota_reserves WHERE id=${old.id}::uuid`)[0].closed_usage_bytes,null);
    const result=await prisma.$queryRaw`SELECT xera_redistribute_quota_reserves(gen_random_uuid(),'HOST',${H},901,ARRAY[${N1}::uuid],${JSON.stringify({[N1]:I1})}::jsonb) AS n`;
    assert.equal(result[0].n,0n,'Retirement alone must never invent a refund');
    console.log('PASS retiring an unreachable old reservation removes delivery, preserves debt and cannot refill another node');

    await prisma.$executeRaw`UPDATE users SET last_traffic_reset_at=clock_timestamp() WHERE id=902`;
    const beforeRollback=await counts();rejectCommit=true;
    const batch=[{kind:'USER',key:'global',owner:'902',nodes:[N1,N2],instances:{[N1]:I1,[N2]:I2}}];
    await assert.rejects(tx.withTransaction({timeout:30000},()=>k.sql`SELECT xera_fund_quota_targets(${JSON.stringify(batch)}::jsonb)`.execute(db.kysely)),/Simulated commit failure/);
    assert.equal(await counts(),beforeRollback);
    await coordinateUntil(async()=> (await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserves WHERE kind='USER' AND user_id=902 AND budget_epoch=xera_current_quota_epoch(kind,key,user_id,window_start)`)[0].n===2n);
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserves WHERE kind='USER' AND user_id=902`)[0].n,4n);
    await coordinateUntil(async()=> (await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_transitions WHERE phase<>'ACTIVE'`)[0].n===0n);
    console.log('PASS a real SQL commit failure rolls back a newly funded epoch; the resumed coordinator creates it once');

    // Real renderer + SQL ledger + receipt processing, with only the node HTTP
    // transport replaced. Turning the base host limit off must retain its bank.
    await prisma.$executeRaw`UPDATE hosts SET user_traffic_limit_bytes=0,traffic_multiplier=1.5 WHERE uuid=${H}::uuid`;
    const opts={uuid:N1,address:'127.0.0.1',port:2222,proxyUrl:null};await policies.syncNode(opts);
    const body=remote.get(N1).body,hostGroup=body.groups['host:'+H];
    assert.equal(hostGroup.reserveRequired,undefined);assert.ok(hostGroup.unreservedAccounts['901']);
    assert.equal(body.hosts[H.replaceAll('-','')].quotaMultipliers['host:'+H],150);
    const account=hostGroup.unreservedAccounts['901'];
    const currentEmail=Object.keys(body.hosts[H.replaceAll('-','')].allowedIdentities).find(email=>email.startsWith('901~'));assert.ok(currentEmail);
    const pool=async()=> (await prisma.$queryRaw`SELECT baseline_bytes AS baseline,unreserved_nano::text AS nano FROM xera_quota_reserve_pools WHERE usage_account=${account}::uuid`)[0];
    const original=await pool();const grossBefore=(await prisma.$queryRaw`SELECT used_traffic_bytes AS n FROM user_traffic WHERE id=901`)[0].n;
    remote.get(N1).values={['qfree>>>'+account+'>>>901>>>150>>>100>>>traffic>>>uplink']:'4',[`user>>>${currentEmail}>>>traffic>>>uplink`]:'4'};
    await usage.collect({nodeUuid:N1,nodeId:901n,opts,multiplier:'1500000000'},async()=>{});
    assert.equal((await pool()).baseline,original.baseline+6n);assert.equal((await pool()).nano,'6000000000');
    assert.equal((await prisma.$queryRaw`SELECT used_traffic_bytes AS n FROM user_traffic WHERE id=901`)[0].n,grossBefore+6n);
    await policies.syncNode(opts);assert.equal(remote.get(N1).body.groups['host:'+H].unreservedAccounts['901'],account);
    assert.equal((await pool()).baseline,original.baseline+6n,'Repeated rendering does not apply debt again');
    console.log('PASS base-quota-off policy retains the original account, commits its coefficient before HTTP and applies outside usage once');
    const sentBefore=deliveries;
    await prisma.$executeRaw`UPDATE hosts SET traffic_multiplier=2.25 WHERE uuid=${H}::uuid`;
    rejectCommit=true;await assert.rejects(policies.syncNode(opts),/Simulated commit failure/);
    assert.equal(deliveries,sentBefore,'A rolled-back price must never reach the node');
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_usage_deliveries WHERE usage_account=${account}::uuid AND factor=225`)[0].n,0n);
    await policies.syncNode(opts);
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_usage_deliveries WHERE usage_account=${account}::uuid AND node_uuid=${N1}::uuid AND factor=225`)[0].n,1n);
    console.log('PASS a failed policy commit cannot send or persist a new outside-grant coefficient; retry commits it once');
    const secondOpts={uuid:N2,address:'127.0.0.2',port:2222,proxyUrl:null};
    await policies.syncNode(secondOpts);
    assert.equal(remote.get(N2).body.groups['host:'+H].unreservedAccounts['901'],account);
    const jointBefore=await pool(),jointGross=(await prisma.$queryRaw`SELECT used_traffic_bytes AS n FROM user_traffic WHERE id=901`)[0].n;
    for(const node of [N1,N2]){
        const email=Object.keys(remote.get(node).body.hosts[H.replaceAll('-','')].allowedIdentities).find(value=>value.startsWith('901~'));
        assert.ok(email);remote.get(node).values={['qfree>>>'+account+'>>>901>>>225>>>100>>>traffic>>>downlink']:'4',[`user>>>${email}>>>traffic>>>downlink`]:'4'};
    }
    await Promise.all([
        usage.collect({nodeUuid:N1,nodeId:901n,opts,multiplier:'1500000000'},async()=>{}),
        usage.collect({nodeUuid:N2,nodeId:902n,opts:secondOpts,multiplier:'1000000000'},async()=>{}),
    ]);
    assert.equal((await pool()).baseline,jointBefore.baseline+18n);
    assert.equal(BigInt((await pool()).nano),BigInt(jointBefore.nano)+18000000000n);
    assert.equal((await prisma.$queryRaw`SELECT used_traffic_bytes AS n FROM user_traffic WHERE id=901`)[0].n,jointGross+10n);
    console.log('PASS concurrent nodes charge one shared outside-grant bank exactly while preserving their distinct gross billing factors');

    const policyProof=async()=> (await prisma.$queryRaw`SELECT desired_revision,applied_revision,desired_source,applied_source,applied_core,applied_at::text AS boundary,applied_policy FROM xera_quota_node_modes WHERE node_uuid=${N1}::uuid`)[0];
    const applied=await policyProof();assert.equal(applied.applied_revision,applied.desired_revision);assert.equal(applied.applied_source,applied.desired_source);assert.equal(applied.applied_core,C1);assert.equal(applied.applied_policy.scopes['host:'+H]['901'][0],'U');
    await policies.syncNode(opts);assert.equal((await policyProof()).boundary,applied.boundary,'A refresh cannot move the stable debt boundary');
    stalePolicyStatus=true;await assert.rejects(policies.syncNode(opts),/acknowledgement is incomplete/);stalePolicyStatus=false;
    const stale=await policyProof();assert.ok(stale.desired_revision>stale.applied_revision);assert.equal(stale.boundary,applied.boundary);
    wrongPolicyInstance=true;await assert.rejects(policies.syncNode(opts),/instance changed/);wrongPolicyInstance=false;
    assert.equal((await policyProof()).applied_revision,stale.applied_revision);
    await policies.syncNode(opts);assert.equal((await policyProof()).boundary,applied.boundary);
    const proofFailureSent=deliveries;failProofCommit=true;await assert.rejects(policies.syncNode(opts),/Simulated commit failure/);
    assert.equal(deliveries,proofFailureSent+1,'The injected ACK commit failure must happen after node HTTP');
    const rolledBack=await policyProof();assert.ok(rolledBack.desired_revision>rolledBack.applied_revision);assert.equal(rolledBack.boundary,applied.boundary);
    await policies.syncNode(opts);const recovered=await policyProof();assert.equal(recovered.applied_revision,recovered.desired_revision);assert.equal(recovered.boundary,applied.boundary);
    console.log('PASS desired/applied entitlement proof survives stale ACK, wrong instance and post-HTTP SQL rollback without a moving fence boundary');
    supersedeProof=true;await assert.rejects(policies.syncNode(opts),/acknowledgement was superseded/);
    const superseded=await policyProof();assert.equal(superseded.applied_revision,recovered.applied_revision);assert.ok(superseded.desired_revision>superseded.applied_revision);assert.equal(superseded.boundary,applied.boundary);
    await policies.syncNode(opts);assert.equal((await policyProof()).applied_revision,(await policyProof()).desired_revision);
    console.log('PASS another committed policy while the ACK is in flight cannot overwrite the newer desired entitlement proof');



    await prisma.$executeRaw`INSERT INTO xera_host_tag_limits(tag,user_traffic_limit_bytes) VALUES('alpha_beta',0)`;
    await prisma.$executeRaw`UPDATE hosts SET tags=array_append(tags,'alpha_beta') WHERE uuid=${H}::uuid`;
    await policies.syncNode(opts);
    const nested=await k.sql`SELECT desired_policy,applied_policy FROM xera_quota_node_modes WHERE node_uuid=${N1}::uuid`.execute(db.kysely);
    assert.ok(nested.rows[0].desiredPolicy.scopes['tag:alpha_beta']);assert.ok(nested.rows[0].appliedPolicy.scopes['tag:alpha_beta']);assert.equal(nested.rows[0].appliedPolicy.scopes['tag:alphaBeta'],undefined);
    console.log('PASS actual SQL JSON mapping preserves opaque quota scope names in the durable proof');

    const {QuotaSettlementService}=load(path.join(__dirname,'../src/common/host-policy/quota-settlement.service.ts'),mocks);
    const {QuotaTransitionService}=load(path.join(__dirname,'../src/common/host-policy/quota-transition.service.ts'),{...mocks,'./host-policy.service':{HostPolicyService}});
    const {LimitsService}=load(path.join(__dirname,'../src/modules/hosts/limits.service.ts'),{'@common/database':{},'@common/host-policy/host-policy.service':{},'./repositories/hosts.repository':{},'./hosts.service':{}});
    const limits=new LimitsService(db,tx,{}, {},policies);
    const transition=()=>new QuotaTransitionService(db,tx,policies,usage,new QuotaSettlementService(db,axios,cache,tx),effects,axios);
    let transfers=transition();const scope={kind:'HOST',key:H,owner:'901'};
    const transferState=async()=> (await prisma.$queryRaw`SELECT id,generation,phase FROM xera_quota_transitions WHERE kind='HOST' AND key=${H} AND user_id=901`)[0];
    const advance=async(stop)=>{for(let step=0;step<35;step++){await transfers.advance(scope);if((await transferState()).phase===stop)return;}assert.fail(JSON.stringify(await prisma.$queryRaw`SELECT * FROM xera_quota_transition_nodes`));};
    const legacyHostIds=(await prisma.$queryRaw`SELECT id FROM xera_quota_reserves WHERE kind='HOST' AND key=${H} AND user_id=901`).map(g=>g.id);
    unavailable=N2;const transferId=await transfers.request(scope,[N1,N2]);const requested=await transferState();
    assert.equal(await transfers.request(scope,[N2,N1,N1]),transferId);assert.equal((await transferState()).generation,requested.generation);
    await advance('RELEASING');for(let step=0;step<5;step++)await transfers.advance(scope);
    const firstRelease=await prisma.$queryRaw`SELECT node_uuid,drained_at,released_at,error_code FROM xera_quota_transition_nodes WHERE transition_id=${transferId}::uuid`;
    assert.ok(firstRelease.find(p=>p.node_uuid===N1).released_at);assert.equal(firstRelease.find(p=>p.node_uuid===N2).drained_at,null);
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserves WHERE kind='HOST' AND node_uuid=${N2}::uuid AND closed_usage_bytes IS NULL`)[0].n,1n);
    assert.equal(remote.get(N1).body.groups['host:'+H].fencedOwners?.['901'],undefined);
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserves WHERE kind='HOST'`)[0].n,BigInt(legacyHostIds.length));
    const offProgress=await limits.synchronization('HOST',H);assert.equal(offProgress.totalNodes,2);assert.equal(offProgress.appliedNodes,1);
    assert.deepEqual(offProgress.pendingNodes.map(p=>p.uuid),[N2]);
    console.log('PASS quota-off transfer releases a reachable owner without refunding an offline finite reserve or minting new credit');

    await prisma.$executeRaw`UPDATE hosts SET user_traffic_limit_bytes=1000 WHERE uuid=${H}::uuid`;
    await transfers.request(scope,[N1,N2]);const preflightSent=deliveries,preflightCount=await counts();
    for(let step=0;step<3;step++)await transfers.advance(scope);
    assert.equal((await transferState()).phase,'PREFLIGHT');assert.equal(deliveries,preflightSent);assert.equal(await counts(),preflightCount);
    await assert.rejects(prisma.$queryRaw`SELECT xera_fund_quota_targets(${JSON.stringify([{...scope,nodes:[N1],instances:{[N1]:I1}}])}::jsonb)`,/not ready for funding/);
    assert.equal(await counts(),preflightCount,'The SQL boundary also rejects bypassing an unfinished transition');
    console.log('PASS returning from unlimited waits for all old unbounded participants before fencing reachable owners or issuing finite credit');
    unavailable=null;transfers=transition();await advance('RELEASING');
    unavailable=N1;await transfers.advance(scope);
    assert.equal((await prisma.$queryRaw`SELECT released_at FROM xera_quota_transition_nodes WHERE transition_id=${transferId}::uuid AND node_uuid=${N1}::uuid`)[0].released_at,null);
    unavailable=null;transfers=transition();await advance('ACTIVE');
    const replacement=await prisma.$queryRaw`SELECT id,ceiling_bytes,closed_usage_bytes,retired_at FROM xera_quota_reserves WHERE kind='HOST' AND key=${H} AND user_id=901 ORDER BY id`;
    assert.ok(replacement.filter(g=>legacyHostIds.includes(g.id)).every(g=>g.closed_usage_bytes===0n));
    const live=replacement.filter(g=>g.closed_usage_bytes===null&&g.retired_at===null);assert.equal(live.length,2);
    assert.ok(live.every(g=>!legacyHostIds.includes(g.id)));assert.equal(live.reduce((sum,g)=>sum+g.ceiling_bytes,0n),1000n-(await pool()).baseline);
    const stable=await transferState(),stableCount=await counts();await transfers.request(scope,[N1,N2]);await transfers.advance(scope);
    assert.equal((await transferState()).generation,stable.generation);assert.equal(await counts(),stableCount);
    console.log('PASS real SQL transfer resumes across service restart and failed release, settles sealed journals and never reopens old grant IDs');

    const firstDecrease={kind:'TAG',key:'alpha',owner:'901'};
    // Reproduce adopting an existing funded pool from the pre-transition
    // coordinator: remove orchestration metadata, retaining every financial row.
    await prisma.$executeRaw`DELETE FROM xera_quota_transitions WHERE kind='TAG' AND key='alpha' AND user_id=901`;
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_transitions WHERE kind='TAG' AND key='alpha' AND user_id=901`)[0].n,0n);
    assert.ok((await prisma.$queryRaw`SELECT max(limit_bytes) AS n FROM xera_quota_reserve_pools WHERE kind='TAG' AND key='alpha' AND user_id=901`)[0].n>200n);
    await prisma.$executeRaw`UPDATE xera_host_tag_limits SET user_traffic_limit_bytes=200 WHERE tag='alpha'`;
    unavailable=N2;const decreaseId=await transfers.request(firstDecrease,[N1,N2]),beforeDecreaseDelivery=deliveries;
    await transfers.advance(firstDecrease);
    const decreasing=await prisma.$queryRaw`SELECT required,preflight_at FROM xera_quota_transition_nodes WHERE transition_id=${decreaseId}::uuid ORDER BY node_uuid`;
    assert.equal(decreasing.length,2);assert.ok(decreasing.every(p=>p.required));assert.ok(decreasing.some(p=>!p.preflight_at));assert.equal(deliveries,beforeDecreaseDelivery);
    unavailable=null;for(let step=0;step<35;step++){await transfers.advance(firstDecrease);if((await prisma.$queryRaw`SELECT phase FROM xera_quota_transitions WHERE id=${decreaseId}::uuid`)[0].phase==='ACTIVE')break;}
    assert.equal((await prisma.$queryRaw`SELECT phase FROM xera_quota_transitions WHERE id=${decreaseId}::uuid`)[0].phase,'ACTIVE');
    console.log('PASS the first finite decrease uses the existing pool cap and waits for every old bounded participant before reclaiming credit');

    const oldResetGrant=(await prisma.$queryRaw`SELECT id,ceiling_bytes FROM xera_quota_reserves WHERE kind='TAG' AND key='alpha' AND user_id=901 AND node_uuid=${N2}::uuid AND retired_at IS NULL AND closed_usage_bytes IS NULL`)[0];
    await prisma.$executeRaw`UPDATE xera_host_tag_limits SET user_traffic_limit_bytes=100 WHERE tag='alpha'`;
    const resetEpoch=(await prisma.$queryRaw`SELECT xera_adjust_quota_budget('12345678-1234-4234-8234-123456789abc'::uuid,'TAG','alpha',901::bigint,'RESET',0::bigint) AS epoch`)[0].epoch;
    unavailable=N2;const smallerReset=await transfers.request(firstDecrease,[N1,N2]);
    for(let step=0;step<25;step++){await transfers.advance(firstDecrease);if((await prisma.$queryRaw`SELECT released_at FROM xera_quota_transition_nodes WHERE transition_id=${smallerReset}::uuid AND node_uuid=${N1}::uuid`)[0].released_at)break;}
    const immediateReset=await prisma.$queryRaw`SELECT node_uuid,released_at FROM xera_quota_transition_nodes WHERE transition_id=${smallerReset}::uuid`;
    assert.ok(immediateReset.find(p=>p.node_uuid===N1).released_at);assert.equal(immediateReset.find(p=>p.node_uuid===N2).released_at,null);
    assert.equal((await prisma.$queryRaw`SELECT closed_usage_bytes FROM xera_quota_reserves WHERE id=${oldResetGrant.id}::uuid`)[0].closed_usage_bytes,null);
    const newReset=(await prisma.$queryRaw`SELECT limit_bytes FROM xera_quota_reserve_pools WHERE kind='TAG' AND key='alpha' AND user_id=901 AND budget_epoch=${resetEpoch}::uuid`)[0];assert.equal(newReset.limit_bytes,100n);
    unavailable=null;for(let pass=0;pass<2;pass++){await transfers.request(firstDecrease,[N1,N2]);for(let step=0;step<35;step++){await transfers.advance(firstDecrease);if((await prisma.$queryRaw`SELECT phase FROM xera_quota_transitions WHERE id=${smallerReset}::uuid`)[0].phase==='ACTIVE')break;}}
    assert.equal((await prisma.$queryRaw`SELECT phase FROM xera_quota_transitions WHERE id=${smallerReset}::uuid`)[0].phase,'ACTIVE');
    console.log('PASS an explicit RESET with a smaller cap releases online nodes immediately while offline old bounded credit remains committed');

    await prisma.$executeRaw`UPDATE hosts SET always_available=true WHERE uuid=${H}::uuid`;
    await policies.syncNode(opts);await policies.syncNode(secondOpts);
    const recoveryScope={kind:'USER',key:'global',owner:'901'};
    assert.equal((await policyProof()).applied_policy.scopes['user:global']['901'][4],true);
    const recoveryAccount=remote.get(N1).body.groups['user:global'].unreservedAccounts['901'];
    const recoveryFactor=remote.get(N1).body.legacyQuotaMultipliers['user:global'];
    const recoveryScale=remote.get(N1).body.groups['user:global'].multiplierScale;
    assert.equal(recoveryFactor,1500000000);assert.equal(recoveryScale,1000000000);
    const recoveryBank=async()=>(await prisma.$queryRaw`SELECT baseline_bytes AS baseline,unreserved_nano::text AS nano FROM xera_quota_reserve_pools WHERE usage_account=${recoveryAccount}::uuid`)[0];
    const recoveryBefore=await recoveryBank();
    remote.get(N1).values={['qfree>>>'+recoveryAccount+'>>>901>>>'+recoveryFactor+'>>>'+recoveryScale+'>>>traffic>>>uplink']:'4',[`user>>>${username}>>>traffic>>>uplink`]:'4'};
    const oldUserGrants=await prisma.$queryRaw`SELECT id,ceiling_bytes FROM xera_quota_reserves WHERE kind='USER' AND user_id=901 AND retired_at IS NULL AND closed_usage_bytes IS NULL ORDER BY id`;
    await prisma.$executeRaw`UPDATE users SET traffic_limit_bytes=traffic_limit_bytes+100 WHERE id=901`;
    unavailable=N2;const recoveryTopup=await transfers.request(recoveryScope,[N1,N2]),beforeRecoveryFence=deliveries;
    await transfers.advance(recoveryScope);
    assert.equal((await prisma.$queryRaw`SELECT phase FROM xera_quota_transitions WHERE id=${recoveryTopup}::uuid`)[0].phase,'PREFLIGHT');
    assert.equal(deliveries,beforeRecoveryFence);
    assert.deepEqual(await prisma.$queryRaw`SELECT id,ceiling_bytes FROM xera_quota_reserves WHERE kind='USER' AND user_id=901 AND retired_at IS NULL AND closed_usage_bytes IS NULL ORDER BY id`,oldUserGrants);
    unavailable=null;for(let step=0;step<35;step++){await transfers.advance(recoveryScope);if((await prisma.$queryRaw`SELECT phase FROM xera_quota_transitions WHERE id=${recoveryTopup}::uuid`)[0].phase==='ACTIVE')break;}
    const toppedUp=(await prisma.$queryRaw`SELECT phase,generation FROM xera_quota_transitions WHERE id=${recoveryTopup}::uuid`)[0];assert.equal(toppedUp.phase,'ACTIVE');
    const recoveryAfter=await recoveryBank();assert.equal(recoveryAfter.baseline,recoveryBefore.baseline+6n);assert.equal(BigInt(recoveryAfter.nano),BigInt(recoveryBefore.nano)+6000000000n);
    await transfers.request(recoveryScope,[N1,N2]);await transfers.advance(recoveryScope);
    assert.equal((await prisma.$queryRaw`SELECT generation FROM xera_quota_transitions WHERE id=${recoveryTopup}::uuid`)[0].generation,toppedUp.generation,'A recovery host cannot cause an endless fence when there is no new credit');
    console.log('PASS additional USER credit with recovery traffic fences and captures its unreserved tail once, without repeated fences after funding');

    await transfers.request(scope,[N1]);await transfers.advance(scope);await transfers.advance(scope);
    assert.equal((await transferState()).phase,'DRAINING');
    const held=await transferState();await transfers.request(scope,[N1,N2]);assert.notEqual((await transferState()).generation,held.generation);
    unavailable=N2;await transfers.advance(scope);await policies.syncNode(opts);
    assert.equal((await transferState()).phase,'PREFLIGHT');assert.equal(remote.get(N1).body.groups['host:'+H].fencedOwners['901'],true);
    unavailable=null;await advance('ACTIVE');
    console.log('PASS changing a target during a committed fence preserves the old admission barrier while the new preflight waits');
    const missingGrant=(await prisma.$queryRaw`SELECT id FROM xera_quota_reserves WHERE kind='HOST' AND key=${H} AND user_id=901 AND node_uuid=${N2}::uuid AND retired_at IS NULL AND closed_usage_bytes IS NULL`)[0];
    assert.ok(missingGrant);assert.ok(remote.get(N2).ledger.delete(missingGrant.id));
    await transfers.request(scope,[N1]);await transfers.advance(scope);
    remote.get(N1).core='df29ee68-a625-4160-9573-cc17de317a5d';
    for(let step=0;step<10;step++)await transfers.advance(scope);
    const lostCore=(await prisma.$queryRaw`SELECT error_code,drained_at,release_ready FROM xera_quota_transition_nodes WHERE transition_id=${transferId}::uuid AND node_uuid=${N1}::uuid`)[0];
    assert.equal(lostCore.error_code,'TRANSITION_CORE_REQUIRES_RECOVERY');assert.equal(lostCore.drained_at,null);assert.equal(lostCore.release_ready,false);
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserves WHERE kind='HOST' AND node_uuid=${N1}::uuid AND retired_at IS NULL AND closed_usage_bytes IS NULL`)[0].n,0n);
    console.log('PASS a process replacement during transfer cannot turn a new zero receipt into proof of the old uncaptured debt');
    const missingLedger=(await prisma.$queryRaw`SELECT error_code,drained_at FROM xera_quota_transition_nodes WHERE transition_id=${transferId}::uuid AND node_uuid=${N2}::uuid`)[0];
    assert.equal(missingLedger.error_code,'TRANSITION_RETRY_REQUIRED');assert.equal(missingLedger.drained_at,null);
    assert.equal((await prisma.$queryRaw`SELECT closed_usage_bytes FROM xera_quota_reserves WHERE id=${missingGrant.id}::uuid`)[0].closed_usage_bytes,null);
    const stoppedProgress=await limits.synchronization('HOST',H);assert.equal(stoppedProgress.totalNodes,2);assert.equal(stoppedProgress.appliedNodes,0);
    console.log('PASS a missing local ledger entry keeps its full committed liability and cannot masquerade as a sealed zero refund');


    // A funded identifier whose first delivery never happened can be cancelled
    // only through the new protocol. A historical legacy identifier remains debt.
    const registrationPool='registration_fixture',registrationEpoch=crypto.randomUUID();
    await prisma.$executeRaw`INSERT INTO xera_quota_reserve_pools(kind,key,user_id,window_start,budget_epoch,expires_at,baseline_bytes,limit_bytes)
        VALUES('TAG',${registrationPool},901,current_date,${registrationEpoch}::uuid,date_trunc('milliseconds',now()+interval '1 day'),0,200)`;
    const neverDelivered=crypto.randomUUID(),legacyMissing=crypto.randomUUID();
    await prisma.$executeRaw`INSERT INTO xera_quota_reserves(id,kind,key,user_id,window_start,budget_epoch,node_uuid,instance_uuid,ceiling_bytes,retired_at)
        VALUES(${neverDelivered}::uuid,'TAG',${registrationPool},901,current_date,${registrationEpoch}::uuid,${N1}::uuid,${I1}::uuid,100,clock_timestamp())`;
    await prisma.$executeRaw`INSERT INTO xera_quota_reserves(id,kind,key,user_id,window_start,budget_epoch,node_uuid,instance_uuid,ceiling_bytes,retired_at,registration_required)
        VALUES(${legacyMissing}::uuid,'TAG',${registrationPool},901,current_date,${registrationEpoch}::uuid,${N1}::uuid,${I1}::uuid,100,clock_timestamp(),false)`;
    assert.ok(!remote.get(N1).ledger.has(neverDelivered));await policies.syncNode(opts);
    const cancelledProof=(await prisma.$queryRaw`SELECT closed_usage_bytes,registration_action,registered_revision,activation_revision FROM xera_quota_reserves WHERE id=${neverDelivered}::uuid`)[0];
    assert.equal(cancelledProof.closed_usage_bytes,0n);assert.equal(cancelledProof.registration_action,'cancel');assert.equal(cancelledProof.registered_revision,null);assert.equal(cancelledProof.activation_revision,null);
    assert.equal(remote.get(N1).ledger.get(neverDelivered).closed,true);
    assert.equal((await prisma.$queryRaw`SELECT closed_usage_bytes FROM xera_quota_reserves WHERE id=${legacyMissing}::uuid`)[0].closed_usage_bytes,null);
    await policies.syncNode(opts);assert.equal((await prisma.$queryRaw`SELECT closed_usage_bytes FROM xera_quota_reserves WHERE id=${neverDelivered}::uuid`)[0].closed_usage_bytes,0n);
    await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_reserves SET registration_required=false WHERE id=${neverDelivered}::uuid`,/cannot be rewritten/);
    await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_reserves SET registered_sequence=1 WHERE id=${neverDelivered}::uuid`,/constraint/);
    console.log('PASS never-delivered new credit closes through a durable zero tombstone while legacy missing credit and immutable SQL provenance remain protected');

    // Keep a terminal process-replacement fixture last: its lost RAM tail is a
    // real outstanding liability and must not be silently removed for later tests.
    const exposureTag='exposure_restart';
    await prisma.$executeRaw`INSERT INTO xera_host_tag_limits(tag,user_traffic_limit_bytes) VALUES(${exposureTag},0)`;
    await prisma.$executeRaw`UPDATE hosts SET tags=array_append(tags,${exposureTag}) WHERE uuid=${H}::uuid`;
    loseExposureOnce=true;await assert.rejects(policies.syncNode(opts),/изоляцией хостов/);
    const exposedCore=remote.get(N1).core,unlimitedProof=await policyProof();
    assert.equal(unlimitedProof.applied_policy.scopes['tag:'+exposureTag],undefined,'A lost delivery ACK must not fabricate an applied proof');
    assert.equal(load(path.join(__dirname,'../src/common/host-policy/quota-policy-proof.ts')).quotaPolicyProof(remote.get(N1).body).proof.scopes['tag:'+exposureTag]['901'][0],'U');
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_usage_exposures WHERE node_uuid=${N1}::uuid AND core_uuid=${exposedCore}::uuid AND kind='TAG' AND key=${exposureTag} AND user_id=901`)[0].n,1n);
    const exposedSource=load(path.join(__dirname,'../src/common/host-policy/quota-policy-proof.ts')).quotaPolicyProof(remote.get(N1).body).source;
    console.log('PASS losing the ACK of unlimited delivery preserves its committed potential debt even without any applied proof');
    remote.get(N1).core='cf29ee68-a625-4160-9573-cc17de317a5d';await policies.syncNode(opts);
    const restarted=await policyProof();assert.equal(restarted.applied_core,remote.get(N1).core);assert.notEqual(restarted.boundary,unlimitedProof.boundary);assert.equal(restarted.applied_source,exposedSource);
    const exposed=await prisma.$queryRaw`SELECT core_uuid FROM xera_quota_usage_exposures WHERE node_uuid=${N1}::uuid AND kind='TAG' AND key=${exposureTag} AND user_id=901`;
    assert.deepEqual(new Set(exposed.map(e=>e.core_uuid)),new Set([exposedCore,remote.get(N1).core]));
    await prisma.$executeRaw`UPDATE xera_host_tag_limits SET user_traffic_limit_bytes=1000 WHERE tag=${exposureTag}`;
    await policies.syncNode(opts);await new Promise(resolve=>setTimeout(resolve,5));
    await usage.collect({nodeUuid:N1,nodeId:901n,opts,multiplier:'1500000000'},async()=>{});
    const remaining=await prisma.$queryRaw`SELECT core_uuid FROM xera_quota_usage_exposures WHERE node_uuid=${N1}::uuid AND kind='TAG' AND key=${exposureTag} AND user_id=901`;
    assert.deepEqual(remaining.map(e=>e.core_uuid),[exposedCore],'A new zero frame clears only its own acknowledged barrier');
    const restartScope={kind:'TAG',key:exposureTag,owner:'901'},beforeRecovery=await counts();
    await assert.rejects(prisma.$queryRaw`SELECT xera_fund_quota_targets(${JSON.stringify([{...restartScope,nodes:[N1],instances:{[N1]:I1}}])}::jsonb)`,/QUOTA_USAGE_REQUIRES_RECOVERY/);
    assert.equal(await counts(),beforeRecovery);
    const recoveryId=await transfers.request(restartScope,[N1]);await transfers.advance(restartScope);
    const recovery=(await prisma.$queryRaw`SELECT error_code,preflight_at FROM xera_quota_transition_nodes WHERE transition_id=${recoveryId}::uuid AND node_uuid=${N1}::uuid`)[0];
    assert.equal(recovery.error_code,'TRANSITION_DEBT_REQUIRES_RECOVERY');assert.equal(recovery.preflight_at,null);
    console.log('PASS a restart before transition preserves old unbounded exposure; new proof and a new zero receipt cannot fund over lost RAM debt');


    const beforeRestoreDelivery=deliveries,beforeRestoreWire=structuredClone(remote.get(N1).body);
    await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;
    assert.equal((await coordinator().status()).phase,'RECOVERY');assert.equal(await coordinator().tick(),false);
    await assert.rejects(policies.syncNode(opts),/RESTORE_REQUIRES_RECONCILIATION/);
    await assert.rejects(prisma.$executeRaw`INSERT INTO xera_quota_reserves(kind,key,user_id,window_start,budget_epoch,node_uuid,instance_uuid,ceiling_bytes,retired_at)
        VALUES('TAG',${registrationPool},901,current_date,${registrationEpoch}::uuid,${N1}::uuid,${I1}::uuid,1,clock_timestamp())`,/RESTORE_REQUIRES_RECONCILIATION/);
    await assert.rejects(prisma.$executeRaw`UPDATE xera_quota_reserves SET ceiling_bytes=ceiling_bytes+1 WHERE id=${legacyMissing}::uuid`,/RESTORE_REQUIRES_RECONCILIATION/);
    const {QuotaCoordinatorTask}=load(path.join(__dirname,'../src/scheduler/tasks/quota-coordinator.task.ts'),{'@common/host-policy/quota-coordinator.service':{QuotaCoordinatorService}});
    await new QuotaCoordinatorTask(coordinator()).run();
    assert.equal(deliveries,beforeRestoreDelivery);assert.deepEqual(remote.get(N1).body,beforeRestoreWire);
    console.log('PASS restore quarantine blocks actual policy delivery and direct positive grant issuance without deleting old node credit');
}finally{await db.kysely.destroy();await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
