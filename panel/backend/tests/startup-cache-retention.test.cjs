const assert = require('node:assert/strict');
const path = require('node:path');
const {test} = require('node:test');
const Redis = require('ioredis');
const load = require('./load-typescript.cjs');
const {RAW_CACHE_KEY_PREFIX, keepRedisKeyOnStartup} = load(
    path.join(__dirname, '../src/common/raw-cache/raw-cache.constants.ts'),
);
const {adminSessionKey} = load(path.join(__dirname, '../src/common/utils/admin-session.ts'));

test('startup preserves actual ioredis session keys and queued core task metadata', () => {
    const redis = new Redis({lazyConnect:true, keyPrefix:RAW_CACHE_KEY_PREFIX});
    const storedKey = redis.options.keyPrefix + adminSessionKey('03d0cd66-9a5b-4bfb-9b99-262910580bc5');
    assert.equal(keepRedisKeyOnStartup(storedKey), true);
    for(const key of ['bull:xera-core-management:wait','bull:xera-core-management:128','bull:xera-core-management:meta']) {
        assert.equal(keepRedisKeyOnStartup(key), true);
    }
    redis.disconnect();
});

test('startup still clears temporary cache and unrelated authentication state', () => {
    for(const key of ['ioraw:system:stats','ioraw:auth:oauth-state:123','auth:active-session:unprefixed',
        'ioraw:auth:active-session-other:123','bull:other-queue:wait']) {
        assert.equal(keepRedisKeyOnStartup(key), false, key);
    }
});
