const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('../../backend/tests/load-typescript.cjs');
const root = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor');
const { parseAddressRules, addressRuleGroups, changeAddressRule, parseAddressRuleImport, importAddressRules, MAX_ADDRESS_RULE_TEXT_BYTES } = load(path.join(root, 'geofile-address-rules.ts'));
const { readClientTemplate } = load(path.join(root, 'client-template-model.ts'));
const { addressRuleTargets, addressRuleTargetKey } = load(path.join(root, 'geofile-targets.ts'));
const action = name => ({ kind: 'action', name });
const outbound = name => ({ kind: 'outbound', name });
const balancer = name => ({ kind: 'balancer', name });
const route = name => ({ kind: 'route', name });
const base = () => ({
    dns: { servers: ['localhost'] },
    outbounds: [{ tag: 'direct', protocol: 'freedom' }, { tag: 'block', protocol: 'blackhole' }, { tag: 'proxy', protocol: 'vless', settings: { vnext: [] } }],
    routing: { rules: [{ network: 'tcp,udp', outboundTag: 'proxy' }] },
    remnacust: { geofiles: [{ id: '00' + 'a'.repeat(32), target: 'DIRECT', categories: ['ru'] }] },
});

test('native named IP datasets remain in code rather than a literal address editor', () => {
    const input = base();
    input.routing.rules.unshift({ ip: ['geoip:private'], outboundTag: 'direct' }, { ip: ['ext:custom.dat:ru'], outboundTag: 'direct' });
    assert.deepEqual(addressRuleGroups(input, 'XRAY_JSON'), []);
    assert.deepEqual(JSON.parse(changeAddressRule(JSON.stringify(input), 'XRAY_JSON', undefined, 'example.com', action('DIRECT'))).routing.rules.slice(1), input.routing.rules);
});

test('manual addresses separate IP/domain OR rules, reuse actions and precede the fallback', () => {
    const input = base();
    const output = JSON.parse(changeAddressRule(JSON.stringify(input), 'XRAY_JSON', undefined, 'example.com\nfull:login.example.com\n192.0.2.0/24', action('DIRECT')));
    assert.deepEqual(output.routing.rules, [
        { type: 'field', outboundTag: 'direct', domain: ['domain:example.com', 'full:login.example.com'] },
        { type: 'field', outboundTag: 'direct', ip: ['192.0.2.0/24'] },
        ...input.routing.rules,
    ]);
    assert.equal(output.routing.domainStrategy, 'IPOnDemand');
    assert.equal(output.outbounds.length, 3);
    assert.deepEqual(output.dns, input.dns);
    assert.deepEqual(output.remnacust, input.remnacust);
    const groups = addressRuleGroups(output, 'XRAY_JSON');
    assert.equal(groups.length, 1);
    assert.equal(groups[0].addresses.length, 3);
    const blocked = JSON.parse(changeAddressRule(JSON.stringify(output), 'XRAY_JSON', groups[0], 'example.com', action('REJECT')));
    assert.equal(blocked.routing.rules[0].outboundTag, 'block');
    assert.equal(blocked.routing.rules.length, 2);
});

test('VPN targets use the named balancer and missing routes cannot be invented', () => {
    const input = base();
    input.routing.balancers = [{ tag: 'automatic', selector: ['proxy'] }];
    const result = JSON.parse(changeAddressRule(JSON.stringify(input), 'XRAY_JSON', undefined, 'example.com', balancer('automatic')));
    assert.equal(result.routing.rules[0].balancerTag, 'automatic');
    assert.equal(result.routing.rules[0].outboundTag, undefined);
    assert.throws(() => changeAddressRule(JSON.stringify(input), 'XRAY_JSON', undefined, 'example.com', outbound('missing')), /target/);
});

test('custom direct settings and conflicting balancer names are preserved', () => {
    const input = base();
    input.outbounds[0].settings = { domainStrategy: 'UseIPv4' };
    input.routing.balancers = [{ tag: 'direct-2', selector: ['proxy'] }];
    const result = JSON.parse(changeAddressRule(JSON.stringify(input), 'XRAY_JSON', undefined, 'example.com', action('DIRECT')));
    assert.equal(result.routing.rules[0].outboundTag, 'direct-3');
    assert.deepEqual(result.outbounds[0], input.outbounds[0]);
    assert.equal(result.outbounds.filter(item => item.protocol === 'freedom').length, 2);
});

