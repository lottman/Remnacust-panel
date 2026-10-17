const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {compileNodePortPlan,validateNodePortBindings,listenersOverlap,PortPlanError}=require('./load-typescript.cjs')(path.join(__dirname,'../src/modules/nodes/profile-port-plan.ts'));
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const uuid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const slot=(n,profile=A,tag='in-'+n)=>({uuid:uuid(n),configProfileUuid:profile,configProfileInboundUuid:uuid(n+100),inboundTag:tag,
    listenAddress:'127.0.0.1',port:20000+n,networks:['tcp']});
const profile=(id,tag,marker)=>({uuid:id,config:{log:{loglevel:'warning'},dns:{servers:['localhost']},
    inbounds:[{tag,listen:'0.0.0.0',port:443,protocol:'socks',settings:{auth:'noauth',udp:false}},
        {tag:tag+'-not-selected',port:444,protocol:'socks',settings:{auth:'noauth'}}],
    outbounds:[{tag:'direct',protocol:'freedom',settings:{redirect:'127.0.0.1:'+marker}},{tag:'block',protocol:'blackhole',settings:{}}],
    routing:{domainStrategy:'AsIs',rules:[{type:'field',domain:['full:blocked.test'],outboundTag:'block'}]}}});
const fails=(code,fn)=>assert.throws(fn,error=>error instanceof PortPlanError&&error.code===code);
test('two profiles with identical outbound names keep independent routes and implicit defaults; other inbounds stay closed',()=>{
    const slots=[slot(1,A,'first'),slot(2,B,'second')],profiles=[profile(A,'first',41001),profile(B,'second',41002)];
    const before=structuredClone({slots,profiles});const plan=compileNodePortPlan(slots,profiles);
    assert.deepEqual({slots,profiles},before,'Planning cannot mutate saved profiles or the editor draft');
    assert.deepEqual(plan.inbounds.map(i=>[i.tag,i.listen,i.port]),[['first','127.0.0.1',20001],['second','127.0.0.1',20002]]);
    const route=(tag,host)=>plan.routing.rules.find(rule=>rule.inboundTag.includes(tag)&&(!rule.domain||rule.domain.includes('full:'+host)));
    const target=(tag,host)=>plan.outbounds.find(outbound=>outbound.tag===route(tag,host).outboundTag);
    assert.equal(target('first','open.test').settings.redirect,'127.0.0.1:41001');
    assert.equal(target('second','open.test').settings.redirect,'127.0.0.1:41002');
    assert.equal(target('first','blocked.test').protocol,'blackhole');assert.equal(target('second','blocked.test').protocol,'blackhole');
    assert.notEqual(route('first','blocked.test').outboundTag,route('second','blocked.test').outboundTag);
    assert.deepEqual(compileNodePortPlan([...slots].reverse(),[...profiles].reverse()),plan,'Plan order is independent of SQL row order');
});
test('multiple selected inbounds share their own profile; rules for an unselected inbound cannot become global',()=>{
    const input=profile(A,'first',41001);input.config.inbounds.push({tag:'third',protocol:'socks',settings:{auth:'noauth'},port:555});
    input.config.routing.rules.unshift({type:'field',inboundTag:['first-not-selected'],outboundTag:'block'});
    const plan=compileNodePortPlan([slot(1,A,'first'),slot(3,A,'third')],[input]);
    assert.equal(plan.outbounds.length,2);assert.equal(plan.inbounds.length,2);
    assert.equal(plan.routing.rules.length,2);assert.deepEqual(plan.routing.rules[0].inboundTag,['first','third']);
});
test('proxy chains, native dialer references, balancers and observers are scoped to the matching profile',()=>{
    const input=profile(A,'first',41001);
    input.config.outbounds.push({tag:'proxy',protocol:'socks',settings:{servers:[{address:'127.0.0.1',port:12345}]},proxySettings:{tag:'direct'},streamSettings:{sockopt:{dialerProxy:'direct'}}});
    input.config.routing.balancers=[{tag:'choose',selector:['pro'],fallbackTag:'direct',strategy:{type:'random'}}];
    input.config.routing.rules=[{type:'field',domain:['full:proxy.test'],balancerTag:'choose',ruleTag:'choose-proxy'}];
    input.config.observatory={subjectSelector:['pro'],probeURL:'https://example.test/probe',probeInterval:'30s'};
    const plan=compileNodePortPlan([slot(1,A,'first')],[input]);const proxy=plan.outbounds.find(o=>o.protocol==='socks');
    const direct=plan.outbounds.find(o=>o.tag.endsWith(':o:direct'));
    assert.equal(proxy.proxySettings.tag,direct.tag);assert.equal(proxy.streamSettings.sockopt.dialerProxy,direct.tag);
    assert.equal(plan.routing.rules[0].balancerTag,plan.routing.balancers[0].tag);
    assert.ok(proxy.tag.startsWith(plan.routing.balancers[0].selector[0]));
    assert.ok(proxy.tag.startsWith(plan.observatory.subjectSelector[0]));
    assert.equal(plan.routing.balancers[0].fallbackTag,direct.tag);
});
test('compatible observatories combine only their scoped selector sets',()=>{
    const profiles=[profile(A,'first',41001),profile(B,'second',41002)];
    for(const p of profiles)p.config.burstObservatory={subjectSelector:['direct'],pingConfig:{destination:'https://example.test/probe',timeout:'8s'}};
    const plan=compileNodePortPlan([slot(1,A,'first'),slot(2,B,'second')],profiles);
    assert.equal(plan.burstObservatory.subjectSelector.length,2);
    for(const selector of plan.burstObservatory.subjectSelector)assert.equal(plan.outbounds.filter(o=>o.tag.startsWith(selector)).length,1);
});
test('native comma-separated selectors and empty inbound lists preserve their original scoped semantics',()=>{
    const input=profile(A,'first',41001);input.config.routing.rules=[{type:'field',inboundTag:[],outboundTag:'block'}];
    input.config.routing.balancers=[{tag:'all',selector:'',fallbackTag:'direct'}];input.config.observatory={subjectSelector:'direct,block'};
    const plan=compileNodePortPlan([slot(1,A,'first')],[input]);
    assert.deepEqual(plan.routing.rules[0].inboundTag,['first']);
    assert.ok(plan.outbounds.every(o=>o.tag.startsWith(plan.routing.balancers[0].selector[0])));
    assert.equal(plan.observatory.subjectSelector.length,2);
});
test('service listeners, tagged DNS, reverse routing and transparent interception are never silently exposed as public port slots',()=>{
    for(const change of [p=>p.api={tag:'api',listen:'0.0.0.0:3333'},p=>p.metrics={listen:'0.0.0.0:3334'},p=>p.reverse={bridges:[{tag:'bridge',domain:'private.test'}]},
        p=>p.dns.tag='dns-route',p=>p.inbounds[0].protocol='tun',p=>p.inbounds[0].listen='/tmp/private.sock',
        p=>p.inbounds[0].settings.followRedirect=true,p=>p.inbounds[0].streamSettings={sockopt:{tproxy:'tproxy'}}]){
        const input=profile(A,'first',41001);change(input.config);
        fails('PROFILE_FEATURE_NEEDS_ISOLATION',()=>compileNodePortPlan([slot(1,A,'first')],[input]));
    }
});
test('unknown chain, route, fallback and observer references fail without crossing into another profile',()=>{
    for(const change of [p=>p.outbounds[0].proxySettings={tag:'missing'},p=>p.routing.rules[0].outboundTag='missing',
        p=>p.routing.rules[0]={type:'field',balancerTag:'missing'},p=>p.observatory={subjectSelector:['missing']},
        p=>p.routing.balancers=[{tag:'chooser',selector:['missing']}],
        p=>p.routing.balancers=[{tag:'chooser',selector:['direct'],fallbackTag:'missing'}]]){
        const input=profile(A,'first',41001);change(input.config);
        fails('UNKNOWN_REFERENCE',()=>compileNodePortPlan([slot(1,A,'first')],[input]));
    }
});
test('global DNS, policy or routing strategy differences are explicit conflicts and never silently borrowed from the first profile',()=>{
    for(const change of [p=>p.dns.servers=['1.1.1.1'],p=>p.policy={levels:{0:{handshake:9}}},p=>p.routing.domainStrategy='IPIfNonMatch']){
        const profiles=[profile(A,'first',41001),profile(B,'second',41002)];change(profiles[1].config);
        fails('INCOMPATIBLE_GLOBAL_SETTINGS',()=>compileNodePortPlan([slot(1,A,'first'),slot(2,B,'second')],profiles));
    }
});
test('per-profile regex weights and differing observer settings require native isolation instead of altered matching semantics',()=>{
    const input=profile(A,'first',41001);input.config.routing.balancers=[{tag:'cost',selector:['direct'],strategy:{type:'leastLoad',settings:{costs:[{regexp:true,match:'^direct$',value:2}]}}}];
    fails('PROFILE_FEATURE_NEEDS_ISOLATION',()=>compileNodePortPlan([slot(1,A,'first')],[input]));
    const profiles=[profile(A,'first',41001),profile(B,'second',41002)];
    for(const [index,p] of profiles.entries())p.config.observatory={subjectSelector:['direct'],probeInterval:(index+1)+'s'};
    fails('PROFILE_FEATURE_NEEDS_ISOLATION',()=>compileNodePortPlan([slot(1,A,'first'),slot(2,B,'second')],profiles));
});

