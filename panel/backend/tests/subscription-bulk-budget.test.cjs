const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { subscriptionBudget, runSubscriptionWork, subscriptionRequestSignal } = require('./load-typescript.cjs')(
    path.join(__dirname, '../src/common/middlewares/subscription-budget.middleware.ts'),
);
const { source } = require('./upstream-filter-fixture.cjs');
const { SubscriptionService } = source('modules/subscription/subscription.service.ts', {
    '@integration-modules/notifications/interfaces': {},
    '@libs/contracts/constants': { ERRORS: { GETTING_ALL_SUBSCRIPTIONS_ERROR: { code: 'BATCH_FAILED' } } },
    '@modules/subscription-settings/queries/get-cached-subscrtipion-settings': { GetCachedSubscriptionSettingsQuery: class {} },
    '@common/types': { ok: response => ({ isOk: true, response }), fail: error => ({ isOk: false, error }) },
});

test('protected bulk subscriptions bound fan-out while retaining every successful result', async () => {
    const service = Object.create(SubscriptionService.prototype);
    const gate = Promise.withResolvers();
    let running = 0, peak = 0;
    Object.assign(service, {
        logger: { error(error) { throw Error(String(error)); } },
        getUsersWithPagination: async () => ({ isOk: true, response: { total: 100, users: Array.from({length: 100}, (_, id) => ({id})) } }),
        queryBus: { execute: async () => ({}) },
        getSubscriptionInfo: async ({userEntity}) => {
            peak = Math.max(peak, ++running);
            await gate.promise;
            running--;
            return { isOk: true, response: { id: userEntity.id } };
        },
    });
    const operation = service.getAllSubscriptions({start: 0, size: 100});
    try {
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(running, 8);
    } finally { gate.resolve(); await operation; }
    const result = await operation;
    assert.equal(result.isOk, true);
    assert.equal(result.response.subscriptions.length, 100);
    assert.equal(new Set(result.response.subscriptions.map(item => item.id)).size, 100);
    assert.equal(peak, 8);
});

test('disconnect stops pending bulk lookups but waits for already started work', async () => {
    const service = Object.create(SubscriptionService.prototype);
    const gate = Promise.withResolvers();
    const abort = new AbortController();
    let started = 0, settled = false;
    Object.assign(service, {
        logger: { error(error) { throw Error(String(error)); } },
        getUsersWithPagination: async () => ({ isOk: true, response: { total: 100, users: Array.from({length: 100}, (_, id) => ({id})) } }),
        queryBus: { execute: async () => ({}) },
        getSubscriptionInfo: async () => { started++; await gate.promise; return {isOk: true, response: {}}; },
    });
    const operation = service.getAllSubscriptions({start: 0, size: 100}, abort.signal).finally(() => { settled = true; });
    try {
        await new Promise(resolve => setImmediate(resolve));
        abort.abort();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(settled, false);
    } finally { gate.resolve(); }
    await operation;
    assert.equal(started, 8);
});

test('two protected HTTP batches cap live work at sixteen and disconnect cannot reopen capacity', {timeout: 5000}, async () => {
    const service = Object.create(SubscriptionService.prototype);
    const gate = Promise.withResolvers(), entered = Promise.withResolvers(), closed = Promise.withResolvers();
    const completed = [];
    let started = 0, running = 0, peak = 0;
    Object.assign(service, {
        logger: { error(error) { throw Error(String(error)); } },
        getUsersWithPagination: async () => ({isOk: true, response: {total: 100, users: Array.from({length: 100}, (_, id) => ({id}))}}),
        queryBus: {execute: async () => ({})},
        getSubscriptionInfo: async () => {
            started++;
            peak = Math.max(peak, ++running);
            if (running === 16) entered.resolve();
            await gate.promise;
            running--;
            return {isOk: true, response: {}};
        },
    });
    const app = express();
    app.use(subscriptionBudget());
    app.get('/api/subscriptions', async (req, res, next) => {
        if (req.query.first) res.once('close', closed.resolve);
        const operation = runSubscriptionWork(res, () => service.getAllSubscriptions({start: 0, size: 100}, subscriptionRequestSignal(res)));
        completed.push(operation);
        try { const result = await operation; if (!res.destroyed) res.json(result); }
        catch (error) { next(error); }
    });
    app.get('/api/sub/:key', (_req, res) => res.send('public'));
    app.get('/api/users', (_req, res) => res.send('admin'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const first = http.get(base + '/api/subscriptions?first=1');
    const second = http.get(base + '/api/subscriptions');
    first.on('error', () => {});
    second.on('error', () => {});
    try {
        await entered.promise;
        assert.equal(started, 16);
        first.destroy();
        await closed.promise;
        for (const route of ['/api/subscriptions', '/API/SUBSCRIPTIONS/']) {
            const response = await fetch(base + route);
            assert.equal(response.status, 503);
            assert.equal(response.headers.get('retry-after'), '2');
        }
        assert.equal((await fetch(base + '/api/users')).status, 200);
        assert.equal((await fetch(base + '/api/sub/key')).status, 200);
        assert.equal(started, 16);
        gate.resolve();
        await Promise.all(completed);
        assert.equal((await fetch(base + '/api/subscriptions')).status, 200);
        assert.equal(peak, 16);
    } finally {
        gate.resolve();
        first.destroy();
        second.destroy();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('an unexpected mapper failure waits for the other lookups before settling the batch', async () => {
    const service = Object.create(SubscriptionService.prototype);
    const failed = Promise.withResolvers(), gate = Promise.withResolvers();
    let settled = false, started = 0;
    Object.assign(service, {
        logger: { error() {} },
        getUsersWithPagination: async () => ({isOk: true, response: {total: 8, users: Array.from({length: 8}, (_, id) => ({id}))}}),
        queryBus: {execute: async () => ({})},
        getSubscriptionInfo: async ({userEntity}) => {
            started++;
            if (userEntity.id === 0) { await failed.promise; throw Error('lookup failed'); }
            await gate.promise;
            return {isOk: true, response: {}};
        },
    });
    const operation = service.getAllSubscriptions({start: 0, size: 8}).finally(() => { settled = true; });
    try {
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(started, 8);
        failed.resolve();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(settled, false, 'unfinished lookups must continue holding admission capacity');
    } finally { failed.resolve(); gate.resolve(); }
    assert.equal((await operation).isOk, false);
});
