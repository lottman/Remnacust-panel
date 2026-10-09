const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { httpLogPath } = load(path.join(__dirname, '../src/common/utils/http-log-path.ts'));

test('access-log paths omit subscription bearer credentials, devices and query tokens', () => {
    for (const pathname of ['/api/sub/fixture-key', '/API/SUB/fixture-key/xray-json',
        '/api/sub/fixture-key/device/fixture-device-token?token=fixture-query-token']) {
        const result = httpLogPath(pathname);
        assert.equal(result, '/api/sub/[redacted]');
        assert(!result.includes('fixture-'));
    }
    assert.equal(httpLogPath('/api/users?token=fixture'), '/api/users');
    assert.equal(httpLogPath('/api/submarine/path'), '/api/submarine/path');
    assert.equal(httpLogPath(undefined), '');
});
