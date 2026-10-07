const assert=require('node:assert/strict');const path=require('node:path');const {PrismaClient}=require('@prisma/client');const k=require('kysely');const load=require('./load-typescript.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const {NodeSshService}=load(path.join(__dirname,'../src/modules/node-ssh/node-ssh.service.ts'),{
 '@common/database':{},'@common/raw-cache':{},'@common/types':{ok:response=>({isOk:true,response}),fail:error=>({isOk:false,error})},
 '@libs/contracts/constants':{ERRORS:{NODE_NOT_FOUND:'NODE_NOT_FOUND'}},'@libs/contracts/models':{},'@modules/nodes/queries/get-node-by-uuid':{GetNodeByUuidQuery:class{}},'./models':{}
});
(async()=>{
 const prisma=new PrismaClient({datasourceUrl:'postgresql://postgres@127.0.0.1:55439/postgres'});
 const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver({tx:prisma}),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()}})};
 const node=await prisma.nodes.create({data:{name:'optimization-r9-test',address:'optimization-r9.invalid'}});
 const service=()=>new NodeSshService({set:()=>{throw new Error('Redis is not durable storage')}},{execute:async()=>({isOk:!!(await prisma.nodes.findUnique({where:{uuid:node.uuid}}))})},db);
 try{
  await service().recordOptimization(node.uuid,'performance');
  await prisma.$executeRaw`UPDATE xera_node_optimization SET checked_at=now()-interval '2 days',verified_at=now()-interval '2 days' WHERE node_uuid=${node.uuid}::uuid`;
  let state=(await service().getOptimization(node.uuid)).response;
  assert.equal(state.level,'performance');assert.equal(state.verified,true);assert(Date.now()-state.verifiedAt.getTime()>86400000);
  await service().recordOptimization(node.uuid,null);state=(await service().getOptimization(node.uuid)).response;
  assert.equal(state.level,'performance');assert.equal(state.verified,false);assert(Date.now()-state.verifiedAt.getTime()>86400000);
  await service().recordOptimization(node.uuid,'none');state=(await service().getOptimization(node.uuid)).response;
  assert.equal(state.level,'none');assert.equal(state.verified,true);
  await prisma.nodes.delete({where:{uuid:node.uuid}});
  await service().recordOptimization(node.uuid,'safe');
  assert.equal((await service().getOptimization(node.uuid)).isOk,false);
  assert.deepEqual(await prisma.$queryRaw`SELECT * FROM xera_node_optimization WHERE node_uuid=${node.uuid}::uuid`,[]);
  console.log('PASS optimization PostgreSQL: survives service recreation and old timestamp; failed check preserves last known state; none persists; delete cascades and late SSH results cannot recreate node');
 }finally{await prisma.nodes.deleteMany({where:{uuid:node.uuid}});await prisma.$disconnect();}
})().catch(e=>{console.error(e);process.exitCode=1});
