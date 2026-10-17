// Own disposable database only. These are real PostgreSQL reserve transactions.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const {AsyncLocalStorage}=require('node:async_hooks');
const k=require('kysely');
const load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url=process.env.USER_QUOTA_TEST_DATABASE_URL;
assert.ok(url,'Set USER_QUOTA_TEST_DATABASE_URL');
const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'55439');assert.equal(parsed.pathname,'/remnacust_global_quota_test');
const db=new PrismaClient({datasourceUrl:url});
const N1='cccccccc-cccc-4ccc-8ccc-cccccccccccc',N2='ffffffff-ffff-4fff-8fff-ffffffffffff';
const I1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',I2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const instances={[N1]:I1,[N2]:I2};
const allocate=(client=db,user=901,nodes=[N1,N2],debt=0n)=>client.$queryRaw`SELECT * FROM xera_allocate_quota_reserves('USER','global',${user}::bigint,${nodes}::uuid[],${debt}::bigint,${JSON.stringify(Object.fromEntries(nodes.map(n=>[n,instances[n]])))}::jsonb) ORDER BY node_uuid`;
const epoch=async()=>String((await db.$queryRaw`SELECT xera_current_quota_epoch('USER','global',901,'1970-01-01') AS epoch`)[0].epoch);
const reset=async(client,at=new Date())=>{
    await client.$executeRaw`UPDATE users SET last_traffic_reset_at=${at},status='ACTIVE' WHERE id=901`;
    await client.$executeRaw`UPDATE user_traffic SET used_traffic_bytes=0 WHERE id=901`;
};

