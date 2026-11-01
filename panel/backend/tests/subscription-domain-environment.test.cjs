const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createHmac } = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');

const exception = load(path.join(__dirname, '../src/common/exception/http-exeception-with-error-code.type.ts'));
const { configuredSubscriptionDomain } = load(path.join(__dirname, '../src/common/utils/public-subscription-domain.ts'));

test('legacy SUB_PUBLIC_DOMAIN accepts HTTPS URLs, IDN and a safe prefix without trusting credentials or private names', () => {
    for (const value of ['sub.example.test/api/sub', ' https://SUB.example.test/api/sub/ '])
        assert.deepEqual(configuredSubscriptionDomain(value), { domain: 'sub.example.test', path: '/api/sub' });
    assert.deepEqual(configuredSubscriptionDomain('https://пример.рф'), { domain: 'xn--e1afmkfd.xn--p1ai', path: '' });
    for (const value of ['http://sub.example.test', 'https://user:password@sub.example.test', 'https://127.0.0.1',
        'https://sub.local', 'sub.example.test:8443', 'sub.example.test/../panel', 'sub.example.test?x=y',
        'sub.example.test/#x', 'sub.example.test/%2e%2e', 'sub.example.test\nAPP_SECRET=x', '//sub.example.test'])
        assert.equal(configuredSubscriptionDomain(value), undefined, value);
});

test('domain environment uses the authenticated private socket, fixed route and bounded redacted responses', async () => {
    const secret = 'private-fixture-secret-'.repeat(3);
    const calls = [];
    const { SubscriptionDomainEnvironmentService } = load(path.join(__dirname,
        '../src/modules/subscription-domains/subscription-domain-environment.service.ts'), {
        '@common/config/app-config': {},
        '@common/exception/http-exeception-with-error-code.type': exception,
        'node:http': { request(options, respond) {
            const req = new EventEmitter();
            let timeout;
            req.setTimeout = (milliseconds, callback) => { assert.equal(milliseconds, 3000); timeout = callback; };
            req.destroy = (error) => req.emit('error', error);
            req.end = (body) => calls.push({ options, body, timeout: () => timeout(), respond(code, value) {
                const res = new EventEmitter(); res.statusCode = code; respond(res);
                res.emit('data', Buffer.from(value)); res.emit('end');
            } });
            return req;
        } },
    });
    const service = new SubscriptionDomainEnvironmentService({ getOrThrow: () => secret });
    const snapshot = { value: 'sub.example.test', revision: 'a'.repeat(64), valid: true };
    const read = service.read();
    assert.equal(calls[0].options.socketPath, '/run/remnacust-control/update.sock');
    assert.equal(calls[0].options.path, '/subscription-domain');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.headers.Authorization,
        'Bearer ' + createHmac('sha256', secret).update('remnacust-panel-update-v1').digest('hex'));
    calls[0].respond(200, JSON.stringify(snapshot));
    assert.deepEqual(await read, snapshot);
    const write = service.write('new.example.test', snapshot.revision);
    assert.deepEqual(JSON.parse(calls[1].body), { value: 'new.example.test', expectedRevision: snapshot.revision });
    calls[1].respond(400, '{"error":"DOMAIN_CHANGED"}');
    await assert.rejects(write, e => e.errorCode === 'SUBSCRIPTION_DOMAIN_ENV_CHANGED');
    for (const [code, response] of [[404, '{}'], [200, 'private-secret'], [200, 'x'.repeat(2049)],
        [200, '{"value":"bad","revision":"bad","valid":true}']]) {
        const pending = service.read();
        calls.at(-1).respond(code, response);
        await assert.rejects(pending, e => e.errorCode === 'SUBSCRIPTION_DOMAIN_ENV_UNAVAILABLE' && !e.message.includes('private-secret'));
    }
    const pending = service.read(); calls.at(-1).timeout();
    await assert.rejects(pending, e => e.errorCode === 'SUBSCRIPTION_DOMAIN_ENV_UNAVAILABLE');
});
