const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto'),{gzipSync}=require('node:zlib');
const load=require('./load-typescript.cjs'),model=load(path.join(__dirname,'../src/common/host-policy/usage-archive.ts'));
const request={generation:randomUUID(),requestId:randomUUID()},stream=randomUUID(),core=randomUUID();
const hash=b=>createHash('sha256').update(b).digest('hex');
const journal=(patch={})=>{const payload=Buffer.from(JSON.stringify({version:1,stream,acked:'0',ackDigest:'',pending:{sequence:'1',coreProcessId:core,capturedAt:'1792140000000',stats:[{name:'user>>>901>>>traffic>>>uplink',value:'9223372036854775807'}]},...patch}));return Buffer.concat([Buffer.from('REMNACUST-USAGE-1\n'+hash(payload)+'\n'),payload]);};
const encode=(original,patch={})=>{const raw=Buffer.from(JSON.stringify({version:model.USAGE_ARCHIVE_VERSION,...request,capturedAt:Date.now(),journal:original===null?null:{bytes:original.length,sha256:hash(original),data:original.toString('base64')},...patch}));return {version:model.USAGE_ARCHIVE_VERSION,encoding:'gzip-base64',bytes:raw.length,sha256:hash(raw),data:gzipSync(raw).toString('base64')};};
test('archive binds exact original native bytes to the request while preserving int64 and old core identities',async()=>{
 const original=journal(),decoded=await model.decodeUsageArchive(encode(original),request);
 assert.equal(decoded.state,'PRESENT');assert.deepEqual(decoded.original,original);assert.equal(decoded.metadata.stream,stream);assert.equal(decoded.metadata.pending.coreProcessId,core);assert.equal(decoded.metadata.pending.counters,1);assert(decoded.original.includes(Buffer.from('9223372036854775807')));
 const empty=await model.decodeUsageArchive(encode(journal({acked:'1',ackDigest:'a'.repeat(64),pending:null})),request);assert.equal(empty.state,'PRESENT');assert.equal(empty.metadata.pending,null);
});
test('missing, corrupt and zero-byte files are distinct evidence, never fabricated empty usage',async()=>{
 const missing=await model.decodeUsageArchive(encode(null),request);assert.equal(missing.state,'ABSENT');assert.equal(missing.original,null);assert.equal(missing.metadata,null);
 for(const original of [Buffer.alloc(0),Buffer.from('broken'),journal({acked:'7'}),journal({pending:{sequence:'1',coreProcessId:core,capturedAt:'1',stats:[{name:'untrusted',value:'1'}]}})]){
  const decoded=await model.decodeUsageArchive(encode(original),request);assert.equal(decoded.state,'INVALID');assert.deepEqual(decoded.original,original);assert.equal(decoded.metadata,null);
 }
});
test('replay, forged lengths/hashes, noncanonical base64 and compressed bombs are refused before archiving',async()=>{
 const good=encode(journal());
 for(const bad of [{...good,bytes:good.bytes+1},{...good,sha256:'0'.repeat(64)},{...good,data:good.data+'\n'},{...good,extra:true},encode(journal(),{requestId:randomUUID()}),encode(null,{generation:randomUUID()}),encode(null,{journal:{bytes:0,sha256:'0'.repeat(64),data:''}})])await assert.rejects(model.decodeUsageArchive(bad,request));
 const bomb=Buffer.alloc(model.USAGE_ARCHIVE_MAX_BYTES+1);await assert.rejects(model.decodeUsageArchive({version:model.USAGE_ARCHIVE_VERSION,encoding:'gzip-base64',bytes:1,sha256:hash(bomb),data:gzipSync(bomb).toString('base64')},request));
});
