const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fixture = require('./api-permissions-fixture.cjs');
const {catalog,endpoints,authorize,ROLE,reflector,GUARDS_METADATA} = fixture;
const blocked = require('./panel-only-api-routes.cjs');

test('all 30 excluded operations deny every token scope but keep administrator access',()=>{
    for(const [method,url,oldScope] of blocked) {
        const endpoint = endpoints.find(e=>e.method===method&&e.url===url);
        assert.ok(endpoint,`${method} ${url} missing`);
        assert.equal(authorize(endpoint,ROLE.ADMIN),true,url);
        for(const scopes of [['*'],[`${url.split('/')[2]}:*`],[`${url.split('/')[2]}:read`],[`${url.split('/')[2]}:write`],[oldScope],[]])
            assert.equal(authorize(endpoint,ROLE.API,scopes),false,`${url}: ${scopes}`);
        assert.ok(!catalog.getCatalog().some(e=>e.method===method&&e.path===url));
        assert.equal(Reflect.getMetadata('swagger/apiExcludeEndpoint',endpoint.handler)?.disable,true,url);
    }
});
test('every token-accessible administrative HTTP method has a selectable enforced scope',()=>{
    // Enumerate declared API routes even when their authorization metadata is broken.
    const available = endpoints.filter(e=>reflector.getAllAndOverride(ROLE,[e.handler,e.controller])?.includes(ROLE.API));
    for(const endpoint of available) {
        assert.ok(reflector.getAllAndOverride('scope_resource',[endpoint.handler,endpoint.controller]),`Missing resource: ${endpoint.url}`);
        const scope = catalog.getCatalog().find(e=>e.path===endpoint.url&&e.method===endpoint.method);
        assert.ok(scope,`Missing scope: ${endpoint.method} ${endpoint.url}`);
        assert.equal(authorize(endpoint,ROLE.API,[scope.key]),true,scope.key);
        assert.equal(authorize(endpoint,ROLE.API,[]),false,scope.key);
        assert.equal(authorize(endpoint,ROLE.API,['unrelated:read']),false,scope.key);
        const guards=reflector.getAllAndOverride(GUARDS_METADATA,[endpoint.handler,endpoint.controller]);
        assert.ok(guards.some(guard=>guard.name==='ScopesGuard'),`ScopesGuard missing: ${endpoint.url}`);
    }
    assert.equal(available.length,210);
    assert.equal(catalog.getCatalog().length,210);
    assert.deepEqual(catalog.findInvalidScopes(blocked.map(row=>row[2])),blocked.map(row=>row[2]));
    assert.equal(catalog.getCatalog().some(row=>['backups','node-ssh','remnawave-settings'].includes(row.resource)),false);
});
test('missing or incomplete scope metadata denies every API grant while preserving administrator access',()=>{
    const details={SCOPE:'list',SCOPE_KIND:'read'};
    for(const [resource,metadata] of [
        [undefined,undefined], [undefined,details], ['example',undefined],
        ['example',{SCOPE:'list'}], ['example',{SCOPE_KIND:'read'}],
    ]) {
        const controller=class {}, handler=()=>{};
        Reflect.defineMetadata(ROLE,[ROLE.ADMIN,ROLE.API],controller);
        if(resource) Reflect.defineMetadata('scope_resource',resource,controller);
        if(metadata) Reflect.defineMetadata('scope_endpoint',metadata,handler);
        const endpoint={controller,handler};
        for(const scopes of [[],['*'],['example:*'],['example:read'],['example:list']])
            assert.equal(authorize(endpoint,ROLE.API,scopes),false,JSON.stringify({resource,metadata,scopes}));
        assert.equal(authorize(endpoint,ROLE.ADMIN),true);
    }
});

