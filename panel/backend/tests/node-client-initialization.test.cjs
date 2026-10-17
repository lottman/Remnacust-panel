const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const ref = { exports: {} };
class AxiosError extends Error {}
const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/common/axios/axios.service.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, esModuleInterop: true },
}).outputText;
new Function('require', 'module', 'exports', output)((id) => {
    if (id === '../host-policy/quota-recovery-release' || id === '../host-policy/quota-recovery-fence') return require('./load-typescript.cjs')(path.resolve(__dirname, '../src/common/host-policy',id.split('/').pop()+'.ts'));
    if (id === '../host-policy/recovery-quiescence') return require('./load-typescript.cjs')(path.resolve(__dirname,'../src/common/host-policy/recovery-quiescence.ts'));
    if (id === '../host-policy/recovery-usage-sample') return require('./load-typescript.cjs')(path.resolve(__dirname,'../src/common/host-policy/recovery-usage-sample.ts'));
    if (id === '../host-policy/recovery-usage-ack') return require('./load-typescript.cjs')(path.resolve(__dirname,'../src/common/host-policy/recovery-usage-ack.ts'));
    if (id === '../host-policy/quota-recovery-policy') return require('./load-typescript.cjs')(path.resolve(__dirname, '../src/common/host-policy/quota-recovery-policy.ts'));
    if (id === 'axios') return { __esModule: true, AxiosError, default: { create: () => ({ defaults: { headers: { common: {} } } }) } };
    if (id === '@nestjs/common') return { Injectable: () => (value) => value, Logger: class { error() {} log() {} } };
    if (id === '@contract/constants') return { ERRORS: { INTERNAL_SERVER_ERROR: {}, NODE_ERROR_WITH_MSG: {withMessage: message => ({message})} } };
    if (id === '@remnawave/node-contract') return { RemoveUserCommand: { url: '/node/handler/remove-user' } };
    if (id.endsWith('/get-node-jwt')) return { GetNodeJwtCommand: class {} };
    if (id === '@common/utils/certs') return { deriveSni: () => 'audit.invalid' };
    if (id === '../types') return { ok: (response) => ({ isOk: true, response }), fail: (error) => ({ isOk: false, error }) };
    if (id.startsWith('node:')) {
        if (id === 'node:zlib') return { constants: {}, zstdCompress: (_data, _options, done) => done(null, Buffer.alloc(0)) };
        return require(id);
    }
    return {};
}, ref, ref.exports);
const { AxiosService } = ref.exports;
const jwt = { isOk: true, response: { jwtToken: 'test-token', caCert: '', clientCert: '', clientKey: '', jwtPublicKey: '' } };
const opts = { address: 'audit.invalid', port: 2222, proxyUrl: null };
const config = { getOrThrow: () => true };
test('node requests support raw and bracketed IPv6 addresses', async () => {
    const service = new AxiosService({ execute: async () => jwt }, {}, config);
    const urls = [];
    service.axiosInstance.get = async (url) => {
        urls.push(new URL(url).href);
        return { data: { response: {} } };
    };
    for (const address of ['2001:db8::1', '[2001:db8::1]']) {
        assert.equal((await service.managedCore({ ...opts, address })).isOk, true);
    }
    assert.deepEqual(urls, Array(2).fill('https://[2001:db8::1]:2222/node/xray/managed-core'));
});
test('concurrent API node requests initialize mTLS and JWT exactly once', async () => {
    let initializations = 0;
    const service = new AxiosService({ execute: async () => { initializations++; await new Promise(r => setTimeout(r, 10)); return jwt; } }, {}, config);
    service.axiosInstance.post = async (_url, _data, config) => {
        assert.equal(service.axiosInstance.defaults.headers.common.Authorization, 'Bearer test-token');
        assert.ok(config.httpsAgent);
        return { data: { response: { success: true } } };
    };
    const results = await Promise.all([service.deleteUser({}, opts), service.deleteUser({}, opts)]);
    assert.ok(results.every(result => result.isOk));
    assert.equal(initializations, 1);
});
test('failed credential initialization fails closed and can retry', async () => {
    let attempts = 0;
    const service = new AxiosService({ execute: async () => ++attempts === 1 ? { isOk: false } : jwt }, {}, config);
    service.axiosInstance.post = async () => ({ data: { response: { success: true } } });
    assert.equal((await service.deleteUser({}, opts)).isOk, false);
    assert.equal((await service.deleteUser({}, opts)).isOk, true);
    assert.equal(attempts, 2);
});

