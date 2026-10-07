// Only the disposable database forwarded from the audit host. No production URL accepted.
const assert=require('node:assert/strict');
const path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const k=require('kysely');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const load=require('./load-typescript.cjs');
const {HwidUserDevicesRepository}=load(path.join(__dirname,'../src/modules/hwid-user-devices/repositories/hwid-user-devices.repository.ts'),{'@common/database':{},'@common/helpers':{},'../hwid-user-devices.converter':{},'../entities/hwid-user-device.entity':{}});
async function main(){
 const prisma=new PrismaClient({datasourceUrl:'postgresql://postgres@127.0.0.1:55439/postgres'});
 const tx={tx:prisma};
 const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(tx),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()}})};
 const repo=new HwidUserDevicesRepository(tx,db,{});
 try {
  await prisma.$executeRaw`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password) VALUES(990,'deletion-audit','deletion-audit',now()+interval '1 day','test',gen_random_uuid(),'test')`;
  await prisma.hwidUserDevices.createMany({data:['a','b','keep'].map(hwid=>({userId:990n,hwid,blocked:hwid==='keep'}))});
  const staged=await repo.stageDeletion(990n,['a','b','keep']);
  assert.deepEqual(staged.map(d=>d.hwid).sort(),['a','b']);
  assert.equal(await prisma.hwidUserDevices.count({where:{userId:990n,blocked:true}}),3);
  // A block changed by another administrator must survive an earlier deletion.
  await repo.blockByHwidAndUserId('a',990n,true);
  assert.equal(await repo.completeDeletion(990n,staged.find(d=>d.hwid==='a')),false);
  assert.equal(await repo.completeDeletion(990n,staged.find(d=>d.hwid==='b')),true);
  // A later unblock also wins; the earlier operation must not remove that device.
  const [second]=await repo.stageDeletion(990n,['a'],true);
  await repo.blockByHwidAndUserId('a',990n,false);
  assert.equal(await repo.completeDeletion(990n,second),false);
  assert.equal((await prisma.hwidUserDevices.findUnique({where:{hwid_userId:{hwid:'a',userId:990n}}})).blocked,false);
  const [final]=await repo.stageDeletion(990n,['a'],true);
  assert.equal(await repo.completeDeletion(991n,final),false,'other owner cannot delete');
  assert.equal(await repo.completeDeletion(990n,final),true);
  assert.equal(await repo.completeDeletion(990n,final),false,'replay is harmless');
  assert.equal(await prisma.hwidUserDevices.count({where:{userId:990n,hwid:'keep',blocked:true}}),1);
  console.log('PASS: durable pre-revocation denial, pre-existing bans, concurrent block/unblock fencing, owner isolation and replay on PostgreSQL');
 } finally {await prisma.users.deleteMany({where:{id:990n}});await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
