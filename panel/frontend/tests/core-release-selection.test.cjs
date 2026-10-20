const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('../../backend/tests/load-typescript.cjs');
const {selectCoreRelease}=load(path.join(__dirname,'../src/features/dashboard/nodes/core-management/core-release-selection.ts'));
test('current release is selected by default and stale selections cannot leave an empty dropdown',()=>{
 const entries=[{id:'1.1.9'},{id:'1.1.8'}];
 assert.equal(selectCoreRelease(entries,null),'1.1.9');
 assert.equal(selectCoreRelease(entries,'1.1.8'),'1.1.8');
 assert.equal(selectCoreRelease(entries,'removed'),'1.1.9');
 assert.equal(selectCoreRelease([],null),undefined);
});
