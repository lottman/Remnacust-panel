const test=require('node:test'), assert=require('node:assert/strict'),path=require('node:path');
const load=require('./load-typescript.cjs');
const {mocks,pool}=require('./client-pool-fixture.cjs');
const fixture=require('./geofiles-fixture.cjs');
const root=path.join(__dirname,'../src/modules/subscription-template/geofiles');
const modules={...mocks,'../generators/client-pool':pool};
const {automaticXrayDelivery}=load(path.join(root,'automatic-xray-delivery.ts'),modules);
const {materializeGeofiles}=load(path.join(root,'materialize-geofiles.ts'),modules);
const {compileDat}=load(path.join(root,'compile-dat.ts'),modules);
const {XrayGeofileDelivery}=load(path.join(root,'xray-geofile-delivery.ts'),modules);
const {xrayProfilesFit}=load(path.join(root,'incy-config.ts'),modules);
const source=n=>String(n).padStart(2,'0')+'a'.repeat(32);
const decode=h=>JSON.parse(Buffer.from(h.split('/onadd/')[1],'base64'));

function setup({rules=fixture.geosite,refs=1,profiles=1,extra='',bundleFails=false}={}) {
 const calls=[];
 const config={inbounds:[],outbounds:[],routing:{rules:[]},extra,remnacust:{geofiles:Array.from({length:refs},(_,i)=>({id:source(i),categories:['example'],target:i%2?'REJECT':'DIRECT',downloadToClient:i%2===0}))}};
 const generate=async delivery=>{
  calls.push(delivery?.mode??'none');
  const resolved=await materializeGeofiles(config,'XRAY_JSON',async id=>({id,kind:'geosite'}),async(_,cats)=>compileDat(rules,'geosite',cats),{
   read:async()=>rules,validateDat:async(_,cats)=>{compileDat(rules,'geosite',cats,true);},
   datUrl:()=>'',datBundleUrl:async()=>{if(bundleFails)throw Error('unavailable');return 'https://subscription.test/combined.dat';},
  },delivery);
  return JSON.stringify(Array.from({length:profiles},()=>resolved));
 };
 return {calls,generate,config};
}
const render=(fixture,more={})=>automaticXrayDelivery({client:'incy',manualRouting:false,title:'base64:'+Buffer.from('Первый VPN').toString('base64'),profileKey:'provider/user',generate:fixture.generate,...more});

