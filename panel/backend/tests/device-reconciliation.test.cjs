const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const load=require('./load-typescript.cjs');
const {DeviceAccessService}=load(path.join(__dirname,'../src/modules/hwid-user-devices/device-access.service.ts'),{
    '@common/axios':{},'@common/config/app-config':{},'@common/helpers/xray-config/ss-cipher':{},
    '@common/host-policy/host-access.service':{},'@common/utils/device-identity':{},'@common/utils/extract-hwid-headers':{},'@common/utils/flow/get-vless-flow':{},
    '@common/utils/settle-concurrent':load(path.join(__dirname,'../src/common/utils/settle-concurrent.ts')),
    '@libs/contracts/constants':{},'@modules/nodes/repositories/nodes.repository':{},'@modules/users/entities/user.entity':{},
    '@modules/users/queries/get-user-by-unique-field':{},'@modules/users/queries/get-user-with-resolved-inbounds':{},
    './entities/hwid-user-device.entity':{},'./repositories/hwid-user-devices.repository':{},
});
function fixture(tasks=[{userId:1n,hwid:'deleted',revision:'one',attempts:1}]){
    const done=[],calls=[];
    const repo={claimDeviceReconciliation:async()=>tasks,checkHwidExists:async()=>({exists:false,blocked:false}),finishDeviceReconciliation:async(...args)=>done.push(args)};
    const service=new DeviceAccessService({getOrThrow:()=> 'test-only'},repo,{}, {},{},{});
    Object.defineProperty(service,'enabled',{get:()=>true});
    service.syncDevice=async(...args)=>{calls.push(args);return false;};
    return {service,repo,done,calls};
}
test('failed/offline node leaves reconciliation pending and never restores a deleted row',async()=>{
    const {service,done,calls}=fixture();
    await service.reconcilePendingDevices();
    assert.deepEqual(calls,[[1n,'deleted',true]]);
    assert.equal(done[0][1],false);
    service.syncDevice=async()=>true;
    await service.reconcilePendingDevices();
    assert.equal(done[1][1],true);
});
test('a re-registered or administratively changed device is reconciled from current data',async()=>{
    const {service,repo,calls}=fixture();
    repo.checkHwidExists=async()=>({exists:true,blocked:false});
    await service.reconcilePendingDevices();
    assert.deepEqual(calls,[[1n,'deleted',false]]);
});
test('reconciliation is bounded, coalesces concurrent runs and isolates failures',async()=>{
    const tasks=Array.from({length:11},(_,i)=>({userId:1n,hwid:String(i),revision:String(i),attempts:2}));
    const {service,done}=fixture(tasks);
    let active=0,peak=0;
    service.syncDevice=async(id,hwid)=>{peak=Math.max(peak,++active);await new Promise(r=>setImmediate(r));active--;if(hwid==='2')throw Error('node offline');return true;};
    const first=service.reconcilePendingDevices();
    assert.equal(service.reconcilePendingDevices(),first);
    await first;
    assert.equal(done.length,11);assert.equal(peak,4);
    assert.equal(done.find(([task])=>task.hwid==='2')[1],false);
    assert.equal(done.filter(([,success])=>success).length,10);
});
