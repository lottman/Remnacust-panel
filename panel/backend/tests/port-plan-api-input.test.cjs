const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('./load-typescript.cjs');
const model=load(path.join(__dirname,'../src/modules/nodes/profile-port-plan.ts'));
const {portListenerNetworks}=load(path.join(__dirname,'../src/modules/nodes/port-listener-networks.ts'),{'./profile-port-plan':model});
const {NodePortPlanInputSchema,PortPlanRevisionSchema}=load(path.join(__dirname,'../src/modules/nodes/node-port-plans.schema.ts'));
const U='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('physical listener claims follow transport and ALPN rather than payload protocols',()=>{
    const config=(network,alpn)=>({protocol:'vless',streamSettings:{network,security:'tls',tlsSettings:{alpn}}});
    for(const network of ['tcp','raw','ws','websocket','grpc','httpupgrade'])assert.deepEqual(portListenerNetworks(config(network,[])),['tcp']);
    for(const network of ['kcp','mkcp','hysteria'])assert.deepEqual(portListenerNetworks(config(network,[])),['udp']);
    for(const network of ['xhttp','splithttp','xera','xera-http']){
        assert.deepEqual(portListenerNetworks(config(network,['h3'])),['udp']);
        assert.deepEqual(portListenerNetworks(config(network,['h2','h3'])),['tcp']);
    }
    assert.deepEqual(portListenerNetworks(config('masque',['h2','h3'])),['tcp','udp']);
    assert.deepEqual(portListenerNetworks(config('masque',['h2'])),['tcp']);
    assert.deepEqual(portListenerNetworks(config('masque',[])),['udp']);
    assert.deepEqual(portListenerNetworks({protocol:'shadowsocks',settings:{network:'tcp,udp'}}),['tcp','udp']);
    assert.deepEqual(portListenerNetworks({protocol:'mixed',settings:{udp:true}}),['tcp'],'SOCKS UDP associations allocate separate temporary sockets');
    assert.throws(()=>portListenerNetworks(config('xdrive',[])),error=>error.code==='PROFILE_FEATURE_NEEDS_ISOLATION');
});
test('port-plan requests reject supplied network claims, unknown fields, invalid versions and ambiguous modes',()=>{
    const request={enabled:true,expectedRevision:'0',bindings:[{uuid:U,configProfileUuid:U,configProfileInboundUuid:U,listenAddress:'::',port:443}]};
    assert.equal(NodePortPlanInputSchema.safeParse(request).success,true);
    for(const mutate of [r=>r.bindings[0].networks=['udp'],r=>r.force=true,r=>r.bindings=[],r=>r.bindings[0].port=1.5,r=>r.expectedRevision='bad',r=>r.expectedRevision='9223372036854775808']){
        const copy=structuredClone(request);mutate(copy);let parsed;assert.doesNotThrow(()=>parsed=NodePortPlanInputSchema.safeParse(copy));assert.equal(parsed.success,false);
    }
    assert.equal(PortPlanRevisionSchema.safeParse('9223372036854775807').success,true);
    assert.equal(NodePortPlanInputSchema.safeParse({enabled:false,expectedRevision:'1',profileUuid:U,activeInbounds:[U]}).success,true);
    assert.equal(NodePortPlanInputSchema.safeParse({...request,enabled:false}).success,false);
});
