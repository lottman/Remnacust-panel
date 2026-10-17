const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto'),Redis=require('ioredis');
const load=require('./load-typescript.cjs'),url=process.env.USAGE_EXPORT_TEST_REDIS_URL;assert.ok(url);
const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'56381');assert.equal(parsed.pathname,'/15');
const redis=new Redis(url),prefix='remnacust-delivery-test:'+randomUUID(),fence=prefix+':epoch',data=prefix+':data';
(async()=>{try{
    const {RawCacheService}=load(path.join(__dirname,'../src/common/raw-cache/raw-cache.service.ts'),{'./memory-cache.service':{}});
    const cache=new RawCacheService(redis,{invalidateMany:async()=>{}});
    assert.equal(await cache.setManyFenced(fence,'9007199254740993',[{key:data,value:{owner:'old'},ttlSeconds:60}]),true);
    assert.equal(await cache.setManyFenced(fence,'9007199254740994',[{key:data,value:{owner:'new'},ttlSeconds:60}]),true);
    assert.equal(await cache.setManyFenced(fence,'9007199254740993',[{key:data,value:{owner:'late'}}]),false);
    assert.deepEqual(JSON.parse(await redis.get(data)),{owner:'new'});assert((await redis.ttl(data))>0);
    await assert.rejects(cache.setManyFenced(fence,'bad',[{key:data,value:1}]),/epoch/);
    assert.deepEqual(JSON.parse(await redis.get(data)),{owner:'new'});
    console.log('PASS Redis atomically fences late delivery telemetry and preserves exact epochs above 2^53');
}finally{await redis.del(fence,data);await redis.quit();}})().catch(error=>{console.error(error);process.exitCode=1;});
