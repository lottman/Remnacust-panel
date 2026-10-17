// Read-only recovery bank verification in the seeded disposable legacy fixture.
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),{TransactionHost}=require('@nestjs-cls/transactional'),k=require('kysely'),load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url=process.env.LEGACY_QUOTA_RECOVERY_TEST_DATABASE_URL;assert.ok(url);const parsed=new URL(url);
assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'55439');assert.equal(parsed.pathname,'/remnacust_legacy_decisions_test');
const prisma=new PrismaClient({datasourceUrl:url});
const tx=new TransactionHost({defaultTxOptions:{},getFallbackInstance:()=>prisma,wrapWithTransaction:(opts,fn,set)=>prisma.$transaction(async client=>{set(client);const result=await fn();return result;},opts)});
const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(tx),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
const {readRecoveryBank,RECOVERY_BANK_TABLES}=load(path.join(__dirname,'../src/common/host-policy/quota-recovery-bank.ts'));
const guard=()=>tx.isTransactionActive(),user=90000,concurrentUser=90001;
async function insert(id){await prisma.$executeRaw`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password) VALUES(${id}::bigint,${'bank-'+id},${'bank-'+id},now(),'PRIVATE_BANK_AUTH_SECRET',${randomUUID()}::uuid,'PRIVATE_BANK_AUTH_SECRET')`;await prisma.$executeRaw`INSERT INTO user_traffic(id,used_traffic_bytes,lifetime_used_traffic_bytes) VALUES(${id}::bigint,9007199254740993,9007199254740993)`;}
(async()=>{try{
 const generation=(await prisma.$queryRaw`SELECT generation FROM xera_quota_restore_state WHERE singleton AND reconciled_at IS NULL`)[0].generation;
 await assert.rejects(readRecoveryBank(db,generation,guard).next(),/active transaction/);
 await assert.rejects(tx.withTransaction({},()=>readRecoveryBank(db,generation,guard).next()),/consistent transaction snapshot/);
 await assert.rejects(tx.withTransaction({isolationLevel:'RepeatableRead'},()=>readRecoveryBank(db,randomUUID(),guard).next()),/not pending/);
 await insert(user);
 const rows=new Map(),pages=new Map();let concurrentInserted=false;
 await tx.withTransaction({isolationLevel:'RepeatableRead',timeout:30000},async()=>{
  for await(const page of readRecoveryBank(db,generation,guard)){
   assert(page.rows.length<=500);pages.set(page.section,(pages.get(page.section)||0)+1);rows.set(page.section,[...(rows.get(page.section)||[]),...page.rows]);
   if(page.section==='users'&&!concurrentInserted){await insert(concurrentUser);concurrentInserted=true;}
  }
 });
 assert.deepEqual([...rows.keys()],RECOVERY_BANK_TABLES);
 assert(pages.get('users')>=4,'All1500+users must be captured in bounded pages');
 const users=rows.get('users').map(JSON.parse),usage=rows.get('user_traffic');
 assert(users.some(row=>row.id===user));assert(!users.some(row=>row.id===concurrentUser),'RepeatableRead must not mix a later user into the same bank');
 assert(!usage.some(row=>row.includes('"id": '+concurrentUser)),'The later traffic row must also be absent');
 assert(usage.some(row=>row.includes('9007199254740993')),'Original int64 must survive as SQL JSON text');
 assert(![...rows.values()].flat().some(row=>row.includes('PRIVATE_BANK_AUTH_SECRET')||row.includes('"trojan_password"')||row.includes('"ss_password"')||row.includes('"vless_uuid"')));
 const counts=await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
 for(const table of RECOVERY_BANK_TABLES){assert(counts.some(row=>row.tablename===table));const total=(await prisma.$queryRawUnsafe('SELECT count(*) AS n FROM public."'+table+'"'))[0].n;assert.equal(BigInt(rows.get(table).length),total-(['users','user_traffic','xera_quota_current_subjects','xera_quota_subjects'].includes(table)?1n:0n),table+' source truncated or duplicated');}
 console.log('PASS every versioned bank source is covered, including empty sections, 1500+users, all periods/prices/subjects and exact int64 counters without credentials');
 console.log('PASS one RepeatableRead snapshot excludes later concurrent owner/traffic changes consistently across tables');
 let iterator;
 await tx.withTransaction({isolationLevel:'RepeatableRead'},async()=>{iterator=readRecoveryBank(db,generation,guard);await iterator.next();});
 await assert.rejects(iterator.next(),/active transaction/);
 assert.equal((await prisma.$queryRaw`SELECT reconciled_at FROM xera_quota_restore_state WHERE singleton`)[0].reconciled_at,null);
 console.log('PASS wrong transaction isolation, stale generation and consumption after transaction closure fail without releasing recovery');
 const originalJobs=(await prisma.$queryRaw`SELECT count(*) AS n FROM xera_legacy_usage_jobs`)[0].n;
 await assert.rejects(tx.withTransaction({isolationLevel:'RepeatableRead',timeout:60000},async()=>{
  await tx.tx.$executeRaw`INSERT INTO xera_legacy_usage_jobs(receipt,digest,payload)
   SELECT encode(sha256(convert_to(${randomUUID()}||'-'||g::text,'UTF8')),'hex'),repeat('a',64),p.payload
   FROM generate_series(1,200) g CROSS JOIN (SELECT jsonb_agg(jsonb_build_object('u',i::text,'b','9223372036854775807','n','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) AS payload FROM generate_series(1,1500) i) p`;
  let seen=0n,largePages=0;
  for await(const page of readRecoveryBank(db,generation,guard))if(page.section==='xera_legacy_usage_jobs'){
   assert(page.rows.reduce((bytes,row)=>bytes+Buffer.byteLength(row),0)<=16*1024*1024);seen+=BigInt(page.rows.length);largePages++;
  }
  assert.equal(seen,originalJobs+200n);assert(largePages>=2,'Large bodies must split even below 500 rows');
  throw Error('bank byte fixture rollback');
 }),/bank byte fixture rollback/);
 assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM xera_legacy_usage_jobs`)[0].n,originalJobs);
 console.log('PASS large journal bodies are sized before transfer and split below16MiB without truncation; byte fixture fully rolled back');
}finally{
 await prisma.$executeRaw`DELETE FROM users WHERE id IN (${user}::bigint,${concurrentUser}::bigint)`;
 await db.kysely.destroy();await prisma.$disconnect();
}})().catch(error=>{console.error(error);process.exitCode=1;});