(async()=>{
    assert.equal((await db.$queryRaw`SELECT count(*) AS n FROM users`)[0].n,0n,'Refuse existing user data');
    await db.$transaction(async tx=>{
        const seed=fs.readFileSync(path.join(__dirname,'fixtures/host-policy-seed.sql'),'utf8').replace('BEGIN;','');
        for(const statement of seed.split(';').filter(s=>s.trim()))await tx.$executeRawUnsafe(statement);
        await tx.$executeRaw`INSERT INTO nodes(id,uuid,name,address) VALUES(902,${N2}::uuid,'global-quota-other','127.0.0.2')`;
        await tx.$executeRaw`INSERT INTO user_traffic(id,used_traffic_bytes) VALUES(901,100),(902,0)`;
        await tx.$executeRaw`UPDATE users SET traffic_limit_bytes=1000 WHERE id=901`;
    });
    await assert.rejects(allocate(),/initial global user debt/);
    await db.$executeRaw`INSERT INTO xera_quota_node_modes(node_uuid,phase,user_quota,instance_uuid,initial_core,initial_drained_at,initial_drain_sequence)
        VALUES(${N1}::uuid,'ACTIVE',true,${I1}::uuid,${I1}::uuid,now(),1),(${N2}::uuid,'ACTIVE',true,${I2}::uuid,${I2}::uuid,now(),1)`;
    await assert.rejects(allocate(),/initial global user debt/,'A fresh core receipt cannot prove the old billing queue is drained');
    await db.$executeRaw`UPDATE xera_quota_node_modes SET legacy_usage_drained_at=initial_drained_at WHERE node_uuid=ANY(${[N1,N2]}::uuid[])`;
    const results=await Promise.all(Array.from({length:12},()=>allocate(db,901,[N2,N1,N2],50n)));
    const initial=results[0];assert.equal(initial.length,2);assert.equal(initial.reduce((n,g)=>n+g.ceiling_bytes,0n),850n);
    for(const rows of results)assert.deepEqual(rows,initial);
    console.log('PASS global allocation deducts billed usage and fenced debt; concurrent retries retain the same exact grants');
    const before=await epoch();
    await assert.rejects(db.$transaction(async tx=>{await reset(tx);throw Error('abort reset');}),/abort reset/);
    assert.equal(await epoch(),before);assert.deepEqual(await allocate(),initial);
    const at=new Date();await db.$transaction(tx=>reset(tx,at));assert.notEqual(await epoch(),before);
    const newGrants=await allocate(db,901,[N2]);assert.equal(newGrants.length,1);assert.equal(newGrants[0].ceiling_bytes,1000n);assert.notEqual(newGrants[0].id,initial[0].id);
    assert.equal((await db.$queryRaw`SELECT sum(ceiling_bytes) AS n FROM xera_quota_reserves WHERE id=ANY(${initial.map(g=>g.id)}::uuid[])`)[0].n.toString(),'850');
    console.log('PASS reset commits atomically, rolls back cleanly and immediately grants reachable nodes while retaining offline old reserves');
    const after=await epoch();await db.$transaction(tx=>reset(tx,new Date(at.getTime()+1)));assert.notEqual(await epoch(),after,'Zero SQL usage must not hide an unreported offline reserve');
    const current=(await allocate(db,901,[N2]))[0];assert.equal(current.ceiling_bytes,1000n);
    await db.$executeRaw`UPDATE users SET traffic_limit_bytes=1200 WHERE id=901`;
    const [topup]=await db.$queryRaw`SELECT xera_redistribute_quota_reserves('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','USER','global',901,ARRAY[${N2}::uuid],${JSON.stringify({[N2]:I2})}::jsonb) AS n`;
    assert.equal(topup.n,200n);assert.equal((await allocate(db,901,[N2]))[0].ceiling_bytes,1200n);
    console.log('PASS a reset with unreported zero usage rotates the epoch; a positive limit increase adds only newly authorized credit');
    await db.$executeRaw`UPDATE users SET traffic_limit_bytes=0 WHERE id=901`;
    assert.deepEqual(await allocate(),[]);
    await db.$executeRaw`UPDATE user_traffic SET used_traffic_bytes=500 WHERE id=901`;
    await db.$executeRaw`UPDATE users SET traffic_limit_bytes=800 WHERE id=901`;
    const finite=(await allocate(db,901,[N2]))[0];assert.equal(finite.ceiling_bytes,300n);assert.notEqual(finite.id,current.id);
    console.log('PASS unlimited-to-finite changes account for traffic spent while unlimited and cannot reuse an old larger grant');
    const [revision]=await db.$queryRaw`SELECT xera_next_host_policy_revision(${N2}::uuid,0) AS n`;
    const settle=()=>db.$queryRaw`SELECT xera_settle_quota_reserve(${finite.id}::uuid,${N2}::uuid,${I2}::uuid,'user:global',901,${finite.ceiling_bytes},${finite.expires_at},75,${revision.n}) AS n`;
    assert.equal((await settle())[0].n,225n);assert.equal((await settle())[0].n,225n);
    const [redistributed]=await db.$queryRaw`SELECT xera_redistribute_quota_reserves('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','USER','global',901,ARRAY[${N1}::uuid,${N2}::uuid],${JSON.stringify(instances)}::jsonb) AS n`;
    assert.equal(redistributed.n,225n);
    const final=await allocate();assert.equal(final.reduce((n,g)=>n+g.ceiling_bytes,0n),225n);
    console.log('PASS sealed global grants settle once and redistribute only proven unused credit');
    for(const [strategy,created,now,expected] of [
        ['DAY','2026-01-01T00:00:00Z','2026-10-15T00:04:59Z','2026-10-15T00:05:00.000Z'],
        ['DAY','2026-01-01T00:00:00Z','2026-10-15T00:05:00Z','2026-10-16T00:05:00.000Z'],
        ['WEEK','2026-01-01T00:00:00Z','2026-10-18T12:00:00Z','2026-10-19T00:15:00.000Z'],
        ['MONTH','2026-01-01T00:00:00Z','2026-10-31T23:00:00Z','2026-11-01T00:20:00.000Z'],
        ['MONTH_ROLLING','2026-01-31T10:00:00Z','2026-02-28T00:09:00Z','2026-02-28T00:10:00.000Z'],
        ['MONTH_ROLLING','2026-01-31T10:00:00Z','2026-02-28T00:10:00Z','2026-03-31T00:10:00.000Z'],
        ['MONTH_ROLLING','2026-10-15T10:00:00Z','2026-10-15T10:01:00Z','2026-11-15T00:10:00.000Z'],
    ]) {
        const [row]=await db.$queryRaw`SELECT xera_user_quota_deadline(${strategy},${created}::timestamptz,${now}::timestamptz) AS value`;
        assert.equal(row.value.toISOString(),expected);
    }
    await db.$executeRawUnsafe("SET TIME ZONE 'Asia/Tokyo'");
    assert.equal((await db.$queryRaw`SELECT xera_user_quota_deadline('DAY','2026-01-01T00:00:00Z','2026-10-15T00:04:59Z') AS value`)[0].value.toISOString(),'2026-10-15T00:05:00.000Z');
    await assert.rejects(db.$queryRaw`SELECT xera_user_quota_deadline('future',now(),now())`,/unknown global/);
    console.log('PASS UTC reset offsets, Monday boundaries, month-end clamping and first rolling reset');
    await db.$executeRaw`UPDATE users SET traffic_limit_bytes=9223372036854775807 WHERE id=902`;
    const huge=await allocate(db,902);assert.equal(huge.reduce((n,g)=>n+g.ceiling_bytes,0n),9223372036854775807n);
    await assert.rejects(db.$queryRaw`SELECT * FROM xera_allocate_quota_reserves('USER','other',902,ARRAY[${N1}::uuid],0,${JSON.stringify({[N1]:I1})}::jsonb)`,/boundary/);
    const saved=instances[N1];instances[N1]=I2;await assert.rejects(allocate(db,902),/initial global user debt/);instances[N1]=saved;
    console.log('PASS int64 precision, fixed global scope and node incarnation binding');
    await db.$executeRaw`UPDATE users SET traffic_limit_strategy='MONTH_ROLLING',created_at='2026-01-31 00:01:00',
        expire_at=(now() AT TIME ZONE 'UTC')+interval '2 hours' WHERE id=902`;
    assert.equal((await db.$queryRaw`SELECT xera_quota_budget_end('USER','global',902,'2026-03-01T00:00:00Z') AS value`)[0].value.toISOString(),'2026-03-31T00:10:00.000Z',
        'UTC timestamp columns cannot acquire the database session timezone before rolling reset calculation');
    assert.equal((await db.$queryRaw`SELECT paused FROM xera_quota_budget_state('USER','global',902)`)[0].paused,false,
        'A future UTC expiry cannot become expired in a non-UTC database session');
    const cls=new AsyncLocalStorage();
    const transactionHost={get tx(){return cls.getStore()??db;},isTransactionActive:()=>!!cls.getStore(),
        withTransaction:(options,fn)=>db.$transaction(tx=>cls.run(tx,fn),options)};
    const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
    const policyDb={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(transactionHost),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:query=>new k.PostgresIntrospector(query),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
    const source=file=>load(path.join(__dirname,'../src/common/host-policy',file));
    const {HostPolicyService}=load(path.join(__dirname,'../src/common/host-policy/host-policy.service.ts'),{
        '@common/database':{},'@common/axios':{},'@common/raw-cache':{},'@common/config/app-config/typed-config.service':{},
        '@common/utils/host-identity':load(path.join(__dirname,'../src/common/utils/host-identity.ts')),
        './destination-rule':source('destination-rule.ts'),'./host-policy-scopes':source('host-policy-scopes.ts'),'./quota-policy':source('quota-policy.ts'),
    });
    let acknowledged=false,body;
    const journal=require("./quota-registration-transport.cjs")(I1);
    const policies=new HostPolicyService(policyDb,{hostPolicy:async(_node,value)=>{
        assert.equal(transactionHost.isTransactionActive(),false,'Global quota HTTP must follow SQL commit');
        if(!value)return {isOk:true,response:{supported:true,version:'xera-host-policy-v2',policyRevisionsSupported:true,policyRevision:body?.revision??'0',applied:true,userQuotaRequired:acknowledged,offlineReserves:'remnacust-quota-reserves-v1',quotaReservesSupported:true,quotaRegistrationsSupported:true,quotaWatermarksSupported:true,quotaJournalSequence:String(journal.sequence()),quotaFencesSupported:true,unreservedUsageSupported:true,quotaInstanceId:I1,coreIncarnationSupported:true,coreProcessId:I1,usageReceiptsSupported:true,userQuotaReservesSupported:true}};
        body=value;journal.apply(value);return {isOk:true,response:{version:value.version,applied:true,userQuotaRequired:acknowledged}};
    },hostQuotaState:journal.read},require('./host-policy-cache.cjs')(),{getOrThrow:()=> 'fixture-only'},transactionHost);
    const node={uuid:N1,address:'127.0.0.1',port:1};
    await assert.rejects(policies.syncNode(node),/mandatory global quota checkpoint/);
    assert.equal(body.userQuota,'remnacust-user-quota-reserves-v1');
    assert.equal(body.legacyQuotaMultipliers['user:global'],1000000000);
    assert.equal(body.groups['user:global'].reserves['902'],undefined);assert.ok(body.registrations.some(item=>item.owner==='902'&&item.action==='prepare'));
    assert.equal((await db.$queryRaw`SELECT count(*) AS n FROM xera_quota_node_epochs WHERE kind='USER' AND node_uuid=${N1}::uuid AND applied_revision IS NOT NULL`)[0].n,0n);
    acknowledged=true;await policies.syncNode(node);
    assert.equal((await db.$queryRaw`SELECT count(*) AS n FROM xera_quota_node_epochs WHERE kind='USER' AND node_uuid=${N1}::uuid AND applied_revision IS NOT NULL`)[0].n,2n);
    console.log('PASS actual Prisma/Kysely global policy rendering commits before HTTP and requires the native checkpoint ACK before marking delivery');
    await db.$disconnect();
})().catch(async error=>{console.error(error);await db.$disconnect();process.exitCode=1;});