test('complex native rules stay untouched and stale editor forms cannot overwrite a newer draft', () => {
    const input = base();
    input.routing.rules.unshift({ domain: ['geosite:ru'], outboundTag: 'direct' }, { domain: ['domain:example.com'], sourceIP: ['10.0.0.1'], outboundTag: 'proxy' });
    const first = changeAddressRule(JSON.stringify(input), 'XRAY_JSON', undefined, 'manual.example', action('DIRECT'));
    const group = addressRuleGroups(JSON.parse(first), 'XRAY_JSON')[0];
    const removed = JSON.parse(changeAddressRule(first, 'XRAY_JSON', group));
    assert.deepEqual(removed.routing.rules, input.routing.rules);
    const newer = JSON.parse(first);
    newer.routing.rules.unshift({ domain: ['full:new.example'], outboundTag: 'proxy' });
    assert.throws(() => changeAddressRule(JSON.stringify(newer), 'XRAY_JSON', group), /stale/);
});

test('sing-box uses reject actions and preserves independent domain/IP matches', () => {
    const input = { outbounds: [{ type: 'vless', tag: 'vpn' }], route: { rules: [{ action: 'sniff' }], final: 'vpn' } };
    const output = JSON.parse(changeAddressRule(JSON.stringify(input), 'SINGBOX', undefined, 'example.com\nfull:login.example.com\n2001:db8::/32', action('REJECT')));
    assert.deepEqual(output.route.rules.slice(0, 3), [
        { action: 'reject', domain_suffix: ['example.com'] },
        { action: 'reject', domain: ['login.example.com'] },
        { action: 'reject', ip_cidr: ['2001:db8::/32'] },
    ]);
    assert.equal(output.outbounds.length, 1);
    assert.equal(addressRuleGroups(output, 'SINGBOX')[0].addresses.length, 3);
    assert.equal(output.route.final, 'vpn');
});

for (const format of ['MIHOMO', 'CLASH', 'STASH']) test(format + ' edits native rules without changing providers or catch-all', () => {
    const input = 'proxy-groups:\n  - name: automatic\n    type: url-test\n    proxies: [vpn]\nrule-providers:\n  original:\n    type: http\n    url: https://example.com/rules.yaml\nrules:\n  - GEOIP,CN,DIRECT\n  - MATCH,automatic\n';
    const output = changeAddressRule(input, format, undefined, 'example.com\n192.0.2.4', route('automatic'));
    const config = readClientTemplate(output, format);
    assert.deepEqual(config.rules, ['DOMAIN-SUFFIX,example.com,automatic', 'IP-CIDR,192.0.2.4/32,automatic', 'GEOIP,CN,DIRECT', 'MATCH,automatic']);
    const group = addressRuleGroups(config, format)[0];
    assert.equal(group.count, 2);
    const deleted = readClientTemplate(changeAddressRule(output, format, group), format);
    assert.deepEqual(deleted.rules, ['GEOIP,CN,DIRECT', 'MATCH,automatic']);
    assert.equal(deleted['rule-providers'].original.url, 'https://example.com/rules.yaml');
});

test('address parsing validates boundaries, IDNs and canonical deduplication', () => {
    assert.deepEqual(parseAddressRules('ПРИМЕР.РФ\nпример.рф\n2001:db8::1\n192.0.2.1'), [
        { type: 'domain', value: 'xn--e1afmkfd.xn--p1ai' },
        { type: 'ip', value: '2001:db8::1/128' },
        { type: 'ip', value: '192.0.2.1/32' },
    ]);
    for (const value of ['', 'https://example.com/private', '999.1.1.1', '192.0.2.0/33', '2001:db8::/129', 'foo..com', 'example.com:443', 'bad\u0000.example'])
        assert.throws(() => parseAddressRules(value), /input/);
    assert.throws(() => parseAddressRules(Array.from({ length: 20001 }, (_, i) => `a${i}.example`).join('\n')), /limit/);
});

