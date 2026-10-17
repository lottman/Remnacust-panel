const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('./load-typescript.cjs');
const {createLegacyRecoveryPlan:plan,legacyRecoveryDigest:hash,legacyRecoveryDraft:draft,validateLegacySource}=load(path.join(__dirname,'../src/common/host-policy/legacy-recovery-plan.ts'));
const subject='11111111-1111-4111-8111-111111111111',generation='22222222-2222-4222-8222-222222222222',node='ABCDEFAB-1234-4234-8234-ABCDEFABCDEF';
const source=(rows,extra={})=>({digest:hash(JSON.stringify(rows)),payload:rows,applied:false,pendingUsers:null,committedAt:'2026-10-01 00:00:00.123456+00',...extra});
const target={subject,userId:'999',username:'chosen-owner',used:'7',lifetime:'40',epoch:'00000000-0000-0000-0000-000000000000',resetAt:null,limit:'1000',strategy:'NO_RESET'};
const input=allocations=>draft.parse({generation,allocations,note:'Explicit accounting recovery'});
const charge=(owner,period='CURRENT')=>({owner,action:'CHARGE',subject,period});
test('manual allocations preserve original uppercase node UUID and exact old priced counters, aggregate a remapped owner, and distinguish the current period',()=>{
 const original=source([{u:'1',b:'9007199254740993',n:node},{u:'2',b:'3',n:node},{u:'3',b:'11',n:node}]);
 const result=plan('a'.repeat(64),original,input([charge('2','LIFETIME'),{owner:'3',action:'LOSS'},charge('1')]),[target]);
 assert.equal(result.plan.charges[0].userId,'999');assert.equal(result.plan.charges[0].after.used,'9007199254741000');assert.equal(result.plan.charges[0].after.lifetime,'9007199254741036');
 assert.deepEqual(result.plan.totals,{charged:'9007199254740996',current:'9007199254740993',lost:'11'});
 assert.equal(result.plan.source.payload[0].n,node);assert.equal(result.digest,hash(result.text));assert.deepEqual(original,source(original.payload));
 assert.equal(plan('a'.repeat(64),original,input([charge('1'),charge('2','LIFETIME'),{owner:'3',action:'LOSS'}]),[target]).digest,result.digest);
});
test('every source owner requires exactly one explicit choice; amounts and forged fields cannot be supplied by the caller',()=>{
 const original=source([{u:'1',b:'5',n:node}]);
 for(const allocations of [[],[charge('2')],[charge('1'),charge('1')]])assert.throws(()=>plan('a'.repeat(64),original,input(allocations),[target]),/INVALID_ALLOCATION/);
 assert.throws(()=>input([{...charge('1'),bytes:'0'}]));assert.throws(()=>input([{owner:'1',action:'CHARGE',subject}]));
 assert.throws(()=>plan('a'.repeat(64),original,input([charge('1')]),[]),/TARGET_CHANGED/);
});
test('already applied jobs can only explicitly discard pending notifications, never be charged again',()=>{
 const original=source([{u:'1',b:'5',n:node}],{applied:true,pendingUsers:['1']});
 const result=plan('a'.repeat(64),original,input([]),[]);assert.deepEqual(result.plan.discardedEvents,['1']);assert.deepEqual(result.plan.charges,[]);
 assert.throws(()=>plan('a'.repeat(64),original,input([charge('1')]),[target]),/INVALID_ALLOCATION/);
 assert.throws(()=>plan('a'.repeat(64),{...original,pendingUsers:null},input([]),[]),/NOT_PENDING/);
 for(const pendingUsers of [['1','1'],['2']])assert.throws(()=>validateLegacySource({...original,pendingUsers}),/SOURCE_INVALID/);
});
test('source modification, duplicate original owners, int64 overflow and target budget changes invalidate a decision',()=>{
 const original=source([{u:'1',b:'5',n:node}]),request=input([charge('1')]);
 assert.throws(()=>validateLegacySource({...original,digest:'b'.repeat(64)}),/SOURCE_INVALID/);
 assert.throws(()=>validateLegacySource(source([...original.payload,...original.payload])),/SOURCE_INVALID/);
 for(const bytes of ['not-a-number','-1','1.5','01','9223372036854775808','99999999999999999999'])assert.throws(()=>validateLegacySource(source([{u:'1',b:bytes,n:node}])),/SOURCE_INVALID/);
 assert.throws(()=>plan('a'.repeat(64),original,request,[{...target,lifetime:'9223372036854775807'}]),/OVERFLOW/);
 const first=plan('a'.repeat(64),original,request,[target]);
 for(const patch of [{used:'8'},{epoch:generation},{resetAt:'2026-10-16 00:00:00'},{username:'changed'},{strategy:'DAY'},{limit:'2000'}])assert.notEqual(plan('a'.repeat(64),original,request,[{...target,...patch}]).digest,first.digest);
});
