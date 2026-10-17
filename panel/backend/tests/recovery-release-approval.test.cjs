const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {releaseNodeRequestId,releaseDraft,releaseApproval}=require('./load-typescript.cjs')(path.join(__dirname,'../src/common/host-policy/quota-recovery-release.service.ts'),{'@common/database':{},'@common/axios':{}});
test('release operation names remain stable per approval and node and satisfy the Node UUID boundary',()=>{
 const approval=randomUUID(),node=randomUUID(),first=releaseNodeRequestId(approval,node);
 assert.equal(first,releaseNodeRequestId(approval,node));assert.notEqual(first,releaseNodeRequestId(randomUUID(),node));assert.notEqual(first,releaseNodeRequestId(approval,randomUUID()));assert.match(first,/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const draft={requestId:first,generation:approval,bankRequest:node,note:'Reviewed source and held policies'};assert.equal(releaseDraft.safeParse(draft).success,true);assert.equal(releaseApproval.safeParse({...draft,planDigest:'a'.repeat(64)}).success,true);
});
test('approval bodies reject supplied actors, node subsets, malformed digests and invalid PostgreSQL text',()=>{
 const valid={requestId:randomUUID(),generation:randomUUID(),bankRequest:randomUUID(),note:'Reviewed original financial source',planDigest:'a'.repeat(64)};
 for(const bad of [{...valid,actor:randomUUID()},{...valid,nodes:[]},{...valid,planDigest:'A'.repeat(64)},{...valid,note:'missing'+String.fromCharCode(0)+'source'},{...valid,note:'unpaired-'+String.fromCharCode(0xd800)},{...valid,note:'short'}])assert.equal(releaseApproval.safeParse(bad).success,false);
});
