const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const load=require('./load-typescript.cjs');
const model=load(path.join(__dirname,'../src/common/host-policy/usage-receipt.ts'));
const request={action:'sample',stream:'6bde8fbb-6d28-4d50-99a2-28074f3c235b',sequence:'1',coreProcessId:'ff29ee68-a625-4160-9573-cc17de317a5d'};
const frame={sequence:'1',coreProcessId:request.coreProcessId,capturedAt:'1',stats:[{name:'user>>>77>>>traffic>>>uplink',value:'9007199254740993'}],stream:request.stream,capability:model.USAGE_RECEIPTS,digest:'8a36f1c97332306024c3fbd25101e639271c84e0091abe904e143b5118f903eb'};
test('panel verifies the same int64 receipt fixture as the node and native core',()=>{
    assert.equal(model.parseUsageReceiptResponse(request,frame).stats[0].value,'9007199254740993');
    for(const mutate of [v=>v.stats[0].value='9007199254740992',v=>v.digest='0'.repeat(64),v=>v.sequence='2',v=>v.stream=request.coreProcessId,v=>v.capturedAt='9223372036854775807']){const changed=structuredClone(frame);mutate(changed);assert.throws(()=>model.parseUsageReceiptResponse(request,changed));}
});


test('private outside-grant counters preserve exact owner/price and reject noncanonical bindings',()=>{
 const codec=load(path.join(__dirname,'../src/common/host-policy/unreserved-usage.ts'));
 const valid='qfree>>>ff29ee68-a625-4160-9573-cc17de317a5d>>>9007199254740993>>>1500000000>>>1000000000>>>traffic>>>downlink';
 const parsed=codec.parseUnreservedUsageCounter(valid);assert.equal(parsed.owner,'9007199254740993');assert.equal(parsed.factor,1500000000n);assert.equal(parsed.scale,1000000000n);assert.equal(codec.isUsageCounter(valid),true);
 for(const invalid of [valid.replace('9007199254740993','01'),valid.replace('9007199254740993','9223372036854775808'),valid.replace('ff29ee68','FF29ee68'),valid.replace('1500000000','0'),valid.replace('1500000000','100000000001'),valid.replace('1000000000','99'),valid.replace('downlink','sideways'),'user>>>>>>traffic>>>downlink','qfree>>>broken']){assert.equal(codec.isUsageCounter(invalid),false,invalid);}
 const payload={sequence:'1',coreProcessId:'ff29ee68-a625-4160-9573-cc17de317a5d',capturedAt:'1',stats:[{name:valid,value:'9007199254740993'}]};
 const hash=require('node:crypto').createHash('sha256').update(JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))).digest('hex');
 const request={action:'sample',stream:'6bde8fbb-6d28-4d50-99a2-28074f3c235b',sequence:'1',coreProcessId:payload.coreProcessId};
 const result=model.parseUsageReceiptResponse(request,{...payload,stream:request.stream,capability:model.USAGE_RECEIPTS,digest:hash});assert.equal(result.stats[0].value,'9007199254740993');
});
