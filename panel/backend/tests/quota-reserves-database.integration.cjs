// This script deliberately seeds data. It only accepts the named disposable DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { AsyncLocalStorage } = require('node:async_hooks');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url = process.env.QUOTA_RESERVES_TEST_DATABASE_URL;
assert.ok(url, 'Set QUOTA_RESERVES_TEST_DATABASE_URL to the disposable database');
const parsed = new URL(url);
assert.equal(parsed.hostname, '127.0.0.1');
assert.equal(parsed.port, '55439');
assert.equal(parsed.pathname, '/remnacust_quota_reserves_test');
const prisma = new PrismaClient({ datasourceUrl: url });
const H = '11111111-1111-4111-8111-111111111111';
const N1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const N2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const N3 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const INSTANCES = {[N1]:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',[N2]:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',[N3]:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'};
const allocate = (db = prisma, roster = [N1, N2], debt = 100n) => db.$queryRaw`
    SELECT id,node_uuid,instance_uuid,ceiling_bytes,expires_at FROM xera_allocate_quota_reserves(
       'HOST',${H},901::bigint,${roster}::uuid[],${debt}::bigint,${JSON.stringify(Object.fromEntries(roster.map(node => [node, INSTANCES[node]])))}::jsonb) ORDER BY node_uuid`;

(async () => {
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n, 0n,
        'Refuse a database containing existing user data');
    await prisma.$transaction(async tx => {
        const seed = fs.readFileSync(path.join(__dirname, 'fixtures/host-policy-seed.sql'), 'utf8').replace('BEGIN;', '');
        for (const statement of seed.split(';').filter(value => value.trim())) await tx.$executeRawUnsafe(statement);
        await tx.$executeRaw`UPDATE hosts SET user_traffic_limit_bytes=1000,traffic_multiplier=3 WHERE uuid=${H}::uuid`;
        await tx.$executeRaw`INSERT INTO xera_host_quota_usage(user_id,host_uuid,node_id,total_bytes) VALUES(901,${H}::uuid,901,100)`;
    });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => allocate(prisma, i % 2 ? [N2, N1, N2] : [N1, N2])));
    const first = results[0];
    assert.equal(first.length, 2);
    assert.equal(first.reduce((sum, grant) => sum + grant.ceiling_bytes, 0n), 600n,
        'Weighted SQL usage and fenced debt are both deducted before reserving');
    assert.equal(first[0].ceiling_bytes, 300n);
    for (const result of results) assert.deepEqual(result, first,
        'Concurrent workers and request replay return the same committed IDs');
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserves`)[0].n, 2n);
    console.log('PASS concurrent allocation, exact total ceiling, roster canonicalization and replay');
    const revisions = await Promise.all(Array.from({length:12},()=>prisma.$queryRaw`SELECT xera_next_host_policy_revision(${N1}::uuid,0::bigint) AS revision`));
    assert.equal(new Set(revisions.map(rows=>rows[0].revision.toString())).size,12);
    const [resumed] = await prisma.$queryRaw`SELECT xera_next_host_policy_revision(${N1}::uuid,900::bigint) AS revision`;
    assert.equal(resumed.revision,901n,'Node durable revision wins after a panel DB rollback');
    const [next] = await prisma.$queryRaw`SELECT xera_next_host_policy_revision(${N1}::uuid,0::bigint) AS revision`;
    assert.equal(next.revision,902n);
    console.log('PASS concurrent policy revisions are monotonic and recover the node high-water mark');

    // A failed response is outside the issuance transaction. It cannot release
    // credit that a disconnected node may already be spending.
    await assert.rejects(async () => {
        await allocate();
        throw new Error('simulated response lost after commit');
    }, /response lost/);
    await prisma.$executeRaw`INSERT INTO xera_quota_usage(node_id,user_id,created_at,total_bytes) VALUES(901,901,current_date,7)`;
    await prisma.$executeRaw`INSERT INTO xera_host_tag_limits(tag,user_traffic_limit_bytes) VALUES('alpha',1000)`;
    await prisma.$executeRaw`INSERT INTO xera_legacy_tag_quota_usage(tag,user_id,node_id,created_at,total_bytes) VALUES('alpha',901,901,current_date,3)`;
    await prisma.$executeRaw`INSERT INTO xera_host_usage_receipts(id,node_id) VALUES('44444444-4444-4444-8444-444444444444',901)`;
    await prisma.$executeRaw`DELETE FROM nodes WHERE uuid=${N1}::uuid`;
    assert.equal((await prisma.$queryRaw`SELECT sum(total_bytes) AS bytes FROM xera_host_quota_usage WHERE user_id=901`)[0].bytes.toString(),'100');
    assert.equal((await prisma.$queryRaw`SELECT sum(total_bytes) AS bytes FROM xera_quota_usage WHERE user_id=901`)[0].bytes.toString(),'7');
    assert.equal((await prisma.$queryRaw`SELECT sum(total_bytes) AS bytes FROM xera_legacy_tag_quota_usage WHERE user_id=901`)[0].bytes.toString(),'3');
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_host_usage_receipts WHERE node_id=901`)[0].n,1n);
    const [preservedMeter]=await prisma.$queryRaw`SELECT used_bytes FROM xera_limit_state('HOST',${H},901)`;
    assert.equal(preservedMeter.used_bytes,300n,'Deleting a node must not reset weighted host quota usage');
    console.log('PASS node deletion preserves host/legacy quota history, weighted debt and replay receipts');
    await prisma.$executeRaw`UPDATE hosts SET user_traffic_limit_bytes=5000 WHERE uuid=${H}::uuid`;
    assert.deepEqual(await allocate(prisma, [N2, N3], 0n), first,
        'Node removal, quota edits and missing acknowledgements cannot recycle existing credit');
    console.log('PASS disconnected/deleted nodes retain their reservation; changed roster cannot mint credit');
    const savedInstance = INSTANCES[N2];
    INSTANCES[N2] = 'aaaaaaaa-ffff-4fff-8fff-ffffffffffff';
    await assert.rejects(allocate(prisma, [N2]), /identity changed/);
    INSTANCES[N2] = savedInstance;
    assert.deepEqual(await allocate(), first);
    console.log('PASS a reinstalled node with empty local state cannot receive an already issued reserve');

    for (const [at, expected] of [
        ['2026-02-27T12:00:00Z','2026-02-28T00:00:00.000Z'],
        ['2026-02-28T00:00:00Z','2026-03-31T00:00:00.000Z'],
        ['2026-03-30T12:00:00Z','2026-03-31T00:00:00.000Z'],
        ['2026-03-31T00:00:00Z','2026-04-30T00:00:00.000Z'],
    ]) {
        const [row] = await prisma.$queryRaw`SELECT xera_quota_window_end('2026-01-31 00:00:00+00',1,'MONTHS',${at}::timestamptz) AS boundary`;
        assert.equal(row.boundary.toISOString(), expected);
    }
    await prisma.$executeRawUnsafe("SET TIME ZONE 'Asia/Tokyo'");
    const [day] = await prisma.$queryRaw`SELECT xera_quota_window_end('2026-01-01 03:00:00+00',3,'DAYS','2026-01-04 03:00:00+00') AS boundary`;
    assert.equal(day.boundary.toISOString(), '2026-01-07T03:00:00.000Z');
    await assert.rejects(allocate(prisma, [], 0n), /roster/);
    await assert.rejects(allocate(prisma, [N2], -1n), /boundary/);
    console.log('PASS UTC day/month boundaries, month-end clamping and invalid boundaries');
    await prisma.$disconnect();
    const restarted = new PrismaClient({ datasourceUrl: url });
    try { assert.deepEqual(await allocate(restarted), first); }
    finally { await restarted.$disconnect(); }
    console.log('PASS reservations survive a panel database-client restart');
    const grant=first.find(row=>row.node_uuid===N1);
    const settle=(overrides={})=>{
        const value={id:grant.id,node:N1,instance:INSTANCES[N1],group:'host:'+H,user:901n,
            ceiling:grant.ceiling_bytes,expiry:grant.expires_at,used:123n,revision:902n,...overrides};
        return prisma.$queryRaw`SELECT xera_settle_quota_reserve(${value.id}::uuid,${value.node}::uuid,${value.instance}::uuid,
            ${value.group},${value.user}::bigint,${value.ceiling}::bigint,${value.expiry}::timestamptz,${value.used}::bigint,${value.revision}::bigint) AS unused`;
    };
    for(const overrides of [
        {node:N2},{instance:INSTANCES[N2]},{group:'tag:alpha'},{user:902n},
        {ceiling:301n},{expiry:new Date(grant.expires_at.getTime()-1000)},
        {used:-1n},{used:301n},{revision:903n},{revision:0n},
        {id:'00000000-0000-4000-8000-000000000000'},
    ]) await assert.rejects(settle(overrides));
    const settled=await Promise.all(Array.from({length:12},()=>settle()));
    assert.ok(settled.every(rows=>rows[0].unused===177n));
    const [closed]=await prisma.$queryRaw`SELECT closed_usage_bytes,closed_revision FROM xera_quota_reserves WHERE id=${grant.id}::uuid`;
    assert.equal(closed.closed_usage_bytes,123n);assert.equal(closed.closed_revision,902n);
    await assert.rejects(settle({used:122n}),/changed after settlement/);
    await assert.rejects(settle({used:124n}),/changed after settlement/);
    await assert.rejects(settle({revision:901n}),/changed after settlement/);
    assert.deepEqual(await allocate(),first.filter(row=>row.id!==grant.id),
        'A sealed grant is never returned for reopening, and its unused credit is not implicitly reissued');
    console.log('PASS closed quota settlement is bound, idempotent, immutable and never silently reopens credit');
    const redistribute=(operation,roster=[N2,N3],bindings=INSTANCES)=>prisma.$queryRaw`
        SELECT xera_redistribute_quota_reserves(${operation}::uuid,'HOST',${H},901::bigint,
            ${roster}::uuid[],${JSON.stringify(Object.fromEntries([...new Set(roster)].map(node=>[node,bindings[node]])))}::jsonb) AS granted`;
    const active=()=>prisma.$queryRaw`SELECT id,node_uuid,instance_uuid,ceiling_bytes FROM xera_quota_reserves
        WHERE kind='HOST' AND key=${H} AND user_id=901 AND closed_usage_bytes IS NULL ORDER BY node_uuid`;
    const beforeRedistribution=await active();
    await assert.rejects(redistribute('11111111-2222-4333-8444-555555555555',[N2,N3],{...INSTANCES,[N2]:INSTANCES[N1]}),/identity changed/);
    assert.deepEqual(await active(),beforeRedistribution,'A late binding mismatch rolls back earlier participants of the same operation');
    const op='22222222-2222-4222-8222-222222222222';
    const redistributed=await Promise.all(Array.from({length:12},()=>redistribute(op)));
    assert.ok(redistributed.every(rows=>rows[0].granted===177n));
    const issued=await active();
    assert.equal(issued.find(row=>row.node_uuid===N3).ceiling_bytes,89n);
    assert.equal(issued.find(row=>row.node_uuid===N2).ceiling_bytes,388n);
    assert.equal(issued.find(row=>row.node_uuid===N2).id,first.find(row=>row.node_uuid===N2).id,
        'An active grant only grows cumulatively; retry is not a fresh grant');
    await assert.rejects(redistribute(op,[N3]),/reused/);
    assert.deepEqual(await active(),issued);
    const [encumbered]=await prisma.$queryRaw`SELECT sum(COALESCE(closed_usage_bytes,ceiling_bytes)) AS bytes FROM xera_quota_reserves WHERE kind='HOST' AND key=${H} AND user_id=901`;
    assert.equal(encumbered.bytes.toString(),'600','Closed charges plus active ceilings never exceed the original remaining budget');
    console.log('PASS redistribution uses sealed unused credit once, keeps disconnected grants and rolls back a partial allocation');

    const second=first.find(row=>row.node_uuid===N2);
    await prisma.$queryRaw`SELECT xera_next_host_policy_revision(${N2}::uuid,11::bigint)`;
    // The panel increased this grant to 388, but its response never reached the
    // node. A sealed report for its last applied ceiling of 300 is authoritative.
    await settle({id:second.id,node:N2,instance:INSTANCES[N2],ceiling:300n,used:200n,revision:12n});
    const leftAfterClose=await active();
    assert.equal(leftAfterClose.length,1);
    assert.equal((await redistribute(op))[0].granted,177n);
    assert.deepEqual(await active(),leftAfterClose,'Lost-response replay cannot spend subsequently released credit');
    const nextOp='33333333-3333-4333-8333-333333333333';
    assert.equal((await redistribute(nextOp,[N3]))[0].granted,188n);
    const [remaining]=await active();
    assert.equal(remaining.ceiling_bytes,277n);
    const [opCount]=await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_reserve_operations`;
    assert.equal(opCount.n,2n,'Failed and repeated operations cannot leave extra allocation records');
    console.log('PASS undelivered top-ups can be settled safely; an older request cannot allocate a later refund');
    await prisma.$queryRaw`SELECT xera_next_host_policy_revision(${N3}::uuid,20::bigint)`;
    const cls=new AsyncLocalStorage();
    const transactionHost={get tx(){return cls.getStore()??prisma;},
        isTransactionActive:()=>!!cls.getStore(),withoutTransaction:async fn=>cls.run(undefined,fn),
        withTransaction:(options,fn)=>prisma.$transaction(tx=>cls.run(tx,fn),options)};
    const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
    const db={kysely:new k.Kysely({dialect:{
        createDriver:()=>new PrismaTxDriver(transactionHost),createAdapter:()=>new k.PostgresAdapter(),
        createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler(),
    },plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
    const cache=new Map();let nodeCalls=0;
    const {QuotaSettlementService}=load(path.join(__dirname,'../src/common/host-policy/quota-settlement.service.ts'),{
        '@common/database':{},'@common/axios':{},'@common/raw-cache':{},
    });
    const settlement=new QuotaSettlementService(db,{hostQuotaState:async(node,request)=>{
        nodeCalls++;assert.deepEqual(request.ids,[remaining.id]);
        return {isOk:true,response:{instance:INSTANCES[N3],sequence:9,policyRevision:'21',
            entries:[{id:remaining.id,group:'host:'+H,owner:'901',ceiling:'89',reserved:'10',
                expiresAt:grant.expires_at.getTime(),closed:true}],missingIds:[],nextAfter:null}};
    }},{get:async key=>cache.get(key)??null,set:async(key,value)=>cache.set(key,value),del:async key=>cache.delete(key)},transactionHost);
    assert.equal(await settlement.syncNode({uuid:N3,address:'127.0.0.1',port:1}),1);
    const [confirmed]=await prisma.$queryRaw`SELECT closed_usage_bytes FROM xera_quota_reserves WHERE id=${remaining.id}::uuid`;
    assert.equal(confirmed.closed_usage_bytes,10n);
    assert.equal(await settlement.syncNode({uuid:N3,address:'127.0.0.1',port:1}),0);
    assert.equal(nodeCalls,1);
    await settlement.syncConnected();
    console.log('PASS panel settlement service validates node acknowledgement and commits it through actual Prisma/Kysely');

    // Keep one offline grant open across multiple RESETs in the same period.
    await redistribute('44444444-2222-4222-8222-222222222222',[N2]);
    const [offline]=await active();
    assert.equal(offline.ceiling_bytes,267n);
    await prisma.$executeRaw`UPDATE hosts SET user_traffic_limit_bytes=1000 WHERE uuid=${H}::uuid`;
    const adjust=(request,action='RESET',amount=0n)=>prisma.$queryRaw`
        SELECT xera_adjust_quota_budget(${request}::uuid,'HOST',${H},901::bigint,${action},${amount}::bigint) AS epoch`;
    const resetId='55555555-2222-4222-8222-222222222222';
    const resets=await Promise.all(Array.from({length:12},()=>adjust(resetId)));
    const epoch=resets[0][0].epoch;
    assert.notEqual(epoch,'00000000-0000-0000-0000-000000000000');
    assert.ok(resets.every(rows=>rows[0].epoch===epoch),'Concurrent RESET retries share one epoch');
    await assert.rejects(adjust(resetId,'ADD',1n),/reused/);
    const fresh=await allocate(prisma,[N2,N3],0n);
    assert.equal(fresh.length,2);
    assert.equal(fresh.reduce((n,g)=>n+g.ceiling_bytes,0n),1000n);
    assert.ok(fresh.every(g=>g.id!==offline.id),'New epoch never reuses a sealed/active grant ID');
    assert.equal((await prisma.$queryRaw`SELECT ceiling_bytes FROM xera_quota_reserves WHERE id=${offline.id}::uuid`)[0].ceiling_bytes,267n);
    const [oldOpen]=await prisma.$queryRaw`SELECT closed_usage_bytes FROM xera_quota_reserves WHERE id=${offline.id}::uuid`;
    assert.equal(oldOpen.closed_usage_bytes,null,'RESET cannot pretend the offline node has stopped spending');
    console.log('PASS same-period RESET is idempotent and issues a separate budget while offline credit remains valid');

    await settle({id:offline.id,node:N2,instance:INSTANCES[N2],ceiling:267n,used:5n,revision:12n});
    assert.equal((await redistribute('66666666-2222-4222-8222-222222222222'))[0].granted,0n,
        'Old epoch refunds cannot enlarge the fresh RESET budget');
    const addId='77777777-2222-4222-8222-222222222222';
    await Promise.all(Array.from({length:12},()=>adjust(addId,'ADD',200n)));
    const [newPool]=await prisma.$queryRaw`SELECT limit_bytes FROM xera_quota_reserve_pools WHERE budget_epoch=${epoch}::uuid`;
    assert.equal(newPool.limit_bytes,1200n);
    const addOp='88888888-2222-4222-8222-222222222222';
    assert.equal((await redistribute(addOp))[0].granted,200n);
    const topped=await allocate(prisma,[N2,N3],0n);
    assert.deepEqual(topped.map(g=>g.id),fresh.map(g=>g.id));
    assert.ok(topped.every(g=>g.ceiling_bytes===600n));
    console.log('PASS late old-epoch settlement never refills a new budget; ADD increases current grants once');

    await prisma.$queryRaw`SELECT xera_next_host_policy_revision(${N2}::uuid,100::bigint)`;
    await prisma.$executeRaw`INSERT INTO xera_quota_node_epochs(kind,key,user_id,window_start,node_uuid,instance_uuid,desired_epoch,desired_revision)
        SELECT kind,key,user_id,window_start,${N2}::uuid,${INSTANCES[N2]}::uuid,budget_epoch,101
        FROM xera_quota_reserve_pools WHERE budget_epoch=${epoch}::uuid`;
    assert.equal((await prisma.$queryRaw`SELECT xera_ack_quota_epoch(${N2}::uuid,${INSTANCES[N2]}::uuid,101::bigint) AS n`)[0].n,0,
        'An epoch containing an unregistered grant cannot be marked active by a preparation ACK');
    const secondEpoch=(await adjust('99999999-2222-4222-8222-222222222222'))[0].epoch;
    assert.notEqual(secondEpoch,epoch);
    await prisma.$queryRaw`SELECT xera_next_host_policy_revision(${N2}::uuid,101::bigint)`;
    await prisma.$executeRaw`UPDATE xera_quota_node_epochs SET desired_epoch=${secondEpoch}::uuid,desired_revision=102`;
    assert.equal((await prisma.$queryRaw`SELECT xera_ack_quota_epoch(${N2}::uuid,${INSTANCES[N2]}::uuid,101::bigint) AS n`)[0].n,0);
    assert.equal((await prisma.$queryRaw`SELECT xera_ack_quota_epoch(${N2}::uuid,${INSTANCES[N3]}::uuid,102::bigint) AS n`)[0].n,0);
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_node_epochs WHERE applied_epoch IS DISTINCT FROM desired_epoch`)[0].n,1n);
    assert.equal((await prisma.$queryRaw`SELECT xera_ack_quota_epoch(${N2}::uuid,${INSTANCES[N2]}::uuid,102::bigint) AS n`)[0].n,1);
    await assert.rejects(prisma.$queryRaw`SELECT xera_ack_quota_epoch(${N2}::uuid,${INSTANCES[N2]}::uuid,103::bigint)`,/not committed/);
    assert.equal((await adjust(resetId))[0].epoch,epoch,'A lost old RESET response cannot rotate the latest epoch again');
    assert.equal((await redistribute(addOp))[0].granted,200n,'An old ADD redistribution retry cannot spend a new RESET budget');
    const twiceReset=await allocate(prisma,[N2,N3],0n);
    assert.equal(twiceReset.reduce((n,g)=>n+g.ceiling_bytes,0n),1000n);
    assert.ok(twiceReset.every(g=>!fresh.some(old=>old.id===g.id)));
    console.log('PASS repeated same-period RESET, delayed ACK and instance mismatch preserve pending/applied progress');

    const journalRequests=[];
    const epochSettlement=new QuotaSettlementService(db,{hostQuotaState:async(node,request)=>{
        assert.equal(new Set(request.ids).size,request.ids.length,'Epoch joins must not duplicate grants');
        journalRequests.push(...request.ids);
        return {isOk:true,response:{instance:INSTANCES[N2],sequence:10,policyRevision:'102',
            entries:[],missingIds:request.ids,nextAfter:null}};
    }},{get:async()=>null,set:async()=>{},del:async()=>{}},transactionHost);
    assert.equal(await epochSettlement.syncNode({uuid:N2,address:'127.0.0.1',port:1}),0);
    assert.equal(journalRequests.length,2,'Exactly one active grant in each of two epochs');
    console.log('PASS actual settlement service handles overlapping epochs without duplicate reports or invented refunds');

    await prisma.$executeRaw`INSERT INTO nodes(id,uuid,name,address,is_connected) VALUES
        (903,${N2}::uuid,'online-node','127.0.0.2',true),(904,${N3}::uuid,'offline-node','127.0.0.3',false)`;
    await prisma.$executeRaw`INSERT INTO config_profile_inbounds_to_nodes(config_profile_inbound_uuid,node_uuid)
        VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',${N2}::uuid),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',${N3}::uuid)`;
    await prisma.$executeRaw`INSERT INTO xera_quota_node_modes(node_uuid,phase,instance_uuid)
        VALUES(${N2}::uuid,'ACTIVE',${INSTANCES[N2]}::uuid)`;
    const identityModule=load(path.join(__dirname,'../src/common/utils/host-identity.ts'));
    const source=(file,mocks={})=>load(path.join(__dirname,'../src/'+file),mocks);
    const quotaModule=source('common/host-policy/quota-policy.ts');
    const {HostPolicyService}=source('common/host-policy/host-policy.service.ts',{
        '@common/database':{},'@common/axios':{},'@common/raw-cache':{},
        '@common/config/app-config/typed-config.service':{},'@common/utils/host-identity':identityModule,
        './host-policy-scopes':source('common/host-policy/host-policy-scopes.ts'),
        './destination-rule':source('common/host-policy/destination-rule.ts'),'./quota-policy':quotaModule,
    });
    const credentials=identityModule.hostCredentials('test-only',901n,H,null,'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    await prisma.$executeRaw`INSERT INTO xera_host_identities(user_id,host_uuid,device_key,hwid,parent_vless_uuid)
        VALUES(901,${H}::uuid,'',NULL,'dddddddd-dddd-4ddd-8ddd-dddddddddddd')`;
    const journal=require('./quota-registration-transport.cjs')(INSTANCES[N2],10);
    let staged=true,lastBody,staleProof=false,coreProcess='12345678-1234-4234-8234-123456789abc';
    const policies=new HostPolicyService(db,{hostPolicy:async(_node,body)=>{
        assert.equal(transactionHost.isTransactionActive(),false,'Node HTTP must follow SQL commit');
        if(!body)return {isOk:true,response:{supported:true,version:'xera-host-policy-v2',policyRevisionsSupported:true,
            policyRevision:staleProof?'1':(lastBody?.revision??'102'),applied:!staged,offlineReserves:'remnacust-quota-reserves-v1',
            quotaReservesSupported:true,quotaRegistrationsSupported:true,quotaWatermarksSupported:true,quotaJournalSequence:String(journal.sequence()),quotaFencesSupported:true,unreservedUsageSupported:true,quotaInstanceId:INSTANCES[N2],
            coreIncarnationSupported:true,coreProcessId:coreProcess}};
        lastBody=body;journal.apply(body);return {isOk:true,response:{version:body.version,staged,applied:!staged}};
    },hostQuotaState:journal.read},require('./host-policy-cache.cjs')(),{getOrThrow:()=> 'test-only'},transactionHost);
    await policies.syncNode({uuid:N2,address:'127.0.0.1',port:1});
    assert.equal(lastBody.offlineReserves,'remnacust-quota-reserves-v1');
    const wireHost=lastBody.hosts[H.replaceAll('-','')];
    assert.equal(wireHost.allowedIdentities[credentials.username],true);
    assert.ok(wireHost.identityExpiresAt[credentials.username]>Date.now());
    assert.equal(wireHost.quotaMultipliers['host:'+H],300);
    assert.equal(lastBody.groups['host:'+H].reserves['901'],undefined);assert.ok(lastBody.registrations.some(item=>item.grant.id===twiceReset.find(g=>g.node_uuid===N2).id));
    assert.equal(lastBody.groups['host:'+H].blockedOwners['901'],undefined);
    const progress=()=>prisma.$queryRaw`SELECT desired_epoch,applied_epoch,desired_revision,applied_revision FROM xera_quota_node_epochs WHERE node_uuid=${N2}::uuid`;
    assert.ok((await progress())[0].desired_revision>(await progress())[0].applied_revision,
        'Staging a policy on a stopped core does not acknowledge its delivery');
    staged=false;await policies.syncNode({uuid:N2,address:'127.0.0.1',port:1});
    const [appliedEpoch]=await progress();
    assert.equal(appliedEpoch.applied_revision,appliedEpoch.desired_revision);
    assert.equal(appliedEpoch.applied_epoch,secondEpoch);
    console.log('PASS real HostPolicyService renders current reserve, multiplier and expiry; only live applied ACK updates progress');

    const {LimitsService}=source('modules/hosts/limits.service.ts',{
        '@common/database':{},'@common/host-policy/host-policy.service':{},'./hosts.service':{},'./repositories/hosts.repository':{},
        './limit-selection':source('modules/hosts/limit-selection.ts'),'./limit-scopes.query':source('modules/hosts/limit-scopes.query.ts'),
    });
    const limits=new LimitsService(db,transactionHost,{}, {}, policies);
    const synchronization=await limits.synchronization('HOST',H);
    assert.equal(synchronization.totalNodes,2);
    assert.equal(synchronization.appliedNodes,1);
    assert.equal(synchronization.unavailableNodes,1);
    assert.deepEqual(synchronization.pendingNodes,[{uuid:N3,name:'offline-node',unavailable:true}]);
    staged=true;await policies.syncNode({uuid:N2,address:'127.0.0.1',port:1});
    assert.equal((await limits.synchronization('HOST',H)).appliedNodes,1,
        'A later staged policy for the same epoch must not make an already applied reset flicker back to pending');
    console.log('PASS limits UI progress distinguishes a live applied reset from an offline pending node');
    const [calendar]=await prisma.$queryRaw`SELECT date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS anchor`;
    await prisma.$executeRaw`UPDATE hosts SET traffic_limit_reset_anchor_at=${calendar.anchor},
        traffic_limit_reset_value=1,traffic_limit_reset_unit='MONTHS' WHERE uuid=${H}::uuid`;
    const forSecondUser=()=>prisma.$queryRaw`SELECT * FROM xera_allocate_quota_reserves('HOST',${H},902::bigint,
        ARRAY[${N2}::uuid],0::bigint,${JSON.stringify({[N2]:INSTANCES[N2]})}::jsonb)`;
    const [monthly]=await forSecondUser();
    assert.equal(monthly.expires_at.getTime(),Date.UTC(calendar.anchor.getUTCFullYear(),calendar.anchor.getUTCMonth()+1,1));
    await prisma.$executeRaw`UPDATE hosts SET traffic_limit_reset_value=2 WHERE uuid=${H}::uuid`;
    await prisma.$queryRaw`SELECT xera_adjust_quota_budget('aaaaaaaa-2222-4222-8222-222222222222','HOST',${H},902::bigint,'RESET',0::bigint)`;
    await prisma.$queryRaw`SELECT xera_adjust_quota_budget('bbbbbbbb-2222-4222-8222-222222222222','HOST',${H},902::bigint,'ADD',200::bigint)`;
    const [twoMonths]=await forSecondUser();
    assert.equal(twoMonths.expires_at.getTime(),Date.UTC(calendar.anchor.getUTCFullYear(),calendar.anchor.getUTCMonth()+2,1),
        'A manual RESET after editing a period uses the new boundary, not the old pool expiry');
    assert.equal(twoMonths.ceiling_bytes,1200n,'ADD before first delivery increases the new epoch budget exactly once');
    await policies.syncNode({uuid:N2,address:'127.0.0.1',port:1});
    assert.equal(lastBody.groups['host:'+H].reserves['901'],undefined,
        'A changed period cannot reuse an old unexpired no-reset grant');
    assert.equal(lastBody.groups['host:'+H].reserves['902'],undefined);assert.ok(lastBody.registrations.some(item=>item.grant.id===twoMonths.id));
    console.log('PASS RESET recalculates an edited calendar boundary and ADD before first delivery preserves its full budget');
    await prisma.$executeRaw`UPDATE xera_quota_node_modes SET phase='FENCING',fenced_revision=NULL,fenced_at=NULL,fenced_source=NULL WHERE node_uuid=${N2}::uuid`;
    await policies.syncNode({uuid:N2,address:'127.0.0.1',port:1});
    const fence=async()=>(await prisma.$queryRaw`SELECT fenced_revision,fenced_at,fenced_source,fenced_core FROM xera_quota_node_modes WHERE node_uuid=${N2}::uuid`)[0];
    assert.equal((await fence()).fenced_at,null,'Staging a soft barrier is not a live drain acknowledgement');
    assert.equal(lastBody.groups['host:'+H].reserves['902'],undefined,
        'A staged fence cannot activate a grant whose registration was not acknowledged');assert.ok(lastBody.registrations.some(item=>item.grant.id===twoMonths.id));
    staged=false;staleProof=true;
    await assert.rejects(policies.syncNode({uuid:N2,address:'127.0.0.1',port:1}),/QUOTA_JOURNAL_BEHIND_CHECKPOINT/);
    assert.equal((await fence()).fenced_at,null,'An unrelated policy revision cannot prove the fence');
    staleProof=false;await policies.syncNode({uuid:N2,address:'127.0.0.1',port:1});
    const fenced=await fence();assert.ok(fenced.fenced_at instanceof Date);assert.match(fenced.fenced_source,/^[a-f0-9]{64}$/);
    await new Promise(resolve=>setTimeout(resolve,3));
    await policies.syncNode({uuid:N2,address:'127.0.0.1',port:1});
    const repeatedFence=await fence();assert.equal(repeatedFence.fenced_at.getTime(),fenced.fenced_at.getTime());
    assert.ok(repeatedFence.fenced_revision>fenced.fenced_revision);
    console.log('PASS live fence proof is revision-bound, staging/stale ACK cannot advance it and repeated delivery preserves its drain boundary');
    await new Promise(resolve=>setTimeout(resolve,3));coreProcess='87654321-4321-4321-8321-cba987654321';
    await policies.syncNode({uuid:N2,address:'127.0.0.1',port:1});
    const fenceAfterRestart=await fence();assert.equal(fenceAfterRestart.fenced_core,coreProcess);
    assert.ok(fenceAfterRestart.fenced_at.getTime()>fenced.fenced_at.getTime(),
        'A new core incarnation cannot reuse a pre-restart stats drain boundary');
    console.log('PASS core restart invalidates the previous raw-counter drain proof even when its policy source is unchanged');
    await prisma.$disconnect();
})().catch(async error => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
});
