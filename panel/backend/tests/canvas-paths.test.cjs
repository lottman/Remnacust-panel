const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {createCanvasPaths}=require('./load-typescript.cjs')(path.resolve(__dirname,'../../frontend/src/pages/dashboard/config-profiles/components/profile-canvas-routing.ts'));
test('canvas paths depend on topology and cannot be mutated during selection renders',()=>{
 const cards=[{id:'in',x:0,y:0},{id:'balancer',x:300,y:0},{id:'exit',x:600,y:150}];
 const edges=[{from:'in',to:'balancer'},{from:'balancer',to:'exit'}];
 const paths=createCanvasPaths(JSON.stringify(cards),JSON.stringify(edges));
 assert(Object.isFrozen(paths));assert.equal(Object.keys(paths).length,2);
 const original=paths['["in","balancer"]'];Reflect.set(paths,'["in","balancer"]','invalid');assert.equal(paths['["in","balancer"]'],original);
 cards[1].y=200;const moved=createCanvasPaths(JSON.stringify(cards),JSON.stringify(edges));assert.notEqual(moved['["in","balancer"]'],original);
 assert.deepEqual(Object.keys(createCanvasPaths(JSON.stringify(cards),'[]')),[]);
});
