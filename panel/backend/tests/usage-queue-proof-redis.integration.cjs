const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Queue}=require('bullmq'),Redis=require('ioredis'),load=require('./load-typescript.cjs');
const {readUsageQueueProof,requireEmptyRecoveryQueueProof}=load(path.join(__dirname,'../src/common/host-policy/usage-queue-proof.ts'));
const url=process.env.QUEUE_PROOF_TEST_REDIS_URL;assert.ok(url);const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'56382');assert.equal(parsed.pathname,'/15');
const connection=new Redis(url,{maxRetriesPerRequest:1,connectTimeout:1000,retryStrategy:times=>times<2?50:null});connection.on('error',()=>{});
const prefix='usage-queue-proof-'+randomUUID(),nodes=new Queue('nodes',{prefix,connection}),users=new Queue('users',{prefix,connection});
const states=['active','wait','paused','delayed','prioritized','waiting-children','failed'];const keys=[];let other,foreign;
(async()=>{try{
 await Promise.all([nodes.waitUntilReady(),users.waitUntilReady()]);
 const empty=await readUsageQueueProof(nodes,users);assert.equal(empty.database,15);assert.equal(empty.entries.length,14);requireEmptyRecoveryQueueProof(empty);
 for(const queue of [nodes,users])for(const state of states){
  const key=queue.toKey(state);keys.push(key);
  try{
   if(['active','wait','paused'].includes(state))await connection.rpush(key,'original-job');else await connection.zadd(key,1,'original-job');
   const proof=await readUsageQueueProof(nodes,users);assert.equal(proof.entries.find(entry=>entry.key===key).count,'1');assert.throws(()=>requireEmptyRecoveryQueueProof(proof),/require recovery/);
   const cutover=await readUsageQueueProof(nodes,users,'cutover');assert.equal(cutover.entries.some(entry=>entry.count!=='0'),queue===users||state==='active');
  }finally{await connection.del(key);}
 }
 console.log('PASS actual Redis primary atomic proof covers all14 states; enrollment8 scope is distinct and cannot authorize recovery');
 const active=nodes.toKey('active'),delayed=nodes.toKey('delayed');await connection.rpush(active,'moving-job');
 for(let index=0;index<24;index++){
  if(index%2===0)await connection.multi().lrem(active,0,'moving-job').zadd(delayed,1,'moving-job').exec();
  else await connection.multi().zrem(delayed,'moving-job').rpush(active,'moving-job').exec();
  const proof=await readUsageQueueProof(nodes,users);assert.equal(proof.entries.reduce((sum,entry)=>sum+BigInt(entry.count),0n),1n);assert.throws(()=>requireEmptyRecoveryQueueProof(proof));
 }
 await connection.del(active,delayed);
 await connection.set(active,'wrong-type');await assert.rejects(readUsageQueueProof(nodes,users),/WRONGTYPE/);await connection.del(active);
 console.log('PASS moving jobs retain a nonempty proof and wrong Redis key types fail rather than becoming zero');
 other=new Redis({...connection.options,db:14});other.on('error',()=>{});foreign=new Queue('foreign',{prefix,connection:other});await foreign.waitUntilReady();await assert.rejects(readUsageQueueProof(foreign,users),/one primary database/);
 await connection.call('CLIENT','PAUSE','200','ALL');await assert.rejects(readUsageQueueProof(nodes,users,'recovery',20),/timed out/);await connection.ping();
 requireEmptyRecoveryQueueProof(await readUsageQueueProof(nodes,users));
 console.log('PASS actual different DB and paused backend cannot fabricate empty recovery; resumed read succeeds without queue mutation');
}finally{
 await Promise.allSettled(keys.map(key=>connection.del(key)));
 await Promise.allSettled([nodes.close(),users.close(),foreign?.close()]);
 if(other)await other.quit().catch(()=>other.disconnect());await connection.quit().catch(()=>connection.disconnect());
}})().catch(error=>{console.error(error);process.exitCode=1});
