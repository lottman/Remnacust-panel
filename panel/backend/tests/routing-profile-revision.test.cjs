const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const Redis = require('ioredis');
const load = require('./load-typescript.cjs');
const { stabilizeRoutingProfile } = load(
    path.join(
        __dirname,
        '../src/modules/subscription-template/geofiles/stabilize-routing-profile.ts',
    ),
);
const { RawCacheService } = load(
    path.join(__dirname, '../src/common/raw-cache/raw-cache.service.ts'),
    { './memory-cache.service': {} },
);
const { keepRedisKeyOnStartup } = load(
    path.join(__dirname, '../src/common/raw-cache/raw-cache.constants.ts'),
);
const decode = (h) => JSON.parse(Buffer.from(h.split('/onadd/')[1], 'base64'));
const header = (client, stamp, fields = {}) =>
    `${client}://routing/onadd/` +
    Buffer.from(
        JSON.stringify({
            Name: 'Provider · 12345678',
            GlobalProxy: 'true',
            Geoipurl: '',
            Geositeurl: '',
            LastUpdated: String(stamp),
            ...fields,
        }),
    ).toString('base64');

test('unchanged profiles do not trigger reimports; file, mode and interval changes do', async () => {
    const states = new Map();
    let counter = 2000000000;
    const resolve = async (key, fingerprint) => {
        const old = states.get(key);
        if (old?.fingerprint === fingerprint) return old.stamp;
        const stamp = ++counter;
        states.set(key, { fingerprint, stamp });
        return stamp;
    };
    for (const client of ['happ', 'incy']) {
        const a = await stabilizeRoutingProfile(header(client, 100), 0, resolve);
        const b = await stabilizeRoutingProfile(header(client, 200), 0, resolve);
        assert.equal(a, b, 'timestamp alone must not change the header');
        const remote = { Geositeurl: 'https://cdn.test/geosite-a.dat' };
        const c = await stabilizeRoutingProfile(header(client, 201, remote), 24, resolve);
        assert(Number(decode(c).LastUpdated) > Number(decode(b).LastUpdated));
        assert.equal(c, await stabilizeRoutingProfile(header(client, 300, remote), 24, resolve));
        const d = await stabilizeRoutingProfile(
            header(client, 301, { Geositeurl: 'https://cdn.test/geosite-b.dat' }),
            24,
            resolve,
        );
        assert(Number(decode(d).LastUpdated) > Number(decode(c).LastUpdated));
        const e = await stabilizeRoutingProfile(header(client, 302), 0, resolve);
        assert(Number(decode(e).LastUpdated) > Number(decode(d).LastUpdated));
        assert.equal(decode(e).Geositeurl, '');
        const f = await stabilizeRoutingProfile(header(client, 303, remote), 12, resolve);
        assert(Number(decode(f).LastUpdated) > Number(decode(e).LastUpdated));
    }
    assert.equal(states.size, 2, 'client profile namespaces stay isolated');
    await stabilizeRoutingProfile(header('happ', 100), 0, resolve, 'registered-device-a');
    await stabilizeRoutingProfile(header('happ', 100), 0, resolve, 'registered-device-b');
    assert.equal(states.size, 4, 'personal credential identities stay isolated');
});

test('only bounded generated profiles and revisions are accepted; state survives application startup', async () => {
    const good = async () => 2000000000;
    for (const bad of [
        'happ://routing/off',
        header('happ', -1),
        header('happ', 'NaN'),
        header('happ', 100, { Name: null }),
    ])
        await assert.rejects(stabilizeRoutingProfile(bad, 0, good));
    for (const n of [NaN, -1, 1.5, 1e12])
        await assert.rejects(stabilizeRoutingProfile(header('happ', 100), 0, async () => n));
    const key = 'ioraw:remnacust:routing-profile:v1:' + 'a'.repeat(64);
    assert.equal(keepRedisKeyOnStartup(key), true);
    assert.equal(keepRedisKeyOnStartup(key + '/extra'), false);
    assert.equal(keepRedisKeyOnStartup('ioraw:remnacust:routing-profile:v1:anything'), false);
});

