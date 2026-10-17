// Seeds only the explicitly named, empty, disposable loopback database.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {AsyncLocalStorage}=require('node:async_hooks');const crypto=require('node:crypto');
const {PrismaClient}=require('@prisma/client');const k=require('kysely');const load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url=process.env.USAGE_RECEIPTS_TEST_DATABASE_URL;assert.ok(url,'Set USAGE_RECEIPTS_TEST_DATABASE_URL');
const target=new URL(url);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55439');assert.equal(target.pathname,'/remnacust_usage_receipts_test');
const prisma=new PrismaClient({datasourceUrl:url});
const N='cccccccc-cccc-4ccc-8ccc-cccccccccccc',I='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',C='ff29ee68-a625-4160-9573-cc17de317a5d',C2='ef29ee68-a625-4160-9573-cc17de317a5d',H='11111111-1111-4111-8111-111111111111';
const username='901~0123456789abcdef01234567~h'+H.replaceAll('-','');
const parser=load(path.join(__dirname,'../src/common/host-policy/usage-receipt.ts'));
function frame(seq,core,entries){const result={sequence:String(seq),coreProcessId:core,capturedAt:String(Date.now()),stats:Object.entries(entries).map(([name,value])=>({name,value:String(value)})).sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)))};const text=JSON.stringify(result).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));return {...result,stream:I,capability:parser.USAGE_RECEIPTS,digest:crypto.createHash('sha256').update(text).digest('hex')};}
(async()=>{
try{
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n,0n,'Refuse existing users');
    const seed=fs.readFileSync(path.join(__dirname,'fixtures/host-policy-seed.sql'),'utf8').replace('BEGIN;','');
    await prisma.$transaction(async tx=>{for(const statement of seed.split(';').filter(v=>v.trim()))await tx.$executeRawUnsafe(statement);await tx.$executeRaw`INSERT INTO user_traffic(id) VALUES(901),(902) ON CONFLICT DO NOTHING`;await tx.$executeRaw`INSERT INTO xera_quota_node_modes(node_uuid,phase,instance_uuid,initial_core,fenced_core,fenced_revision,fenced_at,fenced_source) VALUES(${N}::uuid,'FENCING',${I}::uuid,${C}::uuid,${C}::uuid,1,clock_timestamp()-interval '1 second',repeat('a',64))`;});
    const cls=new AsyncLocalStorage();let rejectCommit=false;
    const transactions={isTransactionActive:()=>!!cls.getStore(),get tx(){return cls.getStore()??prisma;},withTransaction:async(options,fn)=>prisma.$transaction(tx=>cls.run(tx,async()=>{const result=await fn();if(rejectCommit){rejectCommit=false;throw Error('simulated SQL commit failure');}return result;}),options)};
    const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
    const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(transactions),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
    let pending=null,acked=0,currentCore=C,samples=0,acks=0,loseSample=false,loseAck=false,failSQL=false,history=true,capability=true;
    let values={[`user>>>${username}>>>traffic>>>uplink`]:'7',[`user>>>${username}>>>traffic>>>downlink`]:'11','user>>>901>>>traffic>>>uplink':'2'};
    const axios={hostPolicy:async()=>({isOk:true,response:{usageReceiptsSupported:capability,quotaInstanceId:I,coreProcessId:currentCore,policyRevision:'1',applied:true}}),usageReceipt:async(opts,request)=>{
        assert.equal(transactions.isTransactionActive(),false,'Native sampling and ACK must never hold a panel SQL transaction');
        assert.equal(request.stream,I);
        if(request.action==='sample'){
            samples++;
            if(pending){assert.equal(request.sequence,pending.sequence);assert.equal(request.coreProcessId,pending.coreProcessId);}
            else {if(request.coreProcessId!==currentCore||BigInt(request.sequence)!==BigInt(acked)+1n)return {isOk:false};pending=frame(request.sequence,currentCore,values);values={};}
            if(loseSample){loseSample=false;return {isOk:false};}
            if(failSQL){failSQL=false;rejectCommit=true;}
            return {isOk:true,response:pending};
        }
        acks++;
        if(BigInt(request.sequence)>BigInt(acked)){assert.equal(request.digest,pending.digest);acked=Number(request.sequence);pending=null;}
        if(loseAck){loseAck=false;return {isOk:false};}
        return {isOk:true,response:{stream:I,sequence:request.sequence,acknowledged:true}};
    }};
    const {DurableUsageService}=load(path.join(__dirname,'../src/common/host-policy/durable-usage.service.ts'),{'@common/axios':{},'@common/config/app-config':{},'@common/database':{},'@common/utils/device-identity':load(path.join(__dirname,'../src/common/utils/device-identity.ts')),'@common/utils/host-identity':load(path.join(__dirname,'../src/common/utils/host-identity.ts')),'@common/utils/nano':load(path.join(__dirname,'../src/common/utils/nano/nano.util.ts')),'./usage-receipt':parser});
    const service=new DurableUsageService(db,axios,transactions,{getOrThrow:key=>key==='USER_USAGE_IGNORE_BELOW_BYTES'?0n:key==='SERVICE_DISABLE_USER_USAGE_RECORDS'?!history:undefined});
    const node={nodeUuid:N,nodeId:901n,opts:{address:'127.0.0.1',port:2222,proxyUrl:null},multiplier:'1500000000'};
    const effects=[];let failEffects=false;
    const collect=(overrides={})=>service.collect({...node,...overrides},async(receipt,value)=>{effects.push({receipt,value});if(failEffects){failEffects=false;throw Error('simulated notification queue outage');}});
    const traffic=async()=> (await prisma.$queryRaw`SELECT used_traffic_bytes AS used,lifetime_used_traffic_bytes AS lifetime FROM user_traffic WHERE id=901`)[0];
    const hostBytes=async()=>BigInt((await prisma.$queryRaw`SELECT COALESCE(sum(total_bytes),0)::text AS bytes FROM xera_host_quota_usage WHERE user_id=901 AND host_uuid=${H}::uuid`)[0].bytes);
    const state=async()=> (await prisma.$queryRaw`SELECT * FROM xera_node_usage_streams WHERE node_uuid=${N}::uuid`)[0];

    loseSample=true;await assert.rejects(collect(),/sample response is unavailable/);
    assert.equal((await state()).next_sequence,1n);assert.equal((await state()).expected_core,C);assert.equal((await traffic()).used,0n);assert.equal(acked,0);
    const first=await collect({multiplier:'9000000000'});
    assert.equal(first.sequence,'1');assert.equal((await traffic()).used,30n,'prepared multiplier survives a lost response and later config change');assert.equal((await traffic()).lifetime,30n);assert.equal(await hostBytes(),18n);assert.equal((await state()).next_sequence,2n);assert.equal((await state()).committed_digest,null);assert.equal(effects[0].value.owners[0].bytes,'20');assert.deepEqual(effects[0].value.firstConnected,['901']);
    assert.equal((await prisma.$queryRaw`SELECT total_bytes FROM nodes_user_usage_history WHERE user_id=901`)[0].total_bytes,20n);
    const proof=(await prisma.$queryRaw`SELECT initial_core,initial_drained_at,initial_drain_sequence FROM xera_quota_node_modes WHERE node_uuid=${N}::uuid`)[0];assert.equal(proof.initial_core,C);assert.equal(proof.initial_drain_sequence,1n);assert.ok(proof.initial_drained_at instanceof Date);
    console.log('PASS lost response replays one frame; host/global/history accounting commit once with the original multiplier');

    values={[`user>>>${username}>>>traffic>>>uplink`]:'10'};failSQL=true;await assert.rejects(collect(),/SQL commit failure/);
    assert.equal((await traffic()).used,30n);assert.equal(await hostBytes(),18n);assert.equal((await state()).next_sequence,2n);assert.equal(acked,1);
    await collect();assert.equal((await traffic()).used,45n);assert.equal(await hostBytes(),28n);assert.equal(acked,2);
    console.log('PASS SQL rollback after a core reset leaves a replayable frame and no billing effects');

    values={[`user>>>${username}>>>traffic>>>downlink`]:'8'};loseAck=true;await assert.rejects(collect(),/acknowledgement is uncertain/);
    const priorSamples=samples;assert.equal((await traffic()).used,57n);assert.equal((await state()).next_sequence,3n);
    await collect();assert.equal(samples,priorSamples,'lost ACK retry must not take another snapshot');assert.equal((await traffic()).used,57n);assert.equal(await hostBytes(),36n);assert.equal((await state()).next_sequence,4n);
    console.log('PASS lost ACK retries only the acknowledgement and cannot bill twice');

    values={[`user>>>${username}>>>traffic>>>uplink`]:'6'};failEffects=true;await assert.rejects(collect(),/notification queue outage/);
    assert.equal((await traffic()).used,66n);assert.equal(acked,3);const count=samples;
    await collect();assert.equal((await traffic()).used,66n);assert.equal(samples,count);assert.equal(acked,4);assert.equal((await state()).pending_effects,null);
    console.log('PASS notification retry remains outside monetary billing and preserves a bounded durable outbox');

    history=false;values={[`user>>>${username}>>>traffic>>>uplink`]:'4'};await collect();
    assert.equal((await traffic()).used,72n);assert.equal(await hostBytes(),46n);assert.equal((await prisma.$queryRaw`SELECT total_bytes FROM nodes_user_usage_history WHERE user_id=901`)[0].total_bytes,44n);
    console.log('PASS disabling optional statistics history cannot disable billing or host quota accounting');

    values={[`user>>>${username}>>>traffic>>>uplink`]:'2'};loseSample=true;await assert.rejects(collect(),/sample response/);currentCore=C2;
    const old=await collect();assert.equal(old.coreProcessId,C);assert.equal((await traffic()).used,75n);values={[`user>>>${username}>>>traffic>>>uplink`]:'2'};
    const next=await collect();assert.equal(next.coreProcessId,C2);assert.equal((await traffic()).used,78n);
    console.log('PASS previous-core pending frame is recovered before preparing the next live-core sequence');

    values={[`user>>>${username}>>>traffic>>>uplink`]:'2'};
    const concurrent=await Promise.allSettled(Array.from({length:12},()=>collect()));
    assert.ok(concurrent.some(result=>result.status==='fulfilled'));
    for(const result of concurrent)if(result.status==='rejected')assert.match(result.reason.message,/superseded/);
    assert.equal((await traffic()).used,81n,'concurrent stalled jobs cannot bill a frame twice');
    console.log('PASS twelve concurrent collectors preserve one monetary increment');

    values={'user>>>901>>>traffic>>>uplink':'9007199254740993'};await collect({multiplier:'1000000000'});
    assert.equal((await traffic()).used,9007199254741074n,'exact int64 values never pass through a JS number');
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_node_usage_streams`)[0].n,1n);
    console.log('PASS int64 precision and bounded one-row stream state');

    capability=false;const oldSamples=samples;await assert.rejects(collect(),/prove its usage receipt/);assert.equal(samples,oldSamples);capability=true;
    assert.equal(await service.collect({...node,nodeUuid:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},async()=>{}),null,'legacy node path is explicit');
    console.log('PASS legacy/unproven nodes never silently activate or reset the durable stream');

    // The request is committed but no frame was captured before a core crash.
    // Never change its expected core to accept an unproven zero snapshot.
    const original=axios.usageReceipt;let beforeCapture=true;axios.usageReceipt=async(opts,request)=>{if(beforeCapture&&request.action==='sample'){beforeCapture=false;return {isOk:false};}return original(opts,request);};
    await assert.rejects(collect(),/sample response/);currentCore=C;
    await assert.rejects(collect(),/sample response/);assert.equal((await state()).expected_core,C2);assert.equal((await traffic()).used,9007199254741074n);
    console.log('PASS unconfirmed pre-crash debt cannot be replaced by a new-core zero sample');
    await prisma.$executeRaw`UPDATE xera_node_usage_streams SET expected_core=NULL,requested_at=NULL,consumption_multiplier=NULL WHERE node_uuid=${N}::uuid`;
    await prisma.$executeRaw`UPDATE xera_quota_node_modes SET initial_core=${C2}::uuid,initial_drained_at=NULL,initial_drain_sequence=NULL,fenced_core=${C}::uuid WHERE node_uuid=${N}::uuid`;
    const beforeSamples=samples;await assert.rejects(collect(),/Unconfirmed initial core debt/);assert.equal(samples,beforeSamples);
    assert.equal((await prisma.$queryRaw`SELECT initial_core FROM xera_quota_node_modes WHERE node_uuid=${N}::uuid`)[0].initial_core,C2,'a new fence cannot erase the original process identity');
    console.log('PASS a fresh fence on a restarted core cannot hide unconfirmed initial RAM debt');
    await prisma.$executeRaw`UPDATE xera_quota_node_modes SET initial_core=${C}::uuid,fenced_at=clock_timestamp()+interval '1 hour' WHERE node_uuid=${N}::uuid`;
    values={};await collect();
    assert.equal((await prisma.$queryRaw`SELECT initial_drained_at FROM xera_quota_node_modes WHERE node_uuid=${N}::uuid`)[0].initial_drained_at,null,'a sample requested before the fence boundary cannot prove drainage even if it is empty');
    console.log('PASS strict database-clock boundary prevents a premature empty frame from proving a drained fence');
    // Private metadata passes through the real receipt transaction and ACK.
    const AU='b129ee68-a625-4160-9573-cc17de317a5d',AH='b229ee68-a625-4160-9573-cc17de317a5d',AT='b329ee68-a625-4160-9573-cc17de317a5d';
    const bank=async(kind,key,owner,account)=>prisma.$executeRaw`INSERT INTO xera_quota_reserve_pools(kind,key,user_id,window_start,expires_at,baseline_bytes,limit_bytes,usage_account) VALUES(${kind},${key},${owner}::bigint,'1970-01-01','2099-01-01',0,1000000,${account}::uuid)`;
    const delivery=async(account,factor,scale)=>prisma.$executeRaw`INSERT INTO xera_quota_usage_deliveries(usage_account,node_uuid,instance_uuid,factor,scale,first_revision,last_revision) VALUES(${account}::uuid,${N}::uuid,${I}::uuid,${factor}::bigint,${scale}::bigint,1,1)`;
    const name=(account,owner,factor,scale)=>`qfree>>>${account}>>>${owner}>>>${factor}>>>${scale}>>>traffic>>>uplink`;
    const U=name(AU,'901','500000000','1000000000'),HH=name(AH,'901','150','100'),T=name(AT,'901','150','100');
    await bank('USER','global','901',AU);await bank('HOST',H,'901',AH);await bank('TAG','alpha','901',AT);
    await delivery(AU,'500000000','1000000000');await delivery(AH,'150','100');await delivery(AT,'150','100');
    const banks=async()=>Object.fromEntries((await prisma.$queryRaw`SELECT usage_account::text AS account,baseline_bytes AS baseline,unreserved_nano::text AS nano FROM xera_quota_reserve_pools WHERE user_id=901`).map(row=>[row.account,{baseline:row.baseline,nano:row.nano}]));
    const before=(await traffic()).used;
    values={[U]:'1',[HH]:'1',[T]:'1','user>>>901>>>traffic>>>uplink':'2'};
    loseAck=true;await assert.rejects(collect({multiplier:'1000000000'}),/acknowledgement is uncertain/);await collect();
    assert.equal((await traffic()).used,before+2n,'metadata must not become another raw subscriber');
    let b=await banks();assert.equal(b[AU].baseline,1n);assert.equal(b[AH].baseline,2n);assert.equal(b[AT].baseline,2n);
    assert.equal(b[AU].nano,'500000000');assert.equal(b[AH].nano,'1500000000');
    values={[U]:'1',[HH]:'1',[T]:'1'};await collect({multiplier:'9000000000'});
    b=await banks();assert.equal(b[AU].baseline,1n);assert.equal(b[AH].baseline,3n);assert.equal(b[AT].baseline,3n);
    assert.equal((await traffic()).used,before+2n,'adjacent metadata-only frames cannot bill raw traffic twice');
    assert.equal(effects.at(-1).value.owners[0].bytes,'0');
    console.log('PASS USER/HOST/TAG metadata preserves original prices, fractional carry and raw billing across a lost ACK');

    values={[U]:'1',[HH]:'1',[T]:'1'};failSQL=true;await assert.rejects(collect(),/SQL commit failure/);
    b=await banks();assert.equal(b[AU].baseline,1n);assert.equal(b[AH].baseline,3n);assert.equal(b[AT].baseline,3n);
    await collect();b=await banks();assert.equal(b[AU].baseline,2n);assert.equal(b[AH].baseline,5n);assert.equal(b[AT].baseline,5n);
    console.log('PASS outside-grant debt and receipt digest roll back and replay together');

    const unknown='b429ee68-a625-4160-9573-cc17de317a5d';values={[name(unknown,'901','100','100')]:'7'};
    const ackBefore=acked;await assert.rejects(collect(),/unknown unreserved usage account/);assert.equal(acked,ackBefore);
    assert.equal((await traffic()).used,before+2n);
    await bank('TAG','restored','901',unknown);await delivery(unknown,'100','100');await collect();
    b=await banks();assert.equal(b[unknown].baseline,7n);
    console.log('PASS unknown live-owner debt cannot be acknowledged away; restored provenance resumes the same frame');

    values={[name(AU,'901','750000000','1000000000')]:'3'};
    await assert.rejects(collect(),/provenance differs/);assert.equal((await banks())[AU].baseline,2n);
    await delivery(AU,'750000000','1000000000');await collect();
    assert.equal((await banks())[AU].baseline,4n,'fractional carry spans coefficient changes');
    console.log('PASS an undelivered coefficient is refused before ACK and cannot change a live bank');

    const resetAccount='b529ee68-a625-4160-9573-cc17de317a5d';
    await prisma.$executeRaw`INSERT INTO xera_quota_reserve_pools(kind,key,user_id,window_start,budget_epoch,expires_at,baseline_bytes,limit_bytes,usage_account) VALUES('USER','global',901,'1970-01-01','55555555-5555-4555-8555-555555555555','2099-01-01',0,1000000,${resetAccount}::uuid)`;
    await delivery(resetAccount,'500000000','1000000000');
    values={[U]:'1',[name(resetAccount,'901','500000000','1000000000')]:'1'};await collect();
    b=await banks();assert.equal(b[AU].baseline,5n);assert.equal(b[resetAccount].baseline,1n);
    console.log('PASS pre-reset metadata stays in its original epoch and never consumes the new bank');

    const deleted='b629ee68-a625-4160-9573-cc17de317a5d';await bank('TAG','deleted','902',deleted);await delivery(deleted,'100','100');
    await prisma.$executeRaw`DELETE FROM users WHERE id=902`;
    values={[name(deleted,'902','100','100')]:'9'};await collect();
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserve_pools WHERE usage_account=${deleted}::uuid`)[0].n,0n);
    assert.equal((await traffic()).used,before+2n);
    console.log('PASS late deleted-owner debt cannot recreate a bank or block surviving owners');
    const transport=axios.usageReceipt;let releaseRequest,requestStarted;
    const heldRequest=new Promise(resolve=>releaseRequest=resolve),arrived=new Promise(resolve=>requestStarted=resolve);
    axios.usageReceipt=async(opts,request)=>{if(request.action==='sample'){requestStarted();await heldRequest;}return transport(opts,request);};
    values={};const heldCollection=collect();await arrived;
    try {
        await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT 1 FROM xera_quota_node_modes WHERE node_uuid=${N}::uuid FOR UPDATE NOWAIT`;});
    } finally {releaseRequest();}
    await heldCollection;axios.usageReceipt=transport;
    console.log('PASS a stalled native request leaves policy acknowledgement rows available and commits only after its response');
    // Restore may begin after preparation while the native sample is in flight.
    const chargedBeforeRestore=(await traffic()).used,acksBeforeRestore=acked;
    values={'user>>>901>>>traffic>>>uplink':'19'};
    axios.usageReceipt=async(opts,request)=>{const result=await transport(opts,request);if(request.action==='sample')await prisma.$queryRaw`SELECT xera_quarantine_restored_quotas()`;return result;};
    await assert.rejects(collect(),/REQUIRES_RECONCILIATION/);assert.equal((await traffic()).used,chargedBeforeRestore);assert.equal(acked,acksBeforeRestore);
    assert(pending,'An unapproved receipt must remain in the native outbox');
    const stoppedSamples=samples,stoppedAcks=acks;
    await assert.rejects(collect(),/REQUIRES_RECONCILIATION/);assert.equal(samples,stoppedSamples);assert.equal(acks,stoppedAcks);
    assert.equal((await state()).committed_digest,null);
    console.log('PASS a restore begun during native sampling prevents billing and ACK, retains the same outbox frame and blocks subsequent sampling');
    console.log(`Usage receipt database checks passed (${samples} sample attempts, ${acks} ACK attempts); no production DB accessed`);
} finally {await prisma.$disconnect();}
})().catch(error=>{console.error(error);process.exitCode=1;});
