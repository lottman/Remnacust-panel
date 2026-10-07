const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const load=require('./load-typescript.cjs');
test('traffic uses bounded SQL batches instead of one query per user-host pair',async()=>{
 const batches=[];
 const sql=(parts,...values)=>({execute:async()=>{
  if(parts.join('').includes('xera_host_usage_receipts'))return {rows:[{id:'receipt'}]};
  if(parts.join('').includes('INSERT INTO xera_host_quota_usage'))batches.push(values.find(v=>v?.joined)?.joined);
  return {rows:[]};
 },values});
 sql.join=joined=>({joined});
 const {HostUsageService}=load(path.join(__dirname,'../src/common/host-policy/host-usage.service.ts'),{
  kysely:{sql},'@common/database':{},'@common/raw-cache':{},
  '@common/utils/host-identity':load(path.join(__dirname,'../src/common/utils/host-identity.ts')),
 });
 const pending={};
 const cache={hsetJson:async(k,id,value)=>pending[id]=value,hgetallParsed:async()=>pending,createPipeline:()=>{
  let id;return {hdel:(k,value)=>id=value,exec:async()=>{delete pending[id];return [[null,1]]}};
 }};
 const service=new HostUsageService({kysely:{}},cache,{withTransaction:async(opts,fn)=>fn()});
 const rows=Array.from({length:1201},(_,i)=>({username:`${i+1}~${'a'.repeat(24)}~h${'b'.repeat(32)}`,uplink:2,downlink:3}));
 await service.record(1n,rows);
 assert.deepEqual(batches.map(b=>b.length),[500,500,201]);
 assert.equal(batches.flat().length,1201);
 assert.ok(batches.flat().every(row=>row.values[2]==='5'));
 assert.deepEqual(pending,{});
});
