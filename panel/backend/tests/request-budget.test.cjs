const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const http = require('node:http');
const { sign, verify } = require('jsonwebtoken');
const { UnauthorizedException } = require('@nestjs/common');
const load = require('./load-typescript.cjs');
const { boundedJsonParser } = load(
    path.join(__dirname, '../src/common/middlewares/bounded-json.middleware.ts'),
    { '@libs/contracts/constants': { ROLE: { ADMIN: 'ADMIN', API: 'API' } } },
);
test('large JSON requires early authorization; parsing never grants route permission', async () => {
    const app = express();
    app.use(
        boundedJsonParser(async (request) => {
            let user;
            try {
                user = verify(request.headers.authorization?.slice(7) ?? '', 'test-secret', {
                    algorithms: ['HS256'],
                });
            } catch {
                throw new UnauthorizedException();
            }
            if (!user.uuid || !['ADMIN', 'API'].includes(user.role))
                throw new UnauthorizedException();
        }),
    );
    app.post('/api/test', (req, res) => res.status(403).json({ parsed: true }));
    app.use((error, req, res, _next) => res.status(error.status || 500).end());
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const url = `http://127.0.0.1:${server.address().port}/api/test`;
    try {
        const large = JSON.stringify({ value: 'x'.repeat(1024 * 1024 + 10) });
        for (const token of [
            '',
            sign({ uuid: 'id', role: 'ADMIN' }, 'wrong-secret'),
            sign({ uuid: 'id', role: 'ADMIN', exp: 1 }, 'test-secret'),
            sign({ uuid: 'id', role: 'USER' }, 'test-secret'),
        ]) {
            await new Promise((resolve, reject) => {
                const request = http.request(
                    url,
                    {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            'content-length': Buffer.byteLength(large),
                            Authorization: `Bearer ${token}`,
                        },
                        timeout: 2000,
                    },
                    (response) => {
                        assert.equal(response.statusCode, 401);
                        assert.equal(response.headers.connection, 'close');
                        response.resume();
                        response.on('end', resolve);
                    },
                );
                request.on('error', reject);
                request.on('timeout', () =>
                    request.destroy(new Error('Unauthorized body was awaited')),
                );
                request.flushHeaders();
            });
        }
        for (const role of ['API', 'ADMIN']) {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${sign({ uuid: 'id', role }, 'test-secret', { expiresIn: 60 })}`,
                },
                body: large,
            });
            assert.equal(response.status, 403);
            assert.equal((await response.json()).parsed, true);
        }
        const normal = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{"username":"test"}',
        });
        assert.equal(normal.status, 401);
        await normal.arrayBuffer();
    } finally {
        await new Promise((r) => server.close(r));
    }
});