test('durable receipt requests retain mTLS/JWT and a dedicated decoded response budget',async()=>{
    const service=new AxiosService({execute:async()=>jwt},{},config);
    service.axiosInstance.post=async(url,body,options)=>{
        assert.equal(new URL(url).pathname,'/node/xray/usage-receipts');assert.deepEqual(body,{action:'sample'});
        assert.ok(options.httpsAgent);assert.equal(options.maxRedirects,0);assert.equal(options.timeout,18000);assert.equal(options.maxContentLength,16*1024*1024);
        assert.equal(service.axiosInstance.defaults.headers.common.Authorization,'Bearer test-token');
        return {data:{response:{sequence:'7'}}};
    };
    assert.deepEqual(await service.usageReceipt(opts,{action:'sample'}),{isOk:true,response:{sequence:'7'}});
});

test('core status and actions use the node API prefix with initialized mTLS', async () => {
    const service = new AxiosService({ execute: async () => jwt }, {}, config);
    const requests = [];
    service.axiosInstance.get = async (url, config) => {
        requests.push(url);
        assert.ok(config.httpsAgent);
        assert.equal(config.maxRedirects, 0);
        return { data: { response: { capabilityVersion: 1 } } };
    };
    service.axiosInstance.post = async (url, data, config) => {
        requests.push(url);
        assert.deepEqual(data, { action: 'check' });
        assert.ok(config.httpsAgent);
        assert.equal(config.maxRedirects, 0);
        return { data: { response: { accepted: true } } };
    };
    assert.equal((await service.managedCore(opts)).response.capabilityVersion, 1);
    assert.equal((await service.managedCore(opts, { action: 'check' })).isOk, true);
    assert.deepEqual(requests, [
        'https://audit.invalid:2222/node/xray/managed-core',
        'https://audit.invalid:2222/node/xray/managed-core/actions',
    ]);
});

test('SNI compatibility switch preserves certificate and client authentication', async () => {
    for (const enabled of [true, false]) {
        const service = new AxiosService({ execute: async () => jwt }, {}, { getOrThrow: key => {
            assert.equal(key, 'SERVICE_SNI_VERIFICATION');
            return enabled;
        } });
        await service.setJwt();
        const options = service.axiosInstance.defaults.httpsAgent.options;
        assert.equal(options.servername, enabled ? 'audit.invalid' : undefined);
        assert.equal(options.rejectUnauthorized, true);
        assert.equal(options.minVersion, 'TLSv1.3');
        assert.equal(options.cert, jwt.response.clientCert);
        assert.equal(options.key, jwt.response.clientKey);
        assert.equal(options.ca, jwt.response.caCert);
    }
});


test('recovery staging transport accepts only the bound held-policy acknowledgement', async () => {
    const crypto=require('node:crypto');
    const uuid=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
    const fence={version:'remnacust-quota-recovery-fence-v1',generation:uuid('a'),token:uuid('b'),state:'FENCED',sequence:'1',previous:null};
    fence.digest=crypto.createHash('sha256').update([fence.version,fence.generation,fence.token,fence.state,fence.sequence,'-',''].join('\n')).digest('hex');
    const body={requestId:uuid('c'),generation:fence.generation,coreProcessId:uuid('d'),instance:uuid('e'),previous:fence.digest,policyRevision:'42'};
    const response={requestId:body.requestId,coreProcessId:body.coreProcessId,instance:body.instance,policyRevision:body.policyRevision,policyGeneration:uuid('f'),quotaRecovery:{version:fence.version,record:fence}};
    const service=new AxiosService({execute:async()=>jwt},{},config);const calls=[];
    service.request=async request=>{calls.push(request);return {isOk:true,response};};
    assert.equal((await service.hostQuotaRecoveryPolicy(opts,body)).isOk,true);
    assert.equal(calls[0].path,'/node/xray/host-policy/quota-recovery-policy');
    assert.equal(calls[0].method,'post');assert.equal(calls[0].logAxiosError,false);
    assert.deepEqual(calls[0].data,body);assert.equal(calls[0].maxResponseBytes,16*1024);
    response.instance=uuid('1');assert.equal((await service.hostQuotaRecoveryPolicy(opts,body)).isOk,false);
    const before=calls.length;assert.equal((await service.hostQuotaRecoveryPolicy(opts,{...body,policy:{}})).isOk,false);assert.equal(calls.length,before);
    const failed={isOk:false,code:'NODE_HTTP_409'};service.request=async()=>failed;
    assert.equal(await service.hostQuotaRecoveryPolicy(opts,body),failed);
});


