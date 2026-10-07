const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const load = require('./load-typescript.cjs');
const nest = require('@nestjs/common');
const root = path.join(__dirname, '..');

function loadAuth() {
    const filename = path.join(root, 'src/modules/auth/auth.service.ts');
    const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const mocks = {};
    for (const node of ast.statements) {
        if (ts.isImportDeclaration(node) && !node.moduleSpecifier.text.startsWith('node:')) {
            mocks[node.moduleSpecifier.text] = {};
        }
    }
    mocks['@nestjs/common'] = nest;
    mocks['@libs/contracts/constants'] = {
        ROLE: { ADMIN: 'ADMIN' }, EVENTS: { SERVICE: { LOGIN_ATTEMPT_FAILED: 'failed' } },
    };
    mocks['@libs/contracts/constants/errors'] = { ERRORS: { FORBIDDEN: {}, LOGIN_ERROR: {} } };
    mocks['@common/types'] = { fail: (error) => ({ isOk: false, error }) };
    mocks['@integration-modules/notifications/interfaces'] = {
        ServiceEvent: class { constructor(eventName, data) { Object.assign(this, { eventName, data }); } },
    };
    return load(filename, mocks).AuthService;
}

test('a failed password login never publishes the submitted password', async () => {
    const events = [];
    const service = Object.create(loadAuth().prototype);
    service.logger = { error() {} };
    service.getStatus = async () => ({ isOk: true, response: { isLoginAllowed: false } });
    service.eventEmitter = { emit: (...event) => events.push(event) };
    const secret = 'Sensitive-input-must-not-leave-login-123';
    assert.equal((await service.login({ username: 'admin', password: secret }, '127.0.0.1', 'test')).isOk, false);
    assert.equal(events.length, 1);
    assert.equal(JSON.stringify(events).includes(secret), false);
    assert.equal(Object.hasOwn(events[0][1].data.loginAttempt, 'password'), false);
});

const { AuthRateLimitGuard } = load(path.join(root, 'src/modules/auth/auth-rate-limit.guard.ts'), {
    '@common/raw-cache': {},
});
function request(username = 'admin', method = 'POST', path = '') {
    const headers = {};
    return {
        headers,
        switchToHttp: () => ({
            getRequest: () => ({ method, path, body: { username }, socket: { remoteAddress: '127.0.0.1' } }),
            getResponse: () => ({ setHeader: (name, value) => { headers[name] = value; } }),
        }),
    };
}
test('concurrent attempts across API instances share one identity limit', async () => {
    const counters = new Map();
    const cache = { incrementWithTtl: async (key) => {
        const count = (counters.get(key) ?? 0) + 1; counters.set(key, count); return count;
    } };
    const guards = [new AuthRateLimitGuard(cache), new AuthRateLimitGuard(cache)];
    const results = await Promise.allSettled(Array.from({ length: 50 }, (_, i) => guards[i % 2].canActivate(request())));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 15);
    for (const r of results.filter((r) => r.status === 'rejected')) assert.equal(r.reason.getStatus(), 429);
});

test('GET and HEAD cannot bypass limits when issuing passkey challenges', async () => {
    const guard = new AuthRateLimitGuard({ incrementWithTtl: async () => 121 });
    for (const method of ['GET', 'HEAD']) {
        await assert.rejects(guard.canActivate(request(undefined, method, '/api/auth/passkey/authentication/options/')),
            error => error.getStatus() === 429);
    }
    assert.equal(await guard.canActivate(request(undefined, 'GET', '/api/auth/status')), true);
});
test('rotating usernames cannot bypass the global limit; Redis failure fails closed', async () => {
    let total = 0;
    const guard = new AuthRateLimitGuard({ incrementWithTtl: async (key) => key.endsWith(':global') ? ++total : 1 });
    for (let i = 0; i < 120; i++) assert.equal(await guard.canActivate(request(`user-${i}`)), true);
    const context = request('another');
    await assert.rejects(guard.canActivate(context), (e) => e.getStatus() === 429);
    assert.equal(context.headers['Retry-After'], '60');
    const unavailable = new AuthRateLimitGuard({ incrementWithTtl: async () => { throw new Error('Redis offline'); } });
    await assert.rejects(unavailable.canActivate(request()), (e) => e.getStatus() === 503);
    assert.equal(await unavailable.canActivate(request('', 'GET')), true);
});

test('first-admin registration serializes competing requests before checking existence', async () => {
    const { AdminRepository } = load(path.join(root, 'src/modules/admin/repositories/admin.repository.ts'), {
        '@nestjs-cls/transactional': { Transactional: () => () => {} },
    });
    let lock = Promise.resolve();
    const rows = [];
    const register = async (username) => {
        let release;
        const repository = new AdminRepository({ tx: {
            $executeRaw: async () => { const prior = lock; lock = new Promise((r) => { release = r; }); await prior; },
            admin: {
                count: async () => rows.length,
                create: async ({ data }) => { await new Promise(setImmediate); rows.push(data); return data; },
            },
        } }, { fromEntityToPrismaModel: (e) => e, fromPrismaModelToEntity: (e) => e });
        try { return await repository.createInitialAdmin({ username, role: 'ADMIN' }); }
        finally { release?.(); }
    };
    const result = await Promise.allSettled([register('owner'), register('racing-account')]);
    assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(rows.length, 1);
    assert.equal(result.find((r) => r.status === 'rejected').reason.message, 'Initial administrator already exists');
});

test('untrusted login text cannot inject Telegram markup', () => {
    const constants = { EVENTS: { SERVICE: Object.fromEntries(['PANEL_STARTED','LOGIN_ATTEMPT_FAILED','LOGIN_ATTEMPT_SUCCESS','SUBPAGE_CONFIG_CHANGED','API_TOKEN_CREATED','API_TOKEN_DELETED'].map((s) => [s, s])), ERRORS: { BANDWIDTH_USAGE_THRESHOLD_REACHED_MAX_NOTIFICATIONS: 'bandwidth' } } };
    const { SERVICE_EVENTS_TEMPLATES } = load(path.join(root, 'src/integration-modules/notifications/telegram-bot/events/service/service.events.templates.ts'), { '@libs/contracts/constants': constants });
    const message = SERVICE_EVENTS_TEMPLATES.LOGIN_ATTEMPT_FAILED({ data: { loginAttempt: { username: '<a href="evil">login</a>', userAgent: '</code><b>fake</b>', ip: '127.0.0.1' } } }).message;
    assert.ok(message.includes('&lt;/code&gt;&lt;b&gt;fake&lt;/b&gt;'));
    assert.equal(message.includes('<a href="evil">'), false);
    assert.equal(message.includes('Password:'), false);
});
