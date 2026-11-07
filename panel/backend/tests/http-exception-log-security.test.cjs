const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { ZodValidationException } = require('nestjs-zod');
const { z } = require('zod');
const load = require('./load-typescript.cjs');

const exceptions = load(
    path.join(__dirname, '../src/common/exception/http-exeception-with-error-code.type.ts'),
);
const { HttpExceptionWithErrorCodeType } = exceptions;
const { HttpExceptionFilter } = load(
    path.join(__dirname, '../src/common/exception/http-exception.filter.ts'),
    {
        './http-exeception-with-error-code.type': exceptions,
        '@common/utils/http-log-path': load(
            path.join(__dirname, '../src/common/utils/http-log-path.ts'),
        ),
    },
);
function runFilter(exception, url) {
    const records = [];
    const result = { removedHeaders: [] };
    const response = {
        status(code) {
            result.status = code;
            return this;
        },
        json(body) {
            result.body = body;
            return this;
        },
        removeHeader(name) {
            result.removedHeaders.push(name);
        },
    };
    const filter = new HttpExceptionFilter();
    filter.logger = { error: (record) => records.push(record) };
    filter.catch(exception, {
        switchToHttp: () => ({ getRequest: () => ({ url }), getResponse: () => response }),
    });
    return { records, result };
}

for (const url of [
    '/api/sub/fixture-subscription-key/info?token=fixture-query-token',
    '/API/SUB/fixture-subscription-key/device/fixture-device-token/json',
]) {
    test(`application logs and response paths redact subscription credentials: ${url}`, () => {
        const { records, result } = runFilter(
            new HttpExceptionWithErrorCodeType('Fixture failure', 'FIXTURE_ERROR', 500),
            url,
        );
        assert.equal(records.length, 1);
        assert.equal(records[0].path, '/api/sub/[redacted]');
        assert.equal(JSON.stringify(records).includes('fixture-'), false);
        assert.equal(result.status, 500);
        assert.equal(result.body.path, '/api/sub/[redacted]');
        assert.equal(result.body.errorCode, 'FIXTURE_ERROR');
        assert.equal(result.body.message, 'Fixture failure');
    });
}

test('Zod validation error logs redact bearer paths and keep the validation response unchanged', () => {
    const parsed = z.object({ count: z.number() }).safeParse({ count: 'invalid' });
    assert.equal(parsed.success, false);
    const exception = new ZodValidationException(parsed.error);
    const { records, result } = runFilter(
        exception,
        '/api/sub/fixture-key/device/fixture-device?token=fixture-query',
    );
    assert.equal(records.length, 1);
    assert.equal(records[0].path, '/api/sub/[redacted]');
    assert.equal(JSON.stringify(records).includes('fixture-'), false);
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, exception.getResponse());
    assert.deepEqual(result.removedHeaders, ['x-powered-by']);
});

test('other API logs retain useful routes but omit query credentials', () => {
    const url = '/api/users?token=fixture-query-token';
    const { records, result } = runFilter(
        new HttpExceptionWithErrorCodeType('Fixture failure', 'FIXTURE_ERROR', 500),
        url,
    );
    assert.equal(records[0].path, '/api/users');
    assert.equal(JSON.stringify(records).includes('fixture-query-token'), false);
    assert.equal(result.body.path, '/api/users');
});

test('not-found logging suppression and forbidden response behavior remain unchanged', () => {
    const url = '/api/sub/fixture-key/info';
    const missing = runFilter(
        new HttpExceptionWithErrorCodeType('Not found', 'FIXTURE_NOT_FOUND', 404),
        url,
    );
    assert.equal(missing.records.length, 0);
    assert.equal(missing.result.status, 404);
    assert.equal(missing.result.body.path, '/api/sub/[redacted]');
    const forbidden = runFilter(
        new HttpExceptionWithErrorCodeType('Private detail', 'FIXTURE_FORBIDDEN', 403),
        url,
    );
    assert.equal(forbidden.records[0].path, '/api/sub/[redacted]');
    assert.equal(forbidden.records[0].message, 'Forbidden');
    assert.equal(forbidden.result.status, 403);
    assert.equal(forbidden.result.body.message, 'Forbidden');
    assert.equal(forbidden.result.body.errorCode, 'E000');
    assert.equal(forbidden.result.body.path, '/api/sub/[redacted]');
});
