const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {createRequire}=require('node:module');
const ts=require('typescript');const {Module}=require('@nestjs/common');const {NestFactory}=require('@nestjs/core');
const {CommandBus,QueryBus}=require('@nestjs/cqrs');const {EventEmitter2}=require('@nestjs/event-emitter');
class AxiosService{}class HostPolicyService{}class RawCacheService{}class NodesQueuesService{}class PortPlanLeaseService{}
function metadata(relative,overrides={}){
    const file=path.join(__dirname,'../src/queue/_nodes',relative),local=createRequire(file),ref={exports:{}};
    const text=fs.readFileSync(file,'utf8'),mocks={};
    for(const match of text.matchAll(/from '([^']+)'/g))if(match[1].startsWith('@common/')||match[1].startsWith('@modules/')||match[1].startsWith('@queue/')||match[1].startsWith('@libs/')||match[1].startsWith('@integration-'))mocks[match[1]]={};
    Object.assign(mocks,{'@common/axios/axios.service':{AxiosService},'@common/host-policy/host-policy.service':{HostPolicyService},
        '@common/raw-cache':{RawCacheService},'./nodes-queues.service':{NodesQueuesService},'@queue/_nodes':{NodesQueuesService},
        '@queue/queue.enum':{QUEUES_NAMES:{NODES:{START:'start-test'}}},'../../queue.enum':{QUEUES_NAMES:{NODES:{START_ALL_BY_PROFILE:'profile-test'}}},
        './port-plan-lease.service':{PortPlanLeaseService},'./constants/nodes-job-name.constant':{},'../constants':{},...overrides});
    const output=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText;
    new Function('require','module','exports',output)(id=>Object.hasOwn(mocks,id)?mocks[id]:local(id),ref,ref.exports);
    return ref.exports;
}

test('real Nest metadata shares one configuration executor between single and request-scoped bulk workers',async()=>{
    const {NodeConfigurationService}=metadata('node-configuration.service.ts');
    const overrides={'../node-configuration.service':{NodeConfigurationService}};
    const {StartNodeProcessor}=metadata('processors/start-node.processor.ts',overrides);
    const {StartAllNodesByProfileQueueProcessor}=metadata('processors/start-all-nodes-by-profile.processor.ts',overrides);
    const tokens=[AxiosService,HostPolicyService,RawCacheService,NodesQueuesService,QueryBus,CommandBus,EventEmitter2,PortPlanLeaseService];
    class Root{}Module({providers:[...tokens.map(provide=>({provide,useValue:{}})),NodeConfigurationService,StartNodeProcessor,StartAllNodesByProfileQueueProcessor]})(Root);
    const app=await NestFactory.createApplicationContext(Root,{logger:false,abortOnError:false});
    try{
        const configurations=app.get(NodeConfigurationService),single=app.get(StartNodeProcessor);
        const bulk=await app.resolve(StartAllNodesByProfileQueueProcessor);
        assert.equal(single.configurations,configurations);assert.equal(bulk.configurations,configurations);
        assert.equal(configurations.nodesQueuesService,app.get(NodesQueuesService));
        assert.equal(configurations.hostPolicies,app.get(HostPolicyService));
    }finally{await app.close();}
});
