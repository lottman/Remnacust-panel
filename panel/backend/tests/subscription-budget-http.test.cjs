const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { subscriptionBudget } = require('./load-typescript.cjs')(
    path.join(__dirname, '../src/common/middlewares/subscription-budget.middleware.ts'),
);

test('public subscription routes enforce the same budget for every letter case', async () => {
    const app = express();
    app.use(subscriptionBudget(1));
    const held = [];
    app.get('/api/sub/:key', (_req, res) => {
        held.push(res);
        res.write('held');
    });
    app.get('/api/users', (_req, res) => res.send('admin'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    let first;
    try {
        await new Promise((resolve, reject) => {
            first = http.get(`${url}/api/sub/one`, res => {
                assert.equal(res.statusCode, 200);
                res.once('data', resolve);
            }).on('error', reject);
        });
        for (const prefix of ['/api/sub', '/API/SUB', '/aPi/sUb']) {
            // A bypass would enter the held handler; abort safely instead of waiting forever.
            const status = await new Promise((resolve, reject) => {
                const req = http.get(`${url}${prefix}/two`, res => {
                    const status = res.statusCode;
                    res.destroy();
                    resolve(status);
                }).on('error', reject);
                req.setTimeout(1000, () => req.destroy(new Error('HTTP fixture timed out')));
            });
            assert.equal(status, 503, prefix);
        }
        assert.equal((await fetch(`${url}/api/users`)).status, 200);
        assert.equal(held.length, 1, 'rejected subscriptions must not reach the handler');
    } finally {
        first?.destroy();
        for (const res of held) res.destroy();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
