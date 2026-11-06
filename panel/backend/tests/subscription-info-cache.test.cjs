const test = require('node:test');
const assert = require('node:assert/strict');
const { NotFoundException, InternalServerErrorException } = require('@nestjs/common');
const { httpController, regex } = require('./subscription-delivery-fixture.cjs');
test.after(() => regex.configuredRegex.close());

test('actual public info controller protects credentials and 404/500 responses from caching', async () => {
    const { app, base } = await httpController({
        getSubscriptionInfo: async ({ searchBy }) => {
            if (searchBy.uniqueField === 'missing123') throw new NotFoundException();
            if (searchBy.uniqueField === 'failed123') throw new InternalServerErrorException();
            return {
                isOk: true,
                response: {
                    user: { username: 'fixture' },
                    links: ['vless://fixture-secret@node.example.test'],
                },
            };
        },
    });
    try {
        for (const [key, status] of [
            ['fixture123', 200],
            ['missing123', 404],
            ['failed123', 500],
        ]) {
            for (const prefix of ['/api/sub', '/API/SUB']) {
                for (const method of ['GET', 'HEAD']) {
                    const response = await fetch(`${base}${prefix}/${key}/info/`, { method });
                    assert.equal(response.status, status);
                    assert.equal(response.headers.get('cache-control'), 'private, no-store');
                    assert.equal(response.headers.get('pragma'), 'no-cache');
                    if (method === 'GET' && status === 200)
                        assert.deepEqual((await response.json()).response.links, [
                            'vless://fixture-secret@node.example.test',
                        ]);
                }
            }
        }
    } finally {
        await app.close();
    }
});
