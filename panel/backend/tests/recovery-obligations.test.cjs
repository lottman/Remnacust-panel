const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {recoveryObligationsSchema,requireSettledRecoveryObligations}=require('./load-typescript.cjs')(path.join(__dirname,'../src/common/host-policy/quota-recovery-obligations.ts'));
const empty={unsettledReserves:'0',exposures:'0',nativeTickets:'0',nativeEffects:'0',legacyStreams:'0',legacyJobs:'0',recoveryDeliveries:'0',activeWorkers:'0'};
test('every global financial obligation blocks the SQL precondition, with exact integer counters',()=>{
 assert.deepEqual(requireSettledRecoveryObligations(empty),empty);
 for(const key of Object.keys(empty))for(const count of ['1','9007199254740993','9223372036854775807'])assert.throws(()=>requireSettledRecoveryObligations({...empty,[key]:count}),new RegExp(key));
});
test('missing, malformed or unknown observations cannot be coerced into settled zero',()=>{
 for(const bad of [null,undefined,{}, {...empty,legacyJobs:0},{...empty,legacyJobs:'00'},{...empty,legacyJobs:'-1'},{...empty,legacyJobs:'9223372036854775808'},{...empty,ready:true}])assert.equal(recoveryObligationsSchema.safeParse(bad).success,false);
});
