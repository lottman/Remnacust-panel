require('reflect-metadata');
const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { Reflector } = require('@nestjs/core');
const { EventEmitter } = require('node:events');
const { createHmac } = require('node:crypto');
const load = require('./load-typescript.cjs');
const base = path.join(__dirname, '../src');
const ROLE = { ADMIN: 'ADMIN', API: 'API' };
const exception = load(path.join(base, 'common/exception/http-exeception-with-error-code.type.ts'));
const constants = { ROLE };
const { PanelUpdateInterceptor } = load(
    path.join(base, 'modules/system/interceptors/panel-update.interceptor.ts'),
    {
        '@libs/contracts/constants': constants,
        '@common/exception/http-exeception-with-error-code.type': exception,
        '../panel-update.service': {},
    },
);
const context = (role, route) => ({
    getType: () => 'http',
    switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined, path: route }),
    }),
});
test('maintenance blocks admin operations with the error code used by the real exception filters', async () => {
    const interceptor = new PanelUpdateInterceptor({ isActive: async () => true });
    let handled = 0;
    const next = { handle: () => ++handled };
    await assert.rejects(
        interceptor.intercept(context(ROLE.ADMIN, '/api/users'), next),
        (error) => error.getStatus() === 503 && error.errorCode === 'PANEL_UPDATING',
    );
    assert.equal(handled, 0);
    for (const route of [
        '/api/system/update/status',
        '/api/system/update/start/',
        '/api/system/metadata',
    ])
        await interceptor.intercept(context(ROLE.ADMIN, route), next);
    for (const role of [ROLE.API, null])
        await interceptor.intercept(context(role, '/api/subscription/test'), next);
    assert.equal(handled, 5);
    await new PanelUpdateInterceptor({ isActive: async () => false }).intercept(
        context(ROLE.ADMIN, '/api/users'),
        next,
    );
    assert.equal(handled, 6);
});

test('update endpoints are panel-only and reject API-token roles and untrusted input', async () => {
    const roles = load(path.join(base, 'common/decorators/roles/roles.ts'), {
        '@libs/contracts/constants': constants,
    });
    const adminOnly = load(path.join(base, 'common/decorators/admin-only-endpoint.ts'), {
        '@common/decorators/roles/roles': roles,
        '@common/decorators/scopes': { SCOPE_ENDPOINT: 'scope' },
        '@libs/contracts/constants': constants,
    });
    const { PanelUpdateController } = load(
        path.join(base, 'modules/system/panel-update.controller.ts'),
        {
            '@common/decorators/admin-only-endpoint': adminOnly,
            '@common/decorators/roles/roles': roles,
            '@common/guards/jwt-guards/def-jwt-guard': { JwtDefaultGuard: class {} },
            '@common/guards/roles': { RolesGuard: class {} },
            '@libs/contracts/constants': constants,
            './panel-update.service': {},
        },
    );
    const { RolesGuard } = load(path.join(base, 'common/guards/roles/roles.guard.ts'), {
        '@common/decorators/admin-only-endpoint': adminOnly,
        '@common/exception/http-exeception-with-error-code.type': exception,
        '@libs/contracts/constants': {
            ...constants,
            ERRORS: { FORBIDDEN_ROLE_ERROR: { message: 'Forbidden', code: 'E403', httpCode: 403 } },
        },
    });
    const guard = new RolesGuard(new Reflector());
    for (const method of ['status', 'start']) {
        const requestContext = (role) => ({
            ...context(role, '/api/system/update/' + method),
            getHandler: () => PanelUpdateController.prototype[method],
            getClass: () => PanelUpdateController,
        });
        assert.equal(guard.canActivate(requestContext(ROLE.ADMIN)), true);
        assert.throws(() => guard.canActivate(requestContext(ROLE.API)));
        assert.throws(() => guard.canActivate(requestContext(null)));
    }
    let starts = 0;
    const controller = new PanelUpdateController({
        start: async () => {
            starts++;
            return { jobId: 'test' };
        },
    });
    const valid = { targetVersion: '1.1.7.5', requestId: '55632671-6aa0-45db-aacb-92be57ce7e73' };
    for (const body of [
        {},
        { ...valid, targetVersion: 'latest;id' },
        { ...valid, command: 'reboot' },
        { ...valid, requestId: '../job' },
    ])
        await assert.rejects(controller.start(body));
    assert.equal(starts, 0);
    await controller.start(valid);
    assert.equal(starts, 1);
});

test('the update service authenticates on its private socket and does not cache stale idle state over an accepted job', async () => {
    const secret = 's'.repeat(64);
    const idle = {
        available: true,
        installedVersion: '1.1.7.4',
        active: false,
        phase: 'idle',
        jobId: null,
        targetVersion: null,
        error: null,
    };
    const active = {
        ...idle,
        active: true,
        phase: 'queued',
        jobId: '55632671-6aa0-45db-aacb-92be57ce7e73',
        targetVersion: '1.1.7.5',
    };
    const calls = [];
    const { PanelUpdateService } = load(path.join(base, 'modules/system/panel-update.service.ts'), {
        '@common/config/app-config': {},
        'node:fs/promises': { readFile: async () => JSON.stringify(active) },
        'node:http': {
            request: (options, callback) => {
                const req = new EventEmitter();
                req.setTimeout = () => {};
                req.end = (body) =>
                    calls.push({
                        options,
                        body,
                        respond: (state) => {
                            const res = new EventEmitter();
                            res.statusCode = options.method === 'POST' ? 202 : 200;
                            callback(res);
                            res.emit('data', Buffer.from(JSON.stringify(state)));
                            res.emit('end');
                        },
                    });
                return req;
            },
        },
    });
    const service = new PanelUpdateService({ getOrThrow: () => secret });
    const pendingStatus = service.status();
    const pendingStart = service.start({
        targetVersion: active.targetVersion,
        requestId: active.jobId,
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.socketPath, '/run/remnacust-control/update.sock');
    assert.equal(
        calls[1].options.headers.Authorization,
        'Bearer ' + createHmac('sha256', secret).update('remnacust-panel-update-v1').digest('hex'),
    );
    assert.deepEqual(JSON.parse(calls[1].body), {
        targetVersion: active.targetVersion,
        requestId: active.jobId,
    });
    calls[1].respond(active);
    assert.equal((await pendingStart).active, true);
    calls[0].respond(idle);
    assert.equal((await pendingStatus).active, true);
    assert.equal(await service.isActive(), true);
});

test('host service failure preserves a maintenance lock from the mounted state file', async () => {
    const locked = {
        active: true,
        phase: 'updating',
        jobId: '55632671-6aa0-45db-aacb-92be57ce7e73',
        targetVersion: '1.1.7.5',
        error: null,
    };
    const { PanelUpdateService } = load(path.join(base, 'modules/system/panel-update.service.ts'), {
        '@common/config/app-config': {},
        'node:fs/promises': { readFile: async () => JSON.stringify(locked) },
        'node:http': {
            request: () => {
                const req = new EventEmitter();
                req.setTimeout = () => {};
                req.end = () =>
                    queueMicrotask(() => req.emit('error', Error('private host details')));
                return req;
            },
        },
    });
    const service = new PanelUpdateService({ getOrThrow: () => 's'.repeat(64) });
    const state = await service.status();
    assert.equal(state.available, false);
    assert.equal(state.active, true);
    assert.equal(await service.isActive(), true);
    await assert.rejects(
        service.start({ targetVersion: '1.1.7.5', requestId: locked.jobId }),
        (error) => error.getStatus() === 503 && !error.message.includes('private'),
    );
});
