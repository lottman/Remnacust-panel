const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {PrismaClient}=require('@prisma/client');const {TransactionHost}=require('@nestjs-cls/transactional');const k=require('kysely');
const load=require('./load-typescript.cjs');const {source}=require('./upstream-filter-fixture.cjs');
const {PrismaTxDriver}=require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const url=process.env.PORT_PLANS_TEST_DATABASE_URL;assert.ok(url);const parsed=new URL(url);
assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'55439');assert.equal(parsed.pathname,'/remnacust_port_plans_test');
const prisma=new PrismaClient({datasourceUrl:url});
let rejectPortCommit=false;
const tx=new TransactionHost({defaultTxOptions:{},getFallbackInstance:()=>prisma,wrapWithTransaction:(opts,fn,set)=>prisma.$transaction(async client=>{set(client);const value=await fn();if(rejectPortCommit){rejectPortCommit=false;throw Error('Injected port-plan commit failure');}return value;},opts)});
const {CustomCamelCasePlugin,JSON_COLUMNS}=load(path.join(__dirname,'../src/common/database/camel-case.plugin.ts'));
const db={kysely:new k.Kysely({dialect:{createDriver:()=>new PrismaTxDriver(tx),createAdapter:()=>new k.PostgresAdapter(),createIntrospector:db=>new k.PostgresIntrospector(db),createQueryCompiler:()=>new k.PostgresQueryCompiler()},plugins:[new CustomCamelCasePlugin({excludeColumns:JSON_COLUMNS})]})};
const leaseModule=source('queue/_nodes/port-plan-lease.service.ts',{'@common/database':{}});
const leases=new leaseModule.PortPlanLeaseService(db,tx);let leaseA=null,leaseB=null;
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',IA='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',IB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc',N='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const S1='11111111-1234-4123-8123-123456789012',S2='22222222-1234-4123-8123-123456789012';
const helpers=load(path.join(__dirname,'../src/common/helpers/kysely/get-kysely-uuid.ts'));
const {UsersRepository}=source('modules/users/repositories/users.repository.ts',{'@common/helpers/kysely':helpers,
    '@common/utils/get-elapsed-time':source('common/utils/get-elapsed-time.ts')});
const users=new UsersRepository(tx,db,{});users.logger={log(){}};
const result=source('common/types/result.type.ts');
const flow=source('common/utils/flow/get-vless-flow.ts');
const {XRayConfig}=source('common/helpers/xray-config/xray-config.validator.ts',{'@common/utils/flow/get-vless-flow':flow,
    './ss-cipher':source('common/helpers/xray-config/ss-cipher.ts')});
const profileQuery=source('modules/config-profiles/queries/get-config-profile-by-uuid/get-config-profile-by-uuid.query.ts');
const preparedQuery=source('modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.query.ts');
const snippetsQuery=source('modules/config-profiles/queries/get-snippets/get-snippets.query.ts');
const {GetPreparedConfigWithUsersHandler}=source('modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.handler.ts',{
    '@common/helpers/xray-config/xray-config.validator':{XRayConfig},'@common/types':result,'@libs/contracts/constants':{ERRORS:{INTERNAL_SERVER_ERROR:{code:'TEST_PREPARATION_FAILED',message:'Preparation failed'}}},
    '@modules/config-profiles/queries/get-config-profile-by-uuid':profileQuery,'@modules/config-profiles/queries/get-snippets':snippetsQuery,
    './get-prepared-config-with-users.query':preparedQuery,'./expand-device-users':source('modules/users/queries/get-prepared-config-with-users/expand-device-users.ts')});
let beforePrepared=null;const calls=[];
const queries={execute:async query=>{
    if(query instanceof profileQuery.GetConfigProfileByUuidQuery){
        const profile=(await k.sql`SELECT uuid,config FROM config_profiles WHERE uuid=${query.uuid}::uuid`.execute(db.kysely)).rows[0];
        const inbounds=(await k.sql`SELECT uuid,profile_uuid,tag,type,network,security,port,raw_inbound FROM config_profile_inbounds WHERE profile_uuid=${query.uuid}::uuid`.execute(db.kysely)).rows;
        return profile?result.ok({...profile,inbounds}):result.fail({code:'MISSING',message:'Missing profile'});
    }
    if(query instanceof snippetsQuery.GetSnippetsQuery)return result.ok([]);
    if(query instanceof preparedQuery.GetPreparedConfigWithUsersQuery){calls.push({profile:query.configProfileUuid,inbounds:query.activeInbounds.map(i=>i.uuid)});if(beforePrepared){const action=beforePrepared;beforePrepared=null;await action();}return preparer.execute(query);}
    throw Error('Unexpected query');
}};
const preparer=new GetPreparedConfigWithUsersHandler(users,queries,{configIdentities:async()=>[]},{enabled:false});preparer.logger={debug(){},error(error){console.error(error);}};
const planModel=source('modules/nodes/profile-port-plan.ts');
const listenerModel=source('modules/nodes/port-listener-networks.ts',{'./profile-port-plan':planModel});
const graphModel=source('modules/nodes/profile-graph-plan.ts',{'./profile-port-plan':planModel,'./port-listener-networks':listenerModel});
const planModule=source('modules/nodes/queries/get-prepared-node-ports.ts',{'@common/database':{},'@common/helpers/xray-config/xray-config.validator':{XRayConfig},
    '@modules/config-profiles/queries/get-config-profile-by-uuid':profileQuery,
    '@modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.query':preparedQuery,
    '../profile-port-plan':planModel,'../port-listener-networks':listenerModel,'../profile-graph-plan':graphModel});
