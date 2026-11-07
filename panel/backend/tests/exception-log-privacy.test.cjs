const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const common = require('@nestjs/common');
const root = path.join(__dirname, '../src/common');
const safe = load(path.join(root, 'utils/http-log-path.ts'));
const logs = [];
class Logger { error(value) { logs.push(value); } }
const mocks = { '@nestjs/common': { ...common, Logger }, '@common/utils/http-log-path': safe };
const { HttpExceptionWithErrorCodeType } = load(path.join(root, 'exception/http-exeception-with-error-code.type.ts'), mocks);

function run(Filter, url) {
    logs.length = 0;
    let body;
    let status;
    const response = { removeHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; return this; } };
    new Filter().catch(new HttpExceptionWithErrorCodeType('Forbidden', 'fixture-denied', 403), {
        switchToHttp: () => ({ getRequest: () => ({ url }), getResponse: () => response })
    });
    assert.equal(status, 403);
    assert(body);
    const output = JSON.stringify({ logs, body });
    assert(!output.includes('fixture-secret'));
    return body;
}

test('public exception logs never retain subscription or personal device credentials', () => {
    const { PublicHttpExceptionFilter } = load(path.join(root, 'exception/public-http-exception.filter.ts'), mocks);
    const body = run(PublicHttpExceptionFilter, '/api/sub/fixture-secret/device/fixture-secret-token/json?key=fixture-secret');
    assert.equal(body.path, '/api/sub/[redacted]');
});

test('API exception paths omit query credentials and public subscription paths', () => {
    const { HttpExceptionFilter } = load(path.join(root, 'exception/http-exception.filter.ts'), mocks);
    assert.equal(run(HttpExceptionFilter, '/api/users?token=fixture-secret').path, '/api/users');
    assert.equal(run(HttpExceptionFilter, '/api/sub/fixture-secret/json').path, '/api/sub/[redacted]');
});

test('subscription page exception paths are private even with custom prefixes', () => {
    const { HttpExceptionFilter } = load(path.join(__dirname, '../../../subscription-page/backend/src/common/exception/httpException.filter.ts'), mocks);
    const { HttpExceptionWithErrorCodeType: PageError } = load(path.join(__dirname, '../../../subscription-page/backend/src/common/exception/http-exeception-with-error-code.type.ts'), mocks);
    logs.length = 0;
    let result;
    const response = { status() { return this; }, json(body) { result = body; } };
    new HttpExceptionFilter().catch(new PageError('Forbidden', 'fixture-denied', 403), {
        switchToHttp: () => ({ getRequest: () => ({ url: '/custom/fixture-secret/device/fixture-secret' }), getResponse: () => response })
    });
    assert.equal(result.path, '/subscription');
    assert(!JSON.stringify({ logs, result }).includes('fixture-secret'));
});
