const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const load=require('./load-typescript.cjs');
const selection=load(path.join(__dirname,'../src/modules/hosts/limit-selection.ts'));
const {limitActionSchema,listUsersSchema,limitSelectionStateSchema,unlimitedLimitSchema}=load(path.join(__dirname,'../src/modules/hosts/limits.controller.ts'),{
 '@common/decorators/roles/roles':{Roles:()=>()=>{}},
 '@common/decorators/scopes':{ApiScopeEndpoint:()=>()=>{},ApiScopeResource:()=>()=>{}},
 '@common/guards/jwt-guards/def-jwt-guard':{JwtDefaultGuard:class{}},'@common/guards/roles/roles.guard':{RolesGuard:class{}},'@common/guards/scopes':{ScopesGuard:class{}},
 '@libs/contracts/api':{CONTROLLERS_INFO:{LIMITS:{tag:'Limits',resource:'limits'}}},
 '@libs/contracts/constants':{ROLE:{ADMIN:'ADMIN',API:'API'},getEndpointDetails:()=>({})},
 './limits.service':{},'./limit-selection':selection,
});
const base={kind:'TAG',key:'alpha',action:'ADD',amountBytes:1024,requestId:'11111111-1111-4111-8111-111111111111',selection:{type:'ALL'}};
test('limit targets are explicit; individual IDs normalized, bounded and cannot smuggle filters',()=>{
 assert.equal(limitActionSchema.safeParse(base).success,true);
 assert.deepEqual(limitActionSchema.parse({...base,selection:{type:'SELECTED',userIds:['902','901','902']}}).selection.userIds,['901','902']);
 for(const target of [undefined,{type:'SELECTED',userIds:[]},{type:'SELECTED',userIds:['9223372036854775808']},{type:'SELECTED',userIds:['1 OR 1=1']},{type:'ALL',userIds:['901']},{type:'SQUAD',squadType:'EXTERNAL',squadUuid:'bad'}])assert.equal(limitActionSchema.safeParse({...base,selection:target}).success,false);
 for(const amountBytes of [-1,0,1.5,Number.MAX_SAFE_INTEGER+1])assert.equal(limitActionSchema.safeParse({...base,amountBytes}).success,false);
 assert.equal(limitActionSchema.safeParse({...base,action:'RESET'}).success,false);
 assert.equal(limitActionSchema.safeParse({...base,kind:'HOST'}).success,false);
});
test('limit endpoints require their own token scopes, with writes isolated from reads',()=>{
 const {endpoints,authorize,ROLE}=require('./api-permissions-fixture.cjs');
 const limits=endpoints.filter(e=>e.url.startsWith('/api/limits'));
 assert.equal(limits.length,6);
 for(const endpoint of limits){
   const scope=endpoint.url==='/api/limits'? 'limits:list':`limits:${endpoint.url.split('/').at(-1)}`;
   assert.equal(authorize(endpoint,ROLE.ADMIN),true);
   assert.equal(authorize(endpoint,ROLE.API,[scope]),true,scope);
   assert.equal(authorize(endpoint,ROLE.API,[]),false);
   assert.equal(authorize(endpoint,ROLE.API,[scope==='limits:actions'?'limits:list':'limits:actions']),false);
 }
 for(const [method,url,scope] of [['GET','/api/hosts/panel-tag-limits','hosts:tag-limits-list'],['PUT','/api/hosts/panel-tag-limits','hosts:tag-limits-set'],['DELETE','/api/hosts/panel-tag-limits','hosts:tag-limits-delete']]){
   const endpoint=endpoints.find(e=>e.method===method&&e.url===url);
   assert.ok(endpoint);assert.equal(authorize(endpoint,ROLE.ADMIN),true);
   assert.equal(authorize(endpoint,ROLE.API,[scope]),false);
   assert.equal(authorize(endpoint,ROLE.API,['*']),false);
 }
 assert.equal(endpoints.some(e=>e.url==='/api/hosts/tag-limits'),false);
});
test('selection state accepts only a valid scope and explicit recipient selection',()=>{
 const base={kind:'TAG',key:'alpha',selection:{type:'ALL'}};
 assert.equal(limitSelectionStateSchema.safeParse(base).success,true);
 for(const invalid of [
  {selection:{type:'SELECTED',userIds:[]}},
  {selection:{type:'ALL',userIds:['1']}},
  {kind:'HOST'},
  {key:''},
  {unexpected:true}
 ])assert.equal(limitSelectionStateSchema.safeParse({...base,...invalid}).success,false);
});
test('paused host or one paused tag hides only that host; bonus extends effective quota',()=>{
 const {isHostTrafficLimited}=load(path.join(__dirname,'../src/modules/hosts/utils/host-traffic-limit.ts'));
 const host={tagTrafficLimits:[],usedBytes:'110',userTrafficLimitBytes:100n,effectiveLimitBytes:120n,trafficPaused:false};
 assert.equal(isHostTrafficLimited(host),false);
 assert.equal(isHostTrafficLimited({...host,trafficPaused:true}),true);
 assert.equal(isHostTrafficLimited({...host,tagTrafficLimits:[{paused:true,limitBytes:0n,usedBytes:0n}]}),true);
 assert.equal(isHostTrafficLimited({...host,effectiveLimitBytes:100n}),true);
});


test('limit table query validates pagination, filters and sort identifiers',()=>{
 const base={kind:'TAG',key:'alpha'};
 assert.equal(listUsersSchema.parse(base).pageSize,50);
 assert.equal(listUsersSchema.parse({...base,pageSize:'100',search:' name '}).search,'name');
 for(const invalid of [{sort:'usedBytes;drop table users'},{direction:'random'},{pageSize:100000},{page:0},{state:'unknown'},{status:'unknown'},{search:'x'.repeat(101)}])
  assert.equal(listUsersSchema.safeParse({...base,...invalid}).success,false);
});

test('unlimited has its own strict API contract and cannot bypass ordinary action permission',()=>{
 const request={kind:'TAG',key:'alpha',enabled:true,requestId:base.requestId,selection:{type:'SELECTED',userIds:['901']}};
 assert.equal(unlimitedLimitSchema.safeParse(request).success,true);
 assert.equal(unlimitedLimitSchema.safeParse({...request,enabled:false,selection:{type:'ALL'}}).success,true);
 for(const invalid of [{enabled:'true'},{amountBytes:1},{action:'UNLIMITED'},{selection:{type:'ALL',userIds:['901']}},{enabled:undefined}])
  assert.equal(unlimitedLimitSchema.safeParse({...request,...invalid}).success,false);
 assert.equal(limitActionSchema.safeParse({...base,action:'UNLIMITED',amountBytes:0}).success,false);
 assert.equal(limitActionSchema.safeParse({...base,action:'LIMITED',amountBytes:0}).success,false);
 const {catalog,endpoints,authorize,ROLE}=require('./api-permissions-fixture.cjs');
 const endpoint=endpoints.find(e=>e.url==='/api/limits/unlimited');
 assert.equal(catalog.findInvalidScopes(['limits:unlimited']).length,0);
 for(const scopes of [['limits:actions'],['limits:read'],['limits:list'],[]])assert.equal(authorize(endpoint,ROLE.API,scopes),false);
 for(const scopes of [['limits:unlimited'],['limits:write'],['limits:*'],['*']])assert.equal(authorize(endpoint,ROLE.API,scopes),true);
});