const handler=new planModule.GetPreparedNodePortsHandler(db,queries),query=new planModule.GetPreparedNodePortsQuery(N);
const recorded=source('modules/nodes/commands/record-port-plan-result.ts',{'@common/database':{}});
const recorder=new recorded.RecordPortPlanResultHandler(db);
const inboundEntities=source('modules/config-profiles/entities/config-profile-inbound.entity.ts');
const nodeEntities=source('modules/nodes/entities/nodes.entity.ts',{'@modules/config-profiles/entities':inboundEntities});
const {NodesRepository}=source('modules/nodes/repositories/nodes.repository.ts',{'../entities/nodes.entity':nodeEntities});
const nodesRepository=new NodesRepository(tx,db,null);
const profileCriteria=source('modules/nodes/queries/find-nodes-by-criteria/find-nodes-by-criteria.query.ts');
const portNodes=source('modules/nodes/queries/get-port-plan-node-uuids.ts',{'@common/database':{}});
const portNodesHandler=new portNodes.GetPortPlanNodeUuidsHandler(db);
const inputModel=source('modules/nodes/node-port-plans.schema.ts');
const dispatchModule=source('modules/nodes/port-plan-dispatch.service.ts',{'@common/database':{}});
const queued=[];let queueUnavailable=false;
const dispatcher=new dispatchModule.PortPlanDispatchService(db,{startNode:async task=>{
    assert.equal(tx.isTransactionActive(),false,'Redis delivery follows commit');
    const visible=(await prisma.$queryRaw`SELECT revision FROM xera_node_port_plans WHERE node_uuid=${task.nodeUuid}::uuid`)[0];assert(visible);
    if(queueUnavailable)throw Error('Simulated Redis outage');queued.push(task);
}});
const editorModule=source('modules/nodes/node-port-plans.service.ts',{'@common/database':{},'@common/helpers/xray-config/xray-config.validator':{XRayConfig},
    '@common/axios/profile-traffic.schema':load(path.join(__dirname,'../src/common/axios/profile-traffic.schema.ts')),
    './profile-graph-plan':graphModel,
    './profile-port-plan':planModel,'./port-listener-networks':listenerModel,'./node-port-plans.schema':inputModel,'./port-plan-dispatch.service':dispatchModule});
const editor=new editorModule.NodePortPlansService(db,tx,dispatcher,{get:async()=>null});
const configuration=tag=>({log:{loglevel:'none'},inbounds:[{tag,listen:'0.0.0.0',port:443,protocol:'vless',settings:{decryption:'none',clients:[{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}]}},
    {tag:tag+'-unused',port:444,protocol:'vless',settings:{decryption:'none',clients:[]}}],outbounds:[{tag:'direct',protocol:'freedom',settings:{}},{tag:'block',protocol:'blackhole',settings:{}}]});
