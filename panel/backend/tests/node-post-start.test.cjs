const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const load = require('./load-typescript.cjs');
const { nodeSource } = require('./component-paths.cjs');
const source = (file) => path.join(nodeSource, 'src', file);

test('post-start resets state and sends metadata only when both switches are enabled', () => {
    const { PostStartState } = load(source('modules/_plugin/services/states/post-start.state.ts'));
    const calls = [];
    const { PostStartService } = load(source('modules/_plugin/services/post-start.service.ts'), {
        '@nestjs/common': { Injectable: () => (v) => v, Logger: class { warn() {} } },
        '@common/utils/send-webhook': { sendWebhook: (...args) => calls.push(args) },
    });
    const postStart = new PostStartState();
    const state = { plugins: { postStart: true }, postStart };
    const service = new PostStartService(state);
    service.run({ id: 'node-a' });
    postStart.configure({ enabled: true, webhook: { enabled: false, url: 'https://example.com' } });
    service.run({ id: 'node-a' });
    assert.equal(calls.length, 0);
    postStart.configure({ enabled: true, webhook: { enabled: true, url: 'https://example.com' } });
    service.run({ id: 'node-a' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'https://example.com');
    assert.equal(calls[0][1].event, 'service.core_started');
    assert.deepEqual(calls[0][1].metadata, { id: 'node-a' });
    service.run(undefined);
    assert.deepEqual(calls[1][1].metadata, {});
    state.plugins.postStart = false;
    service.run({});
    assert.equal(calls.length, 2);
    postStart.reset();
    state.plugins.postStart = true;
    service.run({});
    assert.equal(calls.length, 2);
    assert.deepEqual(postStart.webhookConfig, { enabled: false, url: '' });
});

test('webhook returns immediately, uses a five second deadline and reports failures', async () => {
    let resolveFetch;
    const warnings = [];
    let deadline;
    const { sendWebhook } = load(source('common/utils/send-webhook.ts'), {}, {
        AbortSignal: { timeout: (ms) => { deadline = ms; return 'deadline'; } },
        fetch: (url, options) => {
            assert.equal(url, 'https://example.com');
            assert.equal(options.method, 'POST');
            assert.equal(options.signal, 'deadline');
            assert.deepEqual(JSON.parse(options.body), { node: 'a' });
            return new Promise((resolve) => { resolveFetch = resolve; });
        },
    });
    assert.equal(sendWebhook('https://example.com', { node: 'a' }, (e) => warnings.push(e.message)), undefined);
    assert.equal(deadline, 5000);
    let cancelled = false;
    resolveFetch({ ok: false, status: 503, body: { cancel: () => { cancelled = true; } } });
    await new Promise(setImmediate);
    assert.deepEqual(warnings, ['HTTP 503']);
    assert.equal(cancelled, true);
    const failing = load(source('common/utils/send-webhook.ts'), {}, {
        fetch: () => Promise.reject(new Error('unreachable')),
    });
    failing.sendWebhook('https://example.com', {}, (e) => warnings.push(e.message));
    await new Promise(setImmediate);
    assert.equal(warnings.at(-1), 'unreachable');
});
