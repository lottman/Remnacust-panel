const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const load=require('./load-typescript.cjs');
const root=path.join(__dirname,'../src/common/host-policy');
const N='cccccccc-cccc-4ccc-8ccc-cccccccccccc',I='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',H='11111111-1111-4111-8111-111111111111',R='22222222-2222-4222-8222-222222222222';
function fixture(){
 const calls=[],grants=[];const sql=(strings,...values)=>({execute:async()=>{const query=strings.join('');calls.push({query,values});return {rows:query.includes('FROM xera_quota_reserves')?grants:[]};}});sql.join=values=>values;
 const {renderUserQuotaPolicy,USER_QUOTA_VERSION}=load(path.join(root,'user-quota-policy.ts'),{kysely:{sql}});
 const state={hosts:[{uuid:H},{uuid:R,alwaysAvailable:true}],users:[{userId:'901',allowed:true,expireAt:new Date('2099-01-01'),limit:'1000'},{userId:'902',allowed:false,expireAt:new Date('2020-01-01'),limit:'0'}],consumptionMultiplier:'1500000000'};
 const body={version:'xera-host-policy-v2',offlineReserves:'remnacust-quota-reserves-v1',revision:'17',protectedInbounds:['private'],groups:{},hosts:{}};
 for(const h of state.hosts){const key=h.uuid.replaceAll('-',''),email='901~0123456789abcdef01234567~h'+key;body.hosts[key]={inboundTag:'private',groups:[],allowedIdentities:{[email]:true},identityExpiresAt:{[email]:Date.parse('2099-01-01')},domainMode:'OFF',domains:[]};}
 const mode={phase:'ACTIVE',instance:I,userQuota:true};const render=()=>renderUserQuotaPolicy({kysely:{}},N,mode,state,body,'17');
 return {calls,grants,state,body,mode,render,USER_QUOTA_VERSION};
}

test('a shared global reserve covers ordinary hosts and legacy devices using the node billing factor; recovery is explicit',async()=>{
 const f=fixture();f.grants.push({id:'33333333-3333-4333-8333-333333333333',instance:I,owner:'901',ceiling:'9007199254740993',expiresAt:new Date('2099-01-01'),epoch:'44444444-4444-4444-8444-444444444444',window:new Date('1970-01-01')});
 f.mode.phase='FENCING';await f.render();
 const global=f.body.groups['user:global'];assert.equal(global.multiplierScale,1000000000);assert.equal(global.fenceAll,true);assert.equal(global.reserves['901'].ceiling,'9007199254740993');
 assert.deepEqual(f.body.legacyGroups,['user:global']);assert.deepEqual(f.body.legacyQuotaMultipliers,{'user:global':1500000000});assert.equal(f.body.legacyOwners['902'].allowed,false);assert.equal(global.unlimitedOwners['902'],true);assert.equal(global.blockedOwners['902'],true);
 assert.deepEqual(f.body.hosts[H.replaceAll('-','')].groups,['user:global']);assert.equal(f.body.hosts[H.replaceAll('-','')].quotaMultipliers['user:global'],1500000000);
 assert.equal(f.body.hosts[R.replaceAll('-','')].userQuotaExempt,true);assert.deepEqual(f.body.hosts[R.replaceAll('-','')].groups,[]);
 assert.equal(f.calls.filter(c=>c.query.includes('INSERT INTO xera_quota_node_epochs')).length,1);
 // Validate the actual generated body against the actual node-side Zod schema.
 const nodeRoot=process.env.REMNACUST_NODE_SOURCE||'D:/dedik/Remnacust-node/node';
 const nest={};for(const name of ['UseGuards','Controller','Get','Post','Body','Headers'])nest[name]=()=>()=>{};
 const schema=load(path.join(nodeRoot,'src/modules/xray-core/host-policy.controller.ts'),{
  '@nestjs/common':nest,'@common/guards/jwt-guards':{},'@common/utils/destination-rule':load(path.join(root,'destination-rule.ts')),
  './core-incarnation':{},'./live-core.service':{},'./core-management':{},'./xray-process.service':{},'./usage-receipt':load(path.join(nodeRoot,'src/modules/xray-core/usage-receipt.ts')),
  './quota-ledger':{QUOTA_RESERVE_VERSION:'remnacust-quota-reserves-v1'},
  './user-quota':{USER_QUOTA_VERSION:f.USER_QUOTA_VERSION,USER_QUOTA_SCALE:1000000000,USER_QUOTA_MAX_FACTOR:100000000000},
 }).hostPolicySchema;
 assert.equal(schema.safeParse(f.body).success,true,'Panel global policy must satisfy the node contract');
});

test('missing entitlements, malformed factors and changed grant identity cannot manufacture an unlimited policy',async()=>{
 for(const mutate of [f=>delete f.state.users,f=>f.state.consumptionMultiplier='1.5',f=>f.state.consumptionMultiplier='100000000001',f=>f.state.users.push(f.state.users[0]),f=>f.state.users[0].expireAt=new Date(NaN),f=>f.state.users[0].limit='-1',f=>f.mode.instance=null]){
  const f=fixture();mutate(f);await assert.rejects(f.render());assert.equal(f.calls.some(c=>c.query.includes('INSERT')),false);
 }
 const f=fixture();f.grants.push({id:'id',instance:N,owner:'901',expiresAt:new Date('2099-01-01')});await assert.rejects(f.render(),/identity recovery/);assert.equal(f.calls.some(c=>c.query.includes('INSERT')),false);
});

test('unknown/departed owners get no grant and legacy mode does not opt into global quotas',async()=>{
 const f=fixture();f.grants.push({id:'unrelated',instance:I,owner:'903',expiresAt:new Date('2099-01-01')});await f.render();assert.deepEqual(f.body.groups['user:global'].reserves,{});
 const legacy=fixture();legacy.mode.userQuota=false;await legacy.render();assert.equal(legacy.calls.length,0);assert.equal(legacy.body.userQuota,undefined);
});