test('a large native list groups in one editor section without changing its order', () => {
    const config = { rules: Array.from({ length: 20000 }, (_, i) => `DOMAIN,a${i}.example,DIRECT`) };
    const groups = addressRuleGroups(config, 'MIHOMO');
    assert.equal(groups.length, 1);
    assert.equal(groups[0].count, 20000);
    assert.equal(groups[0].addresses[19999], 'full:a19999.example');
    assert.equal(groups[0].oversized, false);
});

for (const format of ['XRAY_JSON', 'SINGBOX', 'MIHOMO', 'CLASH', 'STASH']) {
    for (const name of ['DIRECT', 'REJECT']) test(`${format}: literal ${name} round-trips independently of built-in actions`, () => {
        const json = format === 'XRAY_JSON' || format === 'SINGBOX';
        const input = format === 'XRAY_JSON'
            ? { outbounds: [{ tag: name, protocol: 'vless' }], routing: { rules: [{ domain: ['domain:private.example'], outboundTag: name }] } }
            : format === 'SINGBOX'
              ? { outbounds: [{ tag: name, type: 'vless' }], route: { rules: [{ domain_suffix: ['private.example'], outbound: name, action: 'route' }] } }
              : { 'proxy-groups': [{ name, type: 'select', proxies: ['vpn'] }], rules: [`DOMAIN-SUFFIX,private.example,${name}`, 'MATCH,vpn'] };
        const text = json ? JSON.stringify(input) : require('yaml').stringify(input);
        const target = json ? outbound(name) : route(name);
        const choices = addressRuleTargets(input, format);
        assert(choices.some(choice => addressRuleTargetKey(choice) === addressRuleTargetKey(target)));
        const group = addressRuleGroups(input, format)[0];
        assert.deepEqual(group.target, target);
        const output = readClientTemplate(changeAddressRule(text, format, group, group.addresses.join('\n'), group.target), format);
        if (format === 'XRAY_JSON') {
            assert.equal(output.routing.rules[0].outboundTag, name);
            assert.deepEqual(output.outbounds, input.outbounds);
        } else if (format === 'SINGBOX') {
            assert.equal(output.route.rules[0].outbound, name);
            assert.equal(output.route.rules[0].action, 'route');
            assert.deepEqual(output.outbounds, input.outbounds);
        } else {
            assert.deepEqual(output.rules, input.rules);
            assert.deepEqual(output['proxy-groups'], input['proxy-groups']);
            assert(!choices.some(choice => choice.kind === 'action' && choice.name === name));
            assert.throws(() => changeAddressRule(text, format, group, 'private.example', action(name)), /address-rule-target/);
        }
        if (json) {
            const changed = JSON.parse(changeAddressRule(text, format, group, 'private.example', action(name)));
            if (format === 'XRAY_JSON') {
                const tag = changed.routing.rules[0].outboundTag;
                assert.notEqual(tag, name);
                assert.equal(changed.outbounds.find(item => item.tag === tag).protocol, name === 'DIRECT' ? 'freedom' : 'blackhole');
            } else if (name === 'DIRECT') {
                const tag = changed.route.rules[0].outbound;
                assert.notEqual(tag, name);
                assert.equal(changed.outbounds.find(item => item.tag === tag).type, 'direct');
            } else {
                assert.equal(changed.route.rules[0].action, 'reject');
                assert.equal(changed.route.rules[0].outbound, undefined);
            }
        }
    });
}

test('Xray preserves the outbound/balancer namespace even when both use the same reserved tag', () => {
    const input = base();
    input.outbounds.push({ tag: 'DIRECT', protocol: 'vless' });
    input.routing.balancers = [{ tag: 'DIRECT', selector: ['proxy'] }];
    input.routing.rules = [
        { domain: ['domain:one.example'], outboundTag: 'DIRECT' },
        { domain: ['domain:two.example'], balancerTag: 'DIRECT' }
    ];
    const groups = addressRuleGroups(input, 'XRAY_JSON');
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map(group => group.target), [outbound('DIRECT'), balancer('DIRECT')]);
    const keys = addressRuleTargets(input, 'XRAY_JSON').map(addressRuleTargetKey);
    for (const target of [outbound('DIRECT'), balancer('DIRECT'), action('DIRECT')])
        assert(keys.includes(addressRuleTargetKey(target)));
    for (const group of groups) {
        const output = JSON.parse(changeAddressRule(JSON.stringify(input), 'XRAY_JSON', group, group.addresses.join('\n'), group.target));
        const field = group.target.kind === 'balancer' ? 'balancerTag' : 'outboundTag';
        assert.equal(output.routing.rules[group.start][field], 'DIRECT');
        assert.deepEqual(output.outbounds, input.outbounds);
    }
});

