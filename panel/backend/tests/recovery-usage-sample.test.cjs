const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{createHash}=require('node:crypto'),load=require('./load-typescript.cjs');
const codec=load(path.join(__dirname,'../src/common/host-policy/recovery-usage-sample.ts')),fixture=require('./recovery-sample.fixture.cjs');
test('prepared sample replies bind the original ticket, live context and financial preparation independently',()=>{
 const {request,reply}=fixture();assert.equal(codec.recoveryUsageSampleMatches(request,reply),true);
 for(const key of ['requestId','generation','coreProcessId','instance','previous','preparationDigest','sourceDigest','retainedDigest']){
  const other=structuredClone(reply);other[key]=key==='retainedDigest'?'0'.repeat(64):typeof other[key]==='string'&&other[key].length===64?'0'.repeat(64):request.instance;
  if(other[key]===reply[key])other[key]=request.requestId;
  assert.equal(codec.recoveryUsageSampleMatches(request,other),false,key);
 }
 for(const alter of [r=>r.frame.sequence='1',r=>r.frame.stats[0].value='9007199254740992',r=>r.frame.digest='0'.repeat(64),r=>r.frame.extra=true,r=>r.recovery=null]){const other=structuredClone(reply);alter(other);assert.equal(codec.recoveryUsageSampleMatches(request,other),false);}
 request.retainedDigest=reply.retainedDigest=reply.frame.digest;assert.equal(codec.recoveryUsageSampleMatches(request,reply),true);reply.alreadyCaptured=false;assert.equal(codec.recoveryUsageSampleMatches(request,reply),false);
 for(const patch of [{extra:true},{receipt:{...request.receipt,action:'ack',digest:'a'.repeat(64)}},{receipt:{...request.receipt,sequence:'9007199254740995'}},{instance:request.requestId},{preparationDigest:'bad'}])assert.equal(codec.recoveryUsageSampleRequest.safeParse({...request,...patch}).success,false);
});
test('Panel and Node accept the identical prepared-sample wire and preserve an exact old-core retained frame',t=>{
 const file=path.resolve(__dirname,'../../../../Remnacust-node/node/src/modules/xray-core/recovery-usage-sample.ts');if(!fs.existsSync(file))return t.skip('Separate Node repository is not checked out');
 const node=load(file),{request,reply,body}=fixture();
 assert.equal(node.recoveryUsageSampleRequest.safeParse(request).success,true);assert.equal(node.recoveryUsageSampleReply.safeParse(reply).success,true);
 const raw=Buffer.from(JSON.stringify({version:1,stream:request.instance,acked:request.prior.sequence,ackDigest:request.prior.digest,pending:body}));const original=Buffer.concat([Buffer.from('REMNACUST-USAGE-1\n'+createHash('sha256').update(raw).digest('hex')+'\n'),raw]);
 const result=node.recoverySampleJournal(original,request);assert.deepEqual(result.frame,reply.frame);assert.notEqual(result.frame.coreProcessId,request.coreProcessId);assert.equal(result.frame.stats[0].value,'9007199254740993');
});
