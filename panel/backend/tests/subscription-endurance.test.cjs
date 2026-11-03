const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const load = require('./load-typescript.cjs');
const { subscriptionBudget, runSubscriptionWork } = load(path.join(__dirname, '../src/common/middlewares/subscription-budget.middleware.ts'));
const { MemoryCacheService } = load(path.join(__dirname, '../src/common/raw-cache/memory-cache.service.ts'), {
    '@songkeys/nestjs-redis': { InjectRedis: () => () => {} },
});

function response() {
    const value = new EventEmitter();
    value.set = () => value;
    value.status = code => { value.code = code; return value; };
    value.send = () => value;
    return value;
}

test('ten thousand successful failed and disconnected subscription cycles preserve capacity', async () => {
    const budget = subscriptionBudget(2);
    for (let index = 0; index < 10000; index++) {
        const res = response();
        let accepted = false;
        budget({ path: '/api/sub/test' }, res, () => { accepted = true; });
        assert(accepted);
        if (index % 3 === 0) {
            await assert.rejects(runSubscriptionWork(res, async () => { throw new Error('fixture'); }), /fixture/);
        } else {
            assert.equal(await runSubscriptionWork(res, async () => index), index);
        }
        res.emit(index % 2 ? 'finish' : 'close');
        res.emit('finish');
        res.emit('close');
        assert.equal(res.listenerCount('finish') + res.listenerCount('close'), 0);
    }
});

test('large configuration cache entries stay bounded and invalidated data is not retained', async () => {
    let ready, message;
    const subscriber = { on(event, handler) { if (event === 'ready') ready = handler; if (event === 'message') message = handler; }, async subscribe() {}, async quit() {} };
    const cache = new MemoryCacheService({ duplicate: () => subscriber, async publish() {} });
    cache.logger = { log() {} };
    await cache.onModuleInit();
    ready();
    const payload = 'x'.repeat(512 * 1024);
    for (let index = 0; index < 100; index++) cache.set('template-' + index, payload);
    assert.equal(cache.get('template-0'), undefined);
    assert.equal(cache.get('template-99'), payload);
    assert(cache.cache.calculatedSize <= 32 * 1024 * 1024);
    cache.set('oversized', 'x'.repeat(3 * 1024 * 1024));
    assert.equal(cache.get('oversized'), undefined);
    cache.set('expires', { value: true }, 5);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(cache.get('expires'), undefined);
    message('l1:invalidate', 'template-99');
    assert.equal(cache.get('template-99'), undefined);
    cache.set('after-reconnect', { value: true });
    ready();
    assert.equal(cache.get('after-reconnect'), undefined);
    await cache.onModuleDestroy();
});
