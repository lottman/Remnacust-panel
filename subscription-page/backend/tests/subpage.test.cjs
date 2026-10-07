const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const load = require('./load-typescript.cjs');
const axiosMocks = {'@common/axios/axios.service': {}};
function response() {
    const res = new EventEmitter(); res.headers = {}; res.cookies = [];
    res.set = (name, value) => {if (typeof name === 'object') Object.assign(res.headers,name);else res.headers[name]=value;return res;};
    res.status = code => {res.code=code;return res;};res.type = type => {res.contentType=type;return res;};
    res.send = body => {res.body=body;res.writableEnded=true;res.emit('finish');return res;};
    res.cookie = (...args) => res.cookies.push(args);res.socket = {destroy:()=>{res.destroyed=true;}};
    return res;
}
const { SubscriptionService } = load(path.join(__dirname,'../src/modules/subscription/subscription.service.ts'),axiosMocks);

test('proxy keeps upstream bytes and subscription headers but never caches personalized data', async () => {
    const bytes = Buffer.from('vmess://test\nvless://test');
    const service = new SubscriptionService({getSubscription:async()=>({subscription:bytes,headers:{'Cache-Control':'public,max-age=3600','subscription-userinfo':'test'}})});
    const res=response();await service.serveSubscriptionPage('127.0.0.1',{headers:{}},res,'test');
    assert.equal(res.body,bytes);assert.equal(res.headers['subscription-userinfo'],'test');
    assert.equal(res.headers['Cache-Control'],'private, no-store');
    assert.equal(res.headers['Referrer-Policy'],'no-referrer');
    assert.equal(res.listenerCount('close'),0);
});
test('timeout is a retriable 503 instead of an empty successful subscription or connection reset', async () => {
    const service=new SubscriptionService({getSubscription:async()=>{throw Error('timeout');}});
    const res=response();await service.serveSubscriptionPage('127.0.0.1',{headers:{}},res,'test');
    assert.equal(res.code,503);assert.equal(res.headers['Retry-After'],'30');assert(!res.destroyed);
});
test('missing subscription produces an ordinary 404', async () => {
    const service=new SubscriptionService({getSubscription:async()=>null});
    const res=response();await service.serveSubscriptionPage('127.0.0.1',{headers:{}},res,'missing');assert.equal(res.code,404);
});
test('a disconnected client cancels the pending panel request', async () => {
    let seen;
    const service=new SubscriptionService({getSubscription:(_ip,_uuid,_headers,_withType,_type,signal)=>new Promise((resolve,reject)=>{
        seen=signal;signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});
    })});
    const res=response();const promise=service.serveSubscriptionPage('127.0.0.1',{headers:{}},res,'test');
    res.destroyed=true;res.emit('close');await promise;assert(seen.aborted);assert.equal(res.listenerCount('close'),0);
});
test('HTML metadata is escaped by the actual built EJS template', () => {
    const template=fs.readFileSync(path.join(__dirname,'../../frontend/dist/index.html'),'utf8');
    const html=require('ejs').render(template,{metaTitle:'</title><script>alert(1)</script>',metaDescription:'"><img src=x onerror=alert(1)>',panelData:'e30='});
    assert(!html.includes('<script>alert(1)</script>'));assert(!html.includes('<img src=x onerror=alert(1)>'));
});
test('browser payload preserves Russian, Persian, Chinese and emoji text', () => {
    const {decodePanelData}=load(path.join(__dirname,'../../frontend/src/shared/utils/decode-panel-data.ts'));
    const data={name:'Подписка فارسی 中文 🚀',links:['vless://test#Россия']};
    assert.deepEqual(decodePanelData(Buffer.from(JSON.stringify(data),'utf8').toString('base64')),data);
    assert.throws(()=>decodePanelData(Buffer.from([255]).toString('base64')));
});
test('compression survives header filtering and preserves the complete HTML body', async () => {
    const express=require('express'), compression=require('compression');
    const {headerFilterMiddleware}=load(path.join(__dirname,'../src/common/middlewares/header-filter.middleware.ts'),{'@common/constants':{IGNORED_HEADERS:new Set(['accept-encoding','authorization'])}});
    const app=express();app.use(compression({threshold:1024}));app.use(headerFilterMiddleware);
    const html='<main>'+ 'Subscription text '.repeat(2000)+'</main>';
    app.get('/page',(_req,res)=>res.type('html').send(html));
    const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    try {const r=await fetch(`http://127.0.0.1:${server.address().port}/page`,{headers:{'user-agent':'test','accept-encoding':'gzip'}});
        assert.equal(r.headers.get('content-encoding'),'gzip');assert.equal(await r.text(),html);
    } finally {await new Promise(r=>server.close(r));}
});

