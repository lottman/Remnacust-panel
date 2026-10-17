const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('./load-typescript.cjs');
const {PortPlanLease,PortPlanLeaseLostError}=load(path.join(__dirname,'../src/queue/_nodes/port-plan-lease.service.ts'),{'@common/database':{}});
const owner='aaaaaaaa-1111-4111-8111-111111111111',node='bbbbbbbb-1111-4111-8111-111111111111';

test('out-of-order renewals cannot lower a delivery epoch advanced by the node watermark',async()=>{
    const responses=[];let released=0;
    const service={renew:()=>new Promise(resolve=>responses.push(resolve)),release:async()=>released++};
    const lease=new PortPlanLease(service,node,owner,'1','7');
    try{
        const slow=lease.assert(),fast=lease.assert('9007199254740993');
        responses[1]('9007199254740994');await fast;responses[0]('1');await slow;
        assert.equal(lease.epoch,'9007199254740994');assert.deepEqual(lease.delivery,{epoch:'9007199254740994',owner});
    }finally{await lease.close();}
    assert.equal(released,1);
});

test('uncertain renewal and a closed lease prohibit result commits before any SQL action',async()=>{
    let commits=0,released=0;
    const service={renew:async()=>{throw Error('Database unavailable');},commit:async()=>{commits++;},release:async()=>released++};
    const lease=new PortPlanLease(service,node,owner,'1','7');
    await assert.rejects(lease.assert(),/Database unavailable/);
    await assert.rejects(lease.commit(async()=>{}),error=>error instanceof PortPlanLeaseLostError);
    await lease.close();await assert.rejects(lease.assert(),error=>error instanceof PortPlanLeaseLostError);
    assert.equal(commits,0);assert.equal(released,1);
});
