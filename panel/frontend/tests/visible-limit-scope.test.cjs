const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');
const { hasVisibleLimit } = load(path.join(__dirname, '../src/pages/dashboard/limits/visible-limit-scope.ts'));
const scope = (extra = {}) => ({
    limitBytes: '0', speedLimitMbps: null, totalSpeedLimitMbps: null, paused: false,
    trafficMultiplier: 1, ...extra,
});

test('limits page hides unbounded scopes but keeps quota, speed and blocked scopes actionable', () => {
    assert.equal(hasVisibleLimit(scope()), false);
    assert.equal(hasVisibleLimit(scope({ usedBytes: '999999999', trafficMultiplier: 2 })), false);
    assert.equal(hasVisibleLimit(scope({ limitBytes: '9007199254740993' })), true);
    assert.equal(hasVisibleLimit(scope({ speedLimitMbps: 10 })), true);
    assert.equal(hasVisibleLimit(scope({ totalSpeedLimitMbps: 10 })), true);
    assert.equal(hasVisibleLimit(scope({ paused: true })), true);
});
