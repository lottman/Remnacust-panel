const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const load=require('./load-typescript.cjs');
const {quotaPolicyProof}=load(path.join(__dirname,'../src/common/host-policy/quota-policy-proof.ts'));
const G='ff29ee68-a625-4160-9573-cc17de317a5d',A='ef29ee68-a625-4160-9573-cc17de317a5d';
function body(){return {userQuota:'remnacust-user-quota-reserves-v1',legacyGroups:['user:global'],legacyOwners:{'9007199254740993':{allowed:true},'2':{allowed:false}},groups:{'user:global':{reserveRequired:true,reserves:{'9007199254740993':{id:G,ceiling:'9007199254740993'}},unreservedAccounts:{'9007199254740993':A}},'host:a':{},'tag:one':{reserveRequired:true,unlimitedOwners:{'9007199254740993':true}},'tag-total:one':{}},hosts:{a:{groups:['host:a','tag:one','tag-total:one','user:global'],allowedIdentities:{'9007199254740993~0123456789abcdef01234567':true,'3~0123456789abcdef01234567':false}},b:{groups:[],allowedIdentities:{'9007199254740993~abcdef0123456789abcdef01':true},userQuotaExempt:true}}};}
test('bounded entitlement proof preserves finite/unlimited modes, recovery and int64 without credentials',()=>{
 const result=quotaPolicyProof(body());assert.equal(result.proof.userQuota,true);
 assert.deepEqual(result.proof.scopes['user:global']['9007199254740993'],['R',G,'9007199254740993',A,true]);
 assert.deepEqual(result.proof.scopes['user:global']['2'],['R',null,null,null,false]);
 assert.deepEqual(result.proof.scopes['host:a']['9007199254740993'],['U',null,null,null,false]);
 assert.equal(result.proof.scopes['tag:one']['9007199254740993'][0],'U');assert.equal(result.proof.scopes['tag-total:one'],undefined);
 assert.equal(JSON.stringify(result.proof).includes('0123456789abcdef'),false);assert.equal(result.proof.scopes['host:a']['3'],undefined);
});
test('proof hash ignores refresh revision and SQL ordering but changes for fences, grants, accounts or recovery',()=>{
 const value=body(),original=quotaPolicyProof(value).source;
 value.hosts=Object.fromEntries(Object.entries(value.hosts).reverse());value.groups=Object.fromEntries(Object.entries(value.groups).reverse());value.revision='9007199254740993';assert.equal(quotaPolicyProof(value).source,original);
 for(const change of [b=>b.groups['user:global'].fencedOwners={'9007199254740993':true},b=>b.groups['user:global'].reserves['9007199254740993'].ceiling='7',b=>delete b.groups['user:global'].unreservedAccounts['9007199254740993'],b=>delete b.hosts.b.userQuotaExempt]){const next=body();change(next);assert.notEqual(quotaPolicyProof(next).source,original);}
 const fenced=body();fenced.groups['user:global'].fenceAll=true;assert.equal(quotaPolicyProof(fenced).proof.scopes['user:global']['9007199254740993'][0],'F');
});
test('invalid source bindings cannot become durable acknowledgement evidence',()=>{
 for(const change of [b=>b.hosts.a.groups.push('host:missing'),b=>b.legacyOwners['01']={allowed:true},b=>b.groups['user:global'].reserves['9007199254740993'].ceiling=7,b=>b.groups['user:global'].reserves['9007199254740993'].ceiling='9223372036854775808',b=>b.groups['user:global'].reserves['9007199254740993'].id='unknown',b=>b.groups['user:global'].unlimitedOwners={'9007199254740993':true}]){const next=body();change(next);assert.throws(()=>quotaPolicyProof(next));}
});