test('ordinary policy and native ACK carry fresh recovery proof as a per-request header',async()=>{
 const crypto=require('node:crypto'),loader=require('./load-typescript.cjs');
 const helpers=loader(path.resolve(__dirname,'../src/common/host-policy/quota-recovery-policy.ts'));
 const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',core='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',instance='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const record={version:'remnacust-quota-recovery-fence-v1',generation,token:generation,state:'RELEASED',sequence:'2',previous:'a'.repeat(64)};
 record.digest=crypto.createHash('sha256').update([record.version,record.generation,record.token,record.state,record.sequence,record.previous,''].join('\n')).digest('hex');
 const status={quotaRecoveryPolicyBindingsRequired:true,quotaRecoveryPolicyBindingsSupported:true,quotaRecovery:{version:record.version,record},coreProcessId:core,quotaInstanceId:instance};
 const proof=helpers.recoveryPolicyTransportProof(status),service=new AxiosService({execute:async()=>jwt},{},config),sent=[];
 service.axiosInstance.get=async(url,options)=>{sent.push({method:'get',url,options});return {data:{response:status}}};
 service.axiosInstance.post=async(url,body,options)=>{sent.push({method:'post',url,body,options});if(body.action==='ack'&&(status.quotaRecovery.record.state==='FENCED'||options.headers?.['x-remnacust-recovery-proof']!==helpers.recoveryPolicyTransportProof(status))){const error=new AxiosError('Fixture binding rejected');error.response={status:503};throw error;}return {data:{response:{applied:true}}}};
 const body={version:'xera-host-policy-v2',revision:'9223372036854775807'};
 assert.equal((await service.hostPolicy(opts,body,proof)).isOk,true);
 assert.equal(sent.at(-1).options.headers['x-remnacust-recovery-proof'],proof);assert.deepEqual(sent.at(-1).body,body);
 assert.equal(service.axiosInstance.defaults.headers.common['x-remnacust-recovery-proof'],undefined,'the proof must never become a sticky default');
 const count=sent.length;assert.equal((await service.hostPolicy(opts,body,proof+'\n')).isOk,false);assert.equal(sent.length,count);
 const ackBody={action:'ack',stream:instance,sequence:'1',coreProcessId:core,digest:'b'.repeat(64)};
 assert.equal((await service.usageReceipt(opts,ackBody)).isOk,true);assert.equal(sent.at(-3).method,'post');assert.equal(sent.at(-2).method,'get');assert.equal(sent.at(-1).options.headers['x-remnacust-recovery-proof'],proof);assert.deepEqual(sent.at(-1).body,ackBody);
 const warmed=sent.length;assert.equal((await service.usageReceipt(opts,ackBody)).isOk,true);assert.equal(sent.length,warmed+1,'normal ACK has no additional policy read');
 const newCore='dddddddd-dddd-4ddd-8ddd-dddddddddddd';status.coreProcessId=newCore;
 assert.equal((await service.usageReceipt(opts,ackBody)).isOk,true);assert.deepEqual(sent.at(-1).body,ackBody,'a core restart preserves the original receipt core and digest');assert.ok(sent.at(-1).options.headers['x-remnacust-recovery-proof'].includes(newCore));
 status.quotaRecovery.record={...record,state:'FENCED',sequence:'1',previous:null};status.quotaRecovery.record.digest=crypto.createHash('sha256').update([record.version,record.generation,record.token,'FENCED','1','-',''].join('\n')).digest('hex');
 const before=sent.filter(s=>s.method==='post').length;assert.equal((await service.usageReceipt(opts,ackBody)).isOk,false);assert.equal(sent.filter(s=>s.method==='post').length,before+1,'rejected paused ACK is not retried');
 const sampleBefore=sent.length;assert.equal((await service.usageReceipt(opts,{action:'sample'})).isOk,true);assert.equal(sent.length,sampleBefore+1);assert.equal(sent.at(-1).options.headers,undefined,'sample remains unbound and does not acknowledge usage');
});


test('ACK without a recovery epoch retains the original one-request transport path',async()=>{
 const service=new AxiosService({execute:async()=>jwt},{},config);let reads=0,writes=0;
 service.axiosInstance.get=async()=>{reads++;throw Error('unexpected status request');};
 service.axiosInstance.post=async(url,body,options)=>{writes++;assert.equal(options.headers,undefined);return {data:{response:{acknowledged:true}}};};
 assert.equal((await service.usageReceipt(opts,{action:'ack'})).isOk,true);assert.equal(writes,1);assert.equal(reads,0);
});


