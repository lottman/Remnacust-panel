const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { INTERCEPTORS_METADATA } = require('@nestjs/common/constants');
const { firstValueFrom, of, throwError } = require('rxjs');
const load = require('./load-typescript.cjs');
const fixture = require('./api-permissions-fixture.cjs');
const contract = require('../libs/contract/build/backend');
const root = path.resolve(__dirname, '..');
const { NodeResponseModel } = load(path.join(root, 'src/modules/nodes/models/node.response.model.ts'), {
    '@common/utils/nano': { fromNanoToNumber: Number },
});
const { NodeResponseInterceptor } = load(path.join(root, 'src/modules/nodes/models/node-response.interceptor.ts'), {
    '@libs/contracts/constants': contract,
    './node.response.model': { NodeResponseModel },
});
const controllerFile = path.join(root, 'src/modules/nodes/nodes.controller.ts');
const stub = new Proxy({}, { get: (_, key) => key === '__esModule' ? true : function Stub() { return () => {}; } });
const mocks = {};
for (const match of fs.readFileSync(controllerFile, 'utf8').matchAll(/from '([^']+)'/g)) {
    if (!match[1].startsWith('@nestjs/')) mocks[match[1]] = stub;
}
for (const [id, file] of Object.entries({
    '@common/decorators/admin-only-endpoint': 'src/common/decorators/admin-only-endpoint.ts',
    '@common/decorators/base-endpoint': 'src/common/decorators/base-endpoint/base-endpoint.ts',
    '@common/decorators/roles/roles': 'src/common/decorators/roles/roles.ts',
    '@common/decorators/scopes': 'src/common/decorators/scopes/scopes.ts',
})) mocks[id] = fixture.load(file);
Object.assign(mocks, {
    '@contract/api': contract,
    '@contract/constants': contract,
    '@libs/contracts/constants': contract,
    '@libs/contracts/commands': contract,
    '@common/helpers/error-handler.helper': { errorHandler: result => {
        if (!result.isOk) throw new Error('Request failed');
        return result.response;
    } },
    './models/node-response.interceptor': { NodeResponseInterceptor },
});
const { NodesController } = load(controllerFile, mocks);
const interceptor = new NodeResponseInterceptor();
const context = user => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) });
const apply = (body, user) => firstValueFrom(interceptor.intercept(context(user), { handle: () => of(body) }));
const uuid = '11111111-1111-4111-8111-111111111111';
function nodeResponse() {
    const inbound = Object.freeze({
        uuid, profileUuid: uuid, tag: 'fixture', type: 'vless', network: 'tcp', security: 'reality', port: 443,
        rawInbound: Object.freeze({ streamSettings: { realitySettings: { privateKey: 'synthetic-private-key' } } }),
    });
    const node = new NodeResponseModel({
        uuid, id: 1n, name: 'Fixture', address: '192.0.2.1', port: 443, proxyUrl: 'socks5://fixture-user:synthetic-secret@proxy.example:1080',
        isConnected: true, isConnecting: false, isDisabled: false, lastStatusChange: null, lastStatusMessage: null,
        isTrafficTrackingActive: false, trafficResetDay: null, trafficLimitBytes: 0n, trafficUsedBytes: 0n,
        notifyPercent: null, note: null, consumptionMultiplier: 1n, nodeConsumptionMultiplier: 1n,
        tags: [], integrationUuids: [], ips: [], createdAt: new Date(0), updatedAt: new Date(0),
        viewPosition: 0, countryCode: 'US', activeConfigProfileUuid: uuid, activeInbounds: [inbound],
        providerUuid: null, provider: null, activePluginUuid: null,
    }, { system: null, onlineUsers: 0, versions: null, xrayUptime: 0 });
    Object.freeze(node.configProfile.activeInbounds);
    Object.freeze(node.configProfile);
    return Object.freeze(node);
}
const routes = [
    ['getNode', 'getOneNode', [{ uuid }], false, 'GetNodeCommand'],
    ['getNodes', 'getAllNodes', [], true, 'GetNodesCommand'],
    ['createNode', 'createNode', [{}], false, 'CreateNodeCommand'],
    ['updateNode', 'updateNode', [{ uuid }], false, 'UpdateNodeCommand'],
    ['enableNode', 'enableNode', [{ uuid }], false, 'EnableNodeCommand'],
    ['disableNode', 'disableNode', [{ uuid }], false, 'DisableNodeCommand'],
    ['reorderNodes', 'reorderNodes', [{ uuids: [uuid] }], true, 'ReorderNodesCommand'],
];
test('the actual nodes controller binds the response interceptor', () => {
    assert.ok(Reflect.getMetadata(INTERCEPTORS_METADATA, NodesController).includes(NodeResponseInterceptor));
});
for (const [method, serviceMethod, args, list, command] of routes) {
    test(`${method} redacts API inbound configuration and preserves the administrator response and contract`, async () => {
        const source = nodeResponse();
        const controller = new NodesController({ [serviceMethod]: async () => ({ isOk: true, response: list ? [source] : source }) });
        const body = await controller[method](...args);
        const endpoint = { controller: NodesController, handler: NodesController.prototype[method] };
        const scope = fixture.catalog.getCatalog().find(entry => entry.key === `nodes:${contract[command].endpointDetails.SCOPE}`).key;
        assert.equal(fixture.authorize(endpoint, contract.ROLE.API, [scope]), true);
        for (const scopes of [[scope], ['nodes:read'], ['*']]) {
            const result = await apply(body, { role: contract.ROLE.API, scopes });
            const node = list ? result.response[0] : result.response;
            assert.equal(node.configProfile.activeInbounds[0].rawInbound, null);
            assert.equal(node.configProfile.activeInbounds[0].tag, 'fixture');
            assert.equal(node.configProfile.activeInbounds[0].uuid, uuid);
            assert.ok(!JSON.stringify(result).includes('synthetic-private-key'));
            assert.equal(contract[command].ResponseSchema.safeParse(JSON.parse(JSON.stringify(result))).success, true);
        }
        const admin = await apply(body, { role: contract.ROLE.ADMIN });
        assert.equal(admin, body);
        assert.equal((list ? admin.response[0] : admin.response), source);
        assert.equal(contract[command].ResponseSchema.safeParse(JSON.parse(JSON.stringify(admin))).success, true);
        assert.equal(source.configProfile.activeInbounds[0].rawInbound.streamSettings.realitySettings.privateKey, 'synthetic-private-key');
    });
}
test('unrecognized identities cannot obtain raw inbound configuration', async () => {
    for (const user of [undefined, {}, { role: 'unknown' }]) {
        const result = await apply({ response: nodeResponse() }, user);
        assert.equal(result.response.configProfile.activeInbounds[0].rawInbound, null);
        assert.equal(result.response.proxyUrl, null);
    }
});
test('API node responses redact proxy credentials without mutating the admin configuration', async () => {
    const source = nodeResponse();
    for (const body of [{ response: source }, { response: [source] }]) {
        const result = await apply(body, { role: contract.ROLE.API });
        assert.doesNotMatch(JSON.stringify(result), /fixture-user|synthetic-secret|proxy\.example/);
        const sanitized = Array.isArray(result.response) ? result.response[0] : result.response;
        assert.equal(sanitized.proxyUrl, null);
    }
    assert.equal((await apply({ response: source }, { role: contract.ROLE.ADMIN })).response.proxyUrl,
        'socks5://fixture-user:synthetic-secret@proxy.example:1080');
    assert.equal(source.proxyUrl, 'socks5://fixture-user:synthetic-secret@proxy.example:1080');
});
test('unrelated payloads, empty lists, no-content responses and handler errors retain their behavior', async () => {
    for (const body of [undefined, null, { response: [] }, { response: { tags: ['fixture'] } }]) {
        assert.deepEqual(await apply(body, { role: contract.ROLE.API }), body);
    }
    const error = new Error('upstream failed');
    await assert.rejects(firstValueFrom(interceptor.intercept(context({ role: contract.ROLE.API }), {
        handle: () => throwError(() => error),
    })), candidate => candidate === error);
});
