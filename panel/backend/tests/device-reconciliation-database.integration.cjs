// Only loopback ports reserved for disposable local/CI PostgreSQL fixtures.
const assert=require('node:assert/strict');
const path=require('node:path');
const {AsyncLocalStorage}=require('node:async_hooks');
const {PrismaClient}=require('@prisma/client');
const k=require('kysely');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const load=require('./load-typescript.cjs');
const {HwidUserDevicesRepository}=load(path.join(__dirname,'../src/modules/hwid-user-devices/repositories/hwid-user-devices.repository.ts'),{
    '@nestjs-cls/transactional':{Transactional:()=>()=>{},TransactionHost:class{}},
    '@common/database':{},'@common/helpers':{},'../hwid-user-devices.converter':{},'../entities/hwid-user-device.entity':{},
});
async function main(){
    const port=process.env.REMNACUST_TEST_DATABASE_PORT||'55439';
    assert.ok(['55439','55449'].includes(port),'Only disposable database ports are accepted');
    const prisma=new PrismaClient({datasourceUrl:`postgresql://postgres@127.0.0.1:${port}/postgres`});
    const context=new AsyncLocalStorage();
    const tx={get tx(){return context.getStore()||prisma;}};
    const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(tx),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()}})};
    const repo=new HwidUserDevicesRepository(tx,db,{fromEntityToPrismaModel:x=>x,fromPrismaModelToEntity:x=>x});
    const transaction=fn=>prisma.$transaction(client=>context.run(client,fn));
    const saved=process.env.XERA_PERSONAL_SUBSCRIPTIONS;process.env.XERA_PERSONAL_SUBSCRIPTIONS='true';
    try{
        await prisma.$executeRaw`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password) VALUES(992,'reconciliation-audit','reconciliation-audit',now()+interval '1 day','test',gen_random_uuid(),'test')`;
        const before=await prisma.$queryRaw`SELECT revision FROM xera_device_state WHERE id=1`;
        await prisma.hwidUserDevices.createMany({data:['a','b','banned'].map(hwid=>({userId:992n,hwid,blocked:hwid==='banned'}))});
        const snapshots=await prisma.hwidUserDevices.findMany({where:{userId:992n}});
        await transaction(()=>repo.blockByHwidAndUserId('a',992n,true));
        const removed=await transaction(()=>repo.deleteDevicesAndQueue(992n,snapshots,false,true));
        assert.deepEqual(removed,['b']);
        assert.equal(await prisma.hwidUserDevices.count({where:{userId:992n}}),2);
        assert.equal(await prisma.hwidUserDevices.count({where:{userId:992n,blocked:true}}),2,'old and concurrent bans must survive');
        const tasks=await repo.claimDeviceReconciliation();
        const old=tasks.find(t=>t.userId===992n&&t.hwid==='b');assert.ok(old);
        await repo.finishDeviceReconciliation(old,false,old.attempts);
        const retry=await prisma.$queryRaw`SELECT next_attempt_at>now() AS delayed FROM xera_device_reconciliation WHERE user_id=992 AND hwid='b'`;
        assert.equal(retry[0].delayed,true,'failure must persist a retry after panel restart');
        await transaction(()=>repo.createWithAdvisoryLock({userId:992n,hwid:'b'},10));
        const queued=await prisma.$queryRaw`SELECT revision::text FROM xera_device_reconciliation WHERE user_id=992 AND hwid='b'`;
        assert.notEqual(queued[0].revision,old.revision,'re-registration must invalidate the older worker result');
        await repo.finishDeviceReconciliation(old,true,old.attempts);
        assert.equal((await prisma.$queryRaw`SELECT count(*)::int AS count FROM xera_device_reconciliation WHERE user_id=992 AND hwid='b'`)[0].count,1);
        const stale=snapshots.find(d=>d.hwid==='b');
        assert.deepEqual(await transaction(()=>repo.deleteDevicesAndQueue(992n,[stale],true,true)),[],'stale deletion cannot remove a new registration');
        const latest=await prisma.hwidUserDevices.findUnique({where:{hwid_userId:{hwid:'b',userId:992n}}});
        assert.deepEqual(await transaction(()=>repo.deleteDevicesAndQueue(993n,[latest],true,true)),[],'other owner is isolated');
        const [freshTask]= (await repo.claimDeviceReconciliation()).filter(t=>t.userId===992n&&t.hwid==='b');
        assert.ok(freshTask);
        await repo.finishDeviceReconciliation(freshTask,true,freshTask.attempts);
        const acknowledged=await prisma.$queryRaw`SELECT revision FROM xera_device_state WHERE id=1`;
        await repo.finishDeviceReconciliation(old,true,old.attempts);
        const late=await prisma.$queryRaw`SELECT revision FROM xera_device_state WHERE id=1`;
        assert.ok(late[0].revision>acknowledged[0].revision,'late stale node writes must force a fresh config even after the newer job was completed');
        await prisma.$executeRawUnsafe("CREATE FUNCTION xera_test_reject_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only queue failure'; END $$");
        await prisma.$executeRawUnsafe('CREATE TRIGGER xera_test_reject_reconciliation BEFORE INSERT ON xera_device_reconciliation FOR EACH ROW EXECUTE FUNCTION xera_test_reject_reconciliation()');
        await assert.rejects(transaction(()=>repo.deleteDevicesAndQueue(992n,[latest],true,true)),/test-only queue failure/);
        assert.ok(await prisma.hwidUserDevices.findUnique({where:{hwid_userId:{hwid:'b',userId:992n}}}),'queue failure must roll back deletion');
        await prisma.$executeRawUnsafe('DROP TRIGGER xera_test_reject_reconciliation ON xera_device_reconciliation');
        await prisma.$executeRawUnsafe('DROP FUNCTION xera_test_reject_reconciliation()');
        const after=await prisma.$queryRaw`SELECT revision FROM xera_device_state WHERE id=1`;
        assert.ok(after[0].revision>before[0].revision,'configuration revision observes device permission changes');
        console.log('PASS PostgreSQL: atomic deletion/outbox, retry persistence, prior/concurrent bans, re-registration fencing, owner isolation, rollback on queue failure and config revision');
    }finally{
        await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS xera_test_reject_reconciliation ON xera_device_reconciliation');
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS xera_test_reject_reconciliation()');
        await prisma.users.deleteMany({where:{id:992n}});await prisma.$disconnect();
        if(saved===undefined)delete process.env.XERA_PERSONAL_SUBSCRIPTIONS;else process.env.XERA_PERSONAL_SUBSCRIPTIONS=saved;
    }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
