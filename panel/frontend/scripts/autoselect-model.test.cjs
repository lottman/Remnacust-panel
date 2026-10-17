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
