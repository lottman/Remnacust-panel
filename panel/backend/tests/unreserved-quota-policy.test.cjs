const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const load=require('./load-typescript.cjs');
const N='cccccccc-cccc-4ccc-8ccc-cccccccccccc',I='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',H='11111111-1111-4111-8111-111111111111',R='22222222-2222-4222-8222-222222222222';
const A='ff29ee68-a625-4160-9573-cc17de317a5d',B='ef29ee68-a625-4160-9573-cc17de317a5d';
function fixture(){
 const queries=[],accounts=[],deliveries=[];
 const sql=(parts,...values)=>({execute:async()=>{const query=parts.join('');queries.push({query,values});if(query.includes('WITH scopes AS'))return {rows:accounts};if(query.includes('INSERT INTO xera_quota_usage_deliveries')){deliveries.push(...JSON.parse(values[4]));return {rows:[]};}throw Error(query);}});
 const {renderUnreservedQuotaPolicy}=load(path.join(__dirname,'../src/common/host-policy/unreserved-quota-policy.ts'),{kysely:{sql}});
 const state={groups:[{key:'host:'+H,nodeUuids:[N],anchor:new Date('1970-01-01'),resetValue:0,resetUnit:'DAYS'},{key:'tag:alpha',nodeUuids:[N],anchor:new Date('1970-01-01'),resetValue:0,resetUnit:'DAYS'},{key:'tag-total:alpha',nodeUuids:[N]}]};
 const body={groups:{['host:'+H]:{},'tag:alpha':{},'tag-total:alpha':{}},hosts:{[H]:{groups:['host:'+H,'tag:alpha','tag-total:alpha'],allowedIdentities:{'901~0123456789abcdef01234567':true},quotaMultipliers:{['host:'+H]:150,'tag:alpha':75}}}};
 const mode={phase:'ACTIVE',instance:I,userQuota:false};
 const render=()=>renderUnreservedQuotaPolicy({kysely:{}},N,mode,state,body,'17');
 return {render,mode,state,body,queries,accounts,deliveries};
}
test('renderer reuses current banks and batches their price provenance without inventing a bank or grant',async()=>{
 const f=fixture();f.accounts.push({scope:'host:'+H,owner:'901',account:A},{scope:'tag:alpha',owner:'901',account:B});await f.render();
 assert.deepEqual(f.body.groups['host:'+H].unreservedAccounts,{'901':A});assert.equal(f.body.groups['host:'+H].reserveRequired,undefined,'an old bank still tracks quota-off traffic');
 assert.deepEqual(f.deliveries,[{account:A,factor:150,scale:100},{account:B,factor:75,scale:100}]);
 assert.equal(f.queries.length,2);const request=f.queries[0];assert.match(request.query,/xera_current_quota_epoch/);assert.match(request.query,/expires_at>now/);
 assert.deepEqual(JSON.parse(request.values[1]),[{scope:'host:'+H,owner:'901'},{scope:'tag:alpha',owner:'901'}]);
 assert.equal(JSON.parse(request.values[0]).some(s=>s.scope==='tag-total:alpha'),false);
});
test('host permission and tag opt-outs exclude owners while each delivered coefficient remains distinct',async()=>{
 const f=fixture();f.body.hosts[R]={groups:['tag:alpha'],allowedIdentities:{'901~abcdef0123456789abcdef01':true,'902~abcdef0123456789abcdef01':false},quotaMultipliers:{'tag:alpha':200}};
 f.accounts.push({scope:'tag:alpha',owner:'901',account:A});await f.render();assert.deepEqual(f.deliveries,[{account:A,factor:75,scale:100},{account:A,factor:200,scale:100}]);
 assert.equal(JSON.parse(f.queries[0].values[1]).some(o=>o.owner==='902'),false);
 const g=fixture();g.body.hosts[H].groups=['host:'+H];g.accounts.push({scope:'host:'+H,owner:'901',account:A});await g.render();assert.equal(JSON.parse(g.queries[0].values[1]).some(o=>o.scope==='tag:alpha'),false);
});
test('global legacy and recovery owners keep nano precision, including a free coefficient without an invalid zero-price counter',async()=>{
 const f=fixture();f.mode.userQuota=true;f.body.groups['user:global']={};f.body.legacyGroups=['user:global'];f.body.legacyOwners={'901':{allowed:true},'903':{allowed:false}};f.body.legacyQuotaMultipliers={'user:global':1500000000};
 f.accounts.push({scope:'user:global',owner:'901',account:A},{scope:'user:global',owner:'903',account:B});await f.render();assert.deepEqual(f.deliveries,[{account:A,factor:1500000000,scale:1000000000},{account:B,factor:1500000000,scale:1000000000}]);
 const g=fixture();g.mode.userQuota=true;g.body.groups['user:global']={};g.body.legacyGroups=['user:global'];g.body.legacyOwners={'901':{allowed:true}};g.body.legacyQuotaMultipliers={'user:global':0};g.accounts.push({scope:'user:global',owner:'901',account:A});await g.render();assert.equal(g.body.groups['user:global'].unreservedAccounts['901'],A);assert.deepEqual(g.deliveries,[]);
});
test('never-managed unlimited owners get no new bank and malformed bindings cannot publish provenance',async()=>{
 const f=fixture();await f.render();assert.deepEqual(f.deliveries,[]);assert.equal(f.queries.length,1);assert.equal(f.body.groups['host:'+H].unreservedAccounts,undefined);
 for(const mutate of [f=>f.mode.instance=null,f=>f.accounts[0].owner='902',f=>f.accounts[0].account='00000000-0000-0000-0000-000000000000',f=>f.accounts.push({...f.accounts[0]}),f=>delete f.body.hosts[H].quotaMultipliers['host:'+H]]){const g=fixture();g.accounts.push({scope:'host:'+H,owner:'901',account:A});mutate(g);await assert.rejects(g.render());assert.deepEqual(g.deliveries,[]);}
});