test('profile retirement tolerates unavailable Redis and observes a late rejection', async () => {
    let reject;
    const cache = new RawCacheService(
        {
            eval: () =>
                new Promise((_resolve, fail) => {
                    reject = fail;
                }),
        },
        {},
    );
    const warnings = [];
    cache.logger = { warn: (message) => warnings.push(message) };
    assert.equal(await cache.retireRoutingProfileRevision('a'.repeat(64), 'b'.repeat(64), 0), null);
    reject(Error('private Redis detail'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(warnings, ['Geofile profile cleanup deferred']);
    const failed = new RawCacheService(
        {
            eval: async () => {
                throw Error('private Redis detail');
            },
        },
        {},
    );
    failed.logger = { warn: (message) => warnings.push(message) };
    assert.equal(
        await failed.retireRoutingProfileRevision('a'.repeat(64), 'b'.repeat(64), 0),
        null,
    );
    assert.equal(
        warnings.some((message) => message.includes('private')),
        false,
    );
});

test(
    'real Redis preserves a stable revision across workers and increments once under concurrent changes',
    { skip: !process.env.NODE_INCIDENT_TEST_REDIS_URL },
    async () => {
        const url = process.env.NODE_INCIDENT_TEST_REDIS_URL;
        assert.equal(new URL(url).hostname, '127.0.0.1');
        const redis = new Redis(url, {
            maxRetriesPerRequest: 0,
            retryStrategy: () => null,
            connectTimeout: 3000,
        });
        const cache = new RawCacheService(redis, {}),
            key = randomBytes(32).toString('hex'),
            stored = 'remnacust:routing-profile:v1:' + key;
        try {
            const one = await cache.routingProfileRevision(key, 'a'.repeat(64), 2000000000);
            const same = await Promise.all(
                Array.from({ length: 20 }, () =>
                    new RawCacheService(redis, {}).routingProfileRevision(
                        key,
                        'a'.repeat(64),
                        2000000100,
                    ),
                ),
            );
            assert(same.every((n) => n === one));
            const changed = await Promise.all(
                Array.from({ length: 20 }, () =>
                    cache.routingProfileRevision(key, 'b'.repeat(64), 0),
                ),
            );
            assert(changed.every((n) => n === one + 1));
            assert.equal(
                await cache.routingProfileRevision(key, 'a'.repeat(64), 0),
                one + 2,
                'returning to inline is a new revision',
            );
            assert((await redis.ttl(stored)) > 7775900);
            for (const value of ['bad', '{"revision":null}']) {
                await redis.set(stored, value);
                assert(
                    Number.isSafeInteger(
                        await cache.routingProfileRevision(key, 'a'.repeat(64), 0),
                    ),
                );
            }
            await assert.rejects(cache.routingProfileRevision('bad', 'a'.repeat(64), 0));
        } finally {
            await redis.del(stored);
            redis.disconnect();
        }
    },
);

test(
    'real Redis retirement skips missing history and remains stable across concurrent workers',
    { skip: !process.env.NODE_INCIDENT_TEST_REDIS_URL },
    async () => {
        const redis = new Redis(process.env.NODE_INCIDENT_TEST_REDIS_URL, {
            maxRetriesPerRequest: 0,
            retryStrategy: () => null,
            connectTimeout: 3000,
        });
        const cache = new RawCacheService(redis, {});
        const key = randomBytes(32).toString('hex'),
            other = randomBytes(32).toString('hex');
        const stored = 'remnacust:routing-profile:v1:' + key;
        try {
            const initial = await cache.retireRoutingProfileRevision(key, 'b'.repeat(64), 0);
            assert.equal(initial, null);
            assert.equal(await redis.exists(stored), 0);
            for (const malformed of [
                'bad',
                '{"revision":10}',
                '{"revision":10,"fingerprint":"bad"}',
            ]) {
                await redis.set(stored, malformed);
                assert.equal(
                    await cache.retireRoutingProfileRevision(key, 'b'.repeat(64), 0),
                    null,
                );
                assert.equal(await redis.get(stored), malformed);
            }
            const legacyEmpty = JSON.stringify({ fingerprint: 'b'.repeat(64), revision: 123 });
            await redis.set(stored, legacyEmpty);
            assert.equal(await cache.retireRoutingProfileRevision(key, 'b'.repeat(64), 0), null);
            assert.equal(await redis.get(stored), legacyEmpty);
            const first = await cache.routingProfileRevision(key, 'a'.repeat(64), 2000000000);
            const revisions = await Promise.all(
                Array.from({ length: 20 }, () =>
                    new RawCacheService(redis, {}).retireRoutingProfileRevision(
                        key,
                        'b'.repeat(64),
                        0,
                    ),
                ),
            );
            assert(revisions.every((value) => value === first + 1));
            const otherRevision = await cache.retireRoutingProfileRevision(
                other,
                'b'.repeat(64),
                0,
            );
            assert.equal(otherRevision, null);
            assert.equal(await redis.exists('remnacust:routing-profile:v1:' + other), 0);
            assert.equal(
                await cache.retireRoutingProfileRevision(key, 'b'.repeat(64), 0),
                first + 1,
            );
            assert.equal(await cache.routingProfileRevision(key, 'a'.repeat(64), 0), first + 2);
        } finally {
            await redis.del(stored, 'remnacust:routing-profile:v1:' + other);
            redis.disconnect();
        }
    },
);
