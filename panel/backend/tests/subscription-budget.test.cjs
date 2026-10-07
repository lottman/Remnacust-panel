const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { subscriptionBudget } = require('./load-typescript.cjs')(path.join(__dirname, '../src/common/middlewares/subscription-budget.middleware.ts'));

test('slow public subscriptions cannot starve the admin API and disconnected requests release capacity once', () => {
    const middleware = subscriptionBudget(2);
    function request(path) {
        const res = new EventEmitter(); res.headers = {};
        res.set = (k,v) => {res.headers[k]=v;return res;};
        res.status = v => {res.code=v;return res;};res.send = () => res;
        middleware({path},res,() => {res.passed=true;});return res;
    }
    const first=request('/api/sub/key'), second=request('/api/sub/info/key');
    assert(first.passed && second.passed);
    const refused=request('/api/sub/key'); assert.equal(refused.code,503);
    assert.equal(refused.headers['Cache-Control'],'private, no-store');
    assert(request('/api/users').passed);
    first.emit('close');first.emit('finish');
    const replacement=request('/api/sub/key');assert(replacement.passed);
    assert.equal(request('/api/sub/key').code,503,'a close+finish must not free two slots');
    second.emit('finish');replacement.emit('finish');
    assert(request('/api/sub/key').passed);
});
