const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('./load-typescript.cjs');
const {renderQuotaCheckpoint}=load(path.join(__dirname,'../src/common/host-policy/quota-journal-checkpoint.ts'));
const instance='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('first fencing creates a journal before enrollment; known journals cannot omit or forge their observation',async()=>{
 const db={get kysely(){assert.fail('Invalid observation must not issue SQL');}},body={groups:{},hosts:{}};
 await renderQuotaCheckpoint(db,'node',{phase:'FENCING',instance:null},body,undefined);assert.equal(body.quotaCheckpoint,undefined);
 const good={quotaWatermarksSupported:true,quotaJournalSequence:'9007199254740991',quotaInstanceId:instance,policyRevision:'5'};
 for(const change of [v=>v.quotaWatermarksSupported=false,v=>v.quotaJournalSequence='01',v=>v.quotaJournalSequence='9007199254740992',v=>v.quotaInstanceId='wrong',v=>v.quotaJournalSequence=null]){
  const value={...good};change(value);await assert.rejects(renderQuotaCheckpoint(db,'node',{phase:'ACTIVE',instance},body,value),/checkpoint/);
 }
});
