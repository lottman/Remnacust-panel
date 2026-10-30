const assert=require('node:assert/strict');
const test=require('node:test');
const path=require('node:path');
const jwt=require('jsonwebtoken');
const load=require('./load-typescript.cjs');
const contract=require('../libs/contract/build/backend');
const {SignApiTokenHandler}=load(path.join(__dirname,'../src/modules/auth/commands/sign-api-token/sign-api-token.handler.ts'),{
    '@common/types':{ok:response=>({isOk:true,response})},
    '@libs/contracts/constants':{ROLE:{API:'API'}},
    './sign-api-token.command':{SignApiTokenCommand:class{}},
});
const secret='test-permanent-token-secret-32-characters-minimum';

test('a permanent API token has an explicit marker and no fabricated expiration',async()=>{
    const handler=new SignApiTokenHandler({sign:(payload,options)=>jwt.sign(payload,secret,options)});
    const result=await handler.execute({uuid:'fixture',expireInDays:null});
    const claims=jwt.verify(result.response,secret,{algorithms:['HS256']});
    assert.equal(claims.role,'API');assert.equal(claims.permanent,true);assert.equal(claims.exp,undefined);
    const finite=jwt.decode((await handler.execute({uuid:'fixture',expireInDays:30})).response);
    assert.equal(finite.exp-finite.iat,30*86400);assert.equal(finite.permanent,undefined);
});

test('API contracts preserve finite clients and require explicit null for permanent tokens',()=>{
    const schema=contract.CreateApiTokenCommand.RequestBodySchema;
    assert.equal(schema.parse({name:'Test',expiresInDays:null,scopes:['users:update']}).expiresInDays,null);
    assert.equal(schema.parse({name:'Test',expiresInDays:30}).expiresInDays,30);
    assert.deepEqual(schema.parse({name:'Test',expiresInDays:30}).scopes,[]);
    for(const value of [0,-1,1.5,Infinity,365001,undefined])assert.equal(schema.safeParse({name:'Test',expiresInDays:value}).success,false);
    assert.equal(contract.UpdateUserCommand.RequestBodySchema.safeParse({id:1,status:'FROZEN'}).success,true);
    assert.equal(contract.UpdateUserCommand.RequestBodySchema.safeParse({id:1,status:'ACTIVE'}).success,true);
});

test('creating a permanent token stores null and preserves the explicitly selected scopes',async()=>{
    class Entity {constructor(data){Object.assign(this,data)}}
    class Sign {constructor(uuid,expireInDays){Object.assign(this,{uuid,expireInDays})}}
    const signed=[],written=[],events=[];
    const {ApiTokensService}=load(path.join(__dirname,'../src/modules/api-tokens/api-tokens.service.ts'),{
        '@common/types':{ok:response=>({isOk:true,response}),fail:error=>({isOk:false,error})},
        '@libs/contracts/constants':{ERRORS:{CREATE_API_TOKEN_ERROR:'create',INVALID_API_TOKEN_SCOPE:'scope'},EVENTS:{SERVICE:{API_TOKEN_CREATED:'created'}}},
        '@modules/auth/commands/sign-ott-token/sign-ott-token.command':{},
        '@integration-modules/notifications/interfaces':{ServiceEvent:class{constructor(name,data){this.data=data}}},
        '../auth/commands/sign-api-token/sign-api-token.command':{SignApiTokenCommand:Sign},
        './entities/api-token.entity':{ApiTokenEntity:Entity},
        './models':{CreateApiTokenResponseModel:class extends Entity {constructor(data,token){super(data);this.token=token}}},
    });
    const service=new ApiTokensService({}, {create:async row=>{written.push(row);return row}},
        {execute:async command=>{signed.push(command);return {isOk:true,response:'fixture-token'}}},
        {},{findInvalidScopes:()=>[]},{emit:(_,event)=>events.push(event)});
    const result=await service.create({name:'User bot',expiresInDays:null,scopes:['users:update']});
    assert.equal(result.isOk,true);assert.equal(written[0].expireAt,null);
    assert.equal(signed[0].expireInDays,null);assert.equal(result.response.expireAt,null);
    assert.deepEqual(written[0].scopes,['users:update']);assert.equal(events[0].data.apiToken.expireAt,null);
});
