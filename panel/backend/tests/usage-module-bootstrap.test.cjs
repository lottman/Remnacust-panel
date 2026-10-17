const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const {createRequire}=require('node:module');const ts=require('typescript');const {test}=require('node:test');
const {Module,Global}=require('@nestjs/common');const {NestFactory}=require('@nestjs/core');
const {TransactionHost}=require('@nestjs-cls/transactional');const load=require('./load-typescript.cjs');
const directory=path.join(__dirname,'../src/common/host-policy');
class TxKyselyService{}class AxiosService{}class RawCacheService{}class NodesQueuesService{}class UsersQueuesService{}
class TypedConfigService{getOrThrow(key){assert.equal(key,'DATABASE_URL');return 'postgresql://postgres@127.0.0.1:1/audit_bootstrap';}}
const mocks={'@common/database':{TxKyselyService},'@common/axios':{AxiosService},'@common/raw-cache':{RawCacheService},
    '@common/config/app-config':{TypedConfigService},'@queue/_nodes/nodes-queues.service':{NodesQueuesService},
    '@modules/users/builders/bulk-update-user-used-traffic':{BulkUpdateUserUsedTrafficBuilder:class{}},
    '@queue/_users/users-queues.service':{UsersQueuesService},'@libs/contracts/constants':{},'@libs/contracts/models':{},
    '@queue/_users/constants/users-job-name.constant':load(path.join(__dirname,'../src/queue/_users/constants/users-job-name.constant.ts')),
    '@common/utils/device-identity':load(path.join(__dirname,'../src/common/utils/device-identity.ts')),
    '@common/utils/host-identity':load(path.join(__dirname,'../src/common/utils/host-identity.ts')),
    '@common/utils/nano':load(path.join(__dirname,'../src/common/utils/nano/nano.util.ts')),
    './host-access.service':{HostAccessService:class{}},'./host-policy.service':{HostPolicyService:class{}},
    './quota-settlement.service':{QuotaSettlementService:class{}}};
function metadata(name){const file=path.join(directory,name+'.ts'),requireFrom=createRequire(file),ref={exports:{}};
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText;
    new Function('require','module','exports',code)(id=>Object.hasOwn(mocks,id)?mocks[id]:id.startsWith('.')?load(path.resolve(directory,id+'.ts'),mocks):requireFrom(id),ref,ref.exports);
    mocks['./'+name]=ref.exports;return ref.exports;
}
test('real Nest global-module resolution constructs the new usage graph and closes the lazy journal pool',async()=>{
    const {UsageJournalService}=metadata('usage-journal.service');
    const {HostUsageService}=metadata('host-usage.service');metadata('durable-usage.service');
    const {LegacyUsageService}=metadata('legacy-usage.service');const {UsageEffectsService}=metadata('usage-effects.service');
    metadata('legacy-billing.service');
    const {LegacyQuotaRecoveryService}=metadata('legacy-quota-recovery.service');
    const {LegacyQueueRecoveryService}=metadata('legacy-queue-recovery.service');
    const {QuotaBankRecoveryService}=metadata('quota-bank-recovery.service');
    const {QuotaRecoverySettlementService}=metadata('quota-recovery-settlement.service');
    const {NativeQuotaRecoveryService}=metadata('native-quota-recovery.service');
    const {QuotaReceiptRecoveryService}=metadata('quota-receipt-recovery.service');metadata('quota-recovery-policy.service');
    const {QuotaRecoveryReceiptService}=metadata('quota-recovery-receipt.service');const {QuotaRecoveryTailService}=metadata('quota-recovery-tail.service');
    const {QuotaCutoverService}=metadata('quota-cutover.service');metadata('quota-transition.service');metadata('quota-coordinator.service');metadata('quota-exposure-closure.service');const {QuotaRecoveryService}=metadata('quota-recovery.service');const {QuotaRecoveryReleaseService}=metadata('quota-recovery-release.service');const {QuotaReleaseDeliveryService}=metadata('quota-release-delivery.service');const {QuotaRecoveryFinalizationService}=metadata('quota-recovery-finalization.service');const {QuotaFinalizationDispatchService}=metadata('quota-finalization-dispatch.service');const {HostPolicyModule}=metadata('host-policy.module');
    class QueueFeatures{}Module({providers:[NodesQueuesService,UsersQueuesService],exports:[NodesQueuesService,UsersQueuesService]})(QueueFeatures);
    class QueueRoot{}Global()(QueueRoot);Module({imports:[QueueFeatures],exports:[QueueFeatures]})(QueueRoot);
    class Infrastructure{}Global()(Infrastructure);Module({providers:[TxKyselyService,AxiosService,RawCacheService,TypedConfigService,{provide:TransactionHost,useValue:{isTransactionActive:()=>false}}],exports:[TxKyselyService,AxiosService,RawCacheService,TypedConfigService,TransactionHost]})(Infrastructure);
    class Root{}Module({imports:[Infrastructure,HostPolicyModule,QueueRoot]})(Root);
    const app=await NestFactory.createApplicationContext(Root,{logger:false,abortOnError:false});
    try{
        const legacy=app.get(LegacyUsageService),cutover=app.get(QuotaCutoverService);
        assert.equal(app.get(QuotaFinalizationDispatchService).finalizations,app.get(QuotaRecoveryFinalizationService));
        assert.equal(app.get(QuotaRecoveryFinalizationService).delivery,app.get(QuotaReleaseDeliveryService));assert.equal(app.get(QuotaRecoveryFinalizationService).banks,app.get(QuotaBankRecoveryService));
        assert.equal(app.get(QuotaReleaseDeliveryService).banks,app.get(QuotaBankRecoveryService));assert.equal(app.get(QuotaReleaseDeliveryService).cutover,cutover);
        assert.equal(app.get(QuotaRecoveryReleaseService).recovery,app.get(QuotaRecoveryService));assert.equal(app.get(QuotaRecoveryReleaseService).cutover,app.get(QuotaCutoverService));
        assert.ok(app.get(LegacyQuotaRecoveryService));
        assert.equal(app.get(LegacyQueueRecoveryService).queues,app.get(UsersQueuesService));
        assert.equal(app.get(QuotaBankRecoveryService).db,app.get(TxKyselyService));
        assert.equal(app.get(QuotaRecoverySettlementService).banks,app.get(QuotaBankRecoveryService));
        assert.equal(app.get(NativeQuotaRecoveryService).banks,app.get(QuotaBankRecoveryService));
        assert.equal(app.get(QuotaRecoveryService).db,app.get(TxKyselyService));assert.equal(app.get(QuotaRecoveryService).axios,app.get(AxiosService));
        assert.equal(app.get(QuotaRecoveryService).receipts,app.get(QuotaRecoveryReceiptService));
        assert.equal(app.get(QuotaRecoveryReceiptService).native,app.get(NativeQuotaRecoveryService));
        assert.equal(app.get(QuotaRecoveryTailService).captures,app.get(QuotaReceiptRecoveryService));
        assert.equal(app.get(QuotaRecoveryTailService).native,app.get(NativeQuotaRecoveryService));
        assert.equal(legacy.hostUsage,app.get(HostUsageService));assert.equal(legacy.journal,app.get(UsageJournalService));
        assert.equal(cutover.effects,app.get(UsageEffectsService));assert.equal(cutover.nodeQueues,app.get(NodesQueuesService));
        assert.equal(cutover.userQueues,app.get(UsersQueuesService));
    }finally{await app.close();}
});