test('Lua routing is not silently combined with generated rules or renamed outbound tags',()=>{
    const input=profile(A,'first',41001);
    input.config.routing={script:'base64:Zm9v'};
    const original=structuredClone(input);
    fails('PROFILE_FEATURE_NEEDS_ISOLATION',()=>compileNodePortPlan([slot(1,A,'first')],[input]));
    assert.deepEqual(input,original);
});
test('socket conflict detection normalizes wildcard, dual-stack and IPv4-mapped addresses while separating TCP/UDP',()=>{
    const base=slot(1);const peer={...slot(2),port:base.port};
    for(const pair of [['0.0.0.0','127.0.0.1'],['::','127.0.0.1'],['::','::1'],['::ffff:127.0.0.1','127.0.0.1'],['0:0:0:0:0:0:0:1','::1']])
        assert.equal(listenersOverlap({...base,listenAddress:pair[0]},{...peer,listenAddress:pair[1]}),true,pair.join('/'));
    assert.equal(listenersOverlap(base,{...peer,networks:['udp']}),false);
    assert.equal(listenersOverlap(base,{...peer,listenAddress:'127.0.0.2'}),false);
    assert.equal(listenersOverlap({...base,listenAddress:'::1'},peer),false);
    fails('LISTENER_CONFLICT',()=>validateNodePortBindings([base,peer]));
    fails('RESERVED_LISTENER',()=>validateNodePortBindings([base],[{...peer,listenAddress:'0.0.0.0'}]));
});
test('binding identities, original inbound tags, scalar ports and control-plane addresses are checked before compiling',()=>{
    for(const change of [b=>b.port=0,b=>b.port=65536,b=>b.port='443-445',b=>b.uuid='bad',b=>b.networks=['tcp','tcp'],b=>b.networks=['bad'],
        b=>b.listenAddress='localhost',b=>b.listenAddress='/tmp/socket',b=>b.listenAddress='fe80::1%eth0']){
        const binding=slot(1);change(binding);fails('INVALID_BINDING',()=>validateNodePortBindings([binding]));
    }
    fails('DUPLICATE_BINDING',()=>validateNodePortBindings([slot(1),{...slot(2),uuid:uuid(1)}]));
    fails('DUPLICATE_INBOUND',()=>validateNodePortBindings([slot(1),slot(2,A,'in-1')]));
    fails('INBOUND_MISSING',()=>compileNodePortPlan([slot(1,A,'missing')],[profile(A,'first',41001)]));
    fails('PROFILE_MISSING',()=>compileNodePortPlan([slot(1)],[]));
    fails('PLAN_TOO_LARGE',()=>validateNodePortBindings(Array.from({length:513}).fill(slot(1))));
});
