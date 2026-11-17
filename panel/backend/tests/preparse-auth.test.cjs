const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const { gzipSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const load = require('./load-typescript.cjs');
const root = path.resolve(__dirname, '..');
const secret = 'preparse-fixture-signing-key-at-least-32-characters';
const session = load(path.join(root, 'src/common/utils/admin-session.ts'));
const config = { getOrThrow: () => secret };
const constants = {
    ROLE: { ADMIN: 'ADMIN', API: 'API' },
    REMNAWAVE_CLIENT_TYPE_HEADER: 'X-Remnawave-Client-Type',
    REMNAWAVE_CLIENT_TYPE_BROWSER: 'browser',
};
const mocks = {
    '@common/config/app-config/typed-config.service': { TypedConfigService: class {} },
    '@common/config/app-config': { TypedConfigService: class {} },
    '@common/raw-cache': { RawCacheService: class {} },
    '@common/utils/admin-session': session,
    '@libs/contracts/constants': constants,
    '@modules/admin/queries/get-admin-by-username': {
        GetAdminByUsernameQuery: class {
            constructor(username) {
                this.username = username;
            }
        },
    },
    '@modules/api-tokens/queries/get-token-by-uuid': {
        GetTokenByUuidQuery: class {
            constructor(uuid) {
                this.uuid = uuid;
            }
        },
    },
};
const { JwtStrategy } = load(path.join(root, 'src/modules/auth/strategies/jwt.strategy.ts'), mocks);
new JwtStrategy(config);
const { JwtDefaultGuard } = load(
    path.join(root, 'src/common/guards/jwt-guards/def-jwt-guard.ts'),
    mocks,
);
function parser() {
    if (!process.env.REQUEST_BODY_BASELINE)
        return load(path.join(root, 'src/common/middlewares/bounded-json.middleware.ts'))
            .boundedJsonParser;
    const source = execFileSync(
        'git',
        ['show', 'HEAD:panel/backend/src/common/middlewares/bounded-json.middleware.ts'],
        { cwd: root, encoding: 'utf8' },
    );
    const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const result = { exports: {} };
    new Function('require', 'module', 'exports', code)(
        (id) => (id === '@libs/contracts/constants' ? constants : require(id)),
        result,
        result.exports,
    );
    return result.exports.boundedJsonParser;
}
async function fixture(t) {
    const admin = {
        uuid: '10000000-0000-4000-8000-000000000001',
        username: 'fixture',
        passwordHash: 'fixture-password-hash',
    };
    const state = {
        active: true,
        expireAt: null,
        scopes: ['*'],
        sessionActive: true,
        parsed: 0,
        queryCount: 0,
        failQuery: false,
    };
    const query = {
        execute: async (q) => {
            state.queryCount++;
            if (state.failQuery) throw new Error('private fixture failure must not be returned');
            return q.username
                ? { isOk: true, response: admin }
                : state.active
                  ? { isOk: true, response: { expireAt: state.expireAt, scopes: state.scopes } }
                  : { isOk: false };
        },
    };
    const guard = new JwtDefaultGuard(query, config, { exists: async () => state.sessionActive });
    const app = express();
    app.use(
        parser()(
            process.env.REQUEST_BODY_BASELINE
                ? secret
                : (request) => guard.authenticateRequest(request),
        ),
    );
    app.post('/api/auth/login', (req, res) => res.json({ parsed: !!req.body }));
    app.get('/api/sub/example', (_req, res) => res.send('subscription'));
    app.use(async (req, res, next) => {
        state.parsed += Number(req.body !== undefined);
        try {
            const allowed = await guard.canActivate({
                switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
            });
            if (!allowed) return res.sendStatus(403);
            res.json({ bytes: req.body?.data?.length ?? 0, scopes: req.user.scopes ?? [] });
        } catch (error) {
            next(error);
        }
    });
    app.use((error, _req, res, _next) =>
        res.status(error.getStatus?.() ?? error.status ?? 500).json({ error: error.message }),
    );
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    const url = 'http://127.0.0.1:' + server.address().port;
    const api = (extra = {}) =>
        jwt.sign({ uuid: 'api-fixture', role: 'API', permanent: true, ...extra }, secret);
    const browser = () =>
        jwt.sign(
            {
                uuid: admin.uuid,
                username: admin.username,
                role: 'ADMIN',
                ...session.createAdminSessionClaims(admin, secret),
            },
            secret,
            { expiresIn: 60 },
        );
    const post = (route, body, token, headers = {}) =>
        fetch(url + route, {
            method: 'POST',
            body,
            headers: {
                'content-type': 'application/json',
                ...(token ? { Authorization: 'Bearer ' + token } : {}),
                ...headers,
            },
        });
    return { state, url, api, browser, post };
}
function rejectedHeaders(url, headers, token = '') {
    return new Promise((resolve, reject) => {
        const request = http.request(
            url + '/api/users',
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    Authorization: 'Bearer ' + token,
                    ...headers,
                },
                timeout: 2000,
            },
            (response) => {
                response.resume();
                response.on('end', () =>
                    resolve({
                        status: response.statusCode,
                        connection: response.headers.connection,
                    }),
                );
                response.on('error', reject);
            },
        );
        request.on('error', reject);
        request.on('timeout', () =>
            request.destroy(new Error('Server waited for unauthorized body')),
        );
        request.flushHeaders();
    });
}
test('unauthenticated and revoked credentials are rejected before malformed or large JSON is parsed', async (t) => {
    const f = await fixture(t);
    for (const token of [
        '',
        jwt.sign({ uuid: 'bad', role: 'API' }, 'wrong-key'),
        jwt.sign({ uuid: 'old', role: 'API', exp: 1 }, secret),
    ]) {
        const response = await f.post('/api/users', '{invalid', token);
        assert.equal(response.status, 401);
        await response.arrayBuffer();
        const large = await rejectedHeaders(f.url, { 'content-length': 2 * 1024 * 1024 }, token);
        assert.deepEqual(large, { status: 401, connection: 'close' });
    }
    f.state.active = false;
    const revoked = await f.post('/api/users', '{invalid', f.api());
    assert.equal(revoked.status, 403);
    await revoked.arrayBuffer();
    assert.equal(f.state.parsed, 0);
});
test('signed tokens without expiry or explicit permanent state do not unlock parsing', async (t) => {
    const f = await fixture(t);
    for (const payload of [
        { uuid: 'api', role: 'API' },
        { uuid: 'admin', role: 'ADMIN' },
        { uuid: '', role: 'API', permanent: true },
    ]) {
        const response = await f.post('/api/users', '{invalid', jwt.sign(payload, secret));
        assert.equal(response.status, 401);
        await response.arrayBuffer();
    }
});
test('valid permanent API and current browser sessions retain large JSON and current scopes', async (t) => {
    const f = await fixture(t);
    const size = 2 * 1024 * 1024;
    f.state.scopes = ['users:read'];
    for (const [token, headers] of [
        [f.api(), {}],
        [f.browser(), { 'X-Remnawave-Client-Type': 'browser' }],
    ]) {
        const response = await f.post(
            '/api/users',
            JSON.stringify({ data: 'x'.repeat(size) }),
            token,
            headers,
        );
        assert.equal(response.status, 200);
        assert.equal((await response.json()).bytes, size);
    }
    const current = await f.post('/api/users', '{}', f.api());
    assert.deepEqual((await current.json()).scopes, ['users:read']);
    f.state.sessionActive = false;
    const loggedOut = await f.post('/api/users', '{invalid', f.browser(), {
        'X-Remnawave-Client-Type': 'browser',
    });
    assert.equal(loggedOut.status, 401);
    await loggedOut.arrayBuffer();
    f.state.expireAt = new Date(0);
    const expired = await f.post('/api/users', '{invalid', f.api());
    assert.equal(expired.status, 403);
    await expired.arrayBuffer();
});
test('public authentication is bounded, subscription bodies are refused, gateway keeps its authenticated small budget', async (t) => {
    const f = await fixture(t);
    for (const [route, body, token, status] of [
        ['/api/auth/login', '{}', '', 200],
        ['/API/AUTH/login', JSON.stringify({ data: 'x'.repeat(65536) }), '', 413],
        ['/api/sub/example', '{}', '', 413],
        ['/api/sub/domains/access', '{}', f.api(), 200],
        ['/api/sub/domains/access', JSON.stringify({ data: 'x'.repeat(16384) }), f.api(), 413],
        ['/api/subscriptions', '{invalid', '', 401],
        ['/api/authenticated', '{invalid', '', 401],
    ]) {
        const response = await f.post(route, body, token);
        assert.equal(response.status, status, route);
        await response.arrayBuffer();
    }
    assert.equal((await fetch(f.url + '/api/sub/example')).status, 200);
});
test('compressed JSON is refused before inflation even for signed requests', async (t) => {
    const f = await fixture(t);
    const body = gzipSync(JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024) }));
    for (const [route, token] of [
        ['/api/auth/login', ''],
        ['/api/users', f.api()],
    ]) {
        const response = await f.post(route, body, token, { 'content-encoding': 'gzip' });
        assert.equal(response.status, 415);
        await response.arrayBuffer();
    }
});
test('large and chunked unauthorized requests receive a response without supplying the body', async (t) => {
    const f = await fixture(t);
    for (const headers of [
        { 'content-length': 2 * 1024 * 1024 },
        { 'transfer-encoding': 'chunked' },
    ]) {
        assert.deepEqual(await rejectedHeaders(f.url, headers), {
            status: 401,
            connection: 'close',
        });
    }
});
test('an authentication dependency failure fails closed before parsing without exposing private details', async (t) => {
    const f = await fixture(t);
    f.state.failQuery = true;
    const response = await f.post('/api/users', '{invalid', f.api());
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes('private fixture'));
    assert.equal(f.state.parsed, 0);
});
test('revocation while a permitted large body is arriving is checked again before executing the handler', async (t) => {
    const f = await fixture(t);
    const body = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024) });
    let request;
    const result = new Promise((resolve, reject) => {
        request = http.request(
            f.url + '/api/users',
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(body),
                    Authorization: 'Bearer ' + f.api(),
                },
                timeout: 5000,
            },
            (response) => {
                response.resume();
                response.on('end', () => resolve(response.statusCode));
                response.on('error', reject);
            },
        );
        request.on('error', reject);
        request.on('timeout', () =>
            request.destroy(new Error('Body authentication test timed out')),
        );
        request.flushHeaders();
    });
    const deadline = Date.now() + 1500;
    while (!f.state.queryCount && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(f.state.queryCount, 1);
    f.state.active = false;
    request.end(body);
    assert.equal(await result, 403);
    assert.equal(f.state.queryCount, 2);
});
