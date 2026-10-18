const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { sessionObservations } = load(path.join(__dirname, '../src/common/utils/session-observations.ts'));
const ip = (value, time = 1) => ({ ip: value, lastSeen: new Date(time * 1000) });

test('sessions include base, personal device and host identities without double counting IPs', () => {
    const result = sessionObservations([
        { userId: '45', ips: [ip('127.0.0.1')] },
        { userId: '45~' + 'a'.repeat(24), ips: [ip('127.0.0.1', 3), ip('::1')] },
        { userId: '45~' + 'b'.repeat(24) + '~h' + 'c'.repeat(32), ips: [ip('127.0.0.2')] },
        { userId: '46', ips: [] },
    ]);
    assert.equal(result.unmappedUsers, 0);
    assert.deepEqual(result.users, [{ userId: 45, ips: [ip('127.0.0.1', 3), ip('::1'), ip('127.0.0.2')] }]);
});

test('unknown and unsafe identities report incomplete results while retaining known observations', () => {
    const result = sessionObservations([
        { userId: 'user@example.com', ips: [ip('::1')] },
        { userId: '9007199254740993', ips: [ip('::1')] },
        { userId: '0', ips: [ip('::1')] },
        { userId: '45', ips: [ip('127.0.0.1')] },
    ]);
    assert.equal(result.unmappedUsers, 3);
    assert.equal(result.users[0].userId, 45);
});
