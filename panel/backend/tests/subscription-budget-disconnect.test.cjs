const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const express = require('express');
const { Observable } = require('rxjs');
const { subscriptionBudget, runSubscriptionWork, SubscriptionBudgetInterceptor } =
    require('./load-typescript.cjs')(
        path.join(__dirname, '../src/common/middlewares/subscription-budget.middleware.ts'),
    );

test('disconnect cannot admit more work while the original subscription query is pending', async () => {
    const app = express();
    app.use(subscriptionBudget(1));
    const entered = Promise.withResolvers(), closed = Promise.withResolvers();
    const gate = Promise.withResolvers(), done = Promise.withResolvers();
    let running = 0, peak = 0, calls = 0;
    app.get('/api/sub/:key', async (_req, res, next) => {
        res.once('close', closed.resolve);
        try {
            await runSubscriptionWork(res, async () => {
                calls++;
                peak = Math.max(peak, ++running);
                entered.resolve();
                await gate.promise;
                running--;
            });
            res.send('subscription');
        } catch (error) { next(error); }
        finally { done.resolve(); }
    });
    app.get('/api/users', (_req, res) => res.send('admin'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = http.get(base + '/api/sub/first');
    request.on('error', () => {});
    try {
        await entered.promise;
        request.destroy();
        await closed.promise;
        for (let index = 0; index < 3; index++) {
            assert.equal((await fetch(base + '/api/sub/retry')).status, 503);
        }
        assert.equal((await fetch(base + '/api/users')).status, 200);
        assert.equal(calls, 1);
        assert.equal(running, 1);
        gate.resolve();
        await done.promise;
        assert.equal((await fetch(base + '/api/sub/after')).status, 200);
        assert.equal(peak, 1);
    } finally {
        gate.resolve();
        request.destroy();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('observable unsubscribe holds the lease until handler settlement and errors release it once', async () => {
    const middleware = subscriptionBudget(1);
    const admit = () => {
        const response = new EventEmitter();
        response.set = () => response;
        response.status = code => { response.code = code; return response; };
        response.send = () => response;
        middleware({ path: '/api/sub/test' }, response, () => { response.admitted = true; });
        return response;
    };
    const response = admit(), gate = Promise.withResolvers(), settled = Promise.withResolvers();
    const interceptor = new SubscriptionBudgetInterceptor();
    const observable = interceptor.intercept(
        { switchToHttp: () => ({ getResponse: () => response }) },
        { handle: () => new Observable(subscriber => {
            gate.promise.then(() => { subscriber.error(new Error('query failed')); settled.resolve(); });
        }) },
    );
    const subscriber = observable.subscribe({ error: () => {} });
    subscriber.unsubscribe();
    response.emit('close');
    assert.equal(admit().code, 503);
    gate.resolve();
    await settled.promise;
    await new Promise(resolve => setImmediate(resolve));
    const replacement = admit();
    assert(replacement.admitted);
    response.emit('finish');
    assert.equal(admit().code, 503, 'duplicate completion must not free the replacement');
    replacement.emit('finish');
    await assert.rejects(runSubscriptionWork(response, async () => assert.fail('closed work ran')), /closed/);
    assert(admit().admitted);
});