test('small geofiles become inline rules regardless of legacy per-file switches',async()=>{
 for(const client of ['happ','incy']){
  const f=setup({refs:2});const r=await render(f,{client});const p=decode(r.header);
  assert.deepEqual(f.calls,['inline']);assert.equal(r.inline,true);assert.equal(r.intervalHours,0);
  assert.equal(p.Geoipurl,'');assert.equal(p.Geositeurl,'');assert.match(p.Name,/^Первый VPN · [a-f0-9]{8}$/);assert(!p.Name.includes('Remnacust'));
  const rules=JSON.parse(r.subscription)[0].routing.rules;
  assert.equal(rules.length,2);assert.equal(rules[0].outboundTag,'geo-freedom');assert.equal(rules[1].outboundTag,'geo-blackhole');
 }
});
test('host profiles are measured separately, never as the sum of the subscription',async()=>{
 const f=setup({profiles:8,extra:'x'.repeat(160000)});const r=await render(f);
 assert(Buffer.byteLength(r.subscription)>900000);assert.equal(r.inline,true);assert.deepEqual(f.calls,['inline']);assert(xrayProfilesFit(r.subscription));
});
test('per-profile boundaries count UTF-8 bytes and include formatted JSON overhead',()=>{
 const profile={remarks:'Подписка 中文',outbounds:[],routing:{rules:[]}};
 const bytes=Buffer.byteLength(JSON.stringify(profile,null,4));
 const body=JSON.stringify([profile,profile]);
 assert(xrayProfilesFit(body,bytes));assert.equal(xrayProfilesFit(body,bytes-1),false);
});
test('the independent transport cap is not misclassified as a per-host geofile limit',async()=>{
 const f=setup({profiles:110,extra:'x'.repeat(160000)});
 await assert.rejects(render(f),/subscription-size-limit/);
 assert.deepEqual(f.calls,['inline']);
});
test('two individually small files can exceed the complete profile budget and trigger one DAT bundle',async()=>{
 const records=Array.from({length:18000},(_,i)=>fixture.bytes(2,fixture.domain(2,`host-${i}.example.test`)));
 const rules=fixture.bytes(1,Buffer.concat([fixture.bytes(1,'EXAMPLE'),...records]));
 const small=setup({rules});assert.equal((await render(small)).inline,true);
 const f=setup({rules,refs:2,profiles:3});const r=await render(f);const p=decode(r.header);
 assert.deepEqual(f.calls,['inline','remote']);assert.equal(r.inline,false);assert.equal(p.Geositeurl,'https://subscription.test/combined.dat');assert(xrayProfilesFit(r.subscription));
 const routes=JSON.parse(r.subscription)[0].routing.rules;assert(routes[0].domain[0].startsWith('geosite:'));assert.equal(routes.length,2);
 assert.notEqual(routes[0].domain[0],routes[1].domain[0]);assert.equal(routes[1].outboundTag,'geo-blackhole');
});
test('large single files can be validated for native download without allocating all inline matchers',async()=>{
 const data=fixture.bytes(1,Buffer.concat([fixture.bytes(1,'EXAMPLE'),...Array.from({length:50001},(_,i)=>fixture.bytes(2,fixture.domain(2,`domain-${i}.test`)))]));
 assert.throws(()=>compileDat(data,'geosite',['example']),/inline-limit/);
 assert.deepEqual(compileDat(data,'geosite',['example'],true),{ips:[],domains:[]});
 assert.throws(()=>compileDat(data,'geosite',['missing'],true),/empty/);
 const f=setup({rules:data});const r=await render(f);assert.equal(r.inline,false);assert.deepEqual(f.calls,['inline','remote']);
});
test('inline StringList compaction is tried before enabling downloads',async()=>{
 const calls=[];const networks=Array.from({length:26000},(_,i)=>`100.${i>>8}.${i&255}.0/24`);
 const r=await automaticXrayDelivery({client:'incy',manualRouting:false,title:'Test',profileKey:'id',generate:async d=>{calls.push(d.mode);d.registerInline();return JSON.stringify([{inbounds:[],outbounds:[],routing:{rules:[{ip:networks,outboundTag:'direct'}]}}]);}});
 assert.deepEqual(calls,['inline']);assert.equal(r.inline,true);assert.deepEqual(JSON.parse(r.subscription)[0].routing.rules[0].ip.split(','),networks);
});
test('bundle failure, unrelated oversized data and manual routing conflicts fail without returning broken configurations',async()=>{
 const records=Array.from({length:40000},(_,i)=>fixture.bytes(2,fixture.domain(2,`host-${i}.example.test`)));
 const rules=fixture.bytes(1,Buffer.concat([fixture.bytes(1,'EXAMPLE'),...records]));
 await assert.rejects(render(setup({rules,bundleFails:true})),/geofile-auto-delivery-unavailable/);
 await assert.rejects(render(setup({extra:'x'.repeat(950000)})),/size-limit/);
 await assert.rejects(render(setup({rules}),{manualRouting:true}),/size-limit/);
 const f=setup();await assert.rejects(render({...f,generate:async()=>{throw Error('geofile-category-empty');}}),/category-empty/);
});
test('profile identity is stable across automatic delivery transitions, sanitized and provider-scoped',async()=>{
 const inline=new XrayGeofileDelivery('incy','inline','Project\r\nInjected: value');inline.registerInline();
 const a=decode(await inline.header('[{}]','provider/a',1793204000000));
 const remote=new XrayGeofileDelivery('incy','remote','Project\r\nInjected: value');
 const values=remote.register('geosite',{id:source(0),target:'DIRECT',categories:['example']},async()=> 'https://sub.test/rules.dat');
 const b=decode(await remote.header(JSON.stringify([{routing:{rules:[{domain:values}]}}]),'provider/a',1793204001000));
 assert.equal(a.Name,b.Name);assert(!/[\r\n]/.test(a.Name));assert(Number(b.LastUpdated)>Number(a.LastUpdated));
 assert.notEqual(b.Name,decode(await remote.header(JSON.stringify([{routing:{rules:[{domain:values}]}}]),'provider/b')).Name);
});
