const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const concurrent = load(path.join(__dirname, '../src/common/utils/settle-concurrent.ts'));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };

test('bounded fan-out waits for failures and processes every target', async () => {
    let active = 0, peak = 0;
    const visited = [];
    const results = await concurrent.settleConcurrent([...Array(23).keys()], 3, async n => {
        peak = Math.max(peak, ++active);
        await new Promise(r => setImmediate(r));
        --active; visited.push(n);
        if (n === 2) throw Error('node unavailable');
        return n;
    });
    assert.equal(peak, 3);
    assert.equal(visited.length, 23);
    assert.equal(results[2].status, 'rejected');
    assert.equal(results[22].value, 22);
    await assert.rejects(concurrent.settleConcurrent([1], 0, async () => true), RangeError);
});

function hostFixture() {
    const {HostAccessService} = load(path.join(__dirname, '../src/common/host-policy/host-access.service.ts'), {
        '@common/axios': {}, '@common/database': {},
        '@common/helpers/xray-config/ss-cipher': {}, '@common/utils/flow': {},
        '@common/utils/settle-concurrent': concurrent, './host-policy.service': {},
        '@common/utils/bounded-work-queue': load(path.join(__dirname, '../src/common/utils/bounded-work-queue.ts')),
    });
    const calls = [], gate = deferred();
    const nodes = ['slow', 'fast'].map(uuid => ({uuid, isConnected: true, isDisabled: false}));
    const db = {kysely: {selectFrom: () => ({select: () => ({execute: async () => nodes})})}};
    const identity = {userId:'1', hostUuid:'host', hwid:'blocked', allowed:false};
    const policies = {
        scopes: async userId => {
            assert.equal(userId, 1n);
            return {hosts:[{uuid:'host', nodes:[], boundNodes:['slow','fast']}],
                identities:[identity, {...identity, hwid:'healthy', allowed:true}]};
        },
        keys: row => ({username:row.hwid, vlessUuid:row.hwid}),
        syncNode: async node => { calls.push(`policy:${node.uuid}`); if(node.uuid==='slow') await gate.promise; },
    };
    const axios = {
        deleteUser: async (data,node) => {calls.push(`delete:${node.uuid}:${data.username}`); return {isOk:true,response:{success:true,deviceRevocationSupported:true}};},
        addUser: async () => {throw Error('must not reinstall another device');},
    };
    return {service:new HostAccessService(db,policies,axios), calls, gate, axios, identity};
}

test('a single-device revoke reaches both nodes before slow policy I/O, without touching healthy devices', async () => {
    const {service,calls,gate} = hostFixture();
    const running = service.synchronizeUser(1n,'blocked',true);
    await new Promise(r=>setImmediate(r));
    assert.ok(calls.includes('delete:slow:blocked'));
    assert.ok(calls.includes('delete:fast:blocked'));
    assert.ok(calls.indexOf('delete:slow:blocked') < calls.indexOf('policy:slow'));
    assert.ok(calls.every(c=>!c.includes('healthy')));
    gate.resolve();
    assert.equal(await running,true);
});

test('a failed node revocation does not skip other nodes and cannot report success', async () => {
    const {service,calls,gate,axios} = hostFixture();
    const remove=axios.deleteUser;
    axios.deleteUser=async(data,node)=>{if(node.uuid==='slow')throw Error('network');return remove(data,node);};
    gate.resolve();
    assert.equal(await service.synchronizeUser(1n,'blocked',true),false);
    assert.ok(calls.includes('delete:fast:blocked'));
});

test('deletion forces host credential removal even with an earlier allowed snapshot', async () => {
    const {service,calls,gate,identity} = hostFixture();
    identity.allowed=true;
    gate.resolve();
    assert.equal(await service.synchronizeUser(1n,'blocked',true),true);
    assert.equal(calls.filter(c=>c.startsWith('delete:')).length,2);
});
