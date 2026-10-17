const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const load=require('./load-typescript.cjs'),file=part=>path.join(__dirname,'../src',part);
const mocks={'@common/utils/device-identity':load(file('common/utils/device-identity.ts')),'@common/utils/nano':load(file('common/utils/nano/nano.util.ts'))};
const model=load(file('common/host-policy/native-recovery-plan.ts'),mocks);
const node=randomUUID(),stream=randomUUID(),core=randomUUID(),account=randomUUID(),generation=randomUUID();
const ticket={stream,sequence:'1',core,requestedAt:'2026-10-16 10:00:00.123456+00',multiplier:'1500000000',digest:null};
function journal(stats,patch={}){const payload=Buffer.from(JSON.stringify({version:1,stream,acked:'0',ackDigest:'',pending:{sequence:'1',coreProcessId:core,capturedAt:'1792140000000',stats},...patch}));return Buffer.concat([Buffer.from('REMNACUST-USAGE-1\n'+createHash('sha256').update(payload).digest('hex')+'\n'),payload]);}
const stats=[{name:`qfree>>>${account}>>>901>>>150>>>100>>>traffic>>>uplink`,value:'9007199254740993'},{name:'user>>>901>>>traffic>>>downlink',value:'9007199254740993'},{name:'user>>>901>>>traffic>>>uplink',value:'1'}];
test('native recovery preserves exact old factor and original raw journal without charging metadata twice',()=>{
 const source=model.nativeRecoverySource(node,journal(stats),ticket);assert.equal(source.payload[0].b,'13510798882111491');assert.equal(source.outside[0].bytes,'9007199254740993');assert.equal(source.ticket.requestedAt,ticket.requestedAt);
 const input=model.nativeRecoveryDraft.parse({generation,bankRequest:generation,sourceRequest:generation,allocations:[{owner:'901',action:'LOSS'}],accounts:[{account,action:'LOSS'}],note:'Explicitly reviewed unrecoverable historical owner'});
 const plan=model.nativeRecoveryPlan(node,source,input,[],'a'.repeat(64),[]);assert.equal(plan.plan.billing.totals.lost,'13510798882111491');assert.equal(plan.plan.billing.charges.length,0);assert.equal(plan.plan.lostOutside.length,1);
 assert.equal(plan.digest,createHash('sha256').update(plan.text).digest('hex'));
 for(const accounts of [[],[{account:randomUUID(),action:'LOSS'}],[...input.accounts,...input.accounts]])assert.throws(()=>model.nativeRecoveryPlan(node,source,{...input,accounts},[],'a'.repeat(64),[]),/INVALID_ALLOCATION/);
});
test('archive import cannot silently change stream, sequence, core, factor or already committed digest',()=>{
 const original=journal(stats);
 for(const patch of [{stream:randomUUID()},{sequence:'2'},{core:randomUUID()},{core:null},{requestedAt:null},{multiplier:null},{multiplier:'-1'},{multiplier:'9223372036854775808'},{digest:'b'.repeat(64)}])assert.throws(()=>model.nativeRecoverySource(node,original,{...ticket,...patch}),/TICKET_CHANGED/);
 for(const raw of [Buffer.from('bad'),journal(stats,{pending:null}),journal([{name:'user>>>unknown>>>traffic>>>uplink',value:'1'}]),journal([{name:'user>>>901>>>traffic>>>downlink',value:'9223372036854775807'},{name:'user>>>901>>>traffic>>>uplink',value:'1'}])])assert.throws(()=>model.nativeRecoverySource(node,raw,ticket));
});
test('already committed journal requires no new financial allocations and preserves discarded side effects in its audit',()=>{
 const first=model.nativeRecoverySource(node,journal(stats),ticket),effects={owners:[{id:'901',bytes:'7'}],firstConnected:['901'],capturedAt:'1'};
 const source=model.nativeRecoverySource(node,journal(stats),{...ticket,digest:first.digest,effects});
 const input=model.nativeRecoveryDraft.parse({generation,bankRequest:generation,sourceRequest:generation,allocations:[],accounts:[],note:'Discard stale effects without repeating committed money'});
 const plan=model.nativeRecoveryPlan(node,source,input,[],'a'.repeat(64),[]);assert.equal(plan.plan.billing.totals.charged,'0');assert.equal(plan.plan.applyOutside.length,0);assert.deepEqual(plan.plan.source.ticket.effects,effects);
 assert.throws(()=>model.nativeRecoveryPlan(node,source,{...input,accounts:[{account,action:'LOSS'}]},[],'a'.repeat(64),[]),/INVALID_ALLOCATION/);
 for(const extra of [{actor:node},{amount:'1'},{accounts:[{account,action:'DELETE'}]}])assert.equal(model.nativeRecoveryDraft.safeParse({...input,...extra}).success,false);
});

test('account preview includes fractional carry and refuses int64 overflow before monetary execution',()=>{
 const rows=[{name:`qfree>>>${account}>>>901>>>150>>>100>>>traffic>>>uplink`,value:'3'},{name:'user>>>901>>>traffic>>>uplink',value:'7'}];
 const source=model.nativeRecoverySource(node,journal(rows),ticket);
 const input=model.nativeRecoveryDraft.parse({generation,bankRequest:generation,sourceRequest:generation,allocations:[{owner:'901',action:'LOSS'}],accounts:[{account,action:'APPLY'}],note:'Explicit reviewed fractional account liability'});
 const result=model.nativeRecoveryPlan(node,source,input,[],'a'.repeat(64),[{account,baseline:'5',nano:'4500000000'}]);
 assert.deepEqual(result.plan.accountChanges,[{account,before:'5',after:'9',charged:'4',beforeNano:'4500000000',afterNano:'9000000000'}]);
 assert.throws(()=>model.nativeRecoveryPlan(node,source,input,[],'a'.repeat(64),[{account,baseline:'9223372036854775807',nano:'0'}]),/OVERFLOW/);
 assert.throws(()=>model.nativeRecoveryPlan(node,source,input,[],'a'.repeat(64),[]),/ACCOUNT_UNPROVEN/);
});
