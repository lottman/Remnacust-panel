const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const express = require('express');
const load = require('./load-typescript.cjs');

const { WebpageService } = load(path.join(__dirname, '../src/modules/webpage/webpage.service.ts'), {
    '@common/axios': {},
    '@common/config/app-config': {},
    '@common/utils': { isDevelopment: () => true },
    '@common/utils/webpage-error': load(path.join(__dirname, '../src/common/utils/webpage-error.ts')),
    '@common/utils/crypt-utils': { encryptUuid: value => value, decryptUuid: value => value },
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const validInfo = () => ({ isOk: true, response: { response: {
    user: { username: 'Подписка فارسی 中文 🚀' }, links: ['fixture-key'], ssConfLinks: { fixture: 'value' },
} } });
const validRules = () => ({ isOk: true, response: { webpageAllowed: true, subpageConfigUuid: null } });

function fixture(overrides = {}) {
    const info = Promise.withResolvers(), rules = Promise.withResolvers();
    const calls = [], signals = [];
    const service = new WebpageService({ getOrThrow: () => 'fixture' }, {
        getSubscriptionInfo: (_ip, _key, signal) => { calls.push('info'); signals.push(signal); return info.promise; },
        getSubpageConfig: (_key, _headers, signal) => { calls.push('rules'); signals.push(signal); return rules.promise; },
        ...overrides,
    }, { sign: () => 'fixture-cookie' });
    service.logger = { error() {}, log() {} };
    service.getBaseSettings = () => ({ showConnectionKeys: true, metaTitle: 'fixture', metaDescription: 'fixture' });
    service.indexTemplate = value => value.panelData;
    const response = new EventEmitter();
    response.headers = {};
    response.cookies = [];
    response.set = (name, value) => { response.headers[name] = value; return response; };
    response.status = value => { response.statusCode = value; return response; };
    response.type = () => response;
    response.cookie = (...args) => response.cookies.push(args);
    response.send = value => { response.body = value; response.writableEnded = true; response.emit('finish'); return response; };
    let settled = false;
    const operation = service.serveWebpage('192.0.2.1', { headers: {} }, response, 'fixture123')
        .finally(() => { settled = true; });
    return { info, rules, calls, signals, response, operation, settled: () => settled,
        async cleanup() { info.resolve(validInfo()); rules.resolve(validRules()); await operation; },
    };
}

for (const status of [404, 503]) {
    test(`HTML info ${status} cancels rules and observes settlement before replying`, async () => {
        const context = fixture();
        try {
            assert.deepEqual(context.calls, ['info', 'rules']);
            context.info.resolve({ isOk: false, status });
            await tick();
            assert(context.signals.every(signal => signal.aborted));
            assert.equal(context.settled(), false);
            assert.equal(context.response.body, undefined);
            context.rules.reject(new Error('cancelled rules'));
            await context.operation;
            assert.equal(context.response.statusCode, status);
            assert.equal(context.response.headers['Cache-Control'], 'private, no-store');
            assert.equal(context.response.headers['Retry-After'], status === 503 ? '30' : undefined);
            assert.equal(context.response.cookies.length, 0);
            assert.equal(context.response.listenerCount('close'), 0);
        } finally { await context.cleanup(); }
    });

    test(`HTML retains info ${status} when rules have already returned a conflicting failure`, async () => {
        const context = fixture();
        try {
            context.rules.resolve({ isOk: false, status: status === 404 ? 503 : 404 });
            await tick();
            assert.equal(context.response.body, undefined);
            context.info.resolve({ isOk: false, status });
            await context.operation;
            assert.equal(context.response.statusCode, status);
        } finally { await context.cleanup(); }
    });
}

for (const order of ['info', 'rules']) {
    test(`successful HTML stays parallel and complete when ${order} finishes first`, async () => {
        const context = fixture();
        const expected = validInfo();
        try {
            assert.deepEqual(context.calls, ['info', 'rules']);
            context[order].resolve(order === 'info' ? expected : validRules());
            await tick();
            assert.equal(context.settled(), false);
            assert.equal(context.response.body, undefined);
            context[order === 'info' ? 'rules' : 'info'].resolve(order === 'info' ? validRules() : expected);
            await context.operation;
            assert.deepEqual(JSON.parse(Buffer.from(context.response.body, 'base64').toString('utf8')), expected.response);
            assert.equal(context.response.cookies.length, 1);
            assert(context.signals.every(signal => !signal.aborted));
            assert.equal(context.response.listenerCount('close'), 0);
        } finally { await context.cleanup(); }
    });

    test(`unexpected ${order} rejection cancels and observes the other request`, async () => {
        const context = fixture();
        const sibling = order === 'info' ? 'rules' : 'info';
        try {
            context[order].reject(new Error('upstream failed'));
            await tick();
            assert(context.signals.every(signal => signal.aborted));
            assert.equal(context.settled(), false);
            assert.equal(context.response.body, undefined);
            context[sibling].reject(new Error('cancelled sibling'));
            await context.operation;
            assert.equal(context.response.statusCode, 503);
            assert.equal(context.response.listenerCount('close'), 0);
        } finally { await context.cleanup(); }
    });
}

test('disconnect observes both rejections without writing a response', async () => {
    const context = fixture();
    try {
        context.response.emit('close');
        assert(context.signals.every(signal => signal.aborted));
        context.info.reject(new Error('disconnected info'));
        await tick();
        assert.equal(context.settled(), false);
        context.rules.reject(new Error('disconnected rules'));
        await context.operation;
        assert.equal(context.response.body, undefined);
        assert.equal(context.response.cookies.length, 0);
        assert.equal(context.response.listenerCount('close'), 0);
    } finally { await context.cleanup(); }
});

test('synchronous rules failure still cancels and observes an already started info request', async () => {
    const info = Promise.withResolvers();
    let signal;
    const context = fixture({
        getSubscriptionInfo: (_ip, _key, value) => { signal = value; return info.promise; },
        getSubpageConfig: () => { throw Error('synchronous failure'); },
    });
    try {
        await tick();
        assert(signal.aborted);
        assert.equal(context.settled(), false);
        info.reject(new Error('cancelled info'));
        await context.operation;
        assert.equal(context.response.statusCode, 503);
    } finally { info.resolve(validInfo()); await context.cleanup(); }
});

test('simultaneous upstream rejections are observed and return one temporary error', async () => {
    const context = fixture();
    try {
        context.info.reject(new Error('info failure'));
        context.rules.reject(new Error('rules failure'));
        await context.operation;
        assert.equal(context.response.statusCode, 503);
        assert.equal(context.response.listenerCount('close'), 0);
    } finally { await context.cleanup(); }
});

test('a disconnect during failed-info cleanup prevents a late error response', async () => {
    const context = fixture();
    try {
        context.info.resolve({ isOk: false, status: 404 });
        await tick();
        context.response.emit('close');
        context.rules.reject(new Error('cancelled rules'));
        await context.operation;
        assert.equal(context.response.body, undefined);
        assert.equal(context.response.listenerCount('close'), 0);
    } finally { await context.cleanup(); }
});

test('real HTML transport cancels stalled Axios page rules after info 404/503', { timeout: 8000 }, async () => {
    const contract = require('@remnawave/backend-contract');
    const { AxiosService } = load(path.join(__dirname, '../src/common/axios/axios.service.ts'), {
        '@common/config/app-config': {},
        '@common/constants': { IGNORED_HEADERS: new Set() },
        './subscription-request-headers': load(path.join(__dirname, '../src/common/axios/subscription-request-headers.ts')),
    }, { __RW_SUBPAGE_VERSION__: 'fixture' });
    const rulePaths = new Map(), infoPaths = new Map(), pendingRules = new Map(), waitingInfo = new Map();
    for (const status of [404, 503]) {
        const key = 'fixture' + status;
        rulePaths.set(contract.GetSubpageConfigByShortUuidCommand.url(key), key);
        infoPaths.set(contract.GetSubscriptionInfoByShortUuidCommand.url(key), { key, status });
    }
    let calls = 0, expectedCancellationLogs = 0;
    const upstream = http.createServer((req, res) => {
        calls++;
        req.resume();
        const key = rulePaths.get(req.url);
        if (key) {
            pendingRules.set(key, res);
            waitingInfo.get(key)?.();
            return;
        }
        const info = infoPaths.get(req.url);
        if (!info) { res.writeHead(500); return res.end(); }
        const reply = () => {
            res.writeHead(info.status, { 'Content-Type': 'application/json' });
            res.end('{}');
        };
        if (pendingRules.has(info.key)) reply();
        else waitingInfo.set(info.key, reply);
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const values = { REMNAWAVE_PANEL_URL: 'http://127.0.0.1:' + upstream.address().port, REMNAWAVE_API_TOKEN: 'fixture' };
    const axios = new AxiosService({ getOrThrow: key => values[key], get: () => undefined });
    axios.logger = { error(message) { if (message === 'Unable to fetch subscription page rules') expectedCancellationLogs++; } };
    const service = new WebpageService({ getOrThrow: () => 'fixture' }, axios, { sign: () => 'fixture' });
    const app = express();
    app.get('/:key', (req, res) => service.serveWebpage('192.0.2.1', req, res, req.params.key));
    const frontend = http.createServer(app);
    await new Promise(resolve => frontend.listen(0, '127.0.0.1', resolve));
    try {
        for (const status of [404, 503]) {
            const abort = new AbortController();
            const timer = setTimeout(() => abort.abort(), 2000);
            try {
                const response = await fetch('http://127.0.0.1:' + frontend.address().port + '/fixture' + status, { signal: abort.signal });
                assert.equal(response.status, status);
                assert.match(await response.text(), new RegExp(String(status)));
                const rules = pendingRules.get('fixture' + status);
                if (!rules.destroyed) await new Promise(resolve => rules.once('close', resolve));
                assert(rules.destroyed);
                assert.equal(rules.writableEnded, false);
            } finally { clearTimeout(timer); }
        }
        assert.equal(calls, 4);
        assert.equal(expectedCancellationLogs, 0);
    } finally {
        axios.onModuleDestroy();
        frontend.closeAllConnections();
        upstream.closeAllConnections();
        await Promise.all([new Promise(resolve => frontend.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
    }
});