test('tokens cannot edit their own privileges or create another token, even with global access',()=>{
    for(const endpoint of endpoints.filter(e=>e.controller.name==='ApiTokensController')) {
        assert.equal(authorize(endpoint,ROLE.ADMIN),true);
        assert.equal(authorize(endpoint,ROLE.API,['*']),false,endpoint.name);
    }
    assert.ok(endpoints.some(e=>e.method==='PATCH'&&e.url==='/api/tokens/{uuid}'));
});
test('granular write privileges do not grant sibling methods',()=>{
    for(const scope of catalog.getCatalog().filter(e=>['nodes','hwid-user-devices','limits'].includes(e.resource))) {
        for(const other of catalog.getCatalog().filter(e=>e.resource===scope.resource&&e.key!==scope.key)) {
            const endpoint=endpoints.find(e=>e.method===other.method&&e.url===other.path);
            assert.equal(authorize(endpoint,ROLE.API,[scope.key]),false,`${scope.key} must not grant ${other.key}`);
        }
    }
});
test('changing token permissions preserves its identity and expiry without signing a replacement',async()=>{
    const load=require('./load-typescript.cjs');
    const {Prisma}=require('@prisma/client');
    const tokens={INVALID_API_TOKEN_SCOPE:'invalid',INTERNAL_SERVER_ERROR:'internal',REQUESTED_TOKEN_NOT_FOUND:'missing'};
    const {ApiTokensService}=load(path.join(__dirname,'../src/modules/api-tokens/api-tokens.service.ts'),{
        '@common/types':{ok:response=>({isOk:true,response}),fail:error=>({isOk:false,error})},
        '@libs/contracts/constants':{ERRORS:tokens},
        '@modules/auth/commands/sign-ott-token/sign-ott-token.command':{},
        '@integration-modules/notifications/interfaces':{},
        '../auth/commands/sign-api-token/sign-api-token.command':{},
        './entities/api-token.entity':{},
        './models':{},
    });
    let record={uuid:'same',name:'before',scopes:['*'],expireAt:new Date('2030-01-01'),createdAt:new Date('2025-01-01')};
    let writes=0;
    const repo={update:async data=>{writes++;record={...record,...data};return record}};
    const invalidated=[];
    const service=new ApiTokensService({del:async key=>invalidated.push(key)},repo,{execute:()=>assert.fail('must not issue JWT')},{},catalog,{});
    const result=await service.update('same',{name:'limited',scopes:['hwid-user-devices:block','hwid-user-devices:block']});
    assert.equal(result.isOk,true);assert.equal(record.uuid,'same');assert.equal(record.expireAt.toISOString(),'2030-01-01T00:00:00.000Z');
    assert.deepEqual(record.scopes,['hwid-user-devices:block']);assert.deepEqual(invalidated,['api:same']);
    assert.equal((await service.update('same',{name:'bad',scopes:['nodes:core-status']})).isOk,false);assert.equal(writes,1);
    assert.equal((await service.update('same',{name:'disabled',scopes:[]})).isOk,true);assert.deepEqual(record.scopes,[]);
    service.rawCacheService.del=async()=>{throw new Error('cache unavailable')};
    assert.equal((await service.update('same',{name:'cache failure',scopes:['hwid-user-devices:block']})).isOk,true);
    repo.update=async()=>{throw new Prisma.PrismaClientKnownRequestError('missing',{code:'P2025',clientVersion:'test'})};
    assert.equal((await service.update('missing',{name:'gone',scopes:[]})).error,'missing');
});

test('checkbox selections never become broader wildcard grants',()=>{
    const load=require('./load-typescript.cjs');
    const {buildScopes,expandScopesToKeys}=load(path.join(__dirname,'../../frontend/src/widgets/remnawave-settings/api-tokens-card/modals/scopes.utils.tsx'),{
        '@shared/ui/logos':{XrayLogo:()=>null},
    });
    const resources=catalog.getGroupedCatalog().resources;
    const all=new Set(resources.flatMap(r=>r.endpoints.map(e=>e.key)));
    const built=buildScopes(resources,all);
    assert.equal(built.length,210);assert.ok(!built.includes('*'));
    assert.ok(built.every(scope=>!scope.endsWith(':*')&&!scope.endsWith(':read')&&!scope.endsWith(':write')));
    const fullKeys=expandScopesToKeys(resources,['*']);assert.equal(fullKeys.length,210);
    const one=buildScopes(resources,new Set(['hwid-user-devices:block']));assert.deepEqual(one,['hwid-user-devices:block']);
    assert.deepEqual(buildScopes(resources,new Set()),[]);
    assert.deepEqual(expandScopesToKeys(resources,['nodes:core-status']),[]);
});
