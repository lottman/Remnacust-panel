const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {gzipSync}=require('node:zlib'),{createHash,randomUUID}=require('node:crypto');
const load=require('./load-typescript.cjs');
const root=path.join(__dirname,'../src/common/host-policy');
const {decodeRecoverySnapshot}=load(path.join(root,'quota-recovery-snapshot.ts'));
const {recoverySnapshotReport}=load(path.join(root,'quota-recovery-report.ts'));
const request={generation:randomUUID(),requestId:randomUUID()},instance=randomUUID(),core=randomUUID();
const id=n=>`${n.toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`;
const entry=n=>({id:id(n),group:'host:fixture',owner:'9223372036854775807',expiresAt:Date.parse('2030-01-01'),ceiling:'9223372036854775807',reserved:'9007199254740993',prepared:true,activated:true,scale:100});
const payload=()=>({version:'remnacust-quota-snapshots-v1',...request,instance,sequence:20,checkpoint:19,retiredBefore:0,registrationsRequired:true,watermarksRequired:true,policyRevision:'10',coreProcessId:core,capturedAt:Date.now(),entries:[entry(0)]});
const encode=p=>{const raw=Buffer.isBuffer(p)?p:Buffer.from(JSON.stringify(p));return {version:'remnacust-quota-snapshots-v1',encoding:'gzip-base64',bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),data:gzipSync(raw).toString('base64')};};
const basis=count=>({node:{name:'node',address:'private',port:1,proxyUrl:null,disabled:false},mode:{instance},revision:'10',watermarks:[{instance,sequence:'20',revision:'10'}],grants:[],grantCount:String(count),exposures:'0',stream:{core:null,digest:null}});
const status={applied:true,quotaReservesSupported:true,quotaWatermarksSupported:true,quotaSnapshotsSupported:true,quotaInstanceId:instance,quotaJournalSequence:'20',policyRevision:'10',coreProcessId:core};
const grant=n=>({id:id(n),instance,group:'host:fixture',owner:'9223372036854775807',ceiling:'9223372036854775807',expiresAt:'2030-01-01T00:00:00.000Z',closedUsage:null,activation:'10',registrationRequired:true,registered:true,identity:{source:'ISSUED',subject:core,current:core}});

test('streamed ownership beyond the first SQL page stays unresolved after a numeric ID is reused',async()=>{
 const p=payload();p.entries=Array.from({length:1001},(_,n)=>entry(n));const snapshot=await decodeRecoverySnapshot(encode(p),request);
 for(const identity of [{source:'LEGACY',subject:null,current:core},{source:'ISSUED',subject:core,current:randomUUID()}]){
  async function* stream(){for(let n=0;n<1001;n++)yield {...grant(n),...(n===1000?{identity}:{})};}
  const report=await recoverySnapshotReport(basis(1001),status,snapshot,stream());
  assert(report.issues.includes(identity.source==='LEGACY'?'OWNER_UNPROVEN':'OWNER_CHANGED'));
  assert.equal(report.missingGrants,0);assert.equal(report.unknownGrants,0);
 }
});

