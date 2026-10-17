const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{createHash}=require('node:crypto'),load=require('./load-typescript.cjs');
const codec=load(path.resolve(__dirname,'../src/common/host-policy/recovery-usage-ack.ts'));
const fenceCodec=load(path.resolve(__dirname,'../src/common/host-policy/quota-recovery-fence.ts'));
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
function fixture(){const fence={version:fenceCodec.QUOTA_RECOVERY_FENCE,generation:id('a'),token:id('b'),state:'FENCED',sequence:'1',previous:null};fence.digest=createHash('sha256').update([fence.version,fence.generation,fence.token,'FENCED','1','-',''].join('\n')).digest('hex');
 const request={generation:fence.generation,requestId:id('c'),coreProcessId:id('d'),instance:id('e'),previous:fence.digest,decisionDigest:'d'.repeat(64),sourceDigest:'e'.repeat(64),receipt:{action:'ack',stream:id('e'),sequence:'9007199254740993',coreProcessId:id('f'),digest:'f'.repeat(64)}};
 const reply={version:codec.RECOVERY_USAGE_ACK,requestId:request.requestId,generation:request.generation,coreProcessId:request.coreProcessId,instance:request.instance,previous:request.previous,decisionDigest:request.decisionDigest,sourceDigest:request.sourceDigest,alreadyAcknowledged:false,acknowledgement:{stream:request.instance,sequence:request.receipt.sequence,acknowledged:true},journal:{stream:request.instance,acked:request.receipt.sequence,ackDigest:request.receipt.digest,digest:'0'.repeat(64),pending:null},recovery:fence};return {request,reply};}
test('recovery ACK requires exact financial intent, live pause and original stream/sequence/digest',()=>{
 const {request,reply}=fixture();assert.equal(codec.recoveryUsageAckMatches(request,reply),true);
 for(const key of ['requestId','generation','coreProcessId','instance','previous','decisionDigest','sourceDigest']){const other=structuredClone(reply);other[key]=['previous','decisionDigest','sourceDigest'].includes(key)?'0'.repeat(64):id('1');assert.equal(codec.recoveryUsageAckMatches(request,other),false,key);}
 for(const mutate of [r=>r.acknowledgement.sequence='1',r=>r.acknowledgement.stream=id('1'),r=>r.journal.acked='1',r=>r.journal.stream=id('1'),r=>r.journal.ackDigest='0'.repeat(64),r=>r.recovery=null,r=>r.extra=true]){const other=structuredClone(reply);mutate(other);assert.equal(codec.recoveryUsageAckMatches(request,other),false);}
 reply.alreadyAcknowledged=true;assert.equal(codec.recoveryUsageAckMatches(request,reply),true);
});
test('a next pending frame stays explicit and its exact large sequence must follow the acknowledged frame',()=>{
 const {request,reply}=fixture();reply.journal.pending={sequence:'9007199254740994',coreProcessId:id('f'),digest:'1'.repeat(64)};assert.equal(codec.recoveryUsageAckMatches(request,reply),true);
 reply.journal.pending.sequence='9007199254740995';assert.equal(codec.recoveryUsageAckMatches(request,reply),false);
 for(const patch of [{extra:true},{instance:id('1')},{receipt:{...request.receipt,action:'sample'}},{sourceDigest:'bad'},{decisionDigest:'bad'}])assert.equal(codec.recoveryUsageAckRequest.safeParse({...request,...patch}).success,false);
});
