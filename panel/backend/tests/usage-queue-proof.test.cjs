const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {readUsageQueueProof,requireEmptyRecoveryQueueProof,requireApprovedRecoveryQueueProof}=require('./load-typescript.cjs')(path.join(__dirname,'../src/common/host-policy/usage-queue-proof.ts'));
function fixture(){
 const state={counts:null,calls:[],definitions:[],userInfoCalls:0};
 const make=()=>({status:'ready',isCluster:false,options:{db:15},info:async()=> 'run_id:'+ 'a'.repeat(40)+'\r\nrole:master\r\n',defineCommand:(name,definition)=>state.definitions.push({name,definition}),runCommand:async(name,args)=>{state.calls.push({name,args});return state.counts??Array(args.length/2).fill('0');}});
 const node=make(),user=make();return {state,node,user,nodes:{toKey:key=>'bull:node:'+key,getBackend:()=>({connection:{client:Promise.resolve(node)}})},users:{toKey:key=>'bull:user:'+key,getBackend:()=>({connection:{client:Promise.resolve(user)}})}};
}
test('recovery reads every queue state atomically on the primary and an empty proof grants no other action',async()=>{
 const f=fixture(),proof=await readUsageQueueProof(f.nodes,f.users);
 assert.equal(proof.entries.length,14);assert.equal(f.state.calls.length,1);assert.equal(f.state.definitions[0].definition.numberOfKeys,14);assert.equal(f.state.definitions[0].definition.readOnly,undefined);
 assert.deepEqual(f.state.calls[0].args.slice(0,14),proof.entries.map(entry=>entry.key));assert.deepEqual(f.state.calls[0].args.slice(14),Array(2).fill(['list','list','list','zset','zset','zset','zset']).flat());
 assert.deepEqual(requireEmptyRecoveryQueueProof(proof),proof);
 for(let index=0;index<14;index++){const changed=structuredClone(proof);changed.entries[index].count='1';assert.throws(()=>requireEmptyRecoveryQueueProof(changed),/require recovery/);}
 const cutover=await readUsageQueueProof(f.nodes,f.users,'cutover');assert.equal(cutover.entries.length,8);assert.throws(()=>requireEmptyRecoveryQueueProof(cutover),/require recovery/);
 assert.notEqual(f.state.definitions[0].name,f.state.definitions[1].name);
});
test('different databases, replicas, unverified servers and changed primary cannot masquerade as empty',async()=>{
 for(const patch of [{options:{db:14}},{options:{db:15,database:14}},{options:{db:'15'}},{isCluster:true},{status:'wait'},{info:async()=> 'run_id:'+ 'b'.repeat(40)+'\r\nrole:master\r\n'},{info:async()=> 'run_id:'+ 'a'.repeat(40)+'\r\nrole:slave\r\n'},{info:async()=> ''}]){
  const f=fixture();Object.assign(f.node,patch);await assert.rejects(readUsageQueueProof(f.nodes,f.users));assert.equal(f.state.calls.length,0);
 }
 const f=fixture();let calls=0;f.user.info=async()=> 'run_id:'+ (++calls===1?'a':'b').repeat(40)+'\r\nrole:master\r\n';await assert.rejects(readUsageQueueProof(f.nodes,f.users),/changed during proof/);
});
test('truncated counts, wrong types and backend errors remain unknown; deadlines do not create empty proof',async()=>{
 for(const counts of [[],Array(14).fill(0),Array(14).fill('-1'),Array(14).fill('1e+18'),Array(14).fill('9223372036854775808')]){const f=fixture();f.state.counts=counts;await assert.rejects(readUsageQueueProof(f.nodes,f.users));}
 const unavailable=fixture();unavailable.user.runCommand=async()=>{throw Error('redis unavailable')};await assert.rejects(readUsageQueueProof(unavailable.nodes,unavailable.users),/redis unavailable/);
 const hung=fixture();hung.node.info=()=>new Promise(()=>{});await assert.rejects(readUsageQueueProof(hung.nodes,hung.users,'recovery',20),/timed out/);assert.equal(hung.state.calls.length,0);
 const f=fixture(),proof=await readUsageQueueProof(f.nodes,f.users);for(const value of [null,{}, {...proof,entries:proof.entries.slice(1)}, {...proof,entries:Array(14).fill(proof.entries[0])}])assert.throws(()=>requireEmptyRecoveryQueueProof(value));
});

test('coordinator exposes full recovery scope separately from enrollment drain and refuses network reads inside SQL',async()=>{
 const f=fixture();const {QuotaCutoverService}=require('./load-typescript.cjs')(path.join(__dirname,'../src/common/host-policy/quota-cutover.service.ts'));
 let inTransaction=false;
 const service=new QuotaCutoverService({}, {isTransactionActive:()=>inTransaction},{},{},{},{queues:{recordUserUsage:f.nodes}},{queues:{updateUsersUsage:f.users}},{});
 const proof=await service.recoveryQueueProof();assert.equal(proof.scope,'recovery');assert.equal(proof.entries.length,14);
 assert.equal(await service.oldQueuesIdle(),true);assert.equal(f.state.calls[1].args.length,16);
 inTransaction=true;const before=f.state.calls.length;await assert.rejects(service.recoveryQueueProof(),/standalone/);assert.equal(f.state.calls.length,before);
});

 test('approved queue identity tolerates only observation time and object key order changes',async()=>{
 const f=fixture(),proof=await readUsageQueueProof(f.nodes,f.users);
 const expected=Object.fromEntries(Object.entries(proof).reverse());
 expected.observedAt='2026-10-16T00:00:00.000Z';
 assert.deepEqual(requireApprovedRecoveryQueueProof(proof,expected),proof);
 for(const patch of [{serverRunId:'b'.repeat(40)},{database:14},{scope:'cutover'},{entries:proof.entries.map((entry,i)=>i===0?{...entry,key:entry.key+'other'}:entry)},{entries:proof.entries.map((entry,i)=>i===0?{...entry,count:'1'}:entry)}]){
 assert.throws(()=>requireApprovedRecoveryQueueProof(proof,{...expected,...patch}));
 assert.throws(()=>requireApprovedRecoveryQueueProof({...proof,...patch},expected));
 }
 for(const value of [null,[],{},'unknown'])assert.throws(()=>requireApprovedRecoveryQueueProof(proof,value));
});
