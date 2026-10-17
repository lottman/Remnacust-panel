const assert=require('node:assert/strict');const path=require('node:path');const {randomUUID}=require('node:crypto');const Redis=require('ioredis');const load=require('./load-typescript.cjs');
const url=process.env.USAGE_EXPORT_TEST_REDIS_URL;assert.ok(url,'Set USAGE_EXPORT_TEST_REDIS_URL for the disposable Redis container');const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'56381');assert.equal(parsed.pathname,'/15');
const client=new Redis(url);const stream=randomUUID(),key='remnacust-usage-export-test:'+stream,watermark='xera:usage-export:'+stream;
(async()=>{try{
    const {RawCacheService}=load(path.join(__dirname,'../src/common/raw-cache/raw-cache.service.ts'),{'./memory-cache.service':{}});const cache=new RawCacheService(client,{});
    await cache.xaddUsageReceiptOnce(key,1000,{receipt:'first',records:'901:10'},stream,'9007199254740993',0);
    await cache.xaddUsageReceiptOnce(key,1000,{receipt:'duplicate',records:'901:10'},stream,'9007199254740993',0);
    await cache.xaddUsageReceiptOnce(key,1000,{receipt:'older',records:'901:10'},stream,'9007199254740992',0);
    await cache.xaddUsageReceiptOnce(key,1000,{receipt:'next',records:'901:11'},stream,'9007199254740994',0);
    await cache.xaddUsageReceiptOnce(key,1000,{receipt:'batch',records:'902:12'},stream,'9007199254740994',1);
    await cache.xaddUsageReceiptOnce(key,1000,{receipt:'late-old',records:'901:10'},stream,'9007199254740993',0);
    const rows=await client.xrange(key,'-','+');assert.equal(rows.length,3);assert.deepEqual(rows.map(row=>row[1][1]),['first','next','batch']);
    assert.equal(await client.hlen(watermark),2);assert.equal(await client.hget(watermark,'0'),'9007199254740994');
    console.log('PASS actual Redis/Valkey: atomic replay filtering, exact sequences beyond 53 bits and bounded per-batch watermarks');
} finally {await client.del(key,watermark);await client.quit();}})().catch(error=>{console.error(error);process.exitCode=1;});
