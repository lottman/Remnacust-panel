const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const {HwidUserDevicesRepository} = load(path.join(__dirname,'../src/modules/hwid-user-devices/repositories/hwid-user-devices.repository.ts'), {
    '@nestjs-cls/transactional':{Transactional:()=>()=>{},TransactionHost:class{}},
    '@common/database':{},'@common/helpers':{},'../hwid-user-devices.converter':{},
    '../entities/hwid-user-device.entity':{},
});
function fixture({allowed=false,existing=null,count=0}={}) {
    const state={allowed,existing,count,created:0,locked:false};
    const tx={
        $executeRaw:async (_strings,...args)=>{state.locked=true;if(args.length===2) state.allowed=args[1];},
        $queryRaw:async ()=>[{allowed:state.allowed}],
        hwidUserDevices:{findUnique:async()=>state.existing,count:async()=>state.count,
            create:async({data})=>{assert.equal(state.locked,true);state.created++;return data;},
            update:async({data})=>({...state.existing,...data})}
    };
    const service=new HwidUserDevicesRepository({tx},{},{fromEntityToPrismaModel:x=>x,fromPrismaModelToEntity:x=>x});
    return {state,service};
}
const device={hwid:'test-device',userId:1n,blocked:false};
test('registration lock denies all new creation paths, including unlimited capacity, without affecting existing devices',async()=>{
    const {service,state}=fixture();
    for(const limit of [1,100,Number.MAX_SAFE_INTEGER]) assert.equal((await service.createWithAdvisoryLock(device,limit)).status,'REGISTRATION_BLOCKED');
    await assert.rejects(service.create(device),/disabled/);
    await assert.rejects(service.upsert(device),/disabled/);
    assert.equal(state.created,0);
    state.existing={...device,blocked:true};
    assert.equal((await service.createWithAdvisoryLock(device,1)).status,'EXISTS');
    assert.equal((await service.upsert(device)).blocked,true);
});
test('unlock restores normal registration but cannot override a reached device limit',async()=>{
    const {service,state}=fixture({count:2});
    await service.setRegistrationAllowed(1n,true);
    assert.equal(state.allowed,true);
    assert.equal((await service.createWithAdvisoryLock(device,2)).status,'LIMIT_REACHED');
    assert.equal((await service.createWithAdvisoryLock(device,3)).status,'CREATED');
});
test('registration notice is never merged into subscription/HWID status messages',()=>{
    const {composeStatusAndHwidRemarks}=load(path.join(__dirname,'../src/modules/subscription/utils/compose-status-hwid-remarks.ts'));
    const settings={combineSubscriptionAndHwidRemarks:true,subscriptionAndHwidRemarkOrder:['EXPIRED','DISABLED','HWID_REGISTRATION_BLOCKED','HWID_BLOCKED']};
    assert.deepEqual(composeStatusAndHwidRemarks('EXPIRED',['expired'],['blocked'],settings),['expired','blocked']);
    settings.combineSubscriptionAndHwidRemarks=false;
    assert.deepEqual(composeStatusAndHwidRemarks('DISABLED',['disabled'],['blocked'],settings),['disabled']);
});

test('standalone registration notice follows configured priority against expired or disabled subscription',()=>{
 const {registrationBlockedRemarks}=load(path.join(__dirname,'../src/modules/subscription/utils/registration-blocked-remarks.ts'), {
  '@common/utils/templates/is-text-remark': load(path.join(__dirname, '../src/common/utils/templates/is-text-remark.ts')),
 });
 const customRemarks={subscriptionAndHwidRemarkOrder:['EXPIRED','DISABLED','HWID_REGISTRATION_BLOCKED','HWID_BLOCKED'],expiredUsers:['expired'],disabledUsers:['disabled'],HWIDRegistrationBlocked:['no new devices']};
 const user={status:'EXPIRED',expireAt:new Date(0)};
 assert.deepEqual(registrationBlockedRemarks(user,{customRemarks}),['expired']);
 customRemarks.subscriptionAndHwidRemarkOrder=['HWID_REGISTRATION_BLOCKED','EXPIRED','DISABLED','HWID_BLOCKED'];
 assert.deepEqual(registrationBlockedRemarks(user,{customRemarks}),['no new devices']);
});
