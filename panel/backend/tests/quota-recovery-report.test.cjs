const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const {recoveryReport,recoveryDigest,recoveryJournalSchema} = load(path.join(__dirname,'../src/common/host-policy/quota-recovery-report.ts'));
const instance='11111111-1111-4111-8111-111111111111';
const core='22222222-2222-4222-8222-222222222222';
const grant='33333333-3333-4333-8333-333333333333';
const other='44444444-4444-4444-8444-444444444444';
const fixture=()=>({basis:{node:{name:'node',address:'private-address',port:2222,proxyUrl:'private-proxy',disabled:false},
    mode:{instance},revision:'10',watermarks:[{instance,sequence:'20',revision:'10'}],
    grants:[{id:grant,instance,group:'host:fixture',owner:'5',ceiling:'1000',expiresAt:'2030-01-01T00:00:00.000Z',closedUsage:null,activation:'10',registrationRequired:true,registered:true,identity:{source:'ISSUED',subject:core,current:core}}],
    grantCount:'1',exposures:'0',stream:{core:null,digest:null}},
    status:{applied:true,quotaReservesSupported:true,quotaWatermarksSupported:true,quotaInstanceId:instance,quotaJournalSequence:'20',policyRevision:'10',coreProcessId:core},
    journal:{instance,sequence:20,policyRevision:'10',entries:[{id:grant,group:'host:fixture',owner:'5',ceiling:'1000',reserved:'0',expiresAt:Date.parse('2030-01-01'),scale:100,prepared:true,activated:true}],missingIds:[],nextAfter:null}});
const inspect=f=>recoveryReport(f.basis,f.status,f.journal);

