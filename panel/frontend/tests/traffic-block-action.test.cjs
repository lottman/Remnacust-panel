const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('../../backend-3.4.4-xera/tests/load-typescript.cjs');
const { trafficBlockAction } = load(path.join(__dirname, '../src/pages/dashboard/limits/traffic-block-action.ts'));

test('mixed recipients are unblocked first; retries retain the same explicit operation', () => {
    assert.equal(trafficBlockAction({ total: 4, pausedUsers: 1, scopePaused: false }), 'RESUME');
    assert.equal(trafficBlockAction({ total: 4, pausedUsers: 4, scopePaused: true }), 'RESUME');
    assert.equal(trafficBlockAction({ total: 4, pausedUsers: 0, scopePaused: false }), 'PAUSE');
});