test('recovery pause proof is checksummed and must remain identical between live status and snapshot',async()=>{
 const record={version:'remnacust-quota-recovery-fence-v1',generation:'11111111-1111-4111-8111-111111111111',token:'22222222-2222-4222-8222-222222222222',state:'FENCED',sequence:'1',previous:null,
  digest:'a956d69b330b83f9d303c91064f5f9cbb7728c1df810bbf11a122dcc52e0fc8b'};
 const recovery={version:record.version,record},data={...payload(),recovery};
 const decoded=await decodeRecoverySnapshot(encode(data),request);
 const stream=async function*(){yield grant(0);};
 const matching=await recoverySnapshotReport(basis(1),{...status,quotaRecoveryFencesSupported:true,quotaRecovery:recovery},decoded,stream());
 assert.deepEqual(matching.issues,[]);assert.deepEqual(matching.recoveryFence,record);
 const changed=await recoverySnapshotReport(basis(1),{...status,quotaRecoveryFencesSupported:true,quotaRecovery:{version:record.version,record:null}},decoded,stream());
 assert(changed.issues.includes('STATE_CHANGED'));
 const unverified=await recoverySnapshotReport(basis(1),{...status,quotaRecoveryFencesSupported:true,quotaRecovery:null},decoded,stream());
 assert(unverified.issues.includes('RECOVERY_FENCE_UNVERIFIED'));
 await assert.rejects(decodeRecoverySnapshot(encode({...data,recovery:{...recovery,record:{...record,digest:'0'.repeat(64)}}}),request));
});
test('compressed snapshots preserve native capacity and exact amounts; no pagination is fabricated',async()=>{
 const p=payload();p.entries=Array.from({length:100000},(_,n)=>entry(n));
 const decoded=await decodeRecoverySnapshot(encode(p),request);assert.equal(decoded.entries.length,100000);assert.equal(decoded.entries.at(-1).reserved,'9007199254740993');
 assert.equal(decoded.digest,encode(p).sha256);assert.equal(decoded.requestId,request.requestId);
});
test('request replay, false digest/length and malformed or excessive compression are rejected',async()=>{
 const good=encode(payload());
 for(const bad of [{...good,sha256:'0'.repeat(64)},{...good,bytes:good.bytes+1},{...good,data:good.data+'\n'},{...good,encoding:'json'},{...good,extra:1}])await assert.rejects(decodeRecoverySnapshot(bad,request));
 await assert.rejects(decodeRecoverySnapshot(good,{...request,requestId:randomUUID()}));
 await assert.rejects(decodeRecoverySnapshot(good,{...request,generation:randomUUID()}));
 const bomb=encode(Buffer.alloc(32*1024*1024+1));bomb.bytes=1;
 await assert.rejects(decodeRecoverySnapshot(bomb,request),/size|length|large/i);
});
test('duplicates, unsorted IDs, invalid lifecycle, numeric amounts and checkpoints cannot become a valid observation',async()=>{
 for(const mutate of [p=>p.entries.push({...p.entries[0]}),p=>p.entries=[entry(1),entry(0)],p=>p.checkpoint=21,p=>p.watermarksRequired=false,p=>p.registrationsRequired=false,p=>p.entries[0].owner='9223372036854775808',p=>p.entries[0].ceiling=10,p=>p.entries[0].reserved='9223372036854775808',p=>p.entries[0].prepared=false,p=>p.entries[0].activated=false,p=>p.entries[0].id='AAAAAAAA-1111-4111-8111-111111111111']){
  const p=payload();mutate(p);await assert.rejects(decodeRecoverySnapshot(encode(p),request));
 }
});
test('streaming comparison visits every SQL page, including unknown and missing reserves past the old 500 cutoff',async()=>{
 const p=payload();p.entries=Array.from({length:2001},(_,n)=>entry(n));const snapshot=await decodeRecoverySnapshot(encode(p),request);
 let visits=0;async function* grants(){for(let n=0;n<2001;n++){visits++;yield grant(n);}}
 const matched=await recoverySnapshotReport(basis(2001),status,snapshot,grants());assert.deepEqual(matched.issues,[]);assert.equal(visits,2001);assert.equal(matched.nodeGrants,2001);
 snapshot.entries.splice(1550,1);snapshot.entries.push(entry(9000));visits=0;
 const changed=await recoverySnapshotReport(basis(2001),status,snapshot,grants());assert.equal(visits,2001);assert.equal(changed.missingGrants,1);assert.equal(changed.unknownGrants,1);assert(changed.issues.includes('MISSING_RESERVES'));assert(changed.issues.includes('UNKNOWN_RESERVES'));assert(!changed.issues.includes('PAGINATION_REQUIRED'));
});
test('late binding differences, changed incarnation and inconsistent SQL roster never appear matched',async()=>{
 const p=payload();p.entries=Array.from({length:1001},(_,n)=>entry(n));const snapshot=await decodeRecoverySnapshot(encode(p),request);
 async function* grants(){for(let n=0;n<1001;n++)yield {...grant(n),...(n===999?{closedUsage:'1'}:{})};}
 const report=await recoverySnapshotReport(basis(1002),{...status,coreProcessId:randomUUID()},snapshot,grants());
 assert(report.issues.includes('SETTLEMENT_REQUIRED'));assert(report.issues.includes('STATE_CHANGED'));
 async function* unordered(){yield grant(1);yield grant(0);}
 await assert.rejects(recoverySnapshotReport(basis(2),status,snapshot,unordered()),/Unordered/);
});
