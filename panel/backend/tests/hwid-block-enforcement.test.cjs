const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

class GetUserByUniqueFieldQuery {}
const enforcementUnavailable = { code: 'A262' };
const errors = {
    USER_NOT_FOUND: { code: 'user-not-found' },
    HWID_DEVICE_NOT_FOUND: { code: 'device-not-found' },
    HWID_DEVICE_ENFORCEMENT_UNAVAILABLE: enforcementUnavailable,
    HWID_DEVICE_BLOCK_ERROR: { code: 'block-error' },
    INTERNAL_SERVER_ERROR: { code: 'internal-error' },
    DELETE_HWID_USER_DEVICE_ERROR: { code: 'delete-error' },
    DELETE_HWID_USER_DEVICES_ERROR: { code: 'delete-all-error' },
};

const source = fs.readFileSync(
    path.join(__dirname, '../src/modules/hwid-user-devices/hwid-user-devices.service.ts'),
    'utf8',
);
const output = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
    },
}).outputText;
const moduleRef = { exports: {} };
new Function('require', 'module', 'exports', output)((id) => {
    if (id === '@nestjs/common') return { Injectable: () => (value) => value, Logger: class { error() {} } };
    if (id === '@common/types') return { fail: (error) => ({ isOk: false, error }), ok: (response) => ({ isOk: true, response }) };
    if (id === '@libs/contracts/constants') return { ERRORS: errors, EVENTS: { USER_HWID_DEVICES: { ADDED: 'added', DELETED: 'deleted' } } };
    if (id.endsWith('/get-user-by-unique-field')) return { GetUserByUniqueFieldQuery };
    if (id.endsWith('/device-access.service')) return { DeviceAccessService: class {} };
    if (id.endsWith('/user-hwid-device.event')) return { UserHwidDeviceEvent: class {} };
    if (id === '@integration-modules/notifications/interfaces') return { UserHwidDeviceEvent: class {} };
    if (id === '@common/utils/settle-concurrent') return require('./load-typescript.cjs')(path.join(__dirname,'../src/common/utils/settle-concurrent.ts'));
    return {};
}, moduleRef, moduleRef.exports);
const { HwidUserDevicesService } = moduleRef.exports;

test('does not report an HWID traffic block when personal credentials are disabled', async () => {
    let blockWritten = false;
    const service = new HwidUserDevicesService(
        { emit() {} },
        {
            findFirstByCriteria: async () => ({ hwid: 'device-hwid' }),
            blockByHwidAndUserId: async () => { blockWritten = true; },
        },
        { execute: async (query) => query instanceof GetUserByUniqueFieldQuery
            ? { isOk: true, response: { id: 42n } }
            : { isOk: false } },
        { enabled: false },
    );

    const result = await service.blockUserHwidDevice('device-hwid', 42, true);
    assert.equal(result.isOk, false);
    assert.equal(result.error, enforcementUnavailable);
    assert.equal(blockWritten, false);
});

function deletionFixture() {
    const records=new Map([['one',{hwid:'one',blocked:false}],['two',{hwid:'two',blocked:false}],['banned',{hwid:'banned',blocked:true}]]);
    const calls=[];
    const repo={
        findFirstByCriteria:async ({hwid})=>records.get(hwid),
        findByCriteria:async ({blocked})=>[...records.values()].filter(d=>blocked===undefined||d.blocked===blocked),
        blockByHwidAndUserId:async(hwid,id,blocked)=>{records.get(hwid).blocked=blocked;calls.push('persist:'+hwid);},
        deleteDevicesAndQueue:async(id,devices,includeBlocked)=>devices.filter(device=>records.has(device.hwid)&&(includeBlocked||!records.get(device.hwid).blocked)).map(({hwid})=>{calls.push('delete:'+hwid);records.delete(hwid);calls.push('queue:'+hwid);return hwid;}),
    };
    const access={enabled:true,kickReconciliation:()=>calls.push('kick'),retireSharedCredential:async()=>true,syncDevice:async(id,hwid)=>{
        assert.equal(records.get(hwid).blocked,true,'deny must commit before revocation');calls.push('revoke:'+hwid);return true;
    }};
    const service=new HwidUserDevicesService({emit(){}},repo,{execute:async()=>({isOk:true,response:{id:42n,vlessUuid:'parent'}})},access);
    return {service,records,calls,access};
}
test('deletion removes the device and persists reconciliation before notifying the worker',async()=>{
    const {service,records,calls}=deletionFixture();
    assert.equal((await service.deleteUserHwidDevice('one',42)).isOk,true);
    assert.deepEqual(calls,['delete:one','queue:one','kick']);
    assert.equal(records.get('two').blocked,false);
});
test('bulk deletion succeeds while node synchronization is unavailable and preserves prior bans',async()=>{
    const {service,records,calls,access}=deletionFixture();
    const sync=access.syncDevice;
    access.syncDevice=async(id,hwid)=>{await sync(id,hwid);if(hwid==='one')throw Error('offline');return true;};
    assert.equal((await service.deleteAllUserHwidDevices(42)).isOk,true);
    assert.equal(records.has('one'),false);
    assert.equal(records.has('two'),false);
    assert.equal(records.get('banned').blocked,true);
    assert.ok(!calls.some(c=>c.includes('banned')));
});

test('single deletion never waits for a hanging node and a repeated request is idempotent',async()=>{
    const {service,records,access}=deletionFixture();
    access.syncDevice=()=>new Promise(()=>{});
    let timer;
    try {
        const result=await Promise.race([service.deleteUserHwidDevice('one',42),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('delete waited for node')),200);})]);
        assert.equal(result.isOk,true);
        assert.equal(records.has('one'),false);
        assert.equal((await service.deleteUserHwidDevice('one',42)).isOk,true);
    } finally {clearTimeout(timer);}
});
test('shared-key revocation cannot delay device-key revocation',async()=>{
    const {service,access,calls}=deletionFixture();
    let release;
    access.retireSharedCredential=()=>new Promise(r=>release=r);
    const running=service.blockUserHwidDevice('one',42,true);
    await new Promise(r=>setImmediate(r));
    assert.ok(calls.includes('revoke:one'));
    release(true);
    assert.equal((await running).isOk,true);
});
