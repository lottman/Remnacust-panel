const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Redis = require('ioredis');
const load = require('./load-typescript.cjs');
const { RawCacheService } = load(
    path.join(__dirname, '../src/common/raw-cache/raw-cache.service.ts'),
    { './memory-cache.service': {} },
);
const url = process.env.NODE_INCIDENT_TEST_REDIS_URL;
test(
    'real Redis confirms spaced incidents, suppresses repeats/replays and respects maintenance',
    { skip: !url },
    async () => {
        const parsed = new URL(url);
        assert.equal(parsed.hostname, '127.0.0.1');
        const redis = new Redis(url, {
            maxRetriesPerRequest: 0,
            connectTimeout: 3000,
            retryStrategy: () => null,
            lazyConnect: true,
        });
        redis.on('error', () => {});
        const cache = new RawCacheService(redis, {});
        const id = randomUUID(),
            other = randomUUID(),
            retry = randomUUID();
        const check = (at, healthy, muted = false, armed = true) =>
            cache.observeNodeIncident(id, at, healthy, muted, armed);
        const keys = [id, other, retry].map((id) => 'remnacust:node-incident:v1:' + id);
        try {
            await redis.connect();
            assert.equal(await check(1000, true), 0);
            assert.equal(await check(11000, false), 0);
            assert.equal(await check(21000, false), 0);
            const concurrent = await Promise.all(
                Array.from({ length: 20 }, () => check(31000, false)),
            );
            assert.equal(concurrent.filter((n) => n === 1).length, 1);
            await cache.acknowledgeNodeIncident(id, 31000, 1);
            assert.equal(await check(21000, false), 0, 'old observation ignored');
            assert.equal(await check(41000, true), 0);
            assert.equal(await check(51000, true), 2);
            await cache.acknowledgeNodeIncident(id, 51000, 2);
            assert.equal(await check(61000, true), 0, 'no duplicate restoration');
            for (const at of [71000, 81000, 91000, 101000])
                assert.equal(await check(at, false, true), 0);
            assert.equal(await check(111000, false), 0);
            assert.equal(await check(121000, false), 0);
            assert.equal(
                await check(131000, false),
                1,
                'maintenance ends without losing future alarms',
            );
            await cache.acknowledgeNodeIncident(id, 131000, 1);
            assert.equal(await check(300000, false), 0, 'long gaps do not confirm new incidents');
            for (const at of [1000, 11000, 21000, 31000])
                assert.equal(
                    await cache.observeNodeIncident(other, at, false, false, false),
                    0,
                    'never-connected installations do not send outage alarms',
                );
            for (const at of [1000, 11000])
                assert.equal(await cache.observeNodeIncident(retry, at, false, false, true), 0);
            assert.equal(await cache.observeNodeIncident(retry, 21000, false, false, true), 1);
            assert.equal(
                await cache.observeNodeIncident(retry, 31000, false, false, true),
                0,
                'leased delivery is not duplicated by another worker',
            );
            const retryKey = keys[2],
                pending = JSON.parse(await redis.get(retryKey));
            pending.pending[0].lease = 0;
            await redis.set(retryKey, JSON.stringify(pending));
            assert.equal(
                await cache.observeNodeIncident(retry, 41000, false, false, true),
                1,
                'failed transport is retried from persisted outbox',
            );
            await cache.acknowledgeNodeIncident(retry, 21000, 1);
            assert.equal(
                JSON.parse(await redis.get(retryKey)).pending.length,
                1,
                'old owner cannot ACK a newer lease',
            );
            await cache.acknowledgeNodeIncident(retry, 41000, 1);
            assert.equal(await cache.observeNodeIncident(retry, 51000, false, false, true), 0);
        } finally {
            try {
                if (redis.status === 'ready') await redis.del(...keys);
            } finally {
                redis.disconnect();
            }
        }
    },
);