test('a matching numeric owner cannot prove legacy, missing or reused subscriber identities',()=>{
    for(const identity of [undefined,null,{source:'LEGACY',subject:null,current:core},{source:'ISSUED',subject:null,current:core}]){
        const f=fixture();f.basis.grants[0].identity=identity;
        assert(inspect(f).issues.includes('OWNER_UNPROVEN'));
        assert(recoveryReport(f.basis,null,null).issues.includes('OWNER_UNPROVEN'));
    }
    for(const current of [other,null]){
        const f=fixture();f.basis.grants[0].identity.current=current;
        assert(inspect(f).issues.includes('OWNER_CHANGED'));assert.equal(inspect(f).unknownGrants,0);
    }
});
test('matching observations expose counts and hashes, never connection settings or a release authorization',()=>{
    const f=fixture(),before=JSON.stringify(f),r=inspect(f);
    assert.deepEqual(r.issues,[]);assert.equal(r.databaseGrants,'1');assert.equal(r.nodeGrants,1);
    assert.equal(r.journalDigest,recoveryDigest(recoveryJournalSchema.parse(f.journal)));assert.equal(JSON.stringify(f),before);
    assert(!JSON.stringify(r).includes('private-'));assert(!('ready' in r));assert(!('reconciled' in r));
});
test('unknown and missing grants remain explicit differences rather than presumed zero',()=>{
    const f=fixture();f.journal.entries[0].id=other;const r=inspect(f);
    assert(r.issues.includes('UNKNOWN_RESERVES'));assert(r.issues.includes('MISSING_RESERVES'));
    assert.equal(r.unknownGrants,1);assert.equal(r.missingGrants,1);
});
test('unavailable, removed and intentionally disabled nodes have distinct findings',()=>{
    const f=fixture();assert.deepEqual(recoveryReport(f.basis,null,null).issues,['NODE_UNAVAILABLE']);
    f.basis.node.disabled=true;assert.deepEqual(recoveryReport(f.basis,null,null).issues,['NODE_DISABLED']);
    f.basis.node=null;assert.deepEqual(recoveryReport(f.basis,null,null).issues,['NODE_REMOVED']);
});
test('journal rollback, newer writes, policy and process changes cannot appear matched',()=>{
    const f=fixture();f.journal.sequence=19;f.status.quotaJournalSequence='19';assert(inspect(f).issues.includes('JOURNAL_BEHIND'));
    f.journal.sequence=21;f.status.quotaJournalSequence='21';assert(inspect(f).issues.includes('JOURNAL_AHEAD'));
    f.basis.stream.core=core;f.status.policyRevision='11';f.journal.policyRevision='11';f.status.coreProcessId=other;
    assert(inspect(f).issues.includes('POLICY_CHANGED'));assert(inspect(f).issues.includes('CORE_CHANGED'));
    f.journal.instance=other;assert(inspect(f).issues.includes('STATE_CHANGED'));assert(inspect(f).issues.includes('JOURNAL_CHANGED'));
});
test('every scope binding and fixed point scale is checked without number coercion',()=>{
    for(const patch of [{group:'tag:fixture'},{owner:'6'},{ceiling:'1001'},{reserved:'1001'},{expiresAt:1},{scale:1_000_000_000}]){
        const f=fixture();Object.assign(f.journal.entries[0],patch);assert(inspect(f).issues.includes('RESERVE_BINDING'),JSON.stringify(patch));
    }
    const f=fixture();f.basis.grants[0].group='user:global';f.journal.entries[0].group='user:global';f.journal.entries[0].scale=1_000_000_000;
    assert.deepEqual(inspect(f).issues,[]);
});
test('unsupported or unapplied policy and unavailable journal never pass',()=>{
    const f=fixture();f.status.applied=false;f.status.quotaWatermarksSupported=false;const r=inspect(f);
    assert(r.issues.includes('UNSUPPORTED'));assert(r.issues.includes('POLICY_NOT_APPLIED'));
    f.status.applied=true;f.status.quotaWatermarksSupported=true;
    assert(recoveryReport(f.basis,f.status,null).issues.includes('NODE_UNAVAILABLE'));
});
test('truncated pages, repeated IDs, unexpected missing list and unsafe integers are distinguished',()=>{
    const f=fixture();f.journal.nextAfter=grant;assert(inspect(f).issues.includes('PAGINATION_REQUIRED'));
    f.journal.nextAfter=null;f.basis.grantCount='501';assert(inspect(f).issues.includes('PAGINATION_REQUIRED'));
    f.basis.grantCount='1';f.journal.entries.push({...f.journal.entries[0]});assert(inspect(f).issues.includes('INVALID_REPORT'));
    f.journal.entries.pop();f.journal.missingIds=[grant];assert(inspect(f).issues.includes('INVALID_REPORT'));
    f.journal.missingIds=[];f.journal.sequence=Number.MAX_SAFE_INTEGER+1;assert(inspect(f).issues.includes('INVALID_REPORT'));
    f.journal.sequence=20;f.status.quotaJournalSequence='9223372036854775807';assert(inspect(f).issues.includes('INVALID_REPORT'));
});
test('closure, activation, pending receipt and outside-grant debt remain unresolved evidence',()=>{
    const f=fixture();f.basis.grants[0].activation=null;assert(inspect(f).issues.includes('ACTIVATION_CHANGED'));
    f.basis.grants[0].activation='10';f.journal.entries[0].closed=true;assert(inspect(f).issues.includes('SETTLEMENT_REQUIRED'));
    f.basis.grants[0].closedUsage='1';assert(inspect(f).issues.includes('SETTLEMENT_REQUIRED'));
    f.journal.entries[0].reserved='1';assert(!inspect(f).issues.includes('SETTLEMENT_REQUIRED'));
    f.basis.stream.digest='digest';f.basis.exposures='9';const r=recoveryReport(f.basis,null,null);
    assert(r.issues.includes('PENDING_RECEIPT'));assert(r.issues.includes('USAGE_EXPOSURE'));assert.equal(r.exposureCount,'9');
});

test('durable preparation and activation differences remain visible in both directions',()=>{
 const f=fixture();f.basis.grants[0].registered=false;assert(inspect(f).issues.includes('REGISTRATION_CHANGED'));
 f.basis.grants[0].registered=true;f.journal.entries[0].prepared=false;assert(inspect(f).issues.includes('REGISTRATION_CHANGED'));
 f.journal.entries[0].activated=false;assert(inspect(f).issues.includes('ACTIVATION_CHANGED'));
});

test('legacy grants do not invent an activation history absent from their original protocol',()=>{
 const f=fixture();f.basis.grants[0].registrationRequired=false;f.basis.grants[0].registered=false;f.basis.grants[0].activation=null;
 f.journal.entries[0].prepared=false;assert.deepEqual(inspect(f).issues,[]);
});

test('a prepared native sample without a committed digest remains pending, including unavailable nodes',()=>{
 const f=fixture();f.basis.stream.core=core;
 assert.equal(f.basis.stream.digest,null);assert.ok(inspect(f).issues.includes('PENDING_RECEIPT'));
 assert.ok(recoveryReport(f.basis,null,null).issues.includes('PENDING_RECEIPT'));
 f.basis.stream.core=null;assert.equal(inspect(f).issues.includes('PENDING_RECEIPT'),false);
});
