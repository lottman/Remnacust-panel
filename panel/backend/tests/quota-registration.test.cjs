const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('./load-typescript.cjs');
const {verifyQuotaRegistrations}=load(path.join(__dirname,'../src/common/host-policy/quota-registration.ts'));
const id='11111111-1111-4111-8111-111111111111',instance='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(action='prepare'){
 const item={grant:{id,instance,ceiling:'9223372036854775807',expiresAt:253402300799000,registrationRequired:true},group:'user:global',owner:'9007199254740993',scale:1000000000,action,allowMissing:action==='cancel'};
 const report={instance,sequence:21,policyRevision:'9007199254740993',entries:[{id,group:item.group,owner:item.owner,expiresAt:item.grant.expiresAt,ceiling:item.grant.ceiling,reserved:'0',prepared:true,activated:false,closed:action==='cancel',scale:item.scale}],missingIds:[],nextAfter:null};
 return {item,report,verify:r=>verifyQuotaRegistrations(r,[item],report.policyRevision,instance)};
}
test('durable registration proof preserves exact int64 and binds revision, journal, scope, scale and owner',()=>{
 const f=fixture();assert.equal(f.verify(f.report).entries[0].ceiling,'9223372036854775807');
 for(const change of [r=>r.instance=id,r=>r.policyRevision='2',r=>r.entries[0].id=instance,r=>r.entries[0].owner='1',r=>r.entries[0].group='host:other',r=>r.entries[0].scale=100,r=>r.entries[0].expiresAt++,r=>r.entries[0].ceiling='9007199254740993']){
  const r=structuredClone(f.report);change(r);assert.throws(()=>f.verify(r));
 }
});
test('missing, duplicate, used, unprepared or closed stage entries cannot authorize activation',()=>{
 const f=fixture();
 for(const change of [r=>{r.entries=[];r.missingIds=[id]},r=>r.entries.push(r.entries[0]),r=>r.entries[0].activated=true,r=>r.entries[0].closed=true,r=>r.entries[0].prepared=false,r=>r.entries[0].reserved='1']){
  const r=structuredClone(f.report);change(r);assert.throws(()=>f.verify(r));
 }
});
test('cancellation requires a real permanently closed record and never replaces used bytes with zero',()=>{
 const f=fixture('cancel');f.report.entries[0].activated=true;f.report.entries[0].reserved='9007199254740993';
 assert.equal(f.verify(f.report).entries[0].reserved,'9007199254740993');
 for(const change of [r=>r.entries[0].closed=false,r=>r.entries[0].prepared=false,r=>r.entries[0].reserved='9223372036854775808',r=>{r.entries=[];r.missingIds=[id]}]){
  const r=structuredClone(f.report);change(r);assert.throws(()=>f.verify(r));
 }
});
