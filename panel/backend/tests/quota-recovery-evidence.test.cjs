const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),k=require('kysely');
const load=require('./load-typescript.cjs'),root=path.join(__dirname,'../src/common/host-policy');
const {QuotaRecoveryService}=load(path.join(root,'quota-recovery.service.ts'),{'@common/axios':{},'@common/database':{}});
const {QuotaRecoveryEvidenceWriter}=load(path.join(root,'quota-recovery-evidence.ts'));
function fixture(handler){
 const queries=[];const connection={executeQuery:async query=>{queries.push(query);return {rows:handler(query,queries.length)};}};
 const driver={init:async()=>{},acquireConnection:async()=>connection,releaseConnection:async()=>{},destroy:async()=>{},beginTransaction:async()=>{},commitTransaction:async()=>{},rollbackTransaction:async()=>{}};
 const db={kysely:new k.Kysely({dialect:{createDriver:()=>driver,createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()}})};
 return {service:new QuotaRecoveryService(db,{},{}),queries,db};
}
test('history cursor retains PostgreSQL microseconds instead of losing rows through a JavaScript Date',async()=>{
 const exact='2026-10-16 05:30:00.123456+00',id='11111111-1111-4111-8111-111111111111';
 const f=fixture((query,n)=>n===1?[{at:exact,id}]:[]);await f.service.history(id,id);
 assert.equal(f.queries.length,2);assert(f.queries[1].parameters.includes(exact));assert(!f.queries[1].parameters.some(p=>p instanceof Date));
});
test('a missing or foreign cursor fails before a page or archive is exposed',async()=>{
 const f=fixture(()=>[]);await assert.rejects(f.service.history('node','cursor'),/EVIDENCE_MISSING/);assert.equal(f.queries.length,1);
 await assert.rejects(f.service.evidenceArtifact('node','request','digest'),/EVIDENCE_MISSING/);
});
test('download verifies the stored compressed checksum before returning any archive bytes',async()=>{
 const data=require('node:zlib').gzipSync('fixture'),digest=require('node:crypto').createHash('sha256').update(data).digest('hex');
 const corrupt=fixture(()=>[{compressed:data,compressedDigest:'0'.repeat(64)}]);await assert.rejects(corrupt.service.evidenceArtifact('node','request','digest'),/EVIDENCE_CORRUPT/);
 const good=fixture(()=>[{compressed:data,compressedDigest:digest}]);assert.deepEqual((await good.service.evidenceArtifact('node','request','digest')).data,data);
});
test('an evidence writer refuses nontransactional or oversized input before any SQL write',async()=>{
 const f=fixture(()=>[]);const writer=new QuotaRecoveryEvidenceWriter(f.db,{}, {},()=>false);
 await assert.rejects(writer.append('GRANTS',['{}']),/active transaction/);await assert.rejects(writer.finish({}),/active transaction/);assert.equal(f.queries.length,0);
 const active=new QuotaRecoveryEvidenceWriter(f.db,{}, {},()=>true);
 await assert.rejects(active.append('GRANTS',Array(501).fill('{}')),/capacity/);
 await assert.rejects(active.append('STATE',['"'+'x'.repeat(32*1024*1024)+'"']),/capacity/);
 assert.equal(f.queries.length,0);
});
