const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');

const H='11111111-1111-4111-8111-111111111111';
const N='22222222-2222-4222-8222-222222222222';
const I='33333333-3333-4333-8333-333333333333';
const hostKey=H.replaceAll('-','');
const email='901~000000000000000000000000~h'+hostKey;
function fixture() {
    const writes=[];
    const controls=[];
    const grants=[];
    let paused=false;
    const sql=(parts,...values)=>({execute:async()=>{
        const text=parts.join('');
        if(text.includes('INSERT INTO xera_quota_node_epochs')) {writes.push(values); return {rows:[]};}
        if(text.includes('FROM xera_quota_reserves'))return {rows:grants};
        if(text.includes('WITH scopes AS'))return {rows:[]};
        if(text.includes('FROM xera_quota_transitions'))return {rows:[]};
        if(text.includes('FROM xera_limit_user_adjustments'))return {rows:controls};
        if(text.includes('FROM xera_limit_scopes'))return {rows:[{paused}]};
        throw Error('Unexpected SQL: '+text);
    }});
    const module=load(path.join(__dirname,'../src/common/host-policy/quota-policy.ts'),{kysely:{sql}});
    const host={uuid:H,tags:['beta','alpha'],boundNodes:[N],nodes:[],trafficMultiplier:null,
        alwaysAvailable:false,onlyWhenInactive:false};
    const identity={userId:'901',hostUuid:H,allowed:true,expireAt:new Date('2099-01-01T00:00:00Z')};
    const groups=[{key:'host:'+H,userLimit:'1000',trafficMultiplier:1,hostUuids:[H],nodeUuids:[N]},
        {key:'tag:alpha',userLimit:'1000',trafficMultiplier:0.5,hostUuids:[H],nodeUuids:[N]},
        {key:'tag-total:alpha',userLimit:null,trafficMultiplier:1,hostUuids:[H],nodeUuids:[N]}];
    const state={hosts:[host],identities:[identity],groups,protectedInboundIds:new Set()};
    for(const group of groups)Object.assign(group,{anchor:new Date('1970-01-01'),resetValue:0,resetUnit:'DAYS'});
    const body={groups:Object.fromEntries(groups.map(g=>[g.key,{blockAll:true,blockedOwners:{901:true}}])),
        hosts:{[hostKey]:{groups:groups.map(g=>g.key),allowedIdentities:{[email]:true}}}};
    const render=(phase='ACTIVE')=>module.renderQuotaPolicy({kysely:{}},N,{phase,instance:I},state,body,'17',()=>email);
    return {module,host,identity,state,body,render,writes,grants,controls,setPaused:v=>{paused=v;}};
}
test('autonomous quotas replace stale SQL exhaustion and supply local expiry and independent multipliers',async()=>{
    const f=fixture();await f.render();
    assert.equal(f.body.offlineReserves,'remnacust-quota-reserves-v1');
    assert.deepEqual(f.body.groups['host:'+H].blockedOwners,{});
    assert.equal(f.body.groups['host:'+H].blockAll,false);
    assert.deepEqual(f.body.hosts[hostKey].quotaMultipliers,{['host:'+H]:100,'tag:alpha':50});
    assert.equal(f.body.hosts[hostKey].identityExpiresAt[email],Date.parse('2099-01-01T00:00:00Z'));
    assert.equal(f.body.groups['tag-total:alpha'].reserveRequired,undefined,'Shared speed is not a quota');
    assert.equal(f.writes.length,0,'Missing reports cannot invent credit or mark a reset delivered');
});
test('host multiplier overrides the tag while personal unlimited cannot override pause',async()=>{
    const f=fixture();f.host.trafficMultiplier=1.5;f.controls.push({owner:'901',unlimited:true,paused:true});
    f.setPaused(true);await f.render();
    assert.deepEqual(Object.values(f.body.hosts[hostKey].quotaMultipliers),[150,150]);
    assert.deepEqual(f.body.groups['tag:alpha'].unlimitedOwners,{'901':true});
    assert.deepEqual(f.body.groups['tag:alpha'].blockedOwners,{'901':true});
    assert.equal(f.body.groups['tag:alpha'].blockAll,true);
});
test('a soft fence keeps previously committed grants instead of irreversibly sealing them',async()=>{
    const f=fixture();f.grants.push({id:'44444444-4444-4444-8444-444444444444',instance:I,owner:'901',
        ceiling:'123',expiresAt:new Date('2099-01-02T00:00:00Z'),epoch:'55555555-5555-4555-8555-555555555555',window:new Date('2026-10-15')});
    await f.render('FENCING');
    const group=f.body.groups['host:'+H];
    assert.equal(group.fenceAll,true);assert.equal(group.reserves['901'].ceiling,'123');
    assert.equal(f.writes.length,2,'Desired delivery records are prepared but are not applied ACKs');
});
test('changed node identity and missing ordinary subscription expiry fail before delivery',async()=>{
    const f=fixture();f.grants.push({instance:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
    await assert.rejects(f.render(),/instance changed/);assert.equal(f.writes.length,0);
    const g=fixture();delete g.identity.expireAt;
    await assert.rejects(g.render(),/expiry is unavailable/);
    g.host.alwaysAvailable=true;await g.render();
    assert.equal(g.body.hosts[hostKey].identityExpiresAt[email],0,'Recovery hosts retain their explicit exception');
});
test('invalid billing factors cannot silently round into a free or excessive allowance',async()=>{
    for(const factor of [0,0.0099,1.234,NaN,Infinity,100.01,-1]) {
        const f=fixture();f.host.trafficMultiplier=factor;
        await assert.rejects(f.render(),/Invalid autonomous quota multiplier/);
    }
});
test('fence source fingerprints ignore SQL ordering and unrelated raw config but include entitlement changes',()=>{
    const f=fixture();const before=f.module.quotaSourceFingerprint(f.state,N);
    f.state.groups.reverse();f.host.tags.reverse();f.identity.rawInbound={unrelated:'value'};
    assert.equal(f.module.quotaSourceFingerprint(f.state,N),before);
    f.identity.allowed=false;
    assert.notEqual(f.module.quotaSourceFingerprint(f.state,N),before);
});
