const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { frozenRemainingMs, effectiveUserExpiry, frozenDateEdit } = load(
    path.join(__dirname, '../src/common/utils/frozen-user-lifetime.ts'),
);

test('a frozen user keeps the same remaining lifetime as the wall clock advances', () => {
    const user = { status: 'FROZEN', frozenAt: new Date('2026-01-01T00:00:00Z'), expireAt: new Date('2026-01-03T00:00:00Z') };
    assert.equal(frozenRemainingMs(user), 172800000);
    for (const at of ['2026-01-01T00:00:00Z', '2026-05-01T00:00:00Z']) {
        const now = Date.parse(at);
        assert.equal(effectiveUserExpiry(user, now).getTime() - now, 172800000);
    }
    const now = Date.parse('2026-05-01T00:00:00Z');
    assert.equal(frozenDateEdit(user, new Date(now + 86400000), now).toISOString(), '2026-01-02T00:00:00.000Z');
});

test('expired remaining time is clamped and non-frozen dates are untouched', () => {
    const expired = { status: 'FROZEN', frozenAt: new Date('2026-01-03T00:00:00Z'), expireAt: new Date('2026-01-01T00:00:00Z') };
    assert.equal(frozenRemainingMs(expired), 0);
    assert.equal(effectiveUserExpiry(expired, 12345).getTime(), 12345);
    const active = { ...expired, status: 'ACTIVE' };
    assert.equal(frozenRemainingMs(active), null);
    assert.equal(effectiveUserExpiry(active), active.expireAt);
});
