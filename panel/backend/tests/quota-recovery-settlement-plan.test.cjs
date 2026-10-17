const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('./load-typescript.cjs');
const {createSettlementPlan:plan,settlementDraft,settlementDigest}=load(path.join(__dirname,'../src/common/host-policy/quota-recovery-settlement-plan.ts'));
const node='11111111-1111-4111-8111-111111111111',generation='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',subject='44444444-4444-4444-8444-444444444444';
const input=settlementDraft.parse({generation,bankRequest:generation,sourceRequest:id,ids:[id],note:'Reviewed immutable native closure proof'});
const grant={id,node,instance:generation,kind:'HOST',key:'fixture',owner:'901',ceiling:'9007199254740993',expiresAt:'2030-01-01 00:00:00.123456+00',expiresMs:'1893456000123',closedUsage:null,closedRevision:null,subject,currentSubject:subject,origin:'ISSUED',revision:'20'};
const entry={id,group:'host:fixture',owner:'901',ceiling:'9007199254740000',reserved:'7',expiresAt:1893456000123,closed:true,scale:100};
const source={generation,instance:generation,sequence:2,policyRevision:'10',coreProcessId:node,entries:[entry],digest:'a'.repeat(64)};
test('native irreversible closure returns exact unused SQL liability including an undelivered top-up, without changing user traffic',()=>{
 const result=plan(node,source,'b'.repeat(64),input,[grant]);assert.equal(result.plan.totalReturned,'9007199254740986');assert.equal(result.plan.changes[0].grant.expiresAt,grant.expiresAt);assert.equal(result.digest,settlementDigest(result.text));
 assert.equal(plan(node,source,'b'.repeat(64),input,[{...grant,closedUsage:'7',closedRevision:'15'}]).plan.totalReturned,'0');
});
test('unknown, legacy or reused owner identity cannot be treated as proven by the old numeric ID',()=>{
 for(const patch of [{origin:'LEGACY',subject:null},{currentSubject:generation},{currentSubject:null}])assert.throws(()=>plan(node,source,'b'.repeat(64),input,[{...grant,...patch}]),/OWNER_UNPROVEN/);
});
test('active, changed or malformed native bindings cannot release a reserve',()=>{
 for(const patch of [{closed:false},{reserved:'9007199254740001'},{group:'tag:fixture'},{owner:'902'},{expiresAt:1893456000124},{scale:1000000000}])assert.throws(()=>plan(node,{...source,entries:[{...entry,...patch}]},'b'.repeat(64),input,[grant]),/BINDING_CHANGED/);
 for(const patch of [{revision:'9'},{instance:node},{closedUsage:'8'},{ceiling:'not-an-integer'}])assert.throws(()=>plan(node,source,'b'.repeat(64),input,[{...grant,...patch}]),/BINDING_CHANGED/);
 assert.throws(()=>plan(node,source,'b'.repeat(64),{...input,ids:[id,id]},[grant]),/BINDING_CHANGED/);
 assert.throws(()=>plan(node,source,'b'.repeat(64),input,[]),/BINDING_CHANGED/);
 assert.throws(()=>settlementDraft.parse({...input,amount:'0'}));
});
