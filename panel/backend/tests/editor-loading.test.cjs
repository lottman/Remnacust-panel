const test=require('node:test'); const assert=require('node:assert/strict'); const path=require('node:path');
const load=require('./load-typescript.cjs');
const root=path.resolve(__dirname,'../../frontend');
test('WASM shares streaming compilation, retries download errors and keeps no byte-buffer cache', async()=>{
 const globals={};
 let fetches=0,compiles=0,instances=0,runs=0; const module={};
 globals.fetch=async()=>{fetches++;return {ok:fetches!==1,status:503,headers:new Headers({'content-type':'application/wasm'}),arrayBuffer:()=>{throw Error('streaming must not buffer')}}};
 globals.WebAssembly={compileStreaming:async()=>{compiles++;return module},instantiate:async m=>{assert.equal(m,module);instances++;return{} }};
 const window=globals.window={Go:class{importObject={};run(){runs++;window.XrayParseConfig=()=>null;window.onWasmInitialized();return new Promise(()=>{})}}};
 try{
  const runtime=load(path.join(root,'src/shared/utils/xray-wasm.ts'),{'src/config':{app:{configEditor:{wasmUrl:'/assets/test.wasm'}}}},globals);
  await assert.rejects(runtime.initializeXrayWasm(),/503/);
  await Promise.all([runtime.initializeXrayWasm(),runtime.initializeXrayWasm()]);
  await runtime.initializeXrayWasm();
  assert.deepEqual({fetches,compiles,instances,runs},{fetches:2,compiles:1,instances:1,runs:1});
  delete window.XrayParseConfig;
  // A still-running initialization is shared until that Go instance exits.
  assert.equal(await runtime.loadXrayWasm(),module);
 }finally{}
});
test('WASM supports incorrect MIME and runtime failures without downloading a second copy',async()=>{
 const globals={};let fetches=0,buffers=0,runs=0;
 globals.fetch=async()=>{fetches++;return{ok:true,headers:new Headers({'content-type':'application/octet-stream'}),arrayBuffer:async()=>{buffers++;return new ArrayBuffer(8)}}};
 globals.WebAssembly={compile:async()=>({}),instantiate:async()=>({})};
 const window=globals.window={Go:class{importObject={};run(){runs++;if(runs===1)return Promise.reject(Error('startup failed'));window.XrayParseConfig=()=>null;window.onWasmInitialized();return new Promise(()=>{})}}};
 try{
  const runtime=load(path.join(root,'src/shared/utils/xray-wasm.ts'),{'src/config':{app:{configEditor:{wasmUrl:'/assets/test.wasm'}}}},globals);
  await assert.rejects(runtime.initializeXrayWasm(),/startup failed/);
  assert.equal(window.onWasmInitialized,undefined);
  await runtime.initializeXrayWasm(); assert.deepEqual({fetches,buffers,runs},{fetches:1,buffers:1,runs:2});
 }finally{}
});
test('editor schemas share pending requests but isolate per-editor mutation and retry failures',async()=>{
 const globals={};let requests=0;
 globals.fetch=async()=>({ok:++requests!==1,status:502,json:async()=>({definitions:{test:{value:1}}})});
 try{
  const {loadEditorSchema}=load(path.join(root,'src/shared/utils/monaco/schema-cache.ts'),{},globals);
  await assert.rejects(loadEditorSchema('/schema.json'),/502/);
  const [a,b]=await Promise.all([loadEditorSchema('/schema.json'),loadEditorSchema('/schema.json')]);
  a.definitions.test.value=2;assert.equal(b.definitions.test.value,1);
  assert.equal((await loadEditorSchema('/schema.json')).definitions.test.value,1);assert.equal(requests,2);
 }finally{}
});
