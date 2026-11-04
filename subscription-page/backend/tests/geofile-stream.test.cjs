const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),{createHash}=require('node:crypto');
require('reflect-metadata');
const load=require('./load-typescript.cjs');
const {AxiosService}=load(path.join(__dirname,'../src/common/axios/axios.service.ts'),{'@common/config/app-config':{},'@common/constants':{IGNORED_HEADERS:new Set()},'./subscription-request-headers':load(path.join(__dirname,'../src/common/axios/subscription-request-headers.ts'))},{__RW_SUBPAGE_VERSION__:'test'});
const {GeofilesController}=load(path.join(__dirname,'../src/modules/subscription/geofiles.controller.ts'),{'@common/axios/axios.service':{AxiosService}});
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));
const close=s=>new Promise(r=>s.close(r));
test('real public DAT stream exceeds the JSON budget without truncation and matches its checksum',async()=>{
 const data=Buffer.alloc(23*1024*1024,123),digest=createHash('sha256').update(data).digest('hex');
 let conditionalRequests=0;
 const upstream=http.createServer((req,res)=>{
  res.setHeader('ETag','"'+digest+'"');
  if(req.headers['if-none-match']==='"'+digest+'"'){conditionalRequests++;res.writeHead(304);return res.end();}
  if(req.url.includes('d'.repeat(64))){res.writeHead(200,{'Content-Length':65*1024*1024});return res.end();}
  const bytes=req.url.includes('.sha256')?Buffer.from(digest):data;
  res.writeHead(200,{'Content-Length':bytes.length});res.end(bytes);
 });await listen(upstream);
 const service=new AxiosService({getOrThrow:key=>key==='REMNAWAVE_PANEL_URL'?`http://127.0.0.1:${upstream.address().port}`:'fixture',get:()=>undefined});
 const controller=new GeofilesController(service);
 const gateway=http.createServer((req,res)=>{
  res.set=(headers,value)=>{for(const[k,v]of Object.entries(typeof headers==='string'?{[headers]:value}:headers))res.setHeader(k,v);return res;};res.status=code=>{res.statusCode=code;return res;};
  const name=req.url.slice(1);void controller.download('a'.repeat(34),name,name.startsWith('bundle-')?'abc':undefined,req,res).catch(()=>{res.statusCode=500;res.end();});
 });await listen(gateway);
 const fetch=async name=>{const response=await global.fetch(`http://127.0.0.1:${gateway.address().port}/${name}`);return{response,body:Buffer.from(await response.arrayBuffer())};};
 try{
  const filename='b'.repeat(64)+'.dat';const file=await fetch(filename);
  assert.equal(file.response.status,200);assert.equal(file.body.length,data.length);
  assert.equal(file.response.headers.get('etag'),'"'+digest+'"');
  const unchanged=await global.fetch(`http://127.0.0.1:${gateway.address().port}/${filename}`,{headers:{'If-None-Match':'"'+digest+'"'}});
  assert.equal(unchanged.status,304);assert.equal((await unchanged.arrayBuffer()).byteLength,0);
  assert.equal(conditionalRequests,1);
  const hash=await fetch('bundle-'+'c'.repeat(64)+'.dat.sha256');
  assert.equal(hash.response.status,200);
  assert.equal(createHash('sha256').update(file.body).digest('hex'),hash.body.toString());
  assert.equal((await fetch('d'.repeat(64)+'.dat')).response.status,404,'oversized upstream files remain rejected');
  assert.equal(service.axiosInstance.defaults.maxContentLength,16*1024*1024,'JSON remains bounded separately');
 }finally{service.onModuleDestroy();await Promise.all([close(gateway),close(upstream)]);}
});

test('slow DAT downloads cannot occupy the connections needed by page metadata and subscriptions', async () => {
 const held=new Set();
 const upstream=http.createServer((req,res)=>{
  if(req.url.includes('/geofiles/')){
   held.add(res);res.on('close',()=>held.delete(res));
   res.writeHead(200,{'Content-Length':1024*1024});res.write(Buffer.from([1]));return;
  }
  if(req.url.includes('/info/'))return res.end(JSON.stringify({response:{isFound:true}}));
  res.end('[{"outbounds":[]}]');
 });await listen(upstream);
 const service=new AxiosService({getOrThrow:key=>key==='REMNAWAVE_PANEL_URL'?`http://127.0.0.1:${upstream.address().port}`:'fixture',get:()=>undefined});
 const controller=new GeofilesController(service);
 const gateway=http.createServer((req,res)=>{
  res.set=(headers,value)=>{for(const[k,v]of Object.entries(typeof headers==='string'?{[headers]:value}:headers))res.setHeader(k,v);return res;};
  res.status=code=>{res.statusCode=code;return res;};
  void controller.download('a'.repeat(34),'b'.repeat(64)+'.dat',undefined,req,res).catch(()=>res.end());
 });await listen(gateway);
 const agent=(service.geofileAxiosInstance??service.axiosInstance).defaults.httpAgent;
 const abort=new AbortController();
 const downloads=Array.from({length:agent.maxSockets},()=>global.fetch(`http://127.0.0.1:${gateway.address().port}/file`,{signal:abort.signal}).then(r=>r.arrayBuffer()).catch(()=>null));
 let timer;
 try{
  const deadline=Date.now()+5000;
  while(held.size<agent.maxSockets&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
  assert.equal(held.size,agent.maxSockets,'fixture saturates the actual DAT connection pool');
  const pending=Promise.all(Array.from({length:80},()=>Promise.all([service.getSubscriptionInfo('192.0.2.1','fixture',abort.signal),service.getSubscription('192.0.2.1','fixture',{},false,undefined,abort.signal)])));
  const result=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),3000);})]);
  assert(result,'DAT streams starved page metadata and subscription requests');
  for(const [info,subscription] of result){assert.equal(info.isOk,true);assert.equal(subscription.subscription.toString(),'[{"outbounds":[]}]');}
 }finally{
  clearTimeout(timer);abort.abort();for(const res of held)res.destroy();service.onModuleDestroy();
  await Promise.allSettled(downloads);gateway.closeAllConnections();upstream.closeAllConnections();
  await Promise.all([close(gateway),close(upstream)]);
 }
});