test('sing-box DIRECT action reuses a direct outbound named REJECT without becoming a reject action', () => {
    const input = { outbounds: [{ type: 'direct', tag: 'REJECT' }], route: { rules: [] } };
    const output = JSON.parse(changeAddressRule(JSON.stringify(input), 'SINGBOX', undefined, 'example.com', action('DIRECT')));
    assert.deepEqual(output.route.rules[0], { action: 'route', outbound: 'REJECT', domain_suffix: ['example.com'] });
    assert.deepEqual(output.outbounds, input.outbounds);
});

test('sing-box reject actions and literal REJECT outbounds are separate adjacent groups', () => {
    const input = { outbounds: [{ type: 'vless', tag: 'REJECT' }], route: { rules: [
        { action: 'reject', domain: ['one.example'] },
        { action: 'route', outbound: 'REJECT', domain: ['two.example'] }
    ] } };
    assert.deepEqual(addressRuleGroups(input, 'SINGBOX').map(group => group.target), [action('REJECT'), outbound('REJECT')]);
});

for (const format of ['MIHOMO', 'CLASH', 'STASH']) test(`${format}: preserve no-resolve, IPv6 and independently editable resolve modes`, () => {
    const input = { 'proxy-groups': [{ name: 'vpn', type: 'select', proxies: [] }], rules: [
        'IP-CIDR,192.0.2.0/24,vpn,no-resolve',
        'IP-CIDR6,2001:db8::/32,vpn,no-resolve',
        'IP-CIDR,198.51.100.0/24,vpn',
        'MATCH,vpn'
    ] };
    const text = require('yaml').stringify(input);
    const groups = addressRuleGroups(input, format);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].noResolve, true);
    assert.equal(groups[1].noResolve, false);
    const noop = readClientTemplate(changeAddressRule(text, format, groups[0], groups[0].addresses.join('\n'), groups[0].target), format);
    assert.deepEqual(noop.rules, input.rules);
    const changed = readClientTemplate(changeAddressRule(text, format, groups[0], '203.0.113.0/24\n2001:db8:1::/48', action('REJECT')), format);
    assert.deepEqual(changed.rules, ['IP-CIDR,203.0.113.0/24,REJECT,no-resolve', 'IP-CIDR6,2001:db8:1::/48,REJECT,no-resolve', ...input.rules.slice(2)]);
});

test('target identities cannot collide with encoded-looking tags or Object prototype keys', () => {
    const names = ['DIRECT', 'REJECT', '__proto__', 'constructor', '["action","DIRECT"]'];
    const input = { outbounds: names.map(tag => ({ tag, type: 'vless' })), route: { rules: [] } };
    const choices = addressRuleTargets(input, 'SINGBOX');
    assert.equal(new Set(choices.map(addressRuleTargetKey)).size, names.length + 2);
    for (const name of names) {
        const output = JSON.parse(changeAddressRule(JSON.stringify(input), 'SINGBOX', undefined, 'example.com', outbound(name)));
        assert.equal(output.route.rules[0].outbound, name);
        assert.equal(output.route.rules[0].action, 'route');
    }
    assert.equal({}.polluted, undefined);
});

