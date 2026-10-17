const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const {recoveryPolicyRequestSchema, recoveryPolicyReplyMatches} = load(path.resolve(__dirname,'../src/common/host-policy/quota-recovery-policy.ts'));
const {QUOTA_RECOVERY_FENCE} = load(path.resolve(__dirname,'../src/common/host-policy/quota-recovery-fence.ts'));
const uuid = n => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
function fixture(state='FENCED') {
    const fence={version:QUOTA_RECOVERY_FENCE,generation:uuid('a'),token:uuid('b'),state,sequence:'2',previous:'c'.repeat(64)};
    fence.digest=createHash('sha256').update([fence.version,fence.generation,fence.token,fence.state,fence.sequence,fence.previous,''].join('\n')).digest('hex');
    const request={requestId:uuid('c'),generation:fence.generation,coreProcessId:uuid('d'),instance:uuid('e'),previous:fence.digest,policyRevision:'9223372036854775807'};
    return {request,reply:{requestId:request.requestId,coreProcessId:request.coreProcessId,instance:request.instance,policyRevision:request.policyRevision,policyGeneration:uuid('f'),quotaRecovery:{version:QUOTA_RECOVERY_FENCE,record:fence}}};
}
test('held policy acknowledgement must match the exact requested live recovery source',()=>{
    const {request,reply}=fixture();assert.equal(recoveryPolicyReplyMatches(request,reply),true);
    for(const field of ['requestId','coreProcessId','instance','policyRevision']) {
        const other=structuredClone(reply);other[field]=field==='policyRevision'?'1':uuid('1');
        assert.equal(recoveryPolicyReplyMatches(request,other),false,field);
    }
    for(const mutate of [r=>r.quotaRecovery.record=null,r=>r.quotaRecovery.record.digest='0'.repeat(64),r=>r.policyGeneration=null,r=>r.extra=true]) {
        const other=structuredClone(reply);mutate(other);assert.equal(recoveryPolicyReplyMatches(request,other),false);
    }
    assert.equal(recoveryPolicyReplyMatches({...request,generation:uuid('1')},reply),false);
    const released=fixture('RELEASED');assert.equal(recoveryPolicyReplyMatches(released.request,released.reply),false);
});
test('staging requests cannot smuggle a policy or round revision integers',()=>{
    const {request}=fixture();assert.equal(recoveryPolicyRequestSchema.safeParse(request).success,true);
    for(const patch of [{policy:{}},{instance:null},{requestId:request.requestId.toUpperCase()},{policyRevision:'0'},{policyRevision:'01'},{policyRevision:'9223372036854775808'},{policyRevision:9007199254740992}])
        assert.equal(recoveryPolicyRequestSchema.safeParse({...request,...patch}).success,false);
});


test('ordinary policy proof is bound to the released generation and live identities; absent recovery stays compatible',()=>{
 const {recoveryPolicyTransportProof,parseRecoveryPolicyTransportProof}=load(path.resolve(__dirname,'../src/common/host-policy/quota-recovery-policy.ts'));
 assert.equal(recoveryPolicyTransportProof({}),undefined);
 assert.equal(recoveryPolicyTransportProof({quotaRecovery:{version:QUOTA_RECOVERY_FENCE,record:null}}),undefined);
 assert.throws(()=>recoveryPolicyTransportProof({quotaRecoveryPolicyBindingsRequired:true}));
 const {request,reply}=fixture('RELEASED');
 const status={quotaRecoveryPolicyBindingsRequired:true,quotaRecoveryPolicyBindingsSupported:true,quotaRecovery:reply.quotaRecovery,coreProcessId:request.coreProcessId,quotaInstanceId:request.instance};
 const encoded=recoveryPolicyTransportProof(status);assert.equal(encoded,['v1',request.generation,request.previous,request.coreProcessId,request.instance].join(':'));
 assert.deepEqual(parseRecoveryPolicyTransportProof(encoded),{generation:request.generation,digest:request.previous,coreProcessId:request.coreProcessId,instance:request.instance});
 for(const value of [undefined,null,0,[encoded],encoded+', '+encoded,'x'.repeat(257),encoded.replace('v1:','v2:'),encoded.replace(request.generation,request.generation.toUpperCase())])assert.throws(()=>parseRecoveryPolicyTransportProof(value));
 for(const patch of [{quotaRecoveryPolicyBindingsSupported:false},{quotaRecoveryPolicyBindingsSupported:undefined},{coreProcessId:null},{quotaInstanceId:null},{quotaRecovery:fixture('FENCED').reply.quotaRecovery},{quotaRecovery:{version:QUOTA_RECOVERY_FENCE,record:{}}}])assert.throws(()=>recoveryPolicyTransportProof({...status,...patch}));
});
