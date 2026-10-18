const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('./load-typescript.cjs');
const {SessionRecordingService}=load(path.join(__dirname,'../src/modules/connections/session-recording.service.ts'),{
 '@common/config/app-config/typed-config.service':{},'@common/database/prisma.service':{},'@queue/_nodes':{}
});
const {EMPTY_RECORDING}=load(path.join(__dirname,'../src/modules/connections/session-recording-state.ts'));
test('recording validates bounds and user lookup before any database query',async()=>{
 const service=new SessionRecordingService({}, {}, {});
 for(const body of [null,{}, {durationMinutes:0,intervalSeconds:30},{durationMinutes:1,intervalSeconds:1},{durationMinutes:10081,intervalSeconds:30}]) await assert.rejects(service.start(body));
 for(const ids of [undefined,[0],[-1],[1.5],Array(1001).fill(1)]) await assert.rejects(service.users(ids));
 await assert.rejects(service.remove("'bad"));await assert.rejects(service.stop('invalid'));
});
test('recording scans all online nodes, records failures and offline counts, preserves prior observations',async()=>{
 const nodes=[{uuid:'good',name:'One',countryCode:'PL',isConnected:true},{uuid:'bad',name:'Two',countryCode:'DE',isConnected:true},{uuid:'offline',isConnected:false}];
 const queues={connectionsByNode:async({nodeUuid})=>({jobId:nodeUuid}),connectionsByNodeResult:async(id)=>id==='bad'?{isFailed:true}:{isCompleted:true,result:{success:true,users:[{userId:1,ips:[{ip:'1.2.3.4',lastSeen:'2026-10-18T12:00:00Z'}]}]}}};
 const service=new SessionRecordingService({nodes:{findMany:async()=>nodes}},queues,{});
 const row={snapshot:EMPTY_RECORDING()};await service.sample(row);await service.sample(row);
 assert.equal(row.snapshot.polls,2);assert.equal(row.snapshot.failedNodePolls,2);assert.equal(row.snapshot.offlineNodePolls,2);assert.deepEqual(row.snapshot.lastFailures,['bad']);assert.equal(row.snapshot.observations.length,1);assert.equal(row.snapshot.observations[0].samples,2);
});
test('export resolves current subscription links and preserves missing users explicitly',async()=>{
 const snapshot=EMPTY_RECORDING();snapshot.observations=[{userId:1},{userId:2}];
 const db={$queryRaw:async()=>[{id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',snapshot}],users:{findMany:async()=>[{id:1n,shortUuid:'current-token',username:'alice',status:'ACTIVE'}]}};
 const service=new SessionRecordingService(db,{}, {getOrThrow:()=> 'sub.example.test'});
 const result=await service.export('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
 assert.equal(result.users[0].subscriptionUrl,'https://sub.example.test/current-token');assert.equal(result.users[0].shortUuid,undefined);assert.equal(result.users[1].deleted,true);assert.equal(result.users[1].subscriptionUrl,null);
});