for (const format of ['XRAY_JSON', 'SINGBOX']) test(`${format}: a 150,001-address native group is visible, bounded for editing and safely deletable`, () => {
    const large = Array.from({ length: 150000 }, (_, i) => `a${i}.example`);
    const input = format === 'XRAY_JSON'
        ? { outbounds: [{ tag: 'vpn', protocol: 'vless' }], routing: { rules: [
            { domain: ['domain:first.example'], outboundTag: 'vpn' },
            { domain: large.map(value => `domain:${value}`), outboundTag: 'vpn' }
        ] } }
        : { outbounds: [{ tag: 'vpn', type: 'vless' }], route: { rules: [
            { domain_suffix: ['first.example'], outbound: 'vpn' },
            { domain_suffix: large, outbound: 'vpn' }
        ] } };
    const groups = addressRuleGroups(input, format);
    assert.equal(groups.length, 1);
    const group = groups[0];
    assert.equal(group.count, 2);
    assert.equal(group.addresses.length, 150001);
    assert.equal(group.addresses[150000], 'domain:a149999.example');
    assert.equal(group.oversized, true);
    const text = JSON.stringify(input);
    assert.throws(() => changeAddressRule(text, format, group, 'replacement.example', group.target), /address-rule-limit/);
    const deleted = JSON.parse(changeAddressRule(text, format, group));
    assert.deepEqual(deleted[format === 'XRAY_JSON' ? 'routing' : 'route'].rules, []);
});

test('UTF-8 bytes and the joining newlines determine oversized state, not only the address count', () => {
    const address = 'full:' + '界'.repeat(1000);
    const input = { rules: Array.from({ length: 700 }, () => `DOMAIN,${address.slice(5)},DIRECT`) };
    const group = addressRuleGroups(input, 'MIHOMO')[0];
    assert.equal(group.textBytes, Buffer.byteLength(group.addresses.join('\n')));
    assert(group.addresses.length < 20000);
    assert(group.oversized);
});

test('grouping never appends neighboring addresses into the original native configuration', () => {
    const input = { outbounds: [{ tag: 'vpn', protocol: 'vless' }], routing: { rules: [
        { ip: ['192.0.2.0/24'], outboundTag: 'vpn' },
        { ip: ['198.51.100.0/24'], outboundTag: 'vpn' }
    ] } };
    const before = structuredClone(input);
    assert.equal(addressRuleGroups(input, 'XRAY_JSON')[0].addresses.length, 2);
    assert.deepEqual(input, before);
});

for (const format of ['MIHOMO', 'CLASH', 'STASH']) test(`${format}: a concurrently shadowed built-in action cannot silently become a literal route`, () => {
    const input = { rules: ['DOMAIN,private.example,DIRECT'] };
    const group = addressRuleGroups(input, format)[0];
    assert.deepEqual(group.target, action('DIRECT'));
    const newer = { ...input, 'proxy-groups': [{ name: 'DIRECT', type: 'select', proxies: ['vpn'] }] };
    assert.throws(() => changeAddressRule(require('yaml').stringify(newer), format, group, group.addresses.join('\n'), group.target), /address-rule-target/);
});

// Same input shape/scale as the supplied fragment, with generated generic names.
const attachmentShapedRule = () => ({ type: 'field', domain: [
    'regexp:[.]example$', 'regexp:[.]test$', 'regexp:[.]xn--p1ai$',
    ...Array.from({ length: 513 }, (_, i) => `domain:site${String(i).padStart(3, '0')}.test`)
], outboundTag: 'pasted-direct' });

test('attachment-shaped fragment imports all 516 domains as a separate DIRECT rule without changing unrelated configuration', () => {
    const rule = attachmentShapedRule();
    const fragment = JSON.stringify(rule, null, 2).split('\n').map(line => '      ' + line).join('\n') + ',\n';
    assert(Buffer.byteLength(fragment) > 16000);
    assert.equal(parseAddressRuleImport(fragment)[0].addresses.length, 516);
    const input = base();
    const output = JSON.parse(importAddressRules(JSON.stringify(input), 'XRAY_JSON', fragment, action('DIRECT')));
    assert.deepEqual(output.routing.rules, [{ type: 'field', outboundTag: 'direct', domain: rule.domain }, ...input.routing.rules]);
    assert.deepEqual(output.outbounds, input.outbounds);
    assert.deepEqual(output.dns, input.dns);
    assert.deepEqual(output.remnacust, input.remnacust);
});

