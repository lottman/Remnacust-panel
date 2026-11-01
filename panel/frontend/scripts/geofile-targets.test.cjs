const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');
const {geofileTargetAliases,geofileTargets} = load(path.join(__dirname,'../src/widgets/dashboard/templates/subscription-template-editor/geofile-targets.ts'));

test('plain DIRECT and REJECT aliases do not duplicate built-in actions or mutate drafts', () => {
 const config={outbounds:[{tag:'direct',protocol:'freedom',settings:{}},{tag:'block',protocol:'blackhole'},{tag:'proxy',protocol:'vless'}],remnacust:{geofiles:[{target:'direct'}]}};
 const original=JSON.stringify(config);
 assert.deepEqual({...geofileTargetAliases(config,'XRAY_JSON')},{direct:'DIRECT',block:'REJECT'});
 assert.equal(JSON.stringify(config),original);
 assert.deepEqual(geofileTargets(config,'XRAY_JSON'),['DIRECT','REJECT','proxy']);
 assert.deepEqual(geofileTargets({outbounds:[{tag:'DIRECT',protocol:'freedom'},{tag:'REJECT',protocol:'blackhole'}]},'XRAY_JSON'),['DIRECT','REJECT','proxy']);
 assert.deepEqual({...geofileTargetAliases({outbounds:[{tag:'direct',type:'direct'}]},'SINGBOX')},{direct:'DIRECT'});
});

test('custom outbounds and pool tag collisions remain explicit selectable actions', () => {
 for(const config of [
  {outbounds:[{tag:'direct',protocol:'freedom',settings:{redirect:'127.0.0.1:1234'}}]},
  {outbounds:[{tag:'direct',protocol:'freedom',sendThrough:'127.0.0.1'}]},
  {outbounds:[{tag:'direct',protocol:'freedom'}],routing:{balancers:[{tag:'direct'}]}},
  {outbounds:[{tag:'direct',protocol:'freedom'}],remnawave:{injectHosts:[{tagPrefix:'direct'}]}},
  {outbounds:[{tag:'direct',type:'direct',bind_interface:'eth0'}]}
 ]) assert.deepEqual({...geofileTargetAliases(config,config.outbounds[0].type?'SINGBOX':'XRAY_JSON')},{});
});

test('incomplete and invalid JSON drafts do not crash action discovery', () => {
 for(const config of [{}, {outbounds:{}}, {outbounds:[null,0,{}]}, {routing:{balancers:{}},remnawave:{injectHosts:[null]}}]) {
  assert.deepEqual({...geofileTargetAliases(config,'XRAY_JSON')},{});
  assert(geofileTargets(config,'XRAY_JSON').includes('DIRECT'));
 }
});
