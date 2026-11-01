const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const load = require('./load-typescript.cjs');
const fixture = require('./geofiles-fixture.cjs');
const {mocks, pool} = require('./client-pool-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = {...mocks, '../generators/client-pool': pool};
const {bundleDat} = load(path.join(root, 'bundle-dat.ts'), modules);
const {compileDat, datCategories} = load(path.join(root, 'compile-dat.ts'), modules);
const {datCategory, XrayGeofileDelivery} = load(path.join(root, 'xray-geofile-delivery.ts'), modules);
const {materializeGeofiles} = load(path.join(root, 'materialize-geofiles.ts'), modules);
const {storeBundleSelection, readBundleSelection, validateBundleSelection} = load(path.join(root, 'bundle-selection.ts'), modules);
const id = 'a'.repeat(34), other = 'b'.repeat(34);
const selection = () => ({kind:'geosite', ids:[id], namespace:2, categories:{[id]:['example']}});
const unused = fixture.bytes(1, Buffer.concat([fixture.bytes(1, 'UNUSED'), fixture.bytes(2, fixture.domain(2, 'unused.test'))]));

test('built-in actions reuse plain outbounds without adopting custom redirects or colliding with groups', async () => {
 const base={remnacust:{geofiles:[{id,categories:['example'],target:'DIRECT'}]}};
 const render=(config,type='XRAY_JSON')=>materializeGeofiles({...base,...config},type,async()=>({id,kind:'geosite'}),async()=>compileDat(fixture.geosite,'geosite',['example']));
 const plain=await render({outbounds:[{tag:'direct',protocol:'freedom'}]});
 assert.equal(plain.outbounds.length,1);assert.equal(plain.routing.rules[0].outboundTag,'direct');
 const custom={tag:'geo-freedom',protocol:'freedom',settings:{redirect:'127.0.0.1:4321'}};
 const redirected=await render({outbounds:[custom]});
 assert.deepEqual(redirected.outbounds[0],custom);
 assert.equal(redirected.routing.rules[0].outboundTag,'geo-freedom-1');
 assert.deepEqual(redirected.outbounds[1],{tag:'geo-freedom-1',protocol:'freedom'});
 const pool=await render({outbounds:[{tag:'direct',protocol:'freedom'}],remnawave:{injectHosts:[{tagPrefix:'direct'}]},routing:{balancers:[{tag:'geo-freedom'}]}});
 assert.equal(pool.routing.rules[0].outboundTag,'geo-freedom-1');
 const sing=await render({outbounds:[{type:'direct',tag:'geo-direct',bind_interface:'eth0'}]},'SINGBOX');
 assert.equal(sing.route.rules[0].outbound,'geo-direct-1');
});

test('selected DAT bundles exclude unused categories and retain attributes and reverse CIDR bytes', () => {
 const source = Buffer.concat([fixture.geosite, unused]);
 const bundled = bundleDat([{id, data:source}], 2, {[id]:['example']});
 assert.deepEqual(datCategories(bundled, 'geosite'), [datCategory(id,'example')]);
 assert.deepEqual(compileDat(bundled,'geosite',[datCategory(id,'example')+'@ads']).domains,[{type:3,value:'ads.example.com'}]);
 assert.throws(()=>compileDat(bundled,'geosite',[datCategory(id,'unused')]), /empty/);
 assert.equal(datCategories(bundleDat([{id, data:source}], 2),'geosite').length, 2);
 assert.throws(()=>bundleDat([{id,data:source}],2,{[id]:['example','missing']}), /empty/);
 const reverse = fixture.bytes(1,Buffer.concat([fixture.bytes(1,'RU'),fixture.bytes(2,Buffer.concat([fixture.bytes(1,Buffer.from([203,0,113,0])),fixture.number(2,24)])),fixture.number(3,1)]));
 const ip = bundleDat([{id,data:reverse}],2,{[id]:['ru']});
 assert(ip.includes(Buffer.concat([fixture.number(3,1)])));
 assert.throws(()=>compileDat(ip,'geoip',[datCategory(id,'ru')]), /reverse-cidr/);
});

test('collector selects only used source categories, retaining category attributes in routing', async () => {
 const calls=[];
 const delivery = new XrayGeofileDelivery('incy','remote');
 const url = async (...args) => {calls.push(args);return 'https://sub.example.test/subset.dat';};
 const used = delivery.register('geosite',{id,categories:['example@ads'],target:'DIRECT'},url);
 delivery.register('geosite',{id:other,categories:['unused'],target:'REJECT'},url);
 await delivery.header(JSON.stringify([{routing:{rules:[{domain:used,outboundTag:'direct'}]}}]),'fixture');
 assert.deepEqual(calls,[['geosite',[id],{[id]:['example']}]]);
 assert.match(used[0], /@ads$/);
});

test('legacy plain outbound targets have the same DIRECT/REJECT action in JSON and client routing profiles', async () => {
 for(const [target,protocol,field] of [['direct','freedom','DirectSites'],['block','blackhole','BlockSites']]) {
  const delivery=new XrayGeofileDelivery('happ','remote');
  const result=await materializeGeofiles({outbounds:[{tag:target,protocol}],remnacust:{geofiles:[{id,categories:['example'],target}]}},'XRAY_JSON',async()=>({id,kind:'geosite'}),async()=>compileDat(fixture.geosite,'geosite',['example']),{read:async()=>fixture.geosite,validateDat:async()=>{},datUrl:()=>'',datBundleUrl:async()=> 'https://sub.example.test/rules.dat'},delivery);
  const header=await delivery.header(JSON.stringify([result]),'fixture');
  const profile=JSON.parse(Buffer.from(header.split('/onadd/')[1],'base64'));
  assert.equal(result.routing.rules[0].outboundTag,target);
  assert.deepEqual(profile[field],['geosite:'+datCategory(id,'example')]);
  assert.deepEqual(profile.ProxySites,[]);
 }
});

test('shared categories retain per-profile ordered rules and the longest cooldown without contradictory metadata', async () => {
 const delivery=new XrayGeofileDelivery('incy','remote');
 const url=async()=> 'https://sub.example.test/shared.dat';
 const direct=delivery.register('geosite',{id,categories:['example'],target:'DIRECT',clientRefreshIntervalSeconds:86400},url);
 const block=delivery.register('geosite',{id,categories:['example'],target:'REJECT',clientRefreshIntervalSeconds:300},url);
 const subscription=JSON.stringify([{routing:{rules:[{domain:direct,outboundTag:'direct'},{domain:block,outboundTag:'block'}]}}]);
 const header=await delivery.header(subscription,'fixture');
 const profile=JSON.parse(Buffer.from(header.split('/onadd/')[1],'base64'));
 assert.equal(profile.Geositeurl,'https://sub.example.test/shared.dat');
 assert.deepEqual(profile.DirectSites,[]);assert.deepEqual(profile.BlockSites,[]);assert.deepEqual(profile.ProxySites,[]);
 assert.equal(delivery.intervalHours,24);
 assert.deepEqual(JSON.parse(subscription)[0].routing.rules.map(rule=>rule.outboundTag),['direct','block']);
});

test('content-addressed selections persist atomically and reject modified content and unsafe shapes', async () => {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'remnacust-subset-'));
 try {
  const keys=await Promise.all(Array.from({length:8},()=>storeBundleSelection(directory,selection())));
  assert.equal(new Set(keys).size,1);
  const key=keys[0];assert.match(key,/^m-[a-f0-9]{64}$/);
  assert.deepEqual(await readBundleSelection(directory,key),selection());
  assert.equal((await fs.readdir(directory)).length,1);
  for(const value of [null,{}, {...selection(),ids:[id,id]}, {...selection(),categories:{[id]:['../bad']}}, {...selection(),categories:{[id]:[]}}, {...selection(),categories:{[id]:['example'],[other]:['unused']}}]) assert.throws(()=>validateBundleSelection(value));
  for(const value of ['../metadata','m-abc','a'.repeat(66)]) await assert.rejects(readBundleSelection(directory,value));
  await fs.writeFile(path.join(directory,'selection-'+key.slice(2)+'.json'),'{}');
  await assert.rejects(readBundleSelection(directory,key),/selection/);
  assert.equal((await fs.readdir(directory)).filter(name=>name.startsWith('.selection-')).length,0);
 } finally {await fs.rm(directory,{recursive:true,force:true});}
});

test('selection storage is bounded and reuses existing selections at capacity', async () => {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'remnacust-subset-cap-'));
 try {
  const original=await storeBundleSelection(directory,selection());
  await Promise.all(Array.from({length:127},(_,i)=>fs.writeFile(path.join(directory,'selection-'+crypto.createHash('sha256').update(String(i)).digest('hex')+'.json'),'{}')));
  assert.equal(await storeBundleSelection(directory,selection()),original);
  assert.equal(await storeBundleSelection(directory,{...selection(),categories:{[id]:['other']}}),undefined);
 } finally {await fs.rm(directory,{recursive:true,force:true});}
});

test('Linux rejects manifest symlinks before reading their targets', {skip:process.platform!=='linux'}, async () => {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'remnacust-subset-link-'));
 try {
  const data=Buffer.from(JSON.stringify(selection()));
  const key='m-'+crypto.createHash('sha256').update(data).digest('hex');
  const source=path.join(directory,'private.json');await fs.writeFile(source,data);
  await fs.symlink(source,path.join(directory,'selection-'+key.slice(2)+'.json'));
  await assert.rejects(readBundleSelection(directory,key),error=>error.code==='ELOOP');
 } finally {await fs.rm(directory,{recursive:true,force:true});}
});