test('recovery receipt transport preserves exact binding and rejects unverified replies without ordinary ACK fallback',async()=>{
 const codec=require('./load-typescript.cjs')(path.resolve(__dirname,'../src/common/host-policy/recovery-usage-ack.ts'));
 const fenceCodec=require('./load-typescript.cjs')(path.resolve(__dirname,'../src/common/host-policy/quota-recovery-fence.ts'));
 const uuid=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
 const record={version:fenceCodec.QUOTA_RECOVERY_FENCE,generation:uuid('a'),token:uuid('b'),state:'FENCED',sequence:'1',previous:null};
 record.digest=require('node:crypto').createHash('sha256').update([record.version,record.generation,record.token,'FENCED','1','-',''].join('\n')).digest('hex');
 const body={generation:record.generation,requestId:uuid('c'),coreProcessId:uuid('d'),instance:uuid('e'),previous:record.digest,decisionDigest:'d'.repeat(64),sourceDigest:'e'.repeat(64),receipt:{action:'ack',stream:uuid('e'),sequence:'9007199254740993',coreProcessId:uuid('f'),digest:'f'.repeat(64)}};
 const response={version:codec.RECOVERY_USAGE_ACK,requestId:body.requestId,generation:body.generation,coreProcessId:body.coreProcessId,instance:body.instance,previous:body.previous,decisionDigest:body.decisionDigest,sourceDigest:body.sourceDigest,alreadyAcknowledged:false,
 acknowledgement:{stream:body.instance,sequence:body.receipt.sequence,acknowledged:true},journal:{stream:body.instance,acked:body.receipt.sequence,ackDigest:body.receipt.digest,digest:'0'.repeat(64),pending:null},recovery:record};
 const service=new AxiosService({execute:async()=>jwt},{},config),calls=[];
 service.request=async input=>{calls.push(input);return {isOk:true,response};};
 assert.equal((await service.usageRecoveryAck(opts,body)).isOk,true);assert.equal(calls[0].path,'/node/xray/usage-receipts/recovery-ack');assert.deepEqual(calls[0].data,body);assert.equal(calls[0].maxResponseBytes,16384);assert.equal(calls[0].logAxiosError,false);
 response.journal.ackDigest='0'.repeat(64);assert.equal((await service.usageRecoveryAck(opts,body)).isOk,false);
 const before=calls.length;assert.equal((await service.usageRecoveryAck(opts,{...body,receipt:{...body.receipt,action:'sample'}})).isOk,false);assert.equal(calls.length,before);
 const failure={isOk:false,code:'NODE_HTTP_503'};service.request=async input=>{calls.push(input);return failure;};assert.equal(await service.usageRecoveryAck(opts,body),failure);assert.equal(calls.at(-1).path,calls[0].path);
});

test('prepared-sample transport uses only the bounded recovery endpoint and retains the exact original request',async()=>{
 const {request,reply}=require('./recovery-sample.fixture.cjs')(),service=new AxiosService({execute:async()=>jwt},{},config),calls=[];
 service.request=async input=>{calls.push(input);return {isOk:true,response:reply};};
 assert.equal((await service.usageRecoverySample(opts,request)).isOk,true);assert.equal(calls[0].path,'/node/xray/usage-receipts/recovery-sample');assert.deepEqual(calls[0].data,request);assert.equal(calls[0].maxResponseBytes,16*1024*1024);assert.equal(calls[0].logAxiosError,false);
 reply.frame.stats[0].value='1';assert.equal((await service.usageRecoverySample(opts,request)).isOk,false);
 const before=calls.length;assert.equal((await service.usageRecoverySample(opts,{...request,extra:true})).isOk,false);assert.equal(calls.length,before);
 const failure={isOk:false,code:'NODE_HTTP_TIMEOUT'};service.request=async input=>{calls.push(input);return failure;};assert.equal(await service.usageRecoverySample(opts,request),failure);assert.equal(calls.at(-1).path,calls[0].path);
});

