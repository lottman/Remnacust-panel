const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const types=load(path.join(__dirname,'../src/modules/core-management/core-management.types.ts'));
const {CoreManagementService}=load(path.join(__dirname,'../src/modules/core-management/core-management.service.ts'),{
 '@common/axios/axios.service':{},
 '@common/utils/core-ssh-tunnel':{coreSshTunnelKey:uuid=>uuid},
 '@modules/nodes/queries/get-node-by-uuid':{GetNodeByUuidQuery:class{constructor(uuid){this.uuid=uuid}}},
 './core-management.types':types
});
const uuids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
const requestId='10000000-0000-4000-8000-000000000001';
function fixture(stopOnFailure=false){
 const saved=new Map();
 const queue={toKey:x=>x,getJob:async id=>saved.get(id),add:async(name,data)=>{
  if(!saved.has(data.requestId))saved.set(data.requestId,{id:data.requestId,data,timestamp:1,progress:0,getState:async()=> 'waiting'});
  return saved.get(data.requestId);
 }};
 const redis={get:async()=>null};
 const queries={execute:async({uuid})=>({isOk:true,response:{uuid,name:uuid,isDisabled:uuid===uuids[0]}})};
 const service=new CoreManagementService(queue,queries,{},redis);
 service.statusWithRetry=async()=>({history:[],operation:null});
 const sent=[];
 service.managedCore=async(node,data)=>{sent.push(node.uuid);return {isOk:true,response:{id:data.id,status:'succeeded',phase:'done'}}};
 const input={requestId,nodeUuids:uuids,action:'restart',stopOnFailure};
 return {service,input,saved,sent,redis,queue};
}
test('bulk jobs keep an exact snapshot and a disabled node does not reject the whole submission',async()=>{
 const {service,input,saved,sent}=fixture();
 const created=await service.create(input);assert.equal(created.nodes.length,2);
 const job=saved.get(requestId);job.updateProgress=async rows=>{job.progress=structuredClone(rows)};
 const result=await service.process(job);
 assert.deepEqual(result.map(r=>r.status),['failed','succeeded']);
 assert.deepEqual(sent,[uuids[1]]);
});
test('stop-on-failure skips the remaining nodes; cancellation dispatches none',async()=>{
 const {service,input,saved,sent,redis}=fixture(true);
 await service.create(input);const job=saved.get(requestId);job.updateProgress=async rows=>{job.progress=structuredClone(rows)};
 assert.deepEqual((await service.process(job)).map(r=>r.status),['failed','skipped']);assert.deepEqual(sent,[]);
 job.progress=0;redis.get=async()=> '1';
 assert.deepEqual((await service.process(job)).map(r=>r.status),['cancelled','cancelled']);
});
test('retries are idempotent and cannot change targets, action or failure policy',async()=>{
 const {service,input,saved}=fixture();await service.create(input);await service.create(input);assert.equal(saved.size,1);
 for(const patch of [{stopOnFailure:true},{action:'stop'},{nodeUuids:[uuids[1]]}])
  await assert.rejects(service.create({...input,...patch}),/Request ID already used/);
});
test('concurrent submissions cannot reuse one request ID for different jobs',async()=>{
 const {service,input}=fixture();
 const results=await Promise.allSettled([service.create(input),service.create({...input,stopOnFailure:true})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('job input rejects duplicate targets, arbitrary commands and invalid UUIDs',()=>{
 const base={requestId,nodeUuids:uuids,action:'restart'};
 assert.equal(types.coreJobSchema.safeParse(base).success,true);
 for(const patch of [{nodeUuids:[uuids[0],uuids[0]]},{nodeUuids:[]},{nodeUuids:['bad']},{action:'rm -rf /'},{command:'bash'},{action:'install'}])
  assert.equal(types.coreJobSchema.safeParse({...base,...patch}).success,false);
});