test('strict JSON import accepts one object, an array and comma-separated fragments, with one final separator', () => {
    const one = { type: 'field', domain: ['full:one.example'], outboundTag: 'proxy' };
    const two = { domain: ['domain:two.example'], balancerTag: 'automatic' };
    for (const source of [JSON.stringify(one), JSON.stringify(one) + ',\n'])
        assert.equal(parseAddressRuleImport(source).length, 1);
    const input = base();
    input.routing.balancers = [{ tag: 'automatic', selector: ['proxy'] }];
    for (const source of [JSON.stringify([one, two]), JSON.stringify(one) + ',\n' + JSON.stringify(two) + ',']) {
        const output = JSON.parse(importAddressRules(JSON.stringify(input), 'XRAY_JSON', source));
        assert.equal(output.routing.rules.length, input.routing.rules.length + 2);
        assert.equal(output.routing.rules[0].outboundTag, 'proxy');
        assert.equal(output.routing.rules[1].balancerTag, 'automatic');
        assert.deepEqual(output.routing.rules.slice(2), input.routing.rules);
    }
});

test('unknown or missing pasted destinations require an explicit override and cannot become built-in actions implicitly', () => {
    const input = JSON.stringify(base());
    for (const source of ['{"domain":["domain:example.com"],"outboundTag":"missing"}', '{"domain":["domain:example.com"]}', '{"domain":["domain:example.com"],"outboundTag":"DIRECT"}']) {
        assert.throws(() => importAddressRules(input, 'XRAY_JSON', source), /address-rule-target/);
        assert.equal(JSON.parse(importAddressRules(input, 'XRAY_JSON', source, action('DIRECT'))).routing.rules[0].outboundTag, 'direct');
    }
    const literal = { outbounds: [{ tag: 'DIRECT', protocol: 'vless' }], routing: { rules: [] } };
    const source = '{"domain":["domain:example.com"],"outboundTag":"DIRECT"}';
    assert.equal(JSON.parse(importAddressRules(JSON.stringify(literal), 'XRAY_JSON', source)).routing.rules[0].outboundTag, 'DIRECT');
    assert.equal(JSON.parse(importAddressRules(JSON.stringify(literal), 'XRAY_JSON', source, action('DIRECT'))).routing.rules[0].outboundTag, 'direct');
});

test('unsupported conditions and conjunctions reject the entire import even with an explicit action', () => {
    const input = JSON.stringify(base());
    const valid = { type: 'field', domain: ['domain:one.example'], outboundTag: 'proxy' };
    for (const extra of [{ port: '443' }, { network: 'tcp' }, { sourceIP: ['10.0.0.0/8'] }, { ip: ['192.0.2.0/24'] }, { protocol: ['tls'] }, { ruleTag: 'named' }, { constructor: {} }, JSON.parse('{"__proto__":{"polluted":true}}')]) {
        assert.throws(() => importAddressRules(input, 'XRAY_JSON', JSON.stringify([valid, { ...valid, ...extra }]), action('DIRECT')), /address-rule-import-conditions/);
        assert.deepEqual(JSON.parse(input), base());
    }
    for (const value of ['geosite:private', 'ext:custom.dat:private'])
        assert.throws(() => parseAddressRuleImport(JSON.stringify({ domain: [value] })), /address-rule-import-conditions/);
    assert.equal({}.polluted, undefined);
});

test('imports never execute JavaScript, tolerate internal trailing commas or silently drop malformed values', () => {
    for (const source of ['', '[]', 'null', 'true', '1', '"text"', '{domain:["example.com"]}', '({"domain":["example.com"]})', '{"domain":["example.com",]}', '{"domain":["example.com"]},,', '{"domain":["example.com"]};globalThis.importExecuted=true', '{"domain":["foo\\n#ignored"]}', '{"domain":[{}]}', '{"ip":["domain:example.com"]}', '{"domain":["one.example"],"outboundTag":"a","balancerTag":"b"}'])
        assert.throws(() => parseAddressRuleImport(source));
    assert.equal(globalThis.importExecuted, undefined);
});

