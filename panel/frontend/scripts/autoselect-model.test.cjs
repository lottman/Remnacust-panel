const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');
const m = load(path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor/autoselect-model.ts'));
test('priority configures health checks, clears the generated same-pool fallback and preserves custom fallbacks',()=>{
    const config={outbounds:[],routing:{balancers:[{tag:'auto',selector:['p'],fallbackTag:'p',strategy:{type:'leastLoad',settings:{expected:2}}}]}};
    let next=m.parseTemplate(m.setBalancerStrategy(JSON.stringify(config),0,'priority'));
    assert.equal(next.routing.balancers[0].strategy.type,'priority');
    assert.equal(next.routing.balancers[0].fallbackTag,undefined);
    assert.ok(next.observatory.subjectSelector.includes('p'));
    assert.equal(m.validationPath(next),null);
    assert.deepEqual(next.routing.balancers[0].strategy.settings,{expected:2});
    config.routing.balancers[0].fallbackTag='custom';
    next=m.parseTemplate(m.setBalancerStrategy(JSON.stringify(config),0,'priority'));
    assert.equal(next.routing.balancers[0].fallbackTag,'custom');
    next.routing.script='manual';assert.equal(m.validationPath(next),'routing.script');
});
const existing = { outbounds: [{ tag: 'direct', protocol: 'freedom' }, { tag: 'custom', protocol: 'socks', settings: { servers: [{ address: 'localhost', port: 1234 }] } }], routing: { domainStrategy: 'IPIfNonMatch', balancers: [{ tag: 'existing', selector: ['custom'], strategy: { type: 'roundRobin', settings: { custom: 5 } } }], rules: [{ type: 'field', domain: ['geosite:private'], outboundTag: 'direct' }, { type: 'field', network: 'tcp,udp', outboundTag: 'custom' }] }, observatory: { subjectSelector: ['custom'], probeUrl: 'https://example.test/probe', probeInterval: '15s', enableConcurrency: true }, unknownSetting: { keep: true } };
test('adding autoselect is non-destructive and inserts balancing after restrictions before broad catch-all', () => {
    const code = m.addPool(JSON.stringify(existing, null, 2)), added = m.parseTemplate(code);
    assert.deepEqual(added.outbounds, existing.outbounds); assert.deepEqual(added.unknownSetting, existing.unknownSetting);
    assert.deepEqual(added.routing.balancers[0], existing.routing.balancers[0]);
    assert.deepEqual(added.routing.rules[0], existing.routing.rules[0]); assert.deepEqual(added.routing.rules[2], existing.routing.rules[1]);
    assert.deepEqual(added.observatory, { ...existing.observatory, subjectSelector: ['custom', 'auto'] });
    assert.equal(m.validationPath(added), 'remnawave.injectHosts.0.selector.values');
    assert.ok(m.templateChanges(existing, added).some(change => change.kind === 'added'));
    assert.equal(m.templateChanges(existing, added).some(change => change.kind === 'removed'), false);
});
test('editing existing pools and balances updates their linked code without duplicating or clobbering custom settings', () => {
    let code = m.addPool(JSON.stringify(existing));
    code = m.updatePool(code, 0, ['selector', 'type'], 'tags'); code = m.updatePool(code, 0, ['selector', 'values'], ['LTE']);
    assert.equal(m.validationPath(m.parseTemplate(code)), null);
    code = m.renamePoolPrefix(code, 0, 'lte'); code = m.renameBalancer(code, 1, 'lte-balance');
    const config = m.parseTemplate(code);
    assert.equal(config.remnawave.injectHosts.length, 1); assert.equal(config.routing.balancers.length, 2);
    assert.deepEqual(config.routing.balancers[1].selector, ['lte']); assert.equal(config.routing.balancers[1].fallbackTag, 'lte');
    assert.equal(config.routing.rules[1].balancerTag, 'lte-balance'); assert.deepEqual(config.observatory.subjectSelector, ['custom', 'lte']);
    const cleaned = m.parseTemplate(m.removePool(code, 0));
    assert.deepEqual(cleaned.routing.rules, existing.routing.rules); assert.deepEqual(cleaned.routing.balancers, existing.routing.balancers);
});

test('a newly created unsaved pool can be removed in one action without leaving an empty injector', () => {
    const original = { outbounds: [{tag:'direct',protocol:'freedom'}] };
    const cleaned = m.parseTemplate(m.removePool(m.addPool(JSON.stringify(original)), 0));
    assert.deepEqual(cleaned, original);
});

test('pool removal preserves shared balancers, other selectors, manual probes and fallback validity', () => {
    const original = { remnawave: {injectHosts:[{tagPrefix:'p-a',mode:'all',selector:{type:'tags',values:['A']}},{tagPrefix:'p-b',mode:'all',selector:{type:'tags',values:['B']}}]}, outbounds:[{tag:'manual',protocol:'socks'}], routing:{balancers:[{tag:'shared',selector:['p'],fallbackTag:'p-a',strategy:{type:'leastPing'}}],rules:[{balancerTag:'shared',type:'field'}]}, observatory:{subjectSelector:['p','manual'],probeUrl:'https://example.test/204'} };
    const result = m.parseTemplate(m.removePool(JSON.stringify(original),0));
    assert.deepEqual(result.routing.balancers[0].selector,['p']);
    assert.equal(result.routing.balancers[0].fallbackTag,'p-b');
    assert.deepEqual(result.routing.rules,original.routing.rules);
    assert.deepEqual(result.observatory,original.observatory);
    assert.deepEqual(result.outbounds,original.outbounds);
});
test('code-authored groups preserve other selectors and untouched formatting; invalid code is retained outside GUI', () => {
    const code = '{ "remnawave": { "injectHosts": [{"mode":"group","tagPrefix":"g","selector":{"type":"tags","groups":[["VK"],["YC"]]}}]}, "manual" :  { "unchanged" : true } }';
    const edited = m.updatePool(code, 0, ['selector', 'groups', 1], ['YC', 'LTE']);
    assert.ok(edited.includes('"manual" :  { "unchanged" : true }'));
    assert.deepEqual(m.parseTemplate(edited).remnawave.injectHosts[0].selector.groups, [['VK'], ['YC', 'LTE']]);
    assert.throws(() => m.parseTemplate('{ broken')); assert.throws(() => m.parseTemplate('{"routing":{"balancers":[null]}}'));
    assert.equal(m.validationPath(m.parseTemplate(edited)), null);
});
test('prefix allocation terminates for old overlapping names and probing updates preserve existing settings', () => {
    assert.ok(!m.newPrefix({ outbounds: [{ tag: 'a' }] }).startsWith('a'));
    const code = m.observerFor(JSON.stringify(existing), ['custom'], 'leastLoad');
    assert.deepEqual(m.parseTemplate(code), existing);
});


test('random and roundRobin remove their own unused probes but keep manual fields and other active balances', () => {
 const base={outbounds:[],unknown:{keep:true},routing:{balancers:[{tag:'a',selector:['p'],strategy:{type:'leastLoad',settings:{expected:2,tolerance:0.3,baselines:['50ms'],costs:[{keep:true}]}}}]},burstObservatory:{subjectSelector:['p'],pingConfig:{interval:'30s'}}};
 for(const type of ['random','roundRobin']){
  const next=m.parseTemplate(m.setBalancerStrategy(JSON.stringify(base),0,type));
  assert.equal(next.burstObservatory,undefined);assert.deepEqual(next.unknown,base.unknown);
  assert.deepEqual(next.routing.balancers[0].strategy.settings,base.routing.balancers[0].strategy.settings);
 }
 const shared=structuredClone(base);shared.routing.balancers.push({tag:'b',selector:['p'],strategy:{type:'leastPing'}});
 assert.deepEqual(m.parseTemplate(m.setBalancerStrategy(JSON.stringify(shared),0,'random')).burstObservatory,shared.burstObservatory);
 const manual=structuredClone(base);manual.burstObservatory.subjectSelector.push('manual');
 assert.deepEqual(m.parseTemplate(m.setBalancerStrategy(JSON.stringify(manual),0,'random')).burstObservatory.subjectSelector,['manual']);
});

test('leastLoad edits preserve manual settings and validate expected/tolerance/duration bounds', () => {
 const base={routing:{balancers:[{tag:'a',selector:['p'],strategy:{type:'leastLoad',settings:{expected:1,tolerance:0.5,maxRTT:'8000ms',baselines:['50ms','1s'],costs:[{regexp:true,match:'p',value:1}]}}}]}};
 assert.equal(m.validationPath(base),null);
 const next=m.parseTemplate(m.editTemplate(JSON.stringify(base),['routing','balancers',0,'strategy','settings','expected'],3));
 assert.equal(next.routing.balancers[0].strategy.settings.expected,3);assert.deepEqual(next.routing.balancers[0].strategy.settings.costs,base.routing.balancers[0].strategy.settings.costs);
 for(const [field,value] of [['expected',-1],['expected',1.5],['tolerance',2],['maxRTT','bad'],['baselines',['no']]]){
  const changed=structuredClone(base);changed.routing.balancers[0].strategy.settings[field]=value;
  assert.equal(m.validationPath(changed),`routing.balancers.0.strategy.settings.${field}`);
 }
 for(const [field,value] of [['expected',{}],['tolerance','bad'],['maxRTT',100],['baselines','50ms'],['baselines',[{}]]]){
  const changed=structuredClone(base);changed.routing.balancers[0].strategy.settings[field]=value;
  assert.throws(()=>m.parseTemplate(JSON.stringify(changed)),/balancer-settings-fields/);
 }
});

const {injectorCompletionValues}=load(path.join(__dirname,'../src/widgets/dashboard/templates/subscription-template-editor/utils/injector-completions.ts'));

test('host selection and its balancing strategy form one group, including shared prefix selectors', () => {
 const config={remnawave:{injectHosts:[{tagPrefix:'p-a',selector:{type:'tags',values:['A']}},{tagPrefix:'p-b',selector:{type:'tags',values:['B']}},{tagPrefix:'q',selector:{type:'tags',values:['Q']}}]},outbounds:[{tag:'manual',protocol:'freedom'}],routing:{balancers:[{tag:'shared',selector:['p']},{tag:'dedicated',selector:['q']},{tag:'existing',selector:['manual']}],rules:[{balancerTag:'shared'},{balancerTag:'dedicated'},{balancerTag:'existing'},{outboundTag:'manual'}]}};
 assert.deepEqual(m.autoselectGroups(config),[{pools:[0,1],balancers:[0]},{pools:[2],balancers:[1]},{pools:[],balancers:[2]}]);
 const result=m.parseTemplate(m.removeAutoselectGroup(JSON.stringify(config),m.autoselectGroups(config)[0]));
 assert.deepEqual(result.remnawave.injectHosts.map(pool=>pool.tagPrefix),['q']);
 assert.deepEqual(result.routing.balancers.map(balance=>balance.tag),['dedicated','existing']);
 assert.deepEqual(result.routing.rules,[{balancerTag:'dedicated'},{balancerTag:'existing'},{outboundTag:'manual'}]);
 assert.deepEqual(result.outbounds,config.outbounds);
});

test('unlinked pools and manual balancers remain visible exactly once in unified autoselect', () => {
 assert.deepEqual(m.autoselectGroups({}),[]);
 assert.deepEqual(m.autoselectGroups({remnawave:{injectHosts:[{tagPrefix:'p',selector:{type:'tags',values:[]}}]},routing:{balancers:[{tag:'manual',selector:['x']}]}}),[{pools:[0],balancers:[]},{pools:[],balancers:[0]}]);
});
test('partial JSON supplies live host/tag completions and leaves enums to the native schema',()=>{
 const hosts=[{uuid:'10000000-0000-4000-8000-000000000001',remark:'Netherlands',tags:['NL']},{uuid:'10000000-0000-4000-8000-000000000002',remark:'Germany',tags:['DE','NL']}];
 const suggestions=(fragment)=>{const text='{ "remnawave": {"injectHosts": ['+fragment;return injectorCompletionValues(text,text.length,hosts)};
 assert.deepEqual(suggestions('{"mode":"'),[]); // Native schema supplies enums without duplicates.
 assert.deepEqual(suggestions('{"mode":"random","selector":{"type":"tags","values":["').map(x=>x.value),['DE','NL']);
 assert.equal(suggestions('{"selector":{"type":"uuids","values":["')[0].detail,'Netherlands');
 assert.deepEqual(injectorCompletionValues('{"unrelated":"',14,hosts),[]);
});

test('connection selection retains every candidate and removes generation-time sampling', () => {
    const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
    const input = JSON.stringify({remnawave:{injectHosts:[{mode:'random',tagPrefix:'pool',selector:{type:'uuids',values:ids,expected:1}}]},routing:{balancers:[{tag:'auto',selector:['pool'],strategy:{type:'random'}}]}});
    const result = m.parseTemplate(m.selectOnConnection(input,0));
    assert.equal(result.remnawave.injectHosts[0].mode,'all');
    assert.deepEqual(result.remnawave.injectHosts[0].selector,{type:'uuids',values:ids});
    assert.deepEqual(result.routing,JSON.parse(input).routing);
    const grouped = m.connectionPool({mode:'group',selector:{type:'tags',groups:{first:['a','b'],second:['b','c']}}});
    assert.deepEqual(grouped.selector,{type:'tags',values:['a','b','c']});
    for (const type of ['remarkRegex','tagRegex','sameTagAsRecipient']) {
        const selector = {type,groups:{a:ids},...(type.endsWith('Regex')?{pattern:'^EU'}:{})};
        const converted = m.connectionPool({mode:'group',selector});
        assert.equal(converted.mode,'all');
        assert.deepEqual(converted.selector,selector,'keep the predicate and UUID boundary');
    }
});
