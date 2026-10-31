const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const load=require('./load-typescript.cjs');
const utils=path.join(__dirname,'../src/common/utils');
const {publicGeofileOrigin}=load(path.join(utils,'public-geofile-origin.ts'));
const {relayGeofileOrigin,GEOFILE_ORIGIN_HEADER}=load(path.join(utils,'geofile-relay-origin.ts'));
const context=load(path.join(utils,'geofile-request-context.ts'));
const {JwtService}=require('@nestjs/jwt');
const {mocks,pool}=require('./client-pool-fixture.cjs');
const {GeofilesService}=load(path.join(__dirname,'../src/modules/subscription-template/geofiles/geofiles.service.ts'),{
 ...mocks,'../generators/client-pool':pool,'@common/config/app-config/typed-config.service':{},'@common/database/prisma.service':{},
 '../../../common/utils/geofile-request-context':context,
});

test('public authority parsing never accepts credentials, paths, lists, private IPs or header injection',()=>{
 assert.equal(publicGeofileOrigin('CDN.Example.test:8443'),'https://cdn.example.test:8443');
 for(const host of [undefined,['cdn.test'],'','cdn.test\r\nX: test','cdn.test/path','user@cdn.test','cdn.test?x=1','cdn.test#x','cdn.test,evil.test','127.0.0.1','2130706433','[::1]','localhost','node.local','cdn.test:0','cdn.test:65536','cdn.test\\evil','%65vil.test','cdn.test.'])assert.equal(publicGeofileOrigin(host),undefined,String(host));
 assert.equal(fs.readFileSync(path.join(utils,'public-geofile-origin.ts'),'utf8').replaceAll('\r\n','\n'),fs.readFileSync(path.join(__dirname,'../../../subscription-page/backend/src/common/utils/public-geofile-origin.ts'),'utf8').replaceAll('\r\n','\n'));
});

test('relayed authority requires a real current subscription-page API token; client forwarding headers are ignored',async()=>{
 const jwt=new JwtService({secret:'fixture-origin-key'});const uuid='01234567-89ab-4def-8123-456789abcdef';
 const token=jwt.sign({uuid,role:'API'},{expiresIn:300});
 const headers={[GEOFILE_ORIGIN_HEADER]:'https://cdn.example.test',authorization:'Bearer '+token,'x-forwarded-host':'evil.test'};
 const verify=t=>jwt.verifyAsync(t,{algorithms:['HS256']});
 let row={expireAt:new Date(Date.now()+300000),scopes:['subscriptions:subpage-config']};let reads=0;
 const lookup=async id=>{reads++;assert.equal(id,uuid);return row;};
 assert.equal(await relayGeofileOrigin(headers,verify,lookup),'https://cdn.example.test');
 row=undefined;assert.equal(await relayGeofileOrigin(headers,verify,lookup),undefined);
 row={expireAt:new Date(Date.now()+300000),scopes:['users:get']};assert.equal(await relayGeofileOrigin(headers,verify,lookup),undefined);
 row={expireAt:new Date(Date.now()-1),scopes:['*']};assert.equal(await relayGeofileOrigin(headers,verify,lookup),undefined);
 const before=reads;assert.equal(await relayGeofileOrigin({...headers,authorization:'Bearer invalid'},verify,lookup),undefined);assert.equal(reads,before);
 assert.equal(await relayGeofileOrigin({'x-forwarded-host':'evil.test','x-forwarded-proto':'https'},verify,lookup),undefined);
 for(const origin of ['http://cdn.example.test','https://cdn.example.test/path','https://user@cdn.example.test','https://cdn.example.test,evil.test'])assert.equal(await relayGeofileOrigin({...headers,[GEOFILE_ORIGIN_HEADER]:origin},verify,lookup),undefined);
 const permanent=jwt.sign({uuid,role:'API',permanent:true});row={expireAt:null,scopes:['subscriptions:subpage-config']};assert.equal(await relayGeofileOrigin({...headers,authorization:'Bearer '+permanent},verify,lookup),'https://cdn.example.test');
 const admin=jwt.sign({uuid,role:'ADMIN'},{expiresIn:300});assert.equal(await relayGeofileOrigin({...headers,authorization:'Bearer '+admin},verify,lookup),undefined);
});

test('parallel CDN requests share file signatures but never leak authorities into another response or background task',async()=>{
 const service=new GeofilesService({getOrThrow:k=>k==='SUB_PUBLIC_DOMAIN'?'canonical.example.test':'fixture-origin-key'}, {}, {});
 service.bundleContent=async()=>Buffer.from('fixture-bundle');
 const id='a'.repeat(34),originA='https://cdn-a.example.test',originB='https://cdn-b.example.test:8443';
 const values=await Promise.all(Array.from({length:40},(_,i)=>context.withGeofileOrigin(i%2?originA:originB,async()=>{
  await new Promise(r=>setTimeout(r,i%3));return service.bundleUrl('geosite',[id]);
 })));
 for(let i=0;i<values.length;i++)assert.equal(new URL(values[i]).origin,i%2?originA:originB);
 assert.equal(new Set(values.map(v=>new URL(v).pathname)).size,1);
 const url=new URL(values[0]);const parts=url.pathname.split('/');assert.deepEqual(await service.bundle(id,parts.at(-1),parts.at(-2)),Buffer.from('fixture-bundle'));
 assert((await service.bundleUrl('geosite',[id])).startsWith('https://canonical.example.test/geofiles/'));
 await assert.rejects(context.withGeofileOrigin(originA,async()=>{throw Error('fixture');}),/fixture/);
 assert.equal(context.requestGeofileBase('fallback'),'fallback');
});
