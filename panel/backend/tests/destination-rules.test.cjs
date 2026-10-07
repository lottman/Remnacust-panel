const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const load = require('./load-typescript.cjs');
const source = path.join(__dirname, '../src/common/host-policy/destination-rule.ts');
const rules = load(source);
const normalize = rules.normalizeDestinationRule;
const frontend = path.join(__dirname, '../../frontend');
const presets = load(path.join(frontend, 'src/shared/ui/forms/hosts/base-host-form/domain-presets.ts'), {
    '@shared/utils/destination-rule': rules,
    '@shared/i18n/interface-text': { translateUiText: key => key },
});

test('panel, form and node validate the same international domains, IPs and CIDRs', () => {
    for (const file of [path.join(frontend, 'src/shared/utils/destination-rule.ts'),
        path.join(__dirname, '../../../node/src/common/utils/destination-rule.ts')])
        assert.equal(fs.readFileSync(file, 'utf8'), fs.readFileSync(source, 'utf8'));
    for (const [input, output] of [
        ['ПРИМЕР.РФ.', 'xn--e1afmkfd.xn--p1ai'], ['*.Example.org', 'example.org'],
        ['https://пример.рф/page?q=a', 'xn--e1afmkfd.xn--p1ai'],
        ['domain:T.ME', 't.me'], ['149.154.160.1/20', '149.154.160.0/20'],
        ['[2001:DB8::1]', '2001:db8::1'], ['2001:db8:1234::1/32', '2001:db8::/32'],
        ['0.0.0.0/0', '0.0.0.0/0'], ['::/0', '::/0'], ['1.2.3.4', '1.2.3.4'],
    ]) assert.equal(normalize(input), output, input);
});

test('invalid destinations and unsupported matching languages fail closed', () => {
    for (const input of ['', 'a..b', '-a.com', 'a_.com', 'example.com:443', 'test/a',
        '999.2.3.4', '1.2.3', '01.2.3.4', '1.2.3.4/33', '::/129', '::/01',
        'example.com/24', 'fe80::1%eth0', '0x7f000001', 'regexp:.*', 'geosite:telegram',
        'https://user:password@example.com', 'https://', 'a.com\n.evil.com', '\\evil.com',
        'a'.repeat(64) + '.com', '[::1', '*.']) assert.throws(() => normalize(input), input);
});

test('presets combine, deduplicate and preserve manually entered overlapping addresses', () => {
    let state = { manual: ['t.me', 'пример.рф'], selected: [] };
    state = presets.togglePreset(state, 'telegram');
    state = presets.togglePreset(state, 'chatgpt');
    assert.equal(presets.presetDomains(state).filter((d) => d === 't.me').length, 1);
    assert.ok(presets.presetDomains(state).includes('chatgpt.com'));
    state = presets.togglePreset(state, 'telegram');
    assert.ok(presets.presetDomains(state).includes('t.me'));
    assert.ok(!presets.presetDomains(state).includes('91.108.4.0/22'));
    assert.ok(presets.presetDomains(state).includes('chatgpt.com'));
    state = presets.editPresetDomains(state, presets.presetDomains(state).filter((d) => d !== 'chatgpt.com'));
    assert.deepEqual(state.selected, []);
    assert.ok(presets.presetDomains(state).includes('openai.com'));
    for (const preset of presets.DOMAIN_PRESETS)
        for (const domain of preset.domains) assert.equal(normalize(domain), domain);
});

test('Happ receives TCP ping only for restricted hosts with a configured Provider ID', () => {
    const { applyHostPolicyPing } = load(path.join(__dirname, '../src/modules/subscription/utils/host-policy-ping.ts'));
    const hosts = [{ domainRules: { mode: 'ALLOW_ONLY' } }];
    const headers = { 'Provider-Id': 'configured-id', 'Ping-Type': 'proxy' };
    applyHostPolicyPing(headers, hosts);
    assert.deepEqual(headers, { 'Provider-Id': 'configured-id', 'ping-type': 'tcp' });
    const withoutId = {};
    applyHostPolicyPing(withoutId, hosts);
    assert.deepEqual(withoutId, {});
    const unrestricted = { 'provider-id': 'id', 'ping-type': 'proxy' };
    applyHostPolicyPing(unrestricted, [{ domainRules: { mode: 'OFF' } }]);
    assert.equal(unrestricted['ping-type'], 'proxy');
});
