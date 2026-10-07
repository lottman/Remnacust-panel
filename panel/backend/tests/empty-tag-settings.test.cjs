const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./api-permissions-fixture.cjs');
const {HostsController}=load('src/modules/hosts/controllers/hosts.controller.ts');
test('empty tags retain independent settings and validate only their own members',async()=>{
 const saved=new Map(),validated=[];
 const controller=new HostsController({validatePolicyState:async(...args)=>validated.push(args),synchronizeCommittedPolicies:async()=>{}},
  {lockPolicies:async()=>{},findAll:async()=>[{uuid:'other-host',tags:['other']}]},
  {list:async()=>[...saved.values()],set:async(tag,limitBytes,resetValue,resetUnit,speedLimitMbps,totalSpeedLimitMbps,trafficMultiplier)=>saved.set(tag,{tag,limitBytes,resetValue,resetUnit,speedLimitMbps,totalSpeedLimitMbps,trafficMultiplier}),delete:async tag=>saved.delete(tag)});
 await controller.setTagLimit({tag:'empty',limitBytes:0});
 await controller.setTagLimit({tag:'second',limitBytes:1000,speedLimitMbps:2});
 await controller.setTagLimit({tag:'empty',limitBytes:2000});
 assert.equal(saved.get('empty').limitBytes,2000n);
 assert.equal(saved.get('second').limitBytes,1000n);
 assert.equal(saved.get('second').speedLimitMbps,2);
 assert(validated.every(args=>args[3].size===0));
 await assert.rejects(controller.setTagLimit({tag:'bad\nname',limitBytes:0}));
 await controller.deleteTagLimit({tag:'empty'});
 assert(!saved.has('empty'));assert(saved.has('second'));
});