test('import limits count all rows/addresses and enforce the inclusive UTF-8 payload boundary', () => {
    const source = '{"domain":["domain:example.com"]}';
    assert.equal(parseAddressRuleImport(source.padEnd(MAX_ADDRESS_RULE_TEXT_BYTES, ' ')).length, 1);
    assert.throws(() => parseAddressRuleImport(source.padEnd(MAX_ADDRESS_RULE_TEXT_BYTES + 1, ' ')), /address-rule-limit/);
    assert.throws(() => parseAddressRuleImport('界'.repeat(MAX_ADDRESS_RULE_TEXT_BYTES / 3 + 1)), /address-rule-limit/);
    assert.throws(() => parseAddressRuleImport(JSON.stringify(Array(20001).fill({ domain: ['domain:example.com'] }))), /address-rule-limit/);
    assert.throws(() => parseAddressRuleImport(JSON.stringify([{ domain: Array(10000).fill('domain:example.com') }, { domain: Array(10001).fill('domain:example.com') }])), /address-rule-limit/);
});

test('classic Clash rejects imported regexp rules instead of emitting an unsupported native rule', () => {
    assert.throws(() => importAddressRules('rules: []\n', 'CLASH', '{"domain":["regexp:[.]example$"]}', action('DIRECT')), /address-rule-import-format/);
});

for (const format of ['XRAY_JSON', 'SINGBOX', 'MIHOMO', 'CLASH', 'STASH']) test(`${format}: JSON address-rule import uses the explicitly chosen canonical action`, () => {
    const json = format === 'XRAY_JSON' || format === 'SINGBOX';
    const config = format === 'XRAY_JSON' ? base() : format === 'SINGBOX'
        ? { outbounds: [{ type: 'vless', tag: 'DIRECT' }], route: { rules: [{ action: 'sniff' }] } }
        : { rules: ['MATCH,VPN'] };
    const current = json ? JSON.stringify(config) : require('yaml').stringify(config);
    const source = '{"type":"field","domain":["domain:example.com"],"outboundTag":"missing"}, {"type":"field","ip":["2001:db8::/32"],"outboundTag":"missing"},';
    const output = readClientTemplate(importAddressRules(current, format, source, action('DIRECT')), format);
    if (format === 'XRAY_JSON') {
        assert.equal(output.routing.rules[0].outboundTag, 'direct');
        assert.equal(output.routing.rules[1].outboundTag, 'direct');
        assert.equal(output.routing.domainStrategy, 'IPOnDemand');
    } else if (format === 'SINGBOX') {
        assert.deepEqual(output.route.rules.slice(0, 2).map(rule => rule.outbound), ['direct', 'direct']);
        assert.deepEqual(output.route.rules[2], { action: 'sniff' });
    } else assert.deepEqual(output.rules, ['DOMAIN-SUFFIX,example.com,DIRECT', 'IP-CIDR6,2001:db8::/32,DIRECT', 'MATCH,VPN']);
});


test('quoted JSON arrays and pasted comma-separated strings retain IPv4, IPv6 and domain semantics', () => {
    const lines = '"0.0.0.0/8",\n"::1/128",\n"domain:localhost",\n"regexp:[.]ru$",'
    const expected = parseAddressRules('0.0.0.0/8\n::1/128\ndomain:localhost\nregexp:[.]ru$');
    assert.deepEqual(parseAddressRules(lines), expected);
    assert.deepEqual(parseAddressRules('[' + lines.replace(/,$/, '') + ']'), expected);
    assert.deepEqual(parseAddressRules('"full:login.example.com"'), parseAddressRules('full:login.example.com'));
    for (const input of ['["example.com",{}]', '["example.com",null]', '"example.com",alert(1)', '["example.com\\nother.example"]', '["999.0.0.1"]'])
        assert.throws(() => parseAddressRules(input), /address-rule/);
});

test('Xray manual address rules can reference a host destination without inventing an unrestricted outbound', () => {
    const target = 'host:12345678-1234-1234-1234-123456789abc';
    const result = JSON.parse(changeAddressRule(JSON.stringify(base()), 'XRAY_JSON', undefined, 'example.com', outbound(target)));
    assert.equal(result.routing.rules[0].outboundTag, target);
    assert.deepEqual(result.outbounds, base().outbounds);
    assert.throws(() => changeAddressRule(JSON.stringify(base()), 'XRAY_JSON', undefined, 'example.com', outbound('host:../../secret')), /target/);
});
