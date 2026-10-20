const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const load=require('./load-typescript.cjs');
const filename=path.join(__dirname,'../src/modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.handler.ts');
const mocks={};
for(const match of fs.readFileSync(filename,'utf8').matchAll(/from '([^']+)'/g)) if(/^(@common\/|@modules\/|@libs\/|\.)/.test(match[1]))mocks[match[1]]={};
class ProfileQuery{}
class SnippetsQuery{}
function setup(failure){
    const order=[];
    class Config {
        constructor(){order.push('validation');if(failure==='validation')throw new Error('private key must not leak')}
        cleanInboundClients(){}
        replaceSnippets(){order.push('snippets-expanded')}
        processCertificates(){order.push('certificates');if(failure==='certificates')throw new Error('private key must not leak')}
        getConfigHash(){return 'hash'}
        leaveInbounds(){}
        includeUserBatch(){}
        getConfig(){return {inbounds:[],outbounds:[]}}
    }
    const {GetPreparedConfigWithUsersHandler:Handler}=load(filename,{...mocks,
        '@nestjs/cqrs':{QueryHandler:()=>()=>{}},
        '@common/helpers/xray-config/xray-config.validator':{XRayConfig:Config},
        '@common/types':{fail:e=>({isOk:false,...e}),ok:response=>({isOk:true,response})},
        '@libs/contracts/constants':{ERRORS:{INTERNAL_SERVER_ERROR:{code:'A001',message:'Internal server error'}}},
        '@modules/config-profiles/queries/get-config-profile-by-uuid':{GetConfigProfileByUuidQuery:ProfileQuery},
        '@modules/config-profiles/queries/get-snippets':{GetSnippetsQuery:SnippetsQuery},
        './expand-device-users':{expandDeviceUsers:()=>[]},
    });
    const handler=new Handler({async *getUsersForConfigStream(){if(failure==='users')throw new Error('database');yield []}},
        {execute:async query=>{
            const kind=query instanceof ProfileQuery?'profile':'snippets';
            return failure===kind?{isOk:false,code:'A123',message:'Public '+kind+' error'}:{isOk:true,response:kind==='profile'?{config:{}}:[]};
        }},
        {configIdentities:async()=>{if(failure==='identities')throw new Error('database');return []}},
        {enabled:true,devicesForConfig:async()=>{if(failure==='devices')throw new Error('database');return []},credentials(){assert.fail('empty fixture has no credentials')}});
    handler.logger={error(){},debug(){}};
    return {handler,order};
}
test('config preparation retains public profile and snippet errors instead of a generic node failure',async()=>{
    for(const stage of ['profile','snippets']){
        const {handler}=setup(stage);
        assert.deepEqual(await handler.execute({configProfileUuid:'profile',activeInbounds:[]}),{isOk:false,code:'A123',message:'Public '+stage+' error'});
    }
});
test('config preparation reports a safe stage without leaking internal errors or key material',async()=>{
    for(const stage of ['validation','certificates','users','devices','identities']){
        const {handler}=setup(stage);
        const result=await handler.execute({configProfileUuid:'profile',activeInbounds:[]});
        assert.equal(result.isOk,false);
        assert.equal(result.message,`Node configuration preparation failed [${stage}]`);
    }
});
test('certificate resolution runs after snippet expansion and successful preparation remains intact',async()=>{
    const {handler,order}=setup();
    assert.equal((await handler.execute({configProfileUuid:'profile',activeInbounds:[]})).isOk,true);
    assert.deepEqual(order,['validation','snippets-expanded','certificates']);
});