test('quiescence lookup accepts only a bounded exact witness envelope and has no sampling fallback',async()=>{
 const witness=require('./recovery-quiescence.fixture.json'),body=witness.request,service=new AxiosService({execute:async()=>jwt},{},config),calls=[];
 const journal={stream:body.instance,acked:body.prior.sequence,ackDigest:body.prior.digest,digest:witness.journalDigest,pending:{sequence:witness.frame.sequence,coreProcessId:witness.frame.coreProcessId,digest:witness.frame.digest}};let response={witness,journal};service.request=async input=>{calls.push(input);return {isOk:true,response};};
 assert.equal((await service.usageRecoveryQuiescence(opts,body)).isOk,true);assert.equal(calls[0].path,'/node/xray/usage-receipts/recovery-quiescence');assert.deepEqual(calls[0].data,body);assert.equal(calls[0].maxResponseBytes,16384);assert.equal(calls[0].logAxiosError,false);
 for(const value of [null,{},[],{witness,extra:true},{witness:{...witness,digest:'e'.repeat(64)}}]){response=value;assert.equal((await service.usageRecoveryQuiescence(opts,body)).isOk,false);}
 response={witness:null,journal:{...journal,stream:body.requestId}};assert.equal((await service.usageRecoveryQuiescence(opts,body)).isOk,false);
 response={witness:null,journal};assert.deepEqual((await service.usageRecoveryQuiescence(opts,body)).response,response);
 response={witness,journal};assert.equal((await service.usageRecoveryQuiescence(opts,{...body,requestId:body.instance})).isOk,false);
 const before=calls.length;assert.equal((await service.usageRecoveryQuiescence(opts,{...body,extra:true})).isOk,false);assert.equal(calls.length,before);
 const failure={isOk:false,code:'NODE_HTTP_TIMEOUT'};service.request=async input=>{calls.push(input);return failure;};assert.equal(await service.usageRecoveryQuiescence(opts,body),failure);assert.equal(calls.at(-1).path,calls[0].path);
});

test('release delivery validates the original predecessor and every native reply binding without hidden retries',async()=>{
 const {createHash,randomUUID}=require('node:crypto');
 const digest=value=>createHash('sha256').update([value.version,value.generation,value.token,value.state,value.sequence,value.previous??'-',''].join('\n')).digest('hex');
 const previous={version:'remnacust-quota-recovery-fence-v1',generation:randomUUID(),token:randomUUID(),state:'FENCED',sequence:'9007199254740993',previous:'a'.repeat(64)};previous.digest=digest(previous);
 const body={requestId:randomUUID(),generation:previous.generation,coreProcessId:randomUUID(),instance:randomUUID(),previous:previous.digest,policyRevision:'42',policyGeneration:randomUUID(),witnessDigest:'b'.repeat(64),journalDigest:'c'.repeat(64)};
 const record={version:previous.version,generation:body.generation,token:body.requestId,state:'RELEASED',sequence:'9007199254740994',previous:previous.digest};record.digest=digest(record);
 const {previous:_prior,...bindings}=body;const response={...bindings,quotaRecovery:{version:previous.version,record}};
 const service=new AxiosService({execute:async()=>jwt},{},config);const calls=[];let answer=response;
 service.request=async value=>{calls.push(value);return {isOk:true,response:answer};};
 assert.equal((await service.hostQuotaRecoveryRelease(opts,body,previous)).isOk,true);
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/node/xray/host-policy/quota-recovery-release');assert.equal(calls[0].logAxiosError,false);assert.equal(calls[0].maxResponseBytes,16384);assert.equal(calls[0].timeout,18000);assert.deepEqual(calls[0].data,body);
 for(const key of Object.keys(bindings)){answer={...response,[key]:key==='policyRevision'?'43':key.endsWith('Digest')?'d'.repeat(64):randomUUID()};assert.equal((await service.hostQuotaRecoveryRelease(opts,body,previous)).isOk,false,key);}
 const wrong={...record,sequence:'9007199254740995'};wrong.digest=digest(wrong);answer={...response,quotaRecovery:{version:previous.version,record:wrong}};assert.equal((await service.hostQuotaRecoveryRelease(opts,body,previous)).isOk,false);
 const before=calls.length;assert.equal((await service.hostQuotaRecoveryRelease(opts,{...body,actor:randomUUID()},previous)).isOk,false);assert.equal((await service.hostQuotaRecoveryRelease(opts,body,{...previous,digest:'f'.repeat(64)})).isOk,false);assert.equal(calls.length,before);
 const failed={isOk:false,error:{message:'unknown outcome'}};service.request=async()=>failed;assert.equal(await service.hostQuotaRecoveryRelease(opts,body,previous),failed);
});
