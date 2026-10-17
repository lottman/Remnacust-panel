const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const load=require('./load-typescript.cjs');
const file=path.join(__dirname,'../src/common/host-policy/quota-transition-policy.ts');
test('owner transfer fences and seals only its old grant while preserving account, pricing and other owners',async()=>{
    const sql=()=>({execute:async()=>({rows:[{group:'tag:alpha_beta',owner:'901',phase:'FUNDING'},{group:'host:removed',owner:'901',phase:'FENCING'}]})});
    const {renderQuotaTransitionPolicy}=load(file,{kysely:{sql}});
    const body={groups:{'tag:alpha_beta':{reserveRequired:false,reserves:{901:{id:'old'},902:{id:'other'}},
        unreservedAccounts:{901:'account'},fencedOwners:{903:true}}},hosts:{}};
    await renderQuotaTransitionPolicy({kysely:{}},'node',body);
    assert.deepEqual(body.groups['tag:alpha_beta'].fencedOwners,{901:true,903:true});
    assert.deepEqual(body.groups['tag:alpha_beta'].reserves,{902:{id:'other'}});
    assert.deepEqual(body.groups['tag:alpha_beta'].unreservedAccounts,{901:'account'});
    assert.equal(body.groups['tag:alpha_beta'].reserveRequired,false);
    assert.equal(body.groups['host:removed'],undefined,'Removed authorization must not be recreated');
});
test('transition overlay refuses an oversized set before changing any policy',async()=>{
    const sql=()=>({execute:async()=>({rows:Array.from({length:200001}).fill({group:'user:global',owner:'1'})})});
    const {renderQuotaTransitionPolicy}=load(file,{kysely:{sql}});const body={groups:{'user:global':{}},hosts:{}};
    await assert.rejects(renderQuotaTransitionPolicy({kysely:{}},'node',body),/exceeds limit/);
    assert.deepEqual(body.groups,{'user:global':{}});
});
