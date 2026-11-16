const assert = require('node:assert/strict');
const crypto = require('node:crypto');

module.exports = async function checkNodeDeletion({ request, prisma }) {
    assert.equal(new URL(process.env.DATABASE_URL).hostname, 'audit-db');
    assert.equal(await prisma.nodes.count(), 0);
    const Redis = require('/opt/app/node_modules/ioredis');
    const redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        db: Number(process.env.REDIS_DB ?? '1'),
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        keyPrefix: 'ioraw:',
    });
    try {
        for (const isDisabled of [false, true]) {
            const uuid = crypto.randomUUID();
            const address = `delete-${uuid}.example.invalid`;
            const node = await prisma.nodes.create({
                data: {
                    uuid,
                    name: `Deletion fixture ${uuid}`,
                    address,
                    port: 7289,
                    isDisabled,
                    controlAddresses: [{ address, enabled: true }],
                },
            });
            const leaseKey = `remnacust:node-delivery:${uuid}`;
            const owner = crypto.randomUUID();
            await redis.set(leaseKey, owner, 'PX', 60000);
            try {
                assert.equal(
                    (await request(`/api/nodes/${uuid}`, 'DELETE', undefined, false)).status,
                    401,
                );
                assert.ok(await prisma.nodes.findUnique({ where: { uuid } }));
                assert.equal((await request(`/api/nodes/${uuid}`, 'GET')).status, 200);
                const busy = await request(`/api/nodes/${uuid}`, 'DELETE');
                assert.equal(busy.status, 409, JSON.stringify(busy.body));
                assert.equal(busy.body.errorCode, 'A272');
                assert.ok(await prisma.nodes.findUnique({ where: { uuid } }));
                assert.equal(await redis.get(leaseKey), owner, 'Foreign lease must remain intact');
                await redis.eval(
                    "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
                    1,
                    leaseKey,
                    owner,
                );
                const result = await request(`/api/nodes/${uuid}`, 'DELETE');
                assert.equal(result.status, 204, JSON.stringify(result.body));
                assert.equal(
                    await prisma.nodes.findUnique({ where: { uuid } }),
                    null,
                    'Successful HTTP deletion must commit after the delivery lease is released',
                );
                assert.equal(await redis.get(leaseKey), null);
                assert.notEqual((await request(`/api/nodes/${uuid}`, 'GET')).status, 200);
                const repeated = await request(`/api/nodes/${uuid}`, 'DELETE');
                assert.notEqual(repeated.status, 204);
            } finally {
                await redis.eval(
                    "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
                    1,
                    leaseKey,
                    owner,
                );
                await prisma.nodes.deleteMany({ where: { uuid: node.uuid } });
            }
        }
    } finally {
        await redis.quit();
    }
    process.stdout.write(
        'PASS node deletion: authenticated API, busy delivery conflict, enabled/disabled unreachable nodes, immediate SQL commit and stale read rejection\n',
    );
};
