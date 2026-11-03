const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {QueryClient}=require('@tanstack/react-query');
const load=require('../../backend/tests/load-typescript.cjs');
const {cacheCreatedTemplate}=load(path.join(__dirname,'../src/shared/api/hooks/subscription-template/subscription-template-cache.ts'));
const key=['subscriptionTemplate','getSubscriptionTemplates'];
const item=(uuid,viewPosition=0)=>({uuid,name:uuid,viewPosition,templateType:'XRAY_JSON',tags:[]});

test('creation cancels an older list read and publishes the server result immediately',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const old={total:1,templates:[item('old')]};
 client.setQueryData(key,old);
 let finish;
 const pending=client.fetchQuery({queryKey:key,queryFn:()=>new Promise(resolve=>{finish=resolve})});
 pending.catch(()=>{});
 await cacheCreatedTemplate(client,key,item('new',1));
 assert.deepEqual(client.getQueryData(key).templates.map(x=>x.uuid),['old','new']);
 finish(old);
 await pending.catch(()=>{});
 assert.deepEqual(client.getQueryData(key).templates.map(x=>x.uuid),['old','new']);
 assert.equal(client.getQueryState(key).isInvalidated,true);
 assert.deepEqual(old,{total:1,templates:[item('old')]});
 client.clear();
});

test('repeated creation notifications replace one UUID and preserve other cached sections',async()=>{
 const client=new QueryClient();
 client.setQueryData(key,{total:1,templates:[item('one',1)]});
 client.setQueryData(['hosts'],['unchanged']);
 await cacheCreatedTemplate(client,key,item('two',0));
 await cacheCreatedTemplate(client,key,{...item('two',0),name:'renamed'});
 const result=client.getQueryData(key);
 assert.equal(result.total,2);
 assert.deepEqual(result.templates.map(x=>x.uuid),['two','one']);
 assert.equal(result.templates[0].name,'renamed');
 assert.deepEqual(client.getQueryData(['hosts']),['unchanged']);
 client.clear();
});

test('a missing list is fetched normally instead of being seeded with an incomplete list',async()=>{
 const client=new QueryClient();
 await cacheCreatedTemplate(client,key,item('new'));
 assert.equal(client.getQueryData(key),undefined);
 client.clear();
});
