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
        stageDeletion:async(id,hwids,includeBlocked)=>hwids.filter(hwid=>includeBlocked||!records.get(hwid).blocked).map(hwid=>{records.get(hwid).blocked=true;calls.push('stage:'+hwid);return {hwid,version:'v'};}),
        completeDeletion:async(id,{hwid})=>{calls.push('delete:'+hwid);return records.delete(hwid);},
    };
    const access={enabled:true,retireSharedCredential:async()=>true,syncDevice:async(id,hwid)=>{
        assert.equal(records.get(hwid).blocked,true,'deny must commit before revocation');calls.push('revoke:'+hwid);return true;
    }};
    const service=new HwidUserDevicesService({emit(){}},repo,{execute:async()=>({isOk:true,response:{id:42n,vlessUuid:'parent'}})},access);
    return {service,records,calls,access};
}
test('deletion commits denial before revocation, then removes only the confirmed device',async()=>{
    const {service,records,calls}=deletionFixture();
    assert.equal((await service.deleteUserHwidDevice('one',42)).isOk,true);
    assert.deepEqual(calls,['stage:one','revoke:one','delete:one']);
    assert.equal(records.get('two').blocked,false);
});
test('failed bulk revocation retains denial and still processes other devices, preserving prior bans',async()=>{
    const {service,records,calls,access}=deletionFixture();
    const sync=access.syncDevice;
    access.syncDevice=async(id,hwid)=>{await sync(id,hwid);if(hwid==='one')throw Error('offline');return true;};
    assert.equal((await service.deleteAllUserHwidDevices(42)).isOk,false);
    assert.equal(records.get('one').blocked,true);
    assert.equal(records.has('two'),false);
    assert.equal(records.get('banned').blocked,true);
    assert.ok(!calls.some(c=>c.includes('banned')));
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
