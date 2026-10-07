const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

class GetUserByUniqueFieldQuery {}
class GetUserWithResolvedInboundsQuery {}
const success = { isOk: true, response: { success: true, deviceRevocationSupported: true } };
const credentials = { username: '1~device', vlessUuid: 'device-key' };
const output = ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../src/modules/hwid-user-devices/device-access.service.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
}).outputText;
const moduleRef = { exports: {} };
new Function('require', 'module', 'exports', output)((id) => {
    if (id === '@nestjs/common') return { Injectable: () => (value) => value, Logger: class { error() {} } };
    if (id.endsWith('/device-identity')) return { deviceCredentials: () => credentials };
    if (id.endsWith('/hwid-user-device.entity')) return { HwidUserDeviceEntity: class { constructor(value) { Object.assign(this, value); } } };
    if (id.endsWith('/constants')) return { USERS_STATUS: { ACTIVE: 'ACTIVE' } };
    if (id.endsWith('/get-user-by-unique-field')) return { GetUserByUniqueFieldQuery };
    if (id.endsWith('/get-user-with-resolved-inbounds')) return { GetUserWithResolvedInboundsQuery };
    if (id.endsWith('/get-vless-flow')) return { getVlessFlowFromDbInbound: () => '' };
    return {};
}, moduleRef, moduleRef.exports);
const { DeviceAccessService } = moduleRef.exports;

function fixture({ offline = false, noInbounds = false, exceptionInbound = false, protocol = 'vless' } = {}) {
    const state = { user: { id: 1n, status: 'ACTIVE', expireAt: new Date(Date.now() + 60_000), vlessUuid: 'parent' }, device: { exists: true, blocked: false } };
    const calls = [];
    const node = { uuid: 'online', address: 'online', activeConfigProfileUuid: 'profile', activeInbounds: [{ uuid: 'inbound' }] };
    const axios = {
        deleteUser: async (data) => { calls.push(['delete', data.username]); return success; },
        addUser: async (data) => { calls.push(['add', data.data[0].username]); axios.lastGrant = data; return success; },
    };
    const devices = {
        checkHwidExists: async () => ({ ...state.device }),
        findByCriteria: async () => [{ hwid: 'device', blocked: state.device.blocked }],
        createWithAdvisoryLock: async () => ({ status: 'OK', hwidDevice: { blocked: false } }),
    };
    const service = new DeviceAccessService({ getOrThrow: () => 'secret' }, devices, {
        findAllNodes: async () => offline ? [node, { uuid: 'offline', activeConfigProfileUuid: 'profile', activeInbounds: [{ uuid: 'inbound' }] }] : [node],
        findConnectedNodes: async () => [node],
    }, axios, {synchronizeUser:async()=>true}, { execute: async (query) => ({ isOk: true, response: query instanceof GetUserByUniqueFieldQuery
        ? { ...state.user } : { ...state.user, inbounds: noInbounds || (!exceptionInbound && (state.user.status !== 'ACTIVE' || state.user.expireAt <= new Date())) ? [] : [{ uuid: 'inbound', profileUuid: 'profile', type: protocol, tag: 'tag' }] } }) });
    return { state, calls, axios, service };
}

test('an offline node does not prevent revocation on reachable nodes', async () => {
    const { service, calls } = fixture({ offline: true });
    assert.equal(await service.syncDevice(1n, 'device', true), false);
    assert.deepEqual(calls, [['delete', '1~device']]);
});
test('shared credential retirement also reaches online nodes during a partial outage', async () => {
    const { service, calls } = fixture({ offline: true });
    assert.equal(await service.retireSharedCredential(1n, 'parent'), false);
    assert.deepEqual(calls, [['delete', '1']]);
});
for (const reason of ['blocked', 'expired', 'disabled', 'deleted']) {
    test(`grant request cannot reinstall keys when ${reason}`, async () => {
        const { service, state, calls } = fixture();
        if (reason === 'blocked') state.device.blocked = true;
        if (reason === 'expired') state.user.expireAt = new Date(0);
        if (reason === 'disabled') state.user.status = 'DISABLED';
        if (reason === 'deleted') state.device.exists = false;
        assert.equal(await service.syncDevice(1n, 'device', false), true);
        assert.deepEqual(calls, [['delete', '1~device']]);
    });
}
test('a block arriving during network I/O revokes the stale grant', async () => {
    const { service, state, calls, axios } = fixture();
    const add = axios.addUser;
    axios.addUser = async (data) => { const result = await add(data); state.device.blocked = true; return result; };
    assert.equal(await service.syncDevice(1n, 'device', false), false);
    assert.deepEqual(calls, [['add', '1~device'], ['delete', '1~device']]);
});

test('inactive users retain only exception inbounds selected by the squad-aware query', async () => {
    const { service, state, calls } = fixture({ exceptionInbound: true });
    state.user.status = 'DISABLED';
    assert.equal(await service.syncDevice(1n, 'device', false), true);
    assert.deepEqual(calls, [['add', '1~device']]);
});

