const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{createHash}=require('node:crypto'),load=require('./load-typescript.cjs');
const {recoveryTailPlan,recoveryTailInput}=load(path.join(__dirname,'../src/common/host-policy/recovery-tail-plan.ts'));
const {frameDigest}=load(path.join(__dirname,'../src/common/host-policy/usage-receipt.ts'));
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const hash=v=>createHash('sha256').update(v).digest('hex');
const encode=journal=>{const body=Buffer.from(JSON.stringify(journal));return Buffer.concat([Buffer.from('REMNACUST-USAGE-1\n'+hash(body)+'\n'),body]);};
function fixture(){const fence={version:'remnacust-quota-recovery-fence-v1',generation:id('a'),token:id('b'),state:'FENCED',sequence:'1',previous:null};fence.digest=hash([fence.version,fence.generation,fence.token,fence.state,fence.sequence,'-',''].join('\n'));
 const journal={version:1,stream:id('c'),acked:'9007199254740993',ackDigest:'d'.repeat(64),pending:null};
 const ack={version:'remnacust-recovery-usage-ack-v1',requestId:id('e'),generation:id('a'),coreProcessId:id('f'),instance:journal.stream,previous:fence.digest,decisionDigest:'a'.repeat(64),sourceDigest:'b'.repeat(64),alreadyAcknowledged:false,acknowledgement:{stream:journal.stream,sequence:journal.acked,acknowledged:true},journal:{stream:journal.stream,acked:journal.acked,ackDigest:journal.ackDigest,digest:hash(encode(journal)),pending:null},recovery:fence};return {journal,ack};}
test('an acknowledged head without a pending frame prepares an exact next sample, never an empty-usage verdict',()=>{
 const {journal,ack}=fixture(),original=encode(journal),plan=recoveryTailPlan(ack,original,id('1'),'1500000000');
 assert.deepEqual(plan.sample,{action:'sample',stream:journal.stream,sequence:'9007199254740994',coreProcessId:id('1')});
 assert.equal(plan.requiresSampling,true);assert.equal(plan.retainedDigest,null);assert.equal(plan.journalDigest,hash(original));assert.equal(plan.consumptionMultiplier,'1500000000');assert.equal(Object.hasOwn(plan,'empty'),false);
});
test('a retained next frame keeps its old core, exact counters and digest despite a new live core',()=>{
 const {journal,ack}=fixture();journal.pending={sequence:'9007199254740994',coreProcessId:id('2'),capturedAt:'1',stats:[{name:'user>>>901>>>traffic>>>uplink',value:'9007199254740993'}]};
 ack.journal.pending={sequence:journal.pending.sequence,coreProcessId:journal.pending.coreProcessId,digest:frameDigest(journal.pending)};
 const plan=recoveryTailPlan(ack,encode(journal),id('1'),'0');assert.equal(plan.sample.coreProcessId,id('2'));assert.equal(plan.requiresSampling,false);assert.equal(plan.retainedDigest,frameDigest(journal.pending));
 const absent={...journal,pending:null};assert.throws(()=>recoveryTailPlan(ack,encode(absent),id('1'),'0'),/lost or changed/);
 journal.pending.stats[0].value='1';assert.throws(()=>recoveryTailPlan(ack,encode(journal),id('1'),'0'),/lost or changed/);
});
test('tail preparation rejects wrong heads, streams, acknowledgements, corrupt archives and sequence exhaustion',()=>{
 const {journal,ack}=fixture();
 for(const patch of [{stream:id('1')},{acked:'9007199254740992'},{ackDigest:'f'.repeat(64)}])assert.throws(()=>recoveryTailPlan(ack,encode({...journal,...patch}),id('1'),'1'));
 for(const value of ['-1','01','1.5','9223372036854775808'])assert.throws(()=>recoveryTailPlan(ack,encode(journal),id('1'),value));
 const bad=Buffer.from(encode(journal));bad[0]=0;assert.throws(()=>recoveryTailPlan(ack,bad,id('1'),'1'));
 const altered=structuredClone(ack);altered.journal.stream=id('1');assert.throws(()=>recoveryTailPlan(altered,encode(journal),id('1'),'1'));
 journal.acked=ack.journal.acked=ack.acknowledgement.sequence='9223372036854775807';assert.throws(()=>recoveryTailPlan(ack,encode(journal),id('1'),'1'),/exhausted/);
 assert.throws(()=>recoveryTailPlan(ack,encode(journal),'00000000-0000-0000-0000-000000000000','1'));
});
test('tail requests require an explicit reviewed multiplier and bounded note, with no body author or inferred defaults',()=>{
 const input={requestId:id('1'),generation:id('a'),acknowledgementRequest:id('e'),consumptionMultiplier:'1000000000',note:'Reviewed next-packet pricing'};
 assert.deepEqual(recoveryTailInput.parse(input),input);
 for(const patch of [{actor:id('1')},{consumptionMultiplier:undefined},{consumptionMultiplier:1},{note:'short'},{note:'x'.repeat(2001)},{requestId:id('a').toUpperCase()}])assert.equal(recoveryTailInput.safeParse({...input,...patch}).success,false);
});