(async()=>{try{
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n,0n,'Refuse existing users');
    await prisma.$transaction(async t=>{
        const seed=fs.readFileSync(path.join(__dirname,'fixtures/host-policy-seed.sql'),'utf8').replace('BEGIN;','');for(const statement of seed.split(';').filter(s=>s.trim()))await t.$executeRawUnsafe(statement);
        await t.$executeRaw`UPDATE nodes SET port=2222,active_config_profile_uuid=${A}::uuid WHERE uuid=${N}::uuid`;
        await t.$executeRaw`UPDATE config_profiles SET config=${JSON.stringify(configuration('shared'))}::jsonb WHERE uuid=${A}::uuid`;
        await t.$executeRaw`INSERT INTO config_profiles(uuid,name,config) VALUES(${B}::uuid,'second-profile',${JSON.stringify(configuration('second'))}::jsonb)`;
        await t.$executeRaw`INSERT INTO config_profile_inbounds(uuid,profile_uuid,tag,type,raw_inbound) VALUES(${IB}::uuid,${B}::uuid,'second','vless',${JSON.stringify(configuration('second').inbounds[0])}::jsonb)`;
        await t.$executeRaw`INSERT INTO config_profile_inbounds_to_nodes(config_profile_inbound_uuid,node_uuid) VALUES(${IB}::uuid,${N}::uuid)`;
        await t.$executeRaw`DELETE FROM internal_squad_inbounds WHERE internal_squad_uuid='22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`;
        await t.$executeRaw`INSERT INTO internal_squad_inbounds(internal_squad_uuid,inbound_uuid) VALUES('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',${IB}::uuid)`;
    });
    assert.equal(await handler.execute(query),null,'Legacy nodes have no invented port plan');
    const initialClock=(await prisma.$queryRaw`SELECT revision FROM xera_device_state WHERE id=1`)[0].revision;
    await prisma.$executeRaw`INSERT INTO xera_node_port_plans(node_uuid) VALUES(${N}::uuid)`;
    await prisma.$executeRaw`INSERT INTO xera_node_port_bindings(uuid,node_uuid,config_profile_uuid,config_profile_inbound_uuid,listen_address,port,networks)
        VALUES(${S1}::uuid,${N}::uuid,${A}::uuid,${IA}::uuid,'127.0.0.1',20001,ARRAY['tcp']),(${S2}::uuid,${N}::uuid,${B}::uuid,${IB}::uuid,'127.0.0.1',20002,ARRAY['tcp'])`;
    assert.equal((await prisma.$queryRaw`SELECT revision FROM xera_device_state WHERE id=1`)[0].revision,initialClock+1n);
    await assert.rejects(prisma.$executeRaw`UPDATE xera_node_port_bindings SET config_profile_uuid=${B}::uuid WHERE uuid=${S1}::uuid`,/foreign key constraint/i);
    await assert.rejects(prisma.$executeRaw`UPDATE xera_node_port_bindings SET networks=ARRAY['tcp','tcp'] WHERE uuid=${S1}::uuid`,/check constraint/i);
    await assert.rejects(prisma.$executeRaw`UPDATE xera_node_port_bindings SET networks=ARRAY[ARRAY['tcp','udp']] WHERE uuid=${S1}::uuid`,/check constraint/i);
    await assert.rejects(prisma.$executeRaw`UPDATE xera_node_port_bindings SET listen_address='127.0.0.1/24' WHERE uuid=${S1}::uuid`,/check constraint/i);
    await assert.rejects(prisma.$executeRaw`DELETE FROM config_profile_inbounds_to_nodes WHERE config_profile_inbound_uuid=${IB}::uuid AND node_uuid=${N}::uuid`,/foreign key constraint/i);
    console.log('PASS PostgreSQL binds the correct profile/inbound pair and rejects duplicate networks or subnet listeners');
    const prepared=await handler.execute(query);assert.equal(prepared.portPlanRevision,'1');
    assert.deepEqual(calls.map(c=>[c.profile,c.inbounds]),[[A,[IA]],[B,[IB]]]);
    assert.deepEqual(prepared.config.inbounds.map(i=>[i.tag,i.port]),[['shared',20001],['second',20002]]);
    const first=prepared.config.inbounds.find(i=>i.tag==='shared'),second=prepared.config.inbounds.find(i=>i.tag==='second');
    assert.deepEqual(first.settings.clients.map(c=>c.id),['dddddddd-dddd-4ddd-8ddd-dddddddddddd']);
    assert.deepEqual(second.settings.clients.map(c=>c.id),['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']);
    assert.ok(prepared.hashesPayload.inbounds.every(i=>i.usersCount===1));
    console.log('PASS actual user SQL and prepared-config handler preserve separate squad credentials and strip stale/unselected clients');
    await prisma.$executeRaw`UPDATE xera_node_port_plans SET apply_attempts=4 WHERE node_uuid=${N}::uuid`;
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,'1',false)),true);
    const delayed=(await prisma.$queryRaw`SELECT status,error_code,extract(epoch FROM apply_after-clock_timestamp())::float8 AS seconds FROM xera_node_port_plans WHERE node_uuid=${N}::uuid`)[0];
    assert.equal(delayed.status,'ERROR');assert.equal(delayed.error_code,'NODE_APPLY_FAILED');assert(delayed.seconds>70&&delayed.seconds<=80);
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,'1',true)),true);
    assert.equal((await prisma.$queryRaw`SELECT apply_attempts FROM xera_node_port_plans WHERE node_uuid=${N}::uuid`)[0].apply_attempts,0);
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,'1',false)),false,'A late error cannot undo confirmed application');
    let application=(await prisma.$queryRaw`SELECT status,applied_revision,error_code FROM xera_node_port_plans WHERE node_uuid=${N}::uuid`)[0];
    assert.deepEqual(application,{status:'APPLIED',applied_revision:1n,error_code:null});
    await prisma.$executeRaw`UPDATE users SET status='DISABLED' WHERE id=902`;
    const disabled=await handler.execute(query);
    assert.equal(disabled.config.inbounds.find(i=>i.tag==='second').settings.clients.length,0);
    assert.equal(disabled.hashesPayload.emptyConfig,prepared.hashesPayload.emptyConfig);
    console.log('PASS a disabled secondary-profile user disappears without changing the empty configuration hash');
    const beforeConflict=calls.length;
    await prisma.$executeRaw`UPDATE xera_node_port_bindings SET port=(SELECT port FROM nodes WHERE uuid=${N}::uuid) WHERE uuid=${S1}::uuid`;
    await assert.rejects(handler.execute(query),error=>error.code==='RESERVED_LISTENER');assert.equal(calls.length,beforeConflict,'Conflict rejected before expensive user preparation');
    await prisma.$executeRaw`UPDATE nodes SET port=NULL WHERE uuid=${N}::uuid`;await prisma.$executeRaw`UPDATE xera_node_port_bindings SET port=443 WHERE uuid=${S1}::uuid`;
    await assert.rejects(handler.execute(query),error=>error.code==='RESERVED_LISTENER');
    const savedLegacy=process.env.REMNACUST_LEGACY_HTTP_NODES;process.env.REMNACUST_LEGACY_HTTP_NODES='127.0.0.1';
    try{await prisma.$executeRaw`UPDATE xera_node_port_bindings SET port=80 WHERE uuid=${S1}::uuid`;await assert.rejects(handler.execute(query),error=>error.code==='RESERVED_LISTENER');}
    finally{if(savedLegacy===undefined)delete process.env.REMNACUST_LEGACY_HTTP_NODES;else process.env.REMNACUST_LEGACY_HTTP_NODES=savedLegacy;}
    assert.equal(calls.length,beforeConflict);await prisma.$executeRaw`UPDATE nodes SET port=2222 WHERE uuid=${N}::uuid`;
    await prisma.$executeRaw`UPDATE xera_node_port_bindings SET port=20001 WHERE uuid=${S1}::uuid`;
    beforePrepared=async()=>{await prisma.$transaction(async t=>{await t.$executeRaw`UPDATE xera_node_port_bindings SET port=20003 WHERE uuid=${S1}::uuid`;await t.$executeRaw`UPDATE xera_node_port_plans SET revision=revision+1,status='PENDING',error_code=NULL WHERE node_uuid=${N}::uuid`;});};
    const older=await handler.execute(query);assert.equal(older.portPlanRevision,'1');assert.equal(older.config.inbounds.find(i=>i.tag==='shared').port,20001);
    const newer=await handler.execute(query);assert.equal(newer.portPlanRevision,'2');assert.equal(newer.config.inbounds.find(i=>i.tag==='shared').port,20003);
    console.log('PASS revision and port bindings come from one SQL snapshot despite a committed save during user preparation');
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,'1',true)),false,'An old ACK cannot complete a new revision');
    application=(await prisma.$queryRaw`SELECT status,applied_revision,error_code FROM xera_node_port_plans WHERE node_uuid=${N}::uuid`)[0];
    assert.deepEqual(application,{status:'PENDING',applied_revision:1n,error_code:null});
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,'2',false)),true);
    application=(await prisma.$queryRaw`SELECT status,applied_revision,error_code FROM xera_node_port_plans WHERE node_uuid=${N}::uuid`)[0];
    assert.deepEqual(application,{status:'ERROR',applied_revision:1n,error_code:'NODE_APPLY_FAILED'});
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,'2',true)),true);
    application=(await prisma.$queryRaw`SELECT status,applied_revision,error_code FROM xera_node_port_plans WHERE node_uuid=${N}::uuid`)[0];
    assert.deepEqual(application,{status:'APPLIED',applied_revision:2n,error_code:null});
    console.log('PASS durable apply results reject obsolete ACKs and late failures, preserving the last confirmed revision on a real error');
    const flag=process.env.XERA_PERSONAL_SUBSCRIPTIONS;process.env.XERA_PERSONAL_SUBSCRIPTIONS='false';
    try{assert.equal(await nodesRepository.deviceStateRevision(),String((await prisma.$queryRaw`SELECT revision FROM xera_device_state WHERE id=1`)[0].revision));}
    finally{if(flag===undefined)delete process.env.XERA_PERSONAL_SUBSCRIPTIONS;else process.env.XERA_PERSONAL_SUBSCRIPTIONS=flag;}
    const clockBeforeProfile=await nodesRepository.deviceStateRevision();
    await prisma.$executeRaw`UPDATE config_profiles SET config=config || '{"remarks":"changed second profile"}'::jsonb WHERE uuid=${B}::uuid`;
    application=(await prisma.$queryRaw`SELECT revision,status,applied_revision FROM xera_node_port_plans WHERE node_uuid=${N}::uuid`)[0];
    assert.deepEqual(application,{revision:3n,status:'PENDING',applied_revision:2n});
    assert(BigInt(await nodesRepository.deviceStateRevision())>BigInt(clockBeforeProfile));
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,'2',true)),false);
    await prisma.$executeRaw`UPDATE config_profiles SET config=config WHERE uuid=${B}::uuid`;
    assert.equal((await prisma.$queryRaw`SELECT revision FROM xera_node_port_plans WHERE node_uuid=${N}::uuid`)[0].revision,3n,'An unchanged body is not a new plan');
    await prisma.$executeRaw`INSERT INTO config_profile_snippets(name,snippet) VALUES('port-plan-test','{}'::jsonb)`;
    assert.equal((await prisma.$queryRaw`SELECT revision FROM xera_node_port_plans WHERE node_uuid=${N}::uuid`)[0].revision,4n);
    console.log('PASS source-profile and snippet edits invalidate ACKs and reconciliation also advances with personal subscriptions disabled');
    const secondaryNodes=await nodesRepository.findByCriteriaPrisma(profileCriteria.nodesUsingProfile(B));
    assert.equal(secondaryNodes.length,1);assert.equal(secondaryNodes[0].uuid,N);
    assert.equal(secondaryNodes[0].activeConfigProfileUuid,A,'The primary profile really differs');
    assert(secondaryNodes[0].activeInbounds.some(i=>i.uuid===IB&&i.profileUuid===B));
    assert.deepEqual(await portNodesHandler.execute(new portNodes.GetPortPlanNodeUuidsQuery([N])),[N]);
    assert.deepEqual(await portNodesHandler.execute(new portNodes.GetPortPlanNodeUuidsQuery([])),[]);
    await prisma.$executeRaw`UPDATE nodes SET is_disabled=true WHERE uuid=${N}::uuid`;
    assert.deepEqual(await nodesRepository.findByCriteriaPrisma(profileCriteria.nodesUsingProfile(B)),[]);
    console.log('PASS actual Prisma discovery includes a secondary profile and excludes a disabled node; managed plan lookup uses its persisted header');
    await prisma.$executeRaw`UPDATE nodes SET is_disabled=false WHERE uuid=${N}::uuid`;
    let current=await editor.get(N);
    const request={enabled:true,expectedRevision:current.revision,requestId:'aaaaaaaa-1111-4111-8111-111111111111',
        bindings:current.bindings.map(({uuid,configProfileUuid,configProfileInboundUuid,listenAddress,port})=>({uuid,configProfileUuid,configProfileInboundUuid,listenAddress,port:uuid===S1?20006:port}))};
    const preview=await editor.preview(N,request);assert.equal(preview.changed,true);assert.equal(preview.bindings.find(b=>b.uuid===S1).port,20006);
    assert(!JSON.stringify(preview).includes('dddddddd-dddd-4ddd-8ddd-dddddddddddd'));assert(!JSON.stringify(preview).includes('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'));
    assert.equal((await editor.get(N)).revision,current.revision);assert.equal(queued.length,0);
    await assert.rejects(editor.save(N,{...request,reviewHash:'0'.repeat(64)}),e=>e.code==='STALE_REVIEW');
    rejectPortCommit=true;await assert.rejects(editor.save(N,{...request,reviewHash:preview.reviewHash}),/Injected port-plan commit failure/);
    assert.equal((await editor.get(N)).revision,current.revision);assert.equal((await editor.history(N)).length,0);assert.equal(queued.length,0);
    current=await editor.save(N,{...request,reviewHash:preview.reviewHash});assert.equal(current.queued,true);assert(BigInt(current.revision)>BigInt(request.expectedRevision));
    assert.equal((await handler.execute(query)).config.inbounds.find(i=>i.tag==='shared').port,20006);assert.equal((await editor.history(N)).length,1);
    assert.equal((await editor.save(N,request)).revision,current.revision,'Lost response repeats the same operation without a second edit');
    await assert.rejects(editor.save(N,{...request,bindings:request.bindings.map(b=>({...b,port:b.port+10}))}),e=>e.code==='REQUEST_REUSED');
    await assert.rejects(editor.save(N,{...request,requestId:'aaaaaaaa-1111-4111-8111-111111111112'}),e=>e.code==='STALE_REVISION');
    console.log('PASS preview is read-only and omits credentials; commit failure rolls back bindings/history; retries are idempotent and stale edits cannot overwrite');
    const raced=await Promise.allSettled([20007,20008].map((port,index)=>editor.save(N,{...request,expectedRevision:current.revision,
        requestId:'aaaaaaaa-1111-4111-8111-11111111111'+(index+3),bindings:request.bindings.map(b=>({...b,port:b.uuid===S1?port:b.port}))})));
    assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.equal(raced.filter(r=>r.status==='rejected').length,1);
    assert.equal(raced.find(r=>r.status==='rejected').reason.code,'STALE_REVISION');
    current=await editor.get(N);const disabledTarget=await editor.save(N,{enabled:false,expectedRevision:current.revision,profileUuid:A,activeInbounds:[IA]});
    assert.equal(disabledTarget.enabled,false);assert.deepEqual(disabledTarget.bindings,[]);
    let delivery=await handler.execute(query);assert.equal(delivery.portPlanEnabled,false);assert.equal(delivery.portPlanRevision,disabledTarget.revision);
    assert.deepEqual(delivery.config.inbounds.map(i=>i.tag),['shared']);
    await prisma.$transaction(async t=>{
        await t.$executeRaw`DELETE FROM config_profile_inbounds_to_nodes WHERE node_uuid=${N}::uuid`;
        await t.$executeRaw`UPDATE nodes SET active_config_profile_uuid=${B}::uuid WHERE uuid=${N}::uuid`;
        await t.$executeRaw`INSERT INTO config_profile_inbounds_to_nodes(node_uuid,config_profile_inbound_uuid) VALUES(${N}::uuid,${IB}::uuid)`;
    });
    current=await editor.get(N);assert(BigInt(current.revision)>BigInt(disabledTarget.revision));delivery=await handler.execute(query);
    assert.equal(delivery.portPlanEnabled,false);assert.deepEqual(delivery.config.inbounds.map(i=>i.tag),['second']);
    const previous=(await editor.history(N)).find(entry=>entry.snapshot.enabled);
    const restored=await editor.restore(N,previous.uuid,current.revision,'aaaaaaaa-1111-4111-8111-111111111119');
    assert.equal(restored.enabled,true);assert.equal(restored.bindings.length,2);assert.equal((await handler.execute(query)).portPlanEnabled,true);
    console.log('PASS concurrent editors admit one winner; disabling retains a versioned profile target, legacy edits advance it and history restores both bindings');
    queueUnavailable=true;current=await editor.get(N);
    const pending=await editor.save(N,{...request,expectedRevision:current.revision,requestId:'aaaaaaaa-1111-4111-8111-111111111120',bindings:request.bindings.map(b=>({...b,port:b.uuid===S1?20009:b.port}))});
    assert.equal(pending.queued,false);assert.equal(pending.errorCode,'QUEUE_UNAVAILABLE');
    assert.equal((await handler.execute(query)).config.inbounds.find(i=>i.tag==='shared').port,20009);
    queueUnavailable=false;const retried=await editor.retry(N,pending.revision);assert.equal(retried.queued,true);assert.equal(retried.errorCode,null);
    await prisma.$executeRaw`UPDATE xera_node_port_plans SET apply_after=clock_timestamp() WHERE node_uuid=${N}::uuid`;
    const beforeDispatch=queued.length,dispatchCounts=await Promise.all([dispatcher.dispatch(N),dispatcher.dispatch(N)]);
    assert.equal(dispatchCounts.reduce((a,b)=>a+b,0),1);assert.equal(queued.length,beforeDispatch+1);
    console.log('PASS committed saves survive Redis failure and a durable dispatch lease prevents duplicate concurrent claims');
    const originalProfile=(await prisma.$queryRaw`SELECT config FROM config_profiles WHERE uuid=${A}::uuid`)[0].config;
    await prisma.$executeRaw`UPDATE config_profiles SET config='{}'::jsonb WHERE uuid=${A}::uuid`;
    current=await editor.get(N);
    await assert.rejects(editor.preview(N,{...request,expectedRevision:current.revision}),error=>error instanceof planModel.PortPlanError&&error.code==='INVALID_PROFILE'&&error.message==='INVALID_PROFILE');
    const restoreCandidate=(await editor.history(N)).find(entry=>entry.snapshot.enabled);
    const historyBeforeInvalidRestore=await editor.history(N),queuedBeforeInvalidRestore=queued.length;
    await assert.rejects(editor.restore(N,restoreCandidate.uuid,current.revision),error=>error instanceof planModel.PortPlanError&&error.code==='INVALID_PROFILE');
    assert.equal((await editor.get(N)).revision,current.revision);assert.deepEqual(await editor.history(N),historyBeforeInvalidRestore);assert.equal(queued.length,queuedBeforeInvalidRestore);
    await prisma.$executeRaw`UPDATE config_profiles SET config=${JSON.stringify(originalProfile)}::jsonb WHERE uuid=${A}::uuid`;
    console.log('PASS native application failures back off and clear attempts on ACK; invalid saved source profiles return safe typed validation errors');
    const evictedUuid=(await editor.history(N))[0].uuid;
    for(let index=0;index<23;index++){
        current=await editor.get(N);
        await editor.save(N,{...request,requestId:undefined,expectedRevision:current.revision,bindings:request.bindings.map(b=>({...b,port:b.uuid===S1?20100+index:b.port}))});
    }
    const retained=await editor.history(N);assert.equal(retained.length,20);assert.equal(new Set(retained.map(h=>h.revision)).size,20);
    current=await editor.get(N);
    await assert.rejects(editor.restore(N,evictedUuid,current.revision),error=>error.code==='HISTORY_MISSING');
    const queuedBeforeRestore=queued.length;rejectPortCommit=true;
    await assert.rejects(editor.restore(N,retained[0].uuid,current.revision),/Injected port-plan commit failure/);
    assert.equal((await editor.get(N)).revision,current.revision);assert.deepEqual(await editor.history(N),retained);assert.equal(queued.length,queuedBeforeRestore);
    console.log('PASS history retains exactly 20 revisions; invalid and pruned restores cannot change the target; failed restore commit rolls back before queue delivery');
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,current.revision,true)),true);
    await editor.retry(N,current.revision);
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,current.revision,false)),true,'A failed explicit retry must settle as ERROR, not stay PENDING forever');
    application=(await prisma.$queryRaw`SELECT status,applied_revision,error_code FROM xera_node_port_plans WHERE node_uuid=${N}::uuid`)[0];
    assert.deepEqual(application,{status:'ERROR',applied_revision:BigInt(current.revision),error_code:'NODE_APPLY_FAILED'});
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,current.revision,true)),true);
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,current.revision,false)),false);
    console.log('PASS failed explicit retry reports ERROR while retaining the last applied revision; the next ACK settles it and a late error cannot undo it');
    const plugin='aaaaaaaa-5555-4555-8555-555555555555',integration='aaaaaaaa-6666-4666-8666-666666666666';
    let dependencyRevision=(await editor.get(N)).revision;
    const advances=async action=>{await action();const next=(await editor.get(N)).revision;assert(BigInt(next)>BigInt(dependencyRevision));
        assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,dependencyRevision,true)),false,'Old source ACK must not swallow a newer dependency');dependencyRevision=next;};
    await prisma.$executeRaw`INSERT INTO node_plugin(uuid,name,plugin_config) VALUES(${plugin}::uuid,'delivery-plugin','{}'::jsonb)`;
    await advances(()=>prisma.$executeRaw`UPDATE nodes SET active_plugin_uuid=${plugin}::uuid WHERE uuid=${N}::uuid`);
    await advances(()=>prisma.$executeRaw`UPDATE node_plugin SET plugin_config='{"changed":true}'::jsonb WHERE uuid=${plugin}::uuid`);
    await advances(()=>prisma.$executeRaw`INSERT INTO shared_lists(name,config) VALUES('delivery-list','{}'::jsonb)`);
    await prisma.$executeRaw`INSERT INTO integrations(uuid,name,config) VALUES(${integration}::uuid,'delivery-integration','{}'::jsonb)`;
    await advances(()=>prisma.$executeRaw`UPDATE nodes SET integration_uuids=ARRAY[${integration}::uuid] WHERE uuid=${N}::uuid`);
    await advances(()=>prisma.$executeRaw`UPDATE integrations SET config='{"changed":true}'::jsonb WHERE uuid=${integration}::uuid`);
    await advances(()=>prisma.$executeRaw`DELETE FROM integrations WHERE uuid=${integration}::uuid`);
    await advances(()=>prisma.$executeRaw`UPDATE nodes SET name='delivery-node',tags=ARRAY['changed'] WHERE uuid=${N}::uuid`);
    await prisma.$executeRaw`UPDATE nodes SET last_status_message='status-only',is_connecting=false WHERE uuid=${N}::uuid`;
    assert.equal((await editor.get(N)).revision,dependencyRevision,'Status and heartbeat writes must not invalidate their own work');
    assert.equal(await recorder.execute(new recorded.RecordPortPlanResultCommand(N,dependencyRevision,true)),true);
    console.log('PASS plugin, shared-list, integration and node metadata edits persist newer desired versions; status-only updates do not loop');
    await prisma.$executeRaw`UPDATE nodes SET is_connecting=true WHERE uuid=${N}::uuid`;
    await prisma.$executeRaw`UPDATE xera_node_port_plans SET apply_after=clock_timestamp() WHERE node_uuid=${N}::uuid`;
    const claims=await Promise.all([leases.acquire(N),leases.acquire(N)]);
    assert.equal(claims.filter(v=>v==='busy').length,1);leaseA=claims.find(v=>v&&v!=='busy');assert.ok(leaseA);
    assert.equal(await dispatcher.dispatch(N),0,'Active delivery prevents another queue claim even with isConnecting stuck');
    await leaseA.commit(()=>tx.tx.$executeRaw`UPDATE nodes SET last_status_message='lease-A' WHERE uuid=${N}::uuid`);
    await prisma.$executeRaw`UPDATE xera_node_port_plans SET delivery_until=clock_timestamp()-interval '1 second',apply_after=clock_timestamp() WHERE node_uuid=${N}::uuid`;
    assert.equal(await dispatcher.dispatch(N),1,'An APPLIED target still recovers after a crash before clearing isConnecting');
    assert.equal(await dispatcher.dispatch(N),0,'Recovery dispatch also respects its queue lease');
    leaseB=await leases.acquire(N);assert(leaseB&&leaseB!=='busy');assert(BigInt(leaseB.epoch)>BigInt(leaseA.epoch));
    await leaseB.assert('9007199254740993');assert.equal(leaseB.epoch,'9007199254740994','Node watermark safely advances a restored SQL delivery clock beyond 53 bits');
    await leaseB.commit(()=>tx.tx.$executeRaw`UPDATE nodes SET is_connecting=true,last_status_message='lease-B' WHERE uuid=${N}::uuid`);
    await assert.rejects(leaseA.commit(()=>tx.tx.$executeRaw`UPDATE nodes SET last_status_message='late-A' WHERE uuid=${N}::uuid`),error=>error instanceof leaseModule.PortPlanLeaseLostError);
    await leaseA.close();leaseA=null;
    let ownerState=(await prisma.$queryRaw`SELECT is_connecting,last_status_message FROM nodes WHERE uuid=${N}::uuid`)[0];
    assert.deepEqual(ownerState,{is_connecting:true,last_status_message:'lease-B'},'Late release cannot clear the new owner connecting state');
    await assert.rejects(leaseB.commit(async()=>{await tx.tx.$executeRaw`UPDATE nodes SET last_status_message='rollback' WHERE uuid=${N}::uuid`;throw Error('Injected owned commit failure');}),/Injected owned commit failure/);
    assert.equal((await prisma.$queryRaw`SELECT last_status_message FROM nodes WHERE uuid=${N}::uuid`)[0].last_status_message,'lease-B');
    await prisma.$executeRaw`UPDATE nodes SET is_disabled=true WHERE uuid=${N}::uuid`;
    await assert.rejects(leaseB.commit(()=>tx.tx.$executeRaw`UPDATE nodes SET is_connected=true WHERE uuid=${N}::uuid`),error=>error instanceof leaseModule.PortPlanLeaseLostError);
    await leaseB.close();leaseB=null;await prisma.$executeRaw`UPDATE nodes SET is_disabled=false WHERE uuid=${N}::uuid`;
    ownerState=(await prisma.$queryRaw`SELECT is_connecting FROM nodes WHERE uuid=${N}::uuid`)[0];assert.equal(ownerState.is_connecting,false);
    console.log('PASS concurrent delivery claims, expired APPLIED recovery, epoch advancement, stale-owner fencing, rollback and disabled-node exclusion on PostgreSQL');
    current=await editor.get(N);
    const repeated=await editor.save(N,{enabled:true,expectedRevision:current.revision,bindings:[
        {uuid:S1,configProfileUuid:A,configProfileInboundUuid:IA,listenAddress:'127.0.0.1',port:20801},
        {uuid:S2,configProfileUuid:A,configProfileInboundUuid:IA,listenAddress:'127.0.0.1',port:20802}
    ]});
    assert.equal(repeated.bindings.length,2);
    const memberships=await prisma.$queryRaw`SELECT config_profile_inbound_uuid::text AS inbound FROM config_profile_inbounds_to_nodes WHERE node_uuid=${N}::uuid`;
    assert.deepEqual(memberships,[{inbound:IA}],'Repeated graph bindings share one original entitlement membership');
    const independent=await handler.execute(new planModule.GetPreparedNodePortsQuery(N,true));
    assert.equal(independent.profileGraphs.graphs.length,2);
    assert.deepEqual(independent.profileGraphs.graphs.map(graph=>graph.config.inbounds[0].port).sort((a,b)=>a-b),[20801,20802]);
    await assert.rejects(handler.execute(query),error=>error.code==='DUPLICATE_INBOUND');
    console.log('PASS multiple ports per source inbound persist two independent graphs and one entitlement membership; legacy combined delivery refuses ambiguous ownership');
}finally{if(leaseA&&leaseA!=='busy')await leaseA.close();if(leaseB&&leaseB!=='busy')await leaseB.close();await db.kysely.destroy();await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
