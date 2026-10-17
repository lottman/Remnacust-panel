const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const url=process.env.QUOTA_EXPOSURE_TEST_DATABASE_URL;
assert.ok(url);const parsed=new URL(url);
assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'55439');assert.equal(parsed.pathname,'/remnacust_exposure_test');
const db=new PrismaClient({datasourceUrl:url});
const N='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333',OTHER='44444444-4444-4444-8444-444444444444';
const proof=(mode,recovery=false)=>JSON.stringify({version:1,userQuota:true,scopes:{'tag:opaque_tag':{'901':[mode,null,null,null,recovery]}}});
const intent=async(revision,mode='U',recovery=false)=>db.$queryRaw`SELECT xera_record_quota_exposure_intent(${N}::uuid,${C}::uuid,${I}::uuid,${revision}::bigint,${proof(mode,recovery)}::jsonb)`;
const ack=async(revision,mode='F')=>db.$queryRaw`SELECT xera_ack_quota_exposure_policy(${N}::uuid,${C}::uuid,${I}::uuid,${revision}::bigint,${proof(mode)}::jsonb)`;
const rows=()=>db.$queryRaw`SELECT * FROM xera_quota_usage_exposures ORDER BY exposed_at`;
const gate=()=>db.$queryRaw`SELECT 1 FROM xera_assert_quota_exposure_covered('TAG','opaque_tag',901)`;
const cover=(client,core,instance,time,sequence=2n)=>client.$queryRaw`SELECT xera_cover_quota_usage_exposure(${N}::uuid,${core}::uuid,${instance}::uuid,${sequence}::bigint,${time}::timestamptz) AS n`;
(async()=>{try{
 assert.equal((await db.$queryRaw`SELECT count(*) AS n FROM xera_quota_node_modes`)[0].n,0n,'Refuse an existing coordinator fixture');
 await db.$executeRaw`INSERT INTO xera_quota_node_modes(node_uuid,phase,instance_uuid,applied_core) VALUES(${N}::uuid,'ACTIVE',${I}::uuid,${C}::uuid)`;
 await db.$executeRaw`INSERT INTO xera_node_usage_streams(stream_id,node_uuid,node_id,expected_core,requested_at,consumption_multiplier)
     VALUES(${I}::uuid,${N}::uuid,901,${C}::uuid,clock_timestamp(),1000000000)`;
 await gate();await intent(1n);await intent(1n);assert.equal((await rows()).length,1);
 await assert.rejects(gate(),/QUOTA_USAGE_REQUIRES_RECOVERY/);
 const before=(await db.$queryRaw`SELECT clock_timestamp() AS t`)[0].t;
 await ack(2n);const fenced=(await rows())[0];assert.ok(fenced.fenced_at);
 assert.equal((await cover(db,C,I,before))[0].n,0);
 await new Promise(resolve=>setTimeout(resolve,5));const later=(await db.$queryRaw`SELECT clock_timestamp() AS t`)[0].t;
 assert.equal(fenced.fenced_sequence,2n);
 assert.equal((await cover(db,C,I,new Date(later.getTime()+86400000),1n))[0].n,0,'Clock skew cannot turn an already prepared old sequence into post-barrier coverage');
 assert.equal((await cover(db,OTHER,I,later))[0].n,0);assert.equal((await cover(db,C,OTHER,later))[0].n,0);
 await assert.rejects(db.$transaction(async tx=>{assert.equal((await cover(tx,C,I,later))[0].n,1);throw Error('receipt commit failed');}),/receipt commit failed/);
 assert.equal((await rows()).length,1);await assert.rejects(gate(),/QUOTA_USAGE_REQUIRES_RECOVERY/);
 assert.equal((await cover(db,C,I,later))[0].n,1);await gate();
 console.log('PASS intent is durable before ACK; only a committed same-process receipt after its barrier covers RAM debt');

 await intent(4n);await ack(3n);assert.equal((await rows())[0].fenced_at,null,'An older fence cannot cover a newer unbounded delivery');
 await ack(5n);const boundary=(await rows())[0].fenced_at;
 await ack(6n);assert.equal((await rows())[0].fenced_at.getTime(),boundary.getTime(),'Refresh cannot move the capture boundary');
 await intent(7n);assert.equal((await rows())[0].fenced_at,null,'Reopening unlimited mode invalidates the old capture barrier');
 await ack(8n);await new Promise(resolve=>setTimeout(resolve,5));await cover(db,C,I,(await db.$queryRaw`SELECT clock_timestamp() AS t`)[0].t);await gate();
 console.log('PASS stale ACK cannot cover a later intent; unchanged fence refresh is stable; renewed traffic requires a new barrier');

 await intent(9n,'R',true);assert.equal((await rows())[0].unbounded,false);await gate();
 await assert.rejects(db.$queryRaw`SELECT 1 FROM xera_assert_quota_exposure_covered('TAG','opaque_tag',901,true)`,/QUOTA_USAGE_REQUIRES_RECOVERY/);
 await db.$executeRaw`UPDATE xera_quota_node_modes SET applied_core=${OTHER}::uuid WHERE node_uuid=${N}::uuid`;
 await assert.rejects(gate(),/QUOTA_USAGE_REQUIRES_RECOVERY/);
 await db.$executeRaw`DELETE FROM xera_quota_node_modes WHERE node_uuid=${N}::uuid`;
 assert.equal((await rows()).length,1);await assert.rejects(gate(),/QUOTA_USAGE_REQUIRES_RECOVERY/);
 console.log('PASS recovery bypass traffic is covered by its own process; process replacement and node removal retain the liability');
}finally{await db.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
