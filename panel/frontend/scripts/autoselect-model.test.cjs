const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');
const m = load(path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor/autoselect-model.ts'));
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
    assert.throws(() => m.removePool(code, 0), /remove-balancer-first/);
    const cleaned = m.parseTemplate(m.removePool(m.removeBalancer(code, 1), 0));
    assert.deepEqual(cleaned.routing.rules, existing.routing.rules); assert.deepEqual(cleaned.routing.balancers, existing.routing.balancers);
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
test('partial JSON supplies live host/tag completions and leaves enums to the native schema',()=>{
 const hosts=[{uuid:'10000000-0000-4000-8000-000000000001',remark:'Netherlands',tags:['NL']},{uuid:'10000000-0000-4000-8000-000000000002',remark:'Germany',tags:['DE','NL']}];
 const suggestions=(fragment)=>{const text='{ "remnawave": {"injectHosts": ['+fragment;return injectorCompletionValues(text,text.length,hosts)};
 assert.deepEqual(suggestions('{"mode":"'),[]); // Native schema supplies enums without duplicates.
 assert.deepEqual(suggestions('{"mode":"random","selector":{"type":"tags","values":["').map(x=>x.value),['DE','NL']);
 assert.equal(suggestions('{"selector":{"type":"uuids","values":["')[0].detail,'Netherlands');
 assert.deepEqual(injectorCompletionValues('{"unrelated":"',14,hosts),[]);
});
