const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const jwt=require('jsonwebtoken');
const {Module,Inject}=require('@nestjs/common');
const {NestFactory,Reflector}=require('@nestjs/core');
const load=require('./load-typescript.cjs');
const fixture=require('./api-permissions-fixture.cjs');
const constants=require('../libs/contract/build/backend');
const file=name=>path.join(__dirname,'../src',name);

test('all six port-plan HTTP operations require a current browser administrator, including preview and retry',async()=>{
    const secret=randomBytes(32).toString('hex');
    const admin={uuid:'aaaaaaaa-1111-4111-8111-111111111111',username:'port-owner',passwordHash:'test-only-password-hash'};
    const session=load(file('common/utils/admin-session.ts'));
    const claims=session.createAdminSessionClaims(admin,secret);
    const active=new Set([session.adminSessionKey(claims.jti)]);
    const config={getOrThrow:()=>secret};
    const auth=load(file('common/guards/jwt-guards/def-jwt-guard.ts'),{
        '@common/config/app-config/typed-config.service':{TypedConfigService:class{}},
        '@common/raw-cache':{RawCacheService:class{}},'@common/utils/admin-session':session,
        '@libs/contracts/constants':constants,
        '@modules/admin/queries/get-admin-by-username':{GetAdminByUsernameQuery:class{constructor(username){this.username=username;}}},
        '@modules/api-tokens/queries/get-token-by-uuid':{GetTokenByUuidQuery:class{}},
    });
    const {JwtStrategy}=load(file('modules/auth/strategies/jwt.strategy.ts'),{'@common/config/app-config':{}});
    new JwtStrategy(config);
    const roles=fixture.load('src/common/guards/roles/roles.guard.ts');
    const scopes=fixture.load('src/common/guards/scopes/scopes.guard.ts');
    const exception=fixture.load('src/common/exception/http-exeception-with-error-code.type.ts');
    const filter=load(file('common/exception/http-exception.filter.ts'),{'./http-exeception-with-error-code.type':exception});
    class Plans{}
    const {NodePortPlansController}=load(file('modules/nodes/node-port-plans.controller.ts'),{
        '@contract/constants':constants,'@common/decorators/admin-only-endpoint':fixture.load('src/common/decorators/admin-only-endpoint.ts'),
        '@common/decorators/roles/roles':fixture.load('src/common/decorators/roles/roles.ts'),
        '@common/exception/http-exception.filter':filter,'@common/exception/http-exeception-with-error-code.type':exception,
        '@common/guards/jwt-guards/def-jwt-guard':auth,'@common/guards/roles/roles.guard':roles,'@common/guards/scopes':scopes,
        './node-port-plans.service':{NodePortPlansService:Plans,PortPlanEditError:class extends Error{}},
    });
    Inject(Plans)(NodePortPlansController,undefined,0);
    let calls=0;
    const plans=Object.fromEntries(['get','save','preview','history','restore','retry'].map(method=>[method,async()=>{calls++;return{method};}]));
    const reflector=new Reflector();
    const guard=new auth.JwtDefaultGuard({execute:async query=>query.username?{isOk:true,response:admin}:{isOk:true,response:{scopes:['*'],expireAt:new Date(Date.now()+60000)}}},config,{exists:async key=>active.has(key)});
    // Transpile-only fixtures omit design:paramtypes. Bind the declared real
    // guards to explicit instances, keeping Passport and all guard logic real.
    const guardKey=require('@nestjs/common/constants').GUARDS_METADATA;
    const declared=Reflect.getMetadata(guardKey,NodePortPlansController);
    assert.deepEqual(declared,[auth.JwtDefaultGuard,roles.RolesGuard,scopes.ScopesGuard]);
    Reflect.defineMetadata(guardKey,[guard,new roles.RolesGuard(reflector),new scopes.ScopesGuard(reflector)],NodePortPlansController);
    class Root{}
    Module({controllers:[NodePortPlansController],providers:[{provide:Plans,useValue:plans},
        {provide:auth.JwtDefaultGuard,useValue:guard},{provide:roles.RolesGuard,useValue:new roles.RolesGuard(reflector)},
        {provide:scopes.ScopesGuard,useValue:new scopes.ScopesGuard(reflector)}]})(Root);
    const app=await NestFactory.create(Root,{logger:false,abortOnError:false});
    app.setGlobalPrefix('api');await app.listen(0,'127.0.0.1');
    const base=await app.getUrl(),node='bbbbbbbb-2222-4222-8222-222222222222',revision='cccccccc-3333-4333-8333-333333333333';
    const routes=[['GET',''],['POST',''],['POST','/preview'],['GET','/history'],['POST',`/history/${revision}/restore`],['POST','/retry']];
    const sign=(payload,options={})=>jwt.sign(payload,secret,{expiresIn:60,...options});
    const good=sign({uuid:admin.uuid,username:admin.username,role:constants.ROLE.ADMIN,...claims});
    const browser={[constants.REMNAWAVE_CLIENT_TYPE_HEADER]:constants.REMNAWAVE_CLIENT_TYPE_BROWSER};
    const request=async(method,suffix,token,headers=browser)=>{
        const response=await fetch(`${base}/api/nodes/${node}/ports${suffix}`,{method,
            headers:{...headers,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
            ...(method==='POST'?{body:JSON.stringify({expectedRevision:'1'})}:{})});
        await response.arrayBuffer();return response.status;
    };
    try{
        for(const [method,suffix]of routes){
            assert.equal(await request(method,suffix),401,suffix);
            assert.equal(await request(method,suffix,'invalid'),401,suffix);
            assert.equal(await request(method,suffix,sign({uuid:admin.uuid,username:admin.username,role:constants.ROLE.ADMIN,...claims},{expiresIn:-1})),401,suffix);
            assert.equal(await request(method,suffix,sign({uuid:'token',role:constants.ROLE.API,scopes:['*']})),403,suffix);
            assert.equal(await request(method,suffix,sign({uuid:'ordinary',role:'USER'})),403,suffix);
            assert.equal(await request(method,suffix,good,{}),403,suffix);
        }
        assert.equal(calls,0,'Denied requests must never invoke business operations');
        for(const [method,suffix]of routes)assert.equal(await request(method,suffix,good),200,suffix);
        assert.equal(calls,routes.length);
        active.clear();
        for(const [method,suffix]of routes)assert.equal(await request(method,suffix,good),401,suffix);
        assert.equal(calls,routes.length,'A revoked session cannot save or restore a plan');
    }finally{await app.close();}
});
