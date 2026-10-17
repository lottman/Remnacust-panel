const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),k=require('kysely'),{gzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const load=require('./load-typescript.cjs');const {QuotaReceiptRecoveryService}=load(path.join(__dirname,'../src/common/host-policy/quota-receipt-recovery.service.ts'),{'@common/axios':{},'@common/database':{}});
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(handler){const queries=[],connection={executeQuery:async query=>{queries.push(query);return {rows:handler(query,queries.length)};}};const driver={init:async()=>{},acquireConnection:async()=>connection,releaseConnection:async()=>{},destroy:async()=>{},beginTransaction:async()=>{},commitTransaction:async()=>{},rollbackTransaction:async()=>{}};const db={kysely:new k.Kysely({dialect:{createDriver:()=>driver,createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()}})};return {queries,service:new QuotaReceiptRecoveryService(db,{}, {})};}
test('receipt history uses an exact SQL timestamp cursor and refuses a foreign or absent request',async()=>{
 const exact='2026-10-16 11:00:00.123456+00',f=fixture((q,n)=>n===1?[{at:exact,id:'id'}]:[]);await f.service.history('node','id');assert(f.queries[1].parameters.includes(exact));assert(!f.queries[1].parameters.some(p=>p instanceof Date));
 const missing=fixture(()=>[]);await assert.rejects(missing.service.history('node','foreign'),/SOURCE_MISSING/);assert.equal(missing.queries.length,1);
});
test('original-file download validates both compressed and raw hashes, while preserving a captured empty file',async()=>{
 const original=Buffer.from('original journal'),compressed=gzipSync(original),valid={compressed,compressedDigest:hash(compressed),digest:hash(original),bytes:original.length};
 for(const patch of [{compressedDigest:'0'.repeat(64)},{digest:'0'.repeat(64)},{bytes:original.length+1},{compressed:Buffer.from('notgzip'),compressedDigest:hash(Buffer.from('notgzip'))}])await assert.rejects(fixture(()=>[{...valid,...patch}]).service.download('node','request'),/SOURCE_CORRUPT/);
 assert.deepEqual((await fixture(()=>[valid]).service.download('node','request')).data,compressed);
 const empty=gzipSync(Buffer.alloc(0));assert.deepEqual((await fixture(()=>[{compressed:empty,compressedDigest:hash(empty),digest:hash(Buffer.alloc(0)),bytes:0}]).service.download('node','request')).data,empty);
});
