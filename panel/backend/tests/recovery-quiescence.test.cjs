const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),load=require('./load-typescript.cjs');
const codec=load(path.join(__dirname,'../src/common/host-policy/recovery-quiescence.ts')),fixture=require('./recovery-quiescence.fixture.json');
test('empty-after-fence witness binds every original preparation and current native identity without rounding the sequence',()=>{
 assert.equal(fixture.frame.sequence,'9007199254740994');assert.equal(codec.recoveryQuiescenceSchema.safeParse(fixture).success,true);
 assert.equal(codec.recoveryQuiescenceMatches(fixture.request,fixture),true);
 for(const mutate of [w=>w.request.requestId=w.request.instance,w=>w.request.preparationDigest='e'.repeat(64),w=>w.request.sourceDigest='e'.repeat(64),w=>w.request.coreProcessId=w.request.instance,w=>w.request.prior.sequence='1',w=>w.frame.stats=[{name:'user>>>77>>>traffic>>>uplink',value:'1'}],w=>w.frame.capturedAt='2',w=>w.journalDigest='e'.repeat(64),w=>w.fence.state='RELEASED',w=>w.extra=true]){
  const value=structuredClone(fixture);mutate(value);assert.equal(codec.recoveryQuiescenceSchema.safeParse(value).success,false);
 }
 assert.equal(codec.recoveryQuiescenceMatches({...fixture.request,requestId:fixture.request.instance},fixture),false);
 for(const value of [null,{},[],{witness:fixture,extra:true},{witness:{}}])assert.equal(codec.recoveryQuiescenceReplySchema.safeParse(value).success,false);
 const journal={stream:fixture.request.instance,acked:fixture.request.prior.sequence,ackDigest:fixture.request.prior.digest,digest:fixture.journalDigest,pending:{sequence:fixture.frame.sequence,coreProcessId:fixture.frame.coreProcessId,digest:fixture.frame.digest}};
 const pending={witness:fixture,journal};assert.equal(codec.recoveryQuiescenceReplyMatches(fixture.request,pending),true);assert.equal(codec.recoveryQuiescenceAcknowledged(fixture.request,pending),false);
 const acked={witness:fixture,journal:{...journal,acked:fixture.frame.sequence,ackDigest:fixture.frame.digest,pending:null,digest:'e'.repeat(64)}};
 assert.equal(codec.recoveryQuiescenceAcknowledged(fixture.request,acked),true);
 for(const patch of [{acked:fixture.request.prior.sequence},{ackDigest:fixture.request.prior.digest},{stream:fixture.request.requestId},{pending:{sequence:'9007199254740995',coreProcessId:fixture.frame.coreProcessId,digest:fixture.frame.digest}}])assert.equal(codec.recoveryQuiescenceAcknowledged(fixture.request,{...acked,journal:{...acked.journal,...patch}}),false);
 assert.equal(codec.recoveryQuiescenceReplySchema.safeParse({witness:null}).success,false);
 assert.equal(codec.recoveryQuiescenceReplyMatches(fixture.request,{witness:null,journal}),true);
 assert.equal(codec.recoveryQuiescenceAcknowledged(fixture.request,{witness:null,journal}),false);
 assert.equal(codec.recoveryQuiescenceReplyMatches(fixture.request,{witness:null,journal:{...journal,stream:fixture.request.requestId}}),false);
});
test('the actual Node and Panel schemas agree on the durable quiescence wire',t=>{
 const filename=path.resolve(__dirname,'../../../../Remnacust-node/node/src/modules/xray-core/recovery-quiescence.ts');if(!fs.existsSync(filename))return t.skip('Separate Node checkout absent');
 const node=load(filename);assert.equal(node.recoveryQuiescenceSchema.safeParse(fixture).success,true);assert.equal(node.recoveryQuiescenceMatches(fixture.request,fixture),true);
});
