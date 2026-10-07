const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs/promises');const os=require('node:os');const http=require('node:http');const {gunzipSync}=require('node:zlib');const load=require('./load-typescript.cjs');const sirv=require('sirv');
test('static assets negotiate compressed content and ETag; compression never changes originals',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xera-assets-test-'));let server;
 try{
  const source=Buffer.from('test wasm content '.repeat(1000));await fs.writeFile(path.join(root,'test.wasm'),source);await fs.writeFile(path.join(root,'small.json'),'{}');
  const {compressAssets,compressedAssets}=load(path.resolve(__dirname,'../../frontend/compress-assets.ts'));
  assert.equal(compressedAssets().apply,'build');await compressAssets(root);
  assert.deepEqual(await fs.readFile(path.join(root,'test.wasm')),source);
  assert.deepEqual(gunzipSync(await fs.readFile(path.join(root,'test.wasm.gz'))),source);
  await assert.rejects(fs.stat(path.join(root,'small.json.gz')),/ENOENT/);
  server=http.createServer(sirv(root,{gzip:true,etag:true}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const request=headers=>new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port:server.address().port,path:'/test.wasm',headers},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))}).on('error',reject));
  const compressed=await request({'accept-encoding':'gzip'});assert.equal(compressed.headers['content-encoding'],'gzip');assert.match(compressed.headers.vary,/Accept-Encoding/i);assert.deepEqual(gunzipSync(compressed.body),source);
  const cached=await request({'accept-encoding':'gzip','if-none-match':compressed.headers.etag});assert.equal(cached.status,304);
  const plain=await request({'accept-encoding':'identity'});assert.equal(plain.headers['content-encoding'],undefined);assert.deepEqual(plain.body,source);
  await fs.writeFile(path.join(root,'test.wasm'),'small');await compressAssets(root);
  await assert.rejects(fs.stat(path.join(root,'test.wasm.gz')),/ENOENT/);
 }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true})}
});
