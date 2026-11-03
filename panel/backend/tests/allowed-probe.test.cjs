const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const backend = path.join(__dirname, '../src/common/host-policy/allowed-probe.ts');
const backendProbe = load(backend).allowedProbeUrl;
const frontendProbe = load(path.join(__dirname, '../../frontend/src/shared/utils/allowed-probe.ts')).allowedProbeUrl;
const allowedProbeUrl = (...args) => {
    const result = backendProbe(...args);
    assert.equal(frontendProbe(...args), result, 'Host form and subscription must agree');
    return result;
};
const { applyHostPolicyPing } = load(path.join(__dirname, '../src/modules/subscription/utils/host-policy-ping.ts'));
const allow = (...domains) => ({ mode: 'ALLOW_ONLY', domains });
const deny = (...domains) => ({ mode: 'DENY', domains });

test('host form and subscription use the same allowed destination selection', () => {
    for (const domain of ['telegram.org', 'example.org', 'пример.рф']) {
        const url = allowedProbeUrl([allow(domain)]);
        assert.equal(new URL(url).hostname, new URL('https://' + domain).hostname);
    }
    assert.equal(allowedProbeUrl([allow('149.154.160.0/20', '2001:b28:f23d::/48', 't.me')]), 'https://t.me/');
});

test('shared HTTP ping URL is allowed by every visible host, including narrower subdomains and deny rules', () => {
    assert.equal(allowedProbeUrl([allow('telegram.org'), allow('api.telegram.org')]), 'https://api.telegram.org/');
    assert.equal(allowedProbeUrl([allow('t.me', 'telegram.org'), deny('t.me'), null]), 'https://telegram.org/');
    assert.equal(allowedProbeUrl([allow('t.me'), allow('example.org')]), undefined);
    assert.equal(allowedProbeUrl([allow('telegram.org'), deny('telegram.org')]), undefined);
    assert.equal(allowedProbeUrl([allow('telegram.org'), deny('149.154.160.0/20')]), undefined);
    assert.equal(allowedProbeUrl([null, { mode: 'OFF', domains: [] }]), undefined);
});

test('an explicitly allowed custom HTTP check retains its path, port and query', () => {
    for (const url of ['https://api.telegram.org/check?status=204', 'http://telegram.org:8080/health']) {
        assert.equal(allowedProbeUrl([allow('telegram.org')], url), url);
    }
    for (const url of [
        'https://telegram.org.evil.example/health', 'https://nottelegram.org/health',
        'https://www.gstatic.com/generate_204', 'https://user:secret@telegram.org/',
        'file:///etc/passwd', 'https://telegram.org/#fragment',
        'https://telegram.org/\r\nInjected: true',
    ]) assert.equal(allowedProbeUrl([allow('telegram.org')], url), 'https://telegram.org/', url);
});

test('empty, invalid and IP-only policies never fabricate an HTTP check target', () => {
    for (const policies of [[], [allow()], [allow('149.154.160.0/20')], [allow('::/0')],
        [allow('telegram.org'), allow('regexp:.*')], [{ mode: 'INVALID', domains: ['telegram.org'] }]]) {
        assert.equal(allowedProbeUrl(policies), undefined);
    }
});

test('generated probe never escapes intersecting allowlists or matching deny entries', () => {
    const names = ['example.test', 'api.example.test', 'cdn.api.example.test', 'other.test', 'example.test.evil.test'];
    let state = 73421;
    const random = count => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) % count);
    for (let iteration = 0; iteration < 2000; iteration++) {
        const policies = Array.from({ length: 1 + random(4) }, (_, index) => ({
            mode: index === 0 || random(3) ? 'ALLOW_ONLY' : 'DENY',
            domains: names.filter(() => random(2)),
        }));
        const canUse = name => policies.every(policy => {
            const found = policy.domains.some(rule => name === rule || name.endsWith('.' + rule));
            return policy.mode === 'ALLOW_ONLY' ? found : !found;
        });
        const expected = names.filter(canUse);
        const result = allowedProbeUrl(policies);
        assert.equal(Boolean(result), expected.length > 0);
        if (result) assert(expected.includes(new URL(result).hostname));
    }
});

test('Happ receives a real proxy check to an allowed website without widening destination policies', () => {
    const hosts = [{ domainRules: allow('telegram.org') }];
    const before = structuredClone(hosts);
    const headers = { 'Provider-Id': 'configured-id', 'Ping-Type': 'proxy', 'CHECK-URL-VIA-PROXY': 'https://www.gstatic.com/generate_204' };
    applyHostPolicyPing(headers, hosts);
    assert.deepEqual(headers, {
        'Provider-Id': 'configured-id', 'ping-type': 'proxy', 'check-url-via-proxy': 'https://telegram.org/',
    });
    assert.deepEqual(hosts, before);
    const automatic = { 'provider-id': 'id' };
    applyHostPolicyPing(automatic, [...hosts, { domainRules: allow('other.example'), isHidden: true }, { domainRules: allow('other.example'), isDisabled: true }]);
    assert.equal(automatic['ping-type'], 'proxy-head');
    assert.equal(automatic['check-url-via-proxy'], 'https://telegram.org/');
});

test('manual TCP/ICMP preference and missing Provider ID remain unchanged; no common website falls back to TCP', () => {
    const hosts = [{ domainRules: allow('telegram.org') }];
    for (const headers of [{}, { 'ping-type': 'proxy' }, { 'provider-id': 'id', 'ping-type': 'tcp' }, { 'provider-id': 'id', 'ping-type': 'icmp' }]) {
        const before = structuredClone(headers);
        applyHostPolicyPing(headers, hosts);
        assert.deepEqual(headers, before);
    }
    const headers = { 'provider-id': 'id', 'ping-type': 'proxy', 'check-url-via-proxy': 'https://telegram.org/' };
    applyHostPolicyPing(headers, [...hosts, { domainRules: allow('other.example') }]);
    assert.deepEqual(headers, { 'provider-id': 'id', 'ping-type': 'tcp' });
});
