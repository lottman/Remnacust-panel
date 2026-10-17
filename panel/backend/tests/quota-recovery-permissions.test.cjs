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

test('quota recovery HTTP operations require a current browser administrator and never trust a body actor',async()=>{
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
    class Recovery{}
    class Receipts{}
    class Legacy{}
    class LegacyQueue{}
    class Bank{}
    class Settlement{}
    class Native{}
    class Policy{}
    class Ack{}
    class Tail{}
    class Exposure{}
    class Release{} class Delivery{} class Finalization{}
    const releaseModel=load(file('common/host-policy/quota-recovery-release.service.ts'),{'@common/axios':{},'@common/database':{}});
    const deliveryModel=load(file('common/host-policy/quota-release-delivery.service.ts'),{'@common/axios':{},'@common/database':{}});
    const finalizationModel=load(file('common/host-policy/quota-recovery-finalization.service.ts'),{'@common/axios':{},'@common/database':{}});
    const exposureModel=load(file("common/host-policy/quota-exposure-closure.service.ts"),{"@common/axios":{},"@common/database":{}});
    const {RecoveryTailError}=load(file("common/host-policy/quota-recovery-tail.service.ts"),{"@common/axios":{},"@common/database":{}});
    const {RecoveryReceiptDeliveryError}=load(file("common/host-policy/quota-recovery-receipt.service.ts"),{"@common/axios":{},"@common/database":{}});
    const {RecoveryPolicyStageError}=load(file('common/host-policy/quota-recovery-policy.service.ts'),{'@common/axios':{},'@common/database':{}});
    const controllerMocks={
        '@common/host-policy/quota-recovery-release.service':{...releaseModel,QuotaRecoveryReleaseService:Release},
        '@common/host-policy/quota-release-delivery.service':{...deliveryModel,QuotaReleaseDeliveryService:Delivery},
        '@common/host-policy/quota-recovery-finalization.service':{...finalizationModel,QuotaRecoveryFinalizationService:Finalization},
        "@common/host-policy/quota-exposure-closure.service":{...exposureModel,QuotaExposureClosureService:Exposure},
        "@common/host-policy/quota-recovery-tail.service":{QuotaRecoveryTailService:Tail,RecoveryTailError},
        "@common/host-policy/recovery-tail-plan":load(file("common/host-policy/recovery-tail-plan.ts")),
        "@common/host-policy/quota-recovery-receipt.service":{QuotaRecoveryReceiptService:Ack,RecoveryReceiptDeliveryError},
        '@common/host-policy/quota-recovery-policy.service':{QuotaRecoveryPolicyService:Policy,RecoveryPolicyStageError},
        '@contract/constants':constants,'@common/decorators/admin-only-endpoint':fixture.load('src/common/decorators/admin-only-endpoint.ts'),
        '@common/decorators/get-jwt-payload/get-jwt-payload':fixture.load('src/common/decorators/get-jwt-payload/get-jwt-payload.ts'),
        '@common/decorators/roles/roles':fixture.load('src/common/decorators/roles/roles.ts'),
        '@common/exception/http-exception.filter':filter,'@common/exception/http-exeception-with-error-code.type':exception,
        '@common/guards/jwt-guards/def-jwt-guard':auth,'@common/guards/roles/roles.guard':roles,'@common/guards/scopes':scopes,
        '@common/host-policy/quota-recovery.service':{QuotaRecoveryService:Recovery,QuotaRecoveryError:class extends Error{}},
        '@common/host-policy/quota-receipt-recovery.service':{QuotaReceiptRecoveryService:Receipts,QuotaReceiptRecoveryError:class extends Error{}},
        '@common/host-policy/legacy-quota-recovery.service':{LegacyQuotaRecoveryService:Legacy},
        '@common/host-policy/legacy-queue-recovery.service':{LegacyQueueRecoveryService:LegacyQueue},
        '@common/host-policy/quota-bank-recovery.service':{QuotaBankRecoveryService:Bank},
        '@common/host-policy/native-quota-recovery.service':{NativeQuotaRecoveryService:Native},
        '@common/host-policy/native-recovery-plan':load(file('common/host-policy/native-recovery-plan.ts'),{'@common/utils/device-identity':load(file('common/utils/device-identity.ts')),'@common/utils/nano':load(file('common/utils/nano/nano.util.ts'))}),
        '@common/host-policy/quota-recovery-settlement.service':{QuotaRecoverySettlementService:Settlement},
        '@common/host-policy/quota-recovery-settlement-plan':load(file('common/host-policy/quota-recovery-settlement-plan.ts')),
        '@common/host-policy/quota-bank-model':load(file('common/host-policy/quota-bank-model.ts')),
        '@common/host-policy/legacy-recovery-plan':load(file('common/host-policy/legacy-recovery-plan.ts')),
    };
    const {QuotaRecoveryController}=load(file('modules/hosts/quota-recovery.controller.ts'),controllerMocks);
    const {QuotaReceiptRecoveryController}=load(file('modules/hosts/quota-receipt-recovery.controller.ts'),controllerMocks);
    const {LegacyQuotaRecoveryController}=load(file('modules/hosts/legacy-quota-recovery.controller.ts'),controllerMocks);
    const {QuotaBankRecoveryController}=load(file('modules/hosts/quota-bank-recovery.controller.ts'),controllerMocks);
    const {QuotaRecoverySettlementController}=load(file('modules/hosts/quota-recovery-settlement.controller.ts'),controllerMocks);
    const {NativeQuotaRecoveryController}=load(file('modules/hosts/native-quota-recovery.controller.ts'),controllerMocks);
    const {QuotaRecoveryPolicyController}=load(file('modules/hosts/quota-recovery-policy.controller.ts'),controllerMocks);
    const {QuotaRecoveryReceiptController}=load(file("modules/hosts/quota-recovery-receipt.controller.ts"),controllerMocks);
    const {QuotaRecoveryTailController}=load(file("modules/hosts/quota-recovery-tail.controller.ts"),controllerMocks);
    const {QuotaExposureClosureController}=load(file("modules/hosts/quota-exposure-closure.controller.ts"),controllerMocks);
    const {QuotaRecoveryReleaseController}=load(file('modules/hosts/quota-recovery-release.controller.ts'),controllerMocks);
    Inject(Release)(QuotaRecoveryReleaseController,undefined,0);Inject(Delivery)(QuotaRecoveryReleaseController,undefined,1);Inject(Finalization)(QuotaRecoveryReleaseController,undefined,2);
    Inject(Exposure)(QuotaExposureClosureController,undefined,0);
    Inject(Tail)(QuotaRecoveryTailController,undefined,0);
    Inject(Ack)(QuotaRecoveryReceiptController,undefined,0);
    Inject(Policy)(QuotaRecoveryPolicyController,undefined,0);
    Inject(Native)(NativeQuotaRecoveryController,undefined,0);
    Inject(Settlement)(QuotaRecoverySettlementController,undefined,0);
    Inject(Recovery)(QuotaRecoveryController,undefined,0);
    Inject(Receipts)(QuotaReceiptRecoveryController,undefined,0);
    Inject(Legacy)(LegacyQuotaRecoveryController,undefined,0);
    Inject(LegacyQueue)(LegacyQuotaRecoveryController,undefined,1);
    Inject(Bank)(QuotaBankRecoveryController,undefined,0);
    let calls=0,settlementFailure=null,nativeFailure=null,policyFailure=null,ackFailure=null,tailFailure=null,tailSourceConflict=false,tailOtherRequest=false,exposureFailure=null,releaseFailure=null,releaseOtherScope=false;
    const recovery={status:async()=>{calls++;return{};},check:async(checkedNode,generation,actor)=>{calls++;assert.equal(checkedNode,node);assert.equal(generation,revision);assert.equal(actor,admin.uuid);return{};},
        pause:async(checkedNode,generation,actor)=>{calls++;assert.equal(checkedNode,node);assert.equal(generation,revision);assert.equal(actor,admin.uuid);return{};},
        history:async checkedNode=>{calls++;assert.equal(checkedNode,node);return {entries:[],nextAfter:null};},
        evidenceParts:async(checkedNode,request)=>{calls++;assert.equal(checkedNode,node);assert.equal(request,revision);return {entries:[],nextAfter:null};},
        evidenceArtifact:async(checkedNode,request,digest)=>{calls++;assert.equal(checkedNode,node);assert.equal(request,revision);assert.equal(digest,'a'.repeat(64));return {data:require('node:zlib').gzipSync('fixture'),filename:'quota-fixture.json.gz'};}};
    const receipts={capture:async(checkedNode,generation,actor)=>{calls++;assert.equal(checkedNode,node);assert.equal(generation,revision);assert.equal(actor,admin.uuid);return {requestId:revision,state:'PRESENT'};},
        history:async checkedNode=>{calls++;assert.equal(checkedNode,node);return {entries:[],nextAfter:null};},
        download:async(checkedNode,request)=>{calls++;assert.equal(checkedNode,node);assert.equal(request,revision);return {data:require('node:zlib').gzipSync('fixture'),filename:'usage-fixture.journal.gz'};}};
    const legacy={list:async()=>{calls++;return {entries:[],nextAfter:null};},searchTargets:async()=>{calls++;return {entries:[]};},details:async receipt=>{calls++;assert.equal(receipt,'a'.repeat(64));return{};},
        preview:async(receipt,draft)=>{calls++;assert.equal(receipt,'a'.repeat(64));assert.equal(draft.generation,revision);assert.deepEqual(draft.allocations,[]);return{};},
        resolve:async(receipt,draft,actor)=>{calls++;assert.equal(receipt,'a'.repeat(64));assert.equal(draft.generation,revision);assert.equal(actor,admin.uuid);assert.equal(draft.planDigest,'a'.repeat(64));return{};}};
    const reflector=new Reflector();
    const guard=new auth.JwtDefaultGuard({execute:async query=>query.username?{isOk:true,response:admin}:{isOk:true,response:{scopes:['*'],expireAt:new Date(Date.now()+60000)}}},config,{exists:async key=>active.has(key)});
    // Transpile-only fixtures omit design:paramtypes. Bind the declared real
    // guards to explicit instances, keeping Passport and all guard logic real.
    const guardKey=require('@nestjs/common/constants').GUARDS_METADATA;
    for(const controller of [QuotaRecoveryController,QuotaReceiptRecoveryController,LegacyQuotaRecoveryController,QuotaBankRecoveryController,QuotaRecoverySettlementController,NativeQuotaRecoveryController,QuotaRecoveryPolicyController,QuotaRecoveryReceiptController,QuotaRecoveryTailController,QuotaExposureClosureController,QuotaRecoveryReleaseController]){
        const declared=Reflect.getMetadata(guardKey,controller);
        assert.deepEqual(declared,[auth.JwtDefaultGuard,roles.RolesGuard,scopes.ScopesGuard]);
        Reflect.defineMetadata(guardKey,[guard,new roles.RolesGuard(reflector),new scopes.ScopesGuard(reflector)],controller);
    }
    class Root{}
    Module({controllers:[QuotaRecoveryController,QuotaReceiptRecoveryController,LegacyQuotaRecoveryController,QuotaBankRecoveryController,QuotaRecoverySettlementController,NativeQuotaRecoveryController,QuotaRecoveryPolicyController,QuotaRecoveryReceiptController,QuotaRecoveryTailController,QuotaExposureClosureController,QuotaRecoveryReleaseController],providers:[{provide:Release,useValue:{status:async g=>{calls++;assert.equal(g,revision);return null;},preview:async(b,a)=>{calls++;if(releaseFailure)throw releaseFailure;assert.equal(b.requestId,revision);assert.equal(a,admin.uuid);return {};},approve:async(b,a)=>{calls++;assert.equal(b.planDigest,'a'.repeat(64));assert.equal(a,admin.uuid);return {};}}},
        {provide:Delivery,useValue:{list:async(a,c)=>{calls++;assert.equal(a,revision);assert.equal(c,undefined);return {entries:[],nextAfter:null};},details:async(r)=>{calls++;assert.equal(r,revision);return {approval:releaseOtherScope?node:revision,attempts:[]};},deliver:async(r,a)=>{calls++;assert.equal(r,revision);assert.equal(a,admin.uuid);return {};}}},
        {provide:Finalization,useValue:{enqueue:async(b,a)=>{calls++;assert.deepEqual(b,{requestId:revision,note:'Review all recovered nodes before resuming',approvalRequest:revision});assert.equal(a,admin.uuid);return {};},details:async(r)=>{calls++;assert.equal(r,revision);return {approvalRequest:releaseOtherScope?node:revision,attempts:[]};}}},{provide:Exposure,useValue:{preview:async(n,b)=>{calls++;if(exposureFailure)throw exposureFailure;assert.equal(n,node);assert.equal(b.generation,revision);assert.equal(b.bankRequest,revision);return {};},resolve:async(n,b,a)=>{calls++;assert.equal(n,node);assert.equal(a,admin.uuid);assert.equal(b.requestId,revision);assert.equal(b.planDigest,'a'.repeat(64));return {};},list:async(n,g,after)=>{calls++;assert.equal(n,node);assert.equal(g,revision);assert.equal(after,undefined);return {entries:[],nextAfter:null};},details:async(n,g,r)=>{calls++;assert.equal(n,node);assert.equal(g,revision);assert.equal(r,revision);return {};}}},{provide:Tail,useValue:{details:async(n,a,g)=>{calls++;assert.equal(n,node);assert.equal(a,revision);assert.equal(g,revision);return {preparation:{request:tailOtherRequest?node:revision},sourceConflict:tailSourceConflict};},prepare:async(n,input,a)=>{calls++;if(tailFailure)throw tailFailure;assert.equal(n,node);assert.equal(a,admin.uuid);assert.equal(input.generation,revision);assert.equal(input.acknowledgementRequest,revision);assert.equal(input.requestId,revision);assert.equal(input.consumptionMultiplier,"1500000000");return{};},execute:async(n,r,g,a)=>{calls++;assert.equal(n,node);assert.equal(r,revision);assert.equal(g,revision);assert.equal(a,admin.uuid);return{};}}},{provide:Ack,useValue:{list:async(n,g,d,after)=>{calls++;assert.equal(n,node);assert.equal(g,revision);assert.equal(d,revision);assert.equal(after,undefined);return {entries:[],nextAfter:null};},deliver:async(n,g,a,r,d)=>{calls++;if(ackFailure)throw ackFailure;assert.equal(n,node);assert.equal(g,revision);assert.equal(a,admin.uuid);assert.equal(r,revision);assert.equal(d,revision);return{};},details:async(n,r,after)=>{calls++;assert.equal(n,node);assert.equal(r,revision);assert.equal(after,undefined);return {attempts:[],nextAfter:null};}}},{provide:Policy,useValue:{list:async(checkedNode,generation,after)=>{calls++;assert.equal(checkedNode,node);assert.equal(generation,revision);assert.equal(after,undefined);return {entries:[],nextAfter:null};},stage:async(checkedNode,generation,actor,request)=>{calls++;if(policyFailure)throw policyFailure;assert.equal(checkedNode,node);assert.equal(generation,revision);assert.equal(actor,admin.uuid);assert.equal(request,revision);return{};},details:async(checkedNode,request,after)=>{calls++;assert.equal(checkedNode,node);assert.equal(request,revision);assert.equal(after,undefined);return {attempts:[],nextAfter:null};}}},{provide:Recovery,useValue:recovery},{provide:Receipts,useValue:receipts},{provide:Legacy,useValue:legacy},{provide:LegacyQueue,useValue:{capture:async input=>{calls++;assert.deepEqual(input,{generation:revision,offset:0});return {entries:[],nextOffset:null};}}},
        {provide:Native,useValue:{details:async(checkedNode,request,generation)=>{calls++;assert.equal(checkedNode,node);assert.equal(request,revision);assert.equal(generation,revision);return{};},preview:async(checkedNode,draft)=>{calls++;if(nativeFailure)throw nativeFailure;assert.equal(checkedNode,node);assert.equal(draft.generation,revision);assert.equal(draft.bankRequest,revision);assert.equal(draft.sourceRequest,revision);assert.deepEqual(draft.allocations,[]);assert.deepEqual(draft.accounts,[]);return{};},resolve:async(checkedNode,draft,actor)=>{calls++;assert.equal(checkedNode,node);assert.equal(actor,admin.uuid);assert.equal(draft.requestId,revision);assert.equal(draft.planDigest,'a'.repeat(64));return{};}}},
        {provide:Settlement,useValue:{preview:async(checkedNode,draft)=>{calls++;if(settlementFailure)throw settlementFailure;assert.equal(checkedNode,node);assert.equal(draft.generation,revision);assert.equal(draft.bankRequest,revision);assert.equal(draft.sourceRequest,revision);assert.deepEqual(draft.ids,[revision]);return{};},resolve:async(checkedNode,draft,actor)=>{calls++;assert.equal(checkedNode,node);assert.equal(actor,admin.uuid);assert.equal(draft.planDigest,'a'.repeat(64));assert.equal(draft.requestId,revision);return{};}}},
        {provide:Bank,useValue:{capture:async(generation,request,actor)=>{calls++;assert.equal(generation,revision);assert.equal(request,revision);assert.equal(actor,admin.uuid);return{};},list:async()=>{calls++;return {entries:[],nextAfter:null};},details:async request=>{calls++;assert.equal(request,revision);return{};},parts:async request=>{calls++;assert.equal(request,revision);return {entries:[],nextAfter:null};},compare:async(request,generation)=>{calls++;assert.equal(request,revision);assert.equal(generation,revision);return{};},download:async(request,digest)=>{calls++;assert.equal(request,revision);assert.equal(digest,'a'.repeat(64));return {data:require('node:zlib').gzipSync('fixture'),filename:'quota-fixture.json.gz'};}}},
        {provide:auth.JwtDefaultGuard,useValue:guard},{provide:roles.RolesGuard,useValue:new roles.RolesGuard(reflector)},
        {provide:scopes.ScopesGuard,useValue:new scopes.ScopesGuard(reflector)}]})(Root);
    const app=await NestFactory.create(Root,{logger:false,abortOnError:false});
    app.setGlobalPrefix('api');await app.listen(0,'127.0.0.1');
    const base=await app.getUrl(),node='bbbbbbbb-2222-4222-8222-222222222222',revision='cccccccc-3333-4333-8333-333333333333';
    const routes=[['GET',''],['POST',`/nodes/${node}/check`],['POST',`/nodes/${node}/pause`],['GET',`/nodes/${node}/history`],['GET',`/nodes/${node}/history/${revision}/parts`],['GET',`/nodes/${node}/history/${revision}/artifacts/${'a'.repeat(64)}`],['POST',`/nodes/${node}/receipts`],['GET',`/nodes/${node}/receipts`],['GET',`/nodes/${node}/receipts/${revision}/journal`]];
    routes.push(['GET','/legacy-jobs'],['GET','/legacy-jobs/'+'a'.repeat(64)],['POST','/legacy-jobs/'+'a'.repeat(64)+'/preview'],['POST','/legacy-jobs/'+'a'.repeat(64)+'/resolve']);
    routes.push(['GET','/legacy-jobs/targets?search=chosen']);
    routes.push(['POST','/legacy-jobs/capture-failed']);
    routes.push(['GET','/bank-snapshots'],['POST','/bank-snapshots/capture'],['GET','/bank-snapshots/'+revision],['GET','/bank-snapshots/'+revision+'/parts'],['GET','/bank-snapshots/'+revision+'/artifacts/'+'a'.repeat(64)],['POST','/bank-snapshots/'+revision+'/compare']);
    routes.push(['POST',`/nodes/${node}/settlements/preview`],['POST',`/nodes/${node}/settlements/resolve`]);
    routes.push(['POST',`/nodes/${node}/native-import/preview`],['POST',`/nodes/${node}/native-import/resolve`]);
    routes.push(['GET',`/nodes/${node}/native-import/${revision}?generation=${revision}`]);
    routes.push(['POST',`/nodes/${node}/held-policy`],['GET',`/nodes/${node}/held-policy/${revision}`]);
    routes.push(['GET',`/nodes/${node}/held-policy?generation=${revision}`]);
    routes.push(["POST",`/nodes/${node}/receipt-ack`],["GET",`/nodes/${node}/receipt-ack/${revision}`]);
    routes.push(["GET",`/nodes/${node}/receipt-ack?generation=${revision}&decisionRequest=${revision}`]);
    routes.push(["GET",`/nodes/${node}/receipt-ack/${revision}/tail?generation=${revision}`],["POST",`/nodes/${node}/receipt-ack/${revision}/tail`],["POST",`/nodes/${node}/receipt-ack/${revision}/tail/${revision}/execute`]);
    routes.push(['GET',`/nodes/${node}/exposure-closures?generation=${revision}`],['GET',`/nodes/${node}/exposure-closures/${revision}?generation=${revision}`],['POST',`/nodes/${node}/exposure-closures/preview`],['POST',`/nodes/${node}/exposure-closures/resolve`]);
    routes.push(['GET',`/releases?generation=${revision}`],['POST','/releases/preview'],['POST','/releases/approve'],['GET',`/releases/${revision}/jobs`],['GET',`/releases/${revision}/jobs/${revision}`],['POST',`/releases/${revision}/jobs/${revision}/deliver`],['POST',`/releases/${revision}/finalizations`],['GET',`/releases/${revision}/finalizations/${revision}`]);
    assert.equal(routes.length,47);
    const sign=(payload,options={})=>jwt.sign(payload,secret,{expiresIn:60,...options});
    const good=sign({uuid:admin.uuid,username:admin.username,role:constants.ROLE.ADMIN,...claims});
    const browser={[constants.REMNAWAVE_CLIENT_TYPE_HEADER]:constants.REMNAWAVE_CLIENT_TYPE_BROWSER};
    let responseBody;
    const request=async(method,suffix,token,headers=browser,payload)=>{
        payload??=suffix.startsWith('/releases')?(suffix.endsWith('/deliver')?{}:suffix.endsWith('/finalizations')?{requestId:revision,note:'Review all recovered nodes before resuming'}:{requestId:revision,generation:revision,bankRequest:revision,note:'Review all recovered nodes before resuming',...(suffix.endsWith('/approve')?{planDigest:'a'.repeat(64)}:{})}):suffix.includes('/exposure-closures/')?{generation:revision,bankRequest:revision,note:'Reviewed current-process exposure closure',...(suffix.endsWith('/resolve')?{requestId:revision,planDigest:'a'.repeat(64)}:{})}:suffix.endsWith('/tail')?{generation:revision,requestId:revision,consumptionMultiplier:'1500000000',note:'Explicit reviewed next-packet pricing'}:suffix.endsWith('/receipt-ack')?{generation:revision,requestId:revision,decisionRequest:revision}:suffix.endsWith('/held-policy')?{generation:revision,requestId:revision}:suffix.includes('/native-import/')?{generation:revision,bankRequest:revision,sourceRequest:revision,allocations:[],accounts:[],note:'Reviewed immutable native receipt',...(suffix.endsWith('/resolve')?{requestId:revision,planDigest:'a'.repeat(64)}:{})}:suffix.includes('/settlements/')?{generation:revision,bankRequest:revision,sourceRequest:revision,ids:[revision],note:'Reviewed original closed reserve',...(suffix.endsWith('/resolve')?{requestId:revision,planDigest:'a'.repeat(64)}:{})}:suffix.startsWith('/bank-snapshots')?{generation:revision,...(suffix.endsWith('/capture')?{requestId:revision}:{})}:suffix.startsWith('/legacy-jobs')&&!suffix.endsWith('/capture-failed')?{generation:revision,allocations:[],note:'Explicit fixture recovery',...(suffix.endsWith('/resolve')?{requestId:revision,planDigest:'a'.repeat(64)}:{})}:{generation:revision};
        const response=await fetch(`${base}/api/limits/quota-recovery${suffix}`,{method,
            headers:{...headers,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
            ...(method==='POST'?{body:JSON.stringify(payload)}:{})});
        const bytes=await response.arrayBuffer();
        responseBody=response.headers.get('content-type')?.includes('application/json')?JSON.parse(Buffer.from(bytes).toString()):null;
        if(response.status===200&&(suffix.includes('/artifacts/')||suffix.endsWith('/journal'))){
            assert.equal(response.headers.get('content-type'),'application/gzip');assert.equal(response.headers.get('cache-control'),'no-store');
            assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-disposition'),/attachment; filename="(?:quota-fixture.json.gz|usage-fixture.journal.gz)"/);
            assert.equal(require('node:zlib').gunzipSync(Buffer.from(bytes)).toString(),'fixture');
        }
        if([200,202].includes(response.status)&&suffix.startsWith('/releases'))assert.equal(response.headers.get('cache-control'),'no-store');
        return response.status;
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
        for(const [method,suffix]of routes)assert.equal(await request(method,suffix,good),suffix.startsWith('/releases/')&&suffix.endsWith('/finalizations')?202:200,suffix);
        const allowedCalls=calls;assert.equal(allowedCalls,routes.length+2);
        assert.equal(await request('POST',`/nodes/${node}/held-policy`,good,browser,{generation:revision,requestId:revision,actor:node}),400);
        assert.equal(await request('GET',`/nodes/${node}/held-policy/${revision}?after=bad`,good),400);
        assert.equal(await request('POST',`/nodes/${node}/check`,good,browser,{generation:revision,actor:node}),400);
        assert.equal(await request('POST',`/nodes/${node}/pause`,good,browser,{generation:revision,actor:node}),400);
        assert.equal(await request('POST',`/nodes/${node}/receipts`,good,browser,{generation:revision,actor:node}),400);
        assert.equal(await request('POST','/legacy-jobs/'+'a'.repeat(64)+'/resolve',good,browser,{generation:revision,allocations:[],note:'Explicit fixture recovery',requestId:revision,planDigest:'a'.repeat(64),actor:node}),400);
        assert.equal(await request('POST','/legacy-jobs/'+'a'.repeat(64)+'/preview',good,browser,{generation:revision,allocations:[{owner:'1',action:'CHARGE',subject:revision}],note:'Explicit fixture recovery'}),400);
        assert.equal(await request('GET','/legacy-jobs?after=invalid',good),400);
        assert.equal(await request('GET','/legacy-jobs/invalid',good),400);
        assert.equal(await request('GET','/legacy-jobs/targets?search='+('x'.repeat(101)),good),400);
        for(const payload of [{generation:revision,actor:node},{generation:revision,offset:-1},{generation:revision,offset:0.5},{generation:revision,offset:1000001}])assert.equal(await request('POST','/legacy-jobs/capture-failed',good,browser,payload),400);
        assert.equal(await request('POST','/bank-snapshots/capture',good,browser,{generation:revision,requestId:revision,actor:node}),400);
        assert.equal(await request('POST','/bank-snapshots/capture',good,browser,{generation:revision,requestId:'invalid'}),400);
        assert.equal(await request('GET','/bank-snapshots?after=invalid',good),400);
        assert.equal(await request('GET','/bank-snapshots/'+revision+'/parts?after=-1',good),400);
        assert.equal(await request('POST','/bank-snapshots/'+revision+'/compare',good,browser,{generation:revision,actor:node}),400);
        assert.equal(await request('GET',`/nodes/${node}/receipts?after=invalid`,good),400);
        assert.equal(await request('GET','?after=not-a-uuid',good),400);
        assert.equal(await request('GET','?unknown=true',good),400);
        assert.equal(await request('POST','/nodes/not-a-uuid/check',good),400);
        assert.equal(await request('GET',`/nodes/${node}/history?generation=invalid`,good),400);
        assert.equal(await request('GET',`/nodes/${node}/history?after=invalid`,good),400);
        assert.equal(await request('GET',`/nodes/${node}/history/${revision}/parts?after=-1`,good),400);
        assert.equal(await request('GET',`/nodes/${node}/history/${revision}/parts?after=1.5`,good),400);
        assert.equal(await request('GET',`/nodes/${node}/history/${revision}/artifacts/invalid`,good),400);
        const settlement={generation:revision,bankRequest:revision,sourceRequest:revision,ids:[revision],note:'Reviewed original closed reserve'};
        for(const extra of [{actor:node},{amount:'999'},{ids:[]},{ids:Array(501).fill(revision)},{bankRequest:'invalid'},{sourceRequest:'invalid'},{generation:'invalid'},{note:'short'}])assert.equal(await request('POST',`/nodes/${node}/settlements/preview`,good,browser,{...settlement,...extra}),400);
        for(const extra of [{actor:node},{planDigest:'invalid'},{requestId:'invalid'}])assert.equal(await request('POST',`/nodes/${node}/settlements/resolve`,good,browser,{...settlement,requestId:revision,planDigest:'a'.repeat(64),...extra}),400);
        assert.equal(await request('POST','/nodes/not-a-uuid/settlements/preview',good,browser,settlement),400);
        const native={generation:revision,bankRequest:revision,sourceRequest:revision,allocations:[],accounts:[],note:'Reviewed immutable native receipt'};
        for(const extra of [{actor:node},{amount:'123'},{bankRequest:'invalid'},{sourceRequest:'invalid'},{generation:'invalid'},{note:'short'},{accounts:[{account:revision,action:'DELETE'}]},{allocations:[{owner:'901',action:'CHARGE',subject:revision}]},{accounts:Array(1501).fill({account:revision,action:'LOSS'})}])assert.equal(await request('POST',`/nodes/${node}/native-import/preview`,good,browser,{...native,...extra}),400);
        for(const extra of [{actor:node},{planDigest:'bad'},{requestId:'bad'}])assert.equal(await request('POST',`/nodes/${node}/native-import/resolve`,good,browser,{...native,requestId:revision,planDigest:'a'.repeat(64),...extra}),400);
        assert.equal(await request('POST','/nodes/bad/native-import/preview',good,browser,native),400);
        assert.equal(await request('GET',`/nodes/${node}/native-import/${revision}`,good),400);
        assert.equal(await request('GET',`/nodes/${node}/native-import/${revision}?generation=bad`,good),400);
        assert.equal(await request('GET',`/nodes/${node}/native-import/${revision}?generation=${revision}&actor=${node}`,good),400);
        assert.equal(await request('GET',`/nodes/${node}/native-import/bad?generation=${revision}`,good),400);
        for(const extra of [{actor:node},{generation:'bad'},{requestId:'bad'},{decisionRequest:'bad'},{sourceDigest:'a'.repeat(64)},{receipt:{action:'ack'}}])assert.equal(await request('POST',`/nodes/${node}/receipt-ack`,good,browser,{generation:revision,requestId:revision,decisionRequest:revision,...extra}),400);
        assert.equal(await request('GET',`/nodes/${node}/receipt-ack/${revision}?after=bad`,good),400);
        assert.equal(await request('GET',`/nodes/${node}/receipt-ack/${revision}?actor=${node}`,good),400);
        for(const query of ['',`?generation=${revision}`,`?generation=bad&decisionRequest=${revision}`,`?generation=${revision}&decisionRequest=bad`,`?generation=${revision}&decisionRequest=${revision}&after=bad`,`?generation=${revision}&decisionRequest=${revision}&actor=${node}`])assert.equal(await request('GET',`/nodes/${node}/receipt-ack`+query,good),400);
        const tail={generation:revision,requestId:revision,consumptionMultiplier:'1500000000',note:'Explicit reviewed next-packet pricing'};
        for(const extra of [{actor:node},{acknowledgementRequest:revision},{consumptionMultiplier:1},{consumptionMultiplier:'01'},{note:'short'},{requestId:'bad'}])assert.equal(await request('POST',`/nodes/${node}/receipt-ack/${revision}/tail`,good,browser,{...tail,...extra}),400);
        assert.equal(await request('POST',`/nodes/${node}/receipt-ack/${revision}/tail/${revision}/execute`,good,browser,{generation:revision,actor:node}),400);
        assert.equal(await request('GET',`/nodes/${node}/receipt-ack/${revision}/tail?generation=bad`,good),400);
        for(const extra of [{actor:node},{generation:'bad'},{bankRequest:'bad'},{note:'short'},{note:'invalid \u0000 reason text'},{note:'invalid \ud800 reason text'},{core:node},{ids:[node]},{amount:'1'}])assert.equal(await request('POST',`/nodes/${node}/exposure-closures/preview`,good,browser,{generation:revision,bankRequest:revision,note:'Reviewed current-process exposure closure',...extra}),400);
        for(const extra of [{actor:node},{requestId:'bad'},{planDigest:'bad'}])assert.equal(await request('POST',`/nodes/${node}/exposure-closures/resolve`,good,browser,{generation:revision,bankRequest:revision,note:'Reviewed current-process exposure closure',requestId:revision,planDigest:'a'.repeat(64),...extra}),400);
        for(const suffix of [`/nodes/${node}/exposure-closures?generation=${revision}&after=bad`,`/nodes/${node}/exposure-closures/${revision}?generation=bad`,`/nodes/bad/exposure-closures?generation=${revision}`])assert.equal(await request('GET',suffix,good),400);
        for(const payload of [{actor:node},{requestId:'bad'},{approvalRequest:node},{note:'short'}])assert.equal(await request('POST',`/releases/${revision}/finalizations`,good,browser,{requestId:revision,note:'Review all recovered nodes before resuming',...payload}),400);
        assert.equal(await request('POST',`/releases/${revision}/jobs/${revision}/deliver`,good,browser,{actor:node}),400);
        assert.equal(await request('GET',`/releases?generation=bad`,good),400);
        assert.equal(await request('GET',`/releases/${revision}/jobs?after=bad`,good),400);
        assert.equal(calls,allowedCalls,'Invalid input cannot invoke recovery operations');
        active.clear();
        for(const [method,suffix]of routes)assert.equal(await request(method,suffix,good),401,suffix);
        assert.equal(calls,allowedCalls,'A revoked session cannot inspect recovery state');
        active.add(session.adminSessionKey(claims.jti));
        const {RecoverySettlementError}=controllerMocks['@common/host-policy/quota-recovery-settlement-plan'];
        const {QuotaBankError}=controllerMocks['@common/host-policy/quota-bank-model'];
        for(const [error,status,code] of [
            ...['NOT_PENDING','OWNER_UNPROVEN','STALE_PLAN','BINDING_CHANGED','REQUEST_CONFLICT'].map(code=>[new RecoverySettlementError(code),409,'QUOTA_SETTLEMENT_'+code]),
            [new RecoverySettlementError('SOURCE_MISSING'),404,'QUOTA_SETTLEMENT_SOURCE_MISSING'],
            [new RecoverySettlementError('SOURCE_INVALID'),503,'QUOTA_SETTLEMENT_SOURCE_INVALID'],
            ...[['MISSING',404],['CORRUPT',503],['CAPACITY',413],['NOT_PENDING',409]].map(([code,status])=>[new QuotaBankError(code),status,'QUOTA_BANK_'+code])
        ]){
            settlementFailure=error;
            assert.equal(await request('POST',`/nodes/${node}/settlements/preview`,good),status);
            assert.equal(responseBody.errorCode,code);assert.equal(JSON.stringify(responseBody).includes('stack'),false);
        }

        const {NativeRecoveryError}=controllerMocks['@common/host-policy/native-recovery-plan'];
        const {LegacyRecoveryError}=controllerMocks['@common/host-policy/legacy-recovery-plan'];
        for(const [error,status,code] of [
            ...['NOT_PENDING','TICKET_CHANGED','ACCOUNT_UNPROVEN','INVALID_ALLOCATION','STALE_PLAN','REQUEST_CONFLICT','ALREADY_RESOLVED'].map(code=>[new NativeRecoveryError(code),409,'NATIVE_RECOVERY_'+code]),
            [new NativeRecoveryError('SOURCE_MISSING'),404,'NATIVE_RECOVERY_SOURCE_MISSING'],
            [new NativeRecoveryError('SOURCE_INVALID'),503,'NATIVE_RECOVERY_SOURCE_INVALID'],
            [new LegacyRecoveryError('INVALID_ALLOCATION'),400,'LEGACY_RECOVERY_INVALID_ALLOCATION'],
            ...['TARGET_CHANGED','OVERFLOW','STALE_PLAN'].map(code=>[new LegacyRecoveryError(code),409,'LEGACY_RECOVERY_'+code]),
            ...[['MISSING',404],['CORRUPT',503],['CAPACITY',413],['NOT_PENDING',409]].map(([code,status])=>[new QuotaBankError(code),status,'QUOTA_BANK_'+code])
        ]){
            nativeFailure=error;
            assert.equal(await request('POST',`/nodes/${node}/native-import/preview`,good),status);
            assert.equal(responseBody.errorCode,code);assert.equal(JSON.stringify(responseBody).includes('stack'),false);
        }

        for(const [code,status] of [['BUSY',409],['LEASE_LOST',409],['SOURCE_CHANGED',409],['REQUEST_CONFLICT',409],['NOT_PENDING',409],['NODE_MISSING',404],['JOB_MISSING',404],['NODE_UNAVAILABLE',503]]) {
            policyFailure=new RecoveryPolicyStageError(code);
            assert.equal(await request('POST',`/nodes/${node}/held-policy`,good),status);
            assert.equal(responseBody.errorCode,'RECOVERY_POLICY_'+code);
            assert.equal(JSON.stringify(responseBody).includes('stack'),false);
        }
        for(const [code,status] of [['BUSY',409],['LEASE_LOST',409],['SOURCE_CHANGED',409],['HELD_POLICY_REQUIRED',409],['REQUEST_CONFLICT',409],['NOT_PENDING',409],['NODE_MISSING',404],['JOB_MISSING',404],['NODE_UNAVAILABLE',503]]) {
            ackFailure=new RecoveryReceiptDeliveryError(code);
            assert.equal(await request('POST',`/nodes/${node}/receipt-ack`,good),status);
            assert.equal(responseBody.errorCode,'RECOVERY_RECEIPT_'+code);
            assert.equal(JSON.stringify(responseBody).includes('stack'),false);
        }
        for(const [code,status] of [['BUSY',409],['SOURCE_CHANGED',409],['HELD_POLICY_REQUIRED',409],['ACK_REQUIRED',409],['SAMPLE_UNSUPPORTED',409],['REQUEST_CONFLICT',409],['NOT_PENDING',409],['NODE_MISSING',404],['NODE_UNAVAILABLE',503]]) {
            tailFailure=new RecoveryTailError(code);
            assert.equal(await request('POST',`/nodes/${node}/receipt-ack/${revision}/tail`,good),status);
            assert.equal(responseBody.errorCode,'RECOVERY_TAIL_'+code);
            assert.equal(JSON.stringify(responseBody).includes('stack'),false);
        }
        tailFailure=null;
        for(const conflict of ['digest','ownership']) {
            tailSourceConflict=conflict==='digest';tailOtherRequest=conflict==='ownership';
            const before=calls;
            assert.equal(await request('POST',`/nodes/${node}/receipt-ack/${revision}/tail/${revision}/execute`,good),409);
            assert.equal(responseBody.errorCode,'RECOVERY_TAIL_REQUEST_CONFLICT');
            assert.equal(calls,before+1,'Conflicting archive or wrong ACK must stop before executing the node command');
        }
        for(const [code,status] of [['NOT_PENDING',409],['SOURCE_CHANGED',409],['STALE_PLAN',409],['REQUEST_CONFLICT',409],['NOTHING_TO_CLOSE',409],['NODE_UNAVAILABLE',503],['NODE_MISSING',404]]){
            exposureFailure=new exposureModel.ExposureClosureError(code);assert.equal(await request('POST',`/nodes/${node}/exposure-closures/preview`,good),status);assert.equal(responseBody.errorCode,'RECOVERY_EXPOSURE_'+code);assert.equal(JSON.stringify(responseBody).includes('stack'),false);
        }
        for(const code of ['NOT_PENDING','NOT_READY','SOURCE_CHANGED','STALE_PLAN','ALREADY_APPROVED','REQUEST_CONFLICT']){
            releaseFailure=new releaseModel.RecoveryReleaseError(code);assert.equal(await request('POST','/releases/preview',good),409);assert.equal(responseBody.errorCode,'RECOVERY_RELEASE_'+code);
        }
        releaseFailure=null;releaseOtherScope=true;const beforeScopeMismatch=calls;
        assert.equal(await request('POST',`/releases/${revision}/jobs/${revision}/deliver`,good),404);assert.equal(calls,beforeScopeMismatch+1,'Wrong parent must not invoke delivery');
        assert.equal(await request('GET',`/releases/${revision}/finalizations/${revision}`,good),404);
    }finally{await app.close();}
});
