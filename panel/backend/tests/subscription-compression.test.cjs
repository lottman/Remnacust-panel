const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const http=require('node:http');
const express=require('express');
const {gunzipSync}=require('node:zlib');
const load=require('./load-typescript.cjs');
const {sendSubscriptionBody}=load(path.join(__dirname,'../src/modules/subscription/utils/send-subscription-body.ts'));
test('subscription compression negotiates gzip and preserves every profile and routing rule',async()=>{
 const app=express();const body=JSON.stringify(Array.from({length:5},()=>({routing:{rules:Array(2000).fill({domain:['example.org'],outboundTag:'proxy'})}})));
 app.get('/',(req,res)=>{res.set('Cache-Control','private, no-store');void sendSubscriptionBody(res,body,'application/json')});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try {
  for(const [encoding,compressed] of [[null,false],['identity',false],['gzip;q=0, identity',false],['br, gzip',true]]){
   const result=await new Promise((resolve,reject)=>{
    http.get({hostname:'127.0.0.1',port:server.address().port,path:'/',headers:encoding?{'Accept-Encoding':encoding}:{}},res=>{
     const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({headers:res.headers,body:Buffer.concat(chunks)}));
    }).on('error',reject);
   });
   assert.equal(result.headers['content-encoding'],compressed?'gzip':undefined);
   assert.match(result.headers.vary,/Accept-Encoding/);assert.match(result.headers['cache-control'],/no-store/);
   assert.equal((compressed?gunzipSync(result.body):result.body).toString(),body);
   if(compressed)assert(result.body.length<body.length/10);
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});