test('expiry arriving during network I/O removes ordinary inbound credentials', async () => {
    const { service, state, calls, axios } = fixture();
    const add = axios.addUser;
    axios.addUser = async data => { const result = await add(data); state.user.expireAt = new Date(0); return result; };
    assert.equal(await service.syncDevice(1n, 'device', false), false);
    assert.deepEqual(calls, [['add', '1~device'], ['delete', '1~device']]);
});
test('removing the final squad removes the key from its old node', async () => {
    const { service, calls } = fixture({ noInbounds: true });
    assert.equal(await service.syncDevice(1n, 'device', false), true);
    assert.deepEqual(calls, [['delete', '1~device']]);
});
test('an offline node does not stop a permitted grant on reachable nodes', async () => {
    const { service, calls } = fixture({ offline: true });
    assert.equal(await service.syncDevice(1n, 'device', false), true);
    assert.deepEqual(calls, [['add', '1~device']]);
});
test('a healthy personal key does not revoke the shared migration key', async () => {
    const { service, calls } = fixture();
    const result = await service.register({ id: 1n, status: 'ACTIVE', expireAt: new Date(Date.now() + 60_000), vlessUuid: 'parent' }, { hwid: 'device' }, { enabled: false });
    assert.equal(result, 'OK');
    assert.deepEqual(calls, [['add', '1~device']]);
});
test('an offline node permits an acknowledged personal credential on the online node', async () => {
    const { service, calls } = fixture({ offline: true });
    const result = await service.register({ id: 1n, status: 'ACTIVE', expireAt: new Date(Date.now() + 60_000), vlessUuid: 'parent' }, { hwid: 'device' }, { enabled: false });
    assert.equal(result, 'OK');
    assert.deepEqual(calls, [['add', '1~device']]);
});

test('a failed grant retains the shared credential for an account without blocked devices', async () => {
    const { service, calls, axios } = fixture();
    axios.addUser = async () => ({ isOk: false });
    assert.equal(await service.register({ id: 1n, status: 'ACTIVE', expireAt: new Date(Date.now() + 60_000), vlessUuid: 'parent' }, { hwid: 'device' }, { enabled: false }), 'LEGACY');
    assert.deepEqual(calls, []);
});

test('a blocked device remains denied during a partial outage', async () => {
    const {service,state,calls}=fixture({offline:true});
    state.device.blocked=true;
    assert.equal(await service.register({id:1n,status:'ACTIVE',expireAt:new Date(Date.now()+60_000),vlessUuid:'parent'},{hwid:'device'},{enabled:false}),'NODE_ERROR');
    assert.ok(calls.some(call=>call[0]==='delete'));
    assert.ok(calls.every(call=>call[0]!=='add'));
});

test('an inactive account can receive its renewal configuration while an unrelated node is down', async () => {
    const {service,state}=fixture({offline:true});
    state.user.status='DISABLED';
    assert.equal(await service.register(state.user,{hwid:'device'},{enabled:false}),'OK');
});

test('an inactive account without blocked devices keeps renewal access if a legacy node cannot confirm revocation',async()=>{
    const {service,state,axios}=fixture({offline:true});
    state.user.status='DISABLED';
    axios.deleteUser=async()=>({isOk:true,response:{success:true}});
    assert.equal(await service.register(state.user,{hwid:'device'},{enabled:false}),'LEGACY');
});

test('MASQUE device grant uses the same personal account as its subscription', async () => {
    const { service, axios } = fixture({ protocol: 'masque' });
    assert.equal(await service.syncDevice(1n,'device',false), true);
    assert.deepEqual(axios.lastGrant.data, [{ type:'masque', tag:'tag', username:credentials.username, password:credentials.vlessUuid }]);
});

test('slow host policy synchronization does not postpone personal credential revocation', async () => {
    const {service,calls} = fixture();
    let release;
    service.hostAccess.synchronizeUser = () => new Promise(resolve => release=resolve);
    const running=service.syncDevice(1n,'device',true);
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(calls,[['delete','1~device']]);
    release(true);
    assert.equal(await running,true);
});

test('host-policy failure does not prevent device revocation or falsely confirm it', async () => {
    const {service,calls} = fixture();
    service.hostAccess.synchronizeUser = async () => {throw Error('policy unavailable');};
    assert.equal(await service.syncDevice(1n,'device',true),false);
    assert.deepEqual(calls,[['delete','1~device']]);
});


test('ordinary registration does not wait for host policy synchronization, but confirms its personal grant', async () => {
    const { service, state, calls } = fixture();
    service.hostAccess.synchronizeUser = () => new Promise(() => {});
    let timer;
    try {
        const result = await Promise.race([
            service.register(state.user, {hwid:'device'}, {enabled:false}),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('registration waited for host policy')), 200); })
        ]);
        assert.equal(result, 'OK');
        assert.deepEqual(calls, [['add', '1~device']]);
    } finally { clearTimeout(timer); }
});
