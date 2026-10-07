const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const load = require('./load-typescript.cjs');
const frontend = path.resolve(__dirname, '../../frontend/src/shared/api');
const { ApiResponseError, parseApiResponse } = load(path.join(frontend, 'api-response.ts'));

test('opening an existing host restores every policy field and keeps its port override', () => {
    const ts = require('typescript');
    const file = path.resolve(frontend, '../_modals/hosts/edit-host-modal/edit-host.modal.content.tsx');
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let initializer, inboundWatcher;
    function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 'form.initialize') initializer = node.arguments[0].getText(source);
        if (ts.isCallExpression(node) && node.expression.getText(source) === 'form.watch' && node.arguments[0].text === 'inbound.configProfileInboundUuid') inboundWatcher = node.arguments[1].getText(source);
        ts.forEachChild(node, visit);
    }
    visit(source);
    const host = { uuid: 'host', port: 8443, inbound: { configProfileUuid: 'profile', configProfileInboundUuid: 'original' }, userTrafficLimitBytes: 123456789, serverSpeedLimitMbps: 2, totalSpeedLimitMbps: 20, trafficMultiplier: 2.5, useTagTrafficLimit: false, useTagSpeedLimit: false, useTagTotalSpeedLimit: true, speedLimitMbps: 7, domainRules: { mode: 'ALLOW_ONLY', domains: ['t.me'] }, sniRegeneration: { enabled: true, intervalHours: 24 } };
    const restored = new Function('host', 'stringifyJsonField', `return (${initializer})`)(host, value => value);
    for (const field of ['port', 'userTrafficLimitBytes', 'serverSpeedLimitMbps', 'totalSpeedLimitMbps', 'trafficMultiplier', 'useTagTrafficLimit', 'useTagSpeedLimit', 'useTagTotalSpeedLimit', 'speedLimitMbps', 'domainRules', 'sniRegeneration']) assert.deepEqual(restored[field], host[field], field);
    const changes = [];
    const watcher = new Function('form', 'configProfiles', `return (${inboundWatcher})`)(
        { getValues: () => restored, setFieldValue: (...args) => changes.push(args) },
        { configProfiles: [{ uuid: 'profile', inbounds: [{ uuid: 'original', port: 443 }, { uuid: 'new', port: 9443 }] }] },
    );
    watcher({ value: 'original', previousValue: undefined });
    assert.deepEqual(changes, []);
    watcher({ value: 'new', previousValue: 'original' });
    assert.deepEqual(changes, [['port', 9443]]);
});

test('API parser rejects HTML, truncated JSON and primitive payloads without exposing their contents', () => {
    assert.deepEqual(parseApiResponse('{"response":[]}'), { response: [] });
    for (const data of ['<html>secret proxy details</html>', '{"response":', 'null', '"text"', null, 42]) {
        assert.throws(() => parseApiResponse(data), ApiResponseError);
    }
});

test('only reads retry transient responses; writes, forbidden responses and downloads are preserved', async () => {
    global.window = { location: { origin: 'http://localhost' } };
    global.__DOMAIN_BACKEND__ = 'http://localhost';
    global.__NODE_ENV__ = 'test';
    global.__DOMAIN_OVERRIDE__ = '0';
    let logouts = 0;
    const { instance, setAuthorizationToken } = load(path.join(frontend, 'axios.ts'), {
        '@remnawave/backend-contract': {},
        '../emitters/emit-logout': { logoutEvents: { emit: () => logouts++ } },
        './api-response': { ApiResponseError, parseApiResponse },
    });
    const axios = require('axios');
    setAuthorizationToken('fixture-active-session');
    let calls = 0;
    instance.defaults.adapter = async config => {
        calls++;
        if (config.url === '/forbidden' || config.url === '/unauthorized') {
            const status = config.url === '/forbidden' ? 403 : 401;
            throw new axios.AxiosError('Denied', 'ERR_BAD_REQUEST', config, null, { status, data: {} });
        }
        return { config, status: 200, headers: {}, data: config.url === '/recover' && calls > 1 ? { response: [] } : '<html>Unavailable</html>' };
    };
    assert.deepEqual((await instance.get('/recover')).data, { response: [] });
    assert.equal(calls, 2);
    calls = 0;
    await assert.rejects(instance.post('/write'), ApiResponseError);
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(instance.get('/unavailable'), ApiResponseError);
    assert.equal(calls, 3);
    await assert.rejects(instance.get('/forbidden'));
    assert.equal(logouts, 0);
    await assert.rejects(instance.get('/unauthorized'));
    assert.equal(logouts, 1);
    assert.equal((await instance.get('/download', { responseType: 'blob' })).data, '<html>Unavailable</html>');
});

test('host availability changes validate policy without restarting profile nodes', async () => {
    const filename = path.join(__dirname, '../src/modules/hosts/hosts.service.ts');
    const mocks = {};
    for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
        if (match[1] !== '@nestjs/common' && match[1] !== 'node:crypto') mocks[match[1]] = {};
    }
    mocks['@nestjs-cls/transactional'] = { Transactional: () => () => {} };
    const { HostsService } = load(filename, mocks);
    let restarts = 0, validations = 0, synchronizations = 0;
    const host = { uuid: 'host', configProfileUuid: 'profile', configProfileInboundUuid: 'inbound', tags: [], nodes: [], internalSquads: [], alwaysAvailable: true };
    const service = new HostsService(
        { findAll: async () => [{ ...host, onlyWhenInactive: true }] },
        { list: async () => [] }, {},
        { findByCriteria: async () => [{ uuid: 'node', activeConfigProfileUuid: 'profile' }] },
        { startNode: async () => restarts++ }, {}, {},
        { syncConnected: async () => synchronizations++ },
    );
    service.validatePolicyState = async () => validations++;
    await service.syncExceptionPolicy([host]);
    assert.equal(validations, 1);
    assert.equal(restarts, 0);
    assert.equal(synchronizations, 0, 'do not send uncommitted database state to nodes');
    await service.synchronizeCommittedPolicies();
    assert.equal(synchronizations, 1);
});