function webpage(axios) {
    const { WebpageService } = load(path.join(__dirname, '../src/modules/webpage/webpage.service.ts'), {
        '@common/axios': {}, '@common/config/app-config': {},
        '@common/utils': {isDevelopment: () => true},
        '@common/utils/webpage-error': load(path.join(__dirname,'../src/common/utils/webpage-error.ts')),
        '@common/utils/crypt-utils': {encryptUuid: v => v, decryptUuid: v => v},
    });
    const service = new WebpageService({getOrThrow: () => 'test-only'}, axios, {sign: () => 'test-only'});
    service.getBaseSettings = () => ({showConnectionKeys: false, metaTitle: 'test', metaDescription: 'test'});
    service.indexTemplate = data => data.panelData;
    return service;
}
test('HTML starts both independent panel requests immediately, hides private keys and releases listeners', async () => {
    let finishInfo, finishConfig; const calls = [];
    const service = webpage({
        getSubscriptionInfo: () => {calls.push('info');return new Promise(r => finishInfo=r);},
        getSubpageConfig: () => {calls.push('config');return new Promise(r => finishConfig=r);},
    });
    const res=response(); const pending=service.serveWebpage('127.0.0.1',{headers:{}},res,'test');
    assert.deepEqual(calls,['info','config']);
    finishInfo({isOk:true,response:{response:{name:'Россия',links:['secret'],ssConfLinks:{secret:'secret'}}}});
    finishConfig({isOk:true,response:{webpageAllowed:true,subpageConfigUuid:'test'}});await pending;
    const data=JSON.parse(Buffer.from(res.body,'base64').toString('utf8'));
    assert.equal(data.response.name,'Россия');assert.deepEqual(data.response.links,[]);assert.deepEqual(data.response.ssConfLinks,{});
    assert.equal(res.cookies[0][2].sameSite,'lax');assert.equal(res.listenerCount('close'),0);
});
test('HTML distinguishes unknown subscriptions, denied pages and temporary panel failure', async () => {
    for(const [info, config, expected] of [
        [{isOk:false,status:404},{isOk:true,response:{}},404],
        [{isOk:false},{isOk:false},503],
        [{isOk:true,response:{response:{}}},{isOk:true,response:{webpageAllowed:false}},403],
    ]) {
        const res=response();await webpage({getSubscriptionInfo:async()=>info,getSubpageConfig:async()=>config})
            .serveWebpage('127.0.0.1',{headers:{}},res,'test');
        assert.equal(res.code,expected);assert(!res.destroyed);
        if(expected===503)assert.equal(res.headers['Retry-After'],'30');
    }
});
test('page budget rejects overload, lets static files through and releases a disconnect once', () => {
    const {dynamicRequestBudget}=load(path.join(__dirname,'../src/common/middlewares/request-budget.middleware.ts'));
    const budget=dynamicRequestBudget(1),first=response();let accepted=0;
    budget({path:'/subscription'},first,()=>accepted++);
    const busy=response();budget({path:'/subscription'},busy,()=>accepted++);assert.equal(busy.code,503);
    const config=response();budget({path:'/assets/.app-config-v2.json'},config,()=>accepted++);assert.equal(config.code,503);
    budget({path:'/assets/app.js'},response(),()=>accepted++);assert.equal(accepted,2);
    first.emit('close');first.emit('finish');budget({path:'/subscription'},response(),()=>accepted++);assert.equal(accepted,3);
    const stillBusy=response();budget({path:'/subscription'},stillBusy,()=>accepted++);assert.equal(stillBusy.code,503);
});
test('unknown routes respond with a noncacheable 404 rather than resetting the connection', () => {
    const {NotFoundExceptionFilter}=load(path.join(__dirname,'../src/common/exception/not-found-exception.filter.ts'));
    const res=response();new NotFoundExceptionFilter().catch({}, {switchToHttp:()=>({getResponse:()=>res})});
    assert.equal(res.code,404);assert.equal(res.headers['Cache-Control'],'private, no-store');assert(!res.destroyed);
});
test('local health checks remain available under load without exposing a remote bypass', () => {
    const {dynamicRequestBudget}=load(path.join(__dirname,'../src/common/middlewares/request-budget.middleware.ts'));
    const budget=dynamicRequestBudget(0);let accepted=0;
    for (const ip of ['127.0.0.1','::1','::ffff:127.0.0.1']) {
        budget({path:'/internal/health',headers:{},socket:{remoteAddress:ip}},response(),()=>accepted++);
    }
    assert.equal(accepted,3);
    for (const req of [
        {path:'/internal/health',headers:{},socket:{remoteAddress:'203.0.113.9'}},
        {path:'/internal/health',headers:{'x-forwarded-for':'127.0.0.1'},socket:{remoteAddress:'127.0.0.1'}},
        {path:'/subscription',headers:{},socket:{remoteAddress:'127.0.0.1'}},
    ]) {const res=response();budget(req,res,()=>accepted++);assert.equal(res.code,503);}
    assert.equal(accepted,3);
});
test('browser error pages localize RU/EN/FA/ZH and preserve error status without leaking inputs', () => {
    const {sendWebpageError}=load(path.join(__dirname,'../src/common/utils/webpage-error.ts'));
    for (const language of ['ru','en','fa','zh']) {
        for (const code of [403,404,503]) {
            const res=response();sendWebpageError({headers:{'accept-language':language+'-XX,en;q=0.5'}},res,code);
            assert.equal(res.code,code);assert.equal(res.contentType,'html');
            assert.equal(res.headers['Content-Language'],language);
            assert.equal(res.headers['Cache-Control'],'private, no-store');
            assert(res.body.includes(`lang="${language}"`));
            assert(res.body.includes(language==='fa'?'dir="rtl"':'dir="ltr"'));
            assert.equal(res.headers['Retry-After'],code===503?'30':undefined);
        }
    }
    for (const [header,expected] of [['ru;q=0,zh;q=0.9','zh'],['ru;q=0.3,fa;q=0.8','fa'],['<script>alert(1)</script>,xx','en']]) {
        const res=response();sendWebpageError({headers:{'accept-language':header}},res,503);
        assert.equal(res.headers['Content-Language'],expected);assert(!res.body.includes('<script>'));
    }
});
test('navigation rejects executable URL schemes and control-character bypasses while keeping app imports', () => {
    const {isSafeNavigationUrl}=load(path.join(__dirname,'../../frontend/src/shared/utils/safe-navigation.ts'));
    for (const value of ['javascript:alert(1)',' JAVASCRIPT:alert(1)','java\nscript:alert(1)',
        'java\tscript:alert(1)','data:text/html,<script>alert(1)</script>','file:///etc/passwd',
        'vbscript:msgbox(1)','blob:https://example.com/id','about:blank','','http://[invalid']) {
        assert.equal(isSafeNavigationUrl(value),false,value);
    }
    for (const value of ['https://example.com/sub/token','/help','happ://add/https://example.com/sub/token',
        'hiddify://import/https://example.com/sub/token','v2rayng://install-config?url=https%3A%2F%2Fexample.com',
        'clash://install-config?url=https%3A%2F%2Fexample.com','mailto:support@example.com']) {
        assert.equal(isSafeNavigationUrl(value),true,value);
    }
});
