const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const contract = require('../libs/contract/build/backend');
const nodeContract = require('@remnawave/node-contract');
const root = path.resolve(__dirname, '..');
const controls = load(path.join(root, 'src/modules/nodes/node-control-addresses.ts'));
const { NodeResponseModel } = load(
    path.join(root, 'src/modules/nodes/models/node.response.model.ts'),
    { '@common/utils/nano': { fromNanoToNumber: (value) => Number(value) / 1e9 } },
);
const { NodeIpInventoryService } = load(
    path.join(root, 'src/modules/nodes/node-ip-inventory.service.ts'),
    {
        '@contract/constants': contract,
        '@remnawave/node-contract': nodeContract,
        '@common/axios': {},
        '@common/types': {
            ok: (response) => ({ isOk: true, response }),
            fail: (error) => ({ isOk: false, ...error }),
        },
        './entities': {},
        './models': { NodeResponseModel },
        './node-control-addresses': controls,
        './nodes-system-cache.service': {},
        './repositories/nodes.repository': {},
        '../constants/nodes/ip-statuses': load(
            path.join(
                root,
                'libs/contract/constants/nodes/ip-statuses/node-ip-statuses.constant.ts',
            ),
        ),
    },
);
const uuid = '11111111-1111-4111-8111-111111111111';
const revision = '22222222-2222-4222-8222-222222222222';
const nextRevision = '33333333-3333-4333-8333-333333333333';
const scanRevision = '44444444-4444-4444-8444-444444444444';
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
function fixture() {
    const node = {
        uuid,
        id: 1n,
        name: 'Fixture',
        address: 'node.example.test',
        port: 7289,
        proxyUrl: null,
        controlRevision: revision,
        controlAddresses: [{ address: 'node.example.test', enabled: true }],
        isConnected: true,
        isConnecting: false,
        isDisabled: false,
        ipInventory: null,
        ips: [],
        tags: [],
        integrationUuids: [],
        activeInbounds: [],
        activeConfigProfileUuid: null,
        providerUuid: null,
        provider: null,
        activePluginUuid: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        lastStatusChange: null,
        lastStatusMessage: null,
        isTrafficTrackingActive: false,
        trafficResetDay: null,
        trafficLimitBytes: 0n,
        trafficUsedBytes: 0n,
        notifyPercent: null,
        note: null,
        viewPosition: 0,
        countryCode: 'XX',
        consumptionMultiplier: 1000000000n,
        nodeConsumptionMultiplier: 1000000000n,
    };
    const calls = { reads: 0, requests: 0, writes: [] };
    const repository = {
        findByUUID: async () => {
            calls.reads++;
            return structuredClone(node);
        },
        applyIpScan: async (input) => {
            calls.writes.push(input);
            return {
                ...structuredClone(node),
                controlRevision: nextRevision,
                ipInventory: {
                    addresses: [...input.addresses],
                    generatedAddresses: [],
                    revision: scanRevision,
                    scannedAt: new Date(),
                },
            };
        },
    };
    const axios = {
        getNodeNetworkAddresses: async (requestedNode, expectedRevision) => {
            assert.equal(requestedNode.uuid, node.uuid);
            assert.equal(expectedRevision, node.controlRevision);
            calls.requests++;
            return {
                isOk: true,
                response: { addresses: ['192.0.2.1', '2001:db8::1'], complete: true },
            };
        },
    };
    const cache = {
        getOne: async () => ({
            controlRevision: nextRevision,
            system: null,
            versions: null,
            xrayUptime: 0,
            onlineUsers: 0,
        }),
    };
    const service = new NodeIpInventoryService(repository, axios, cache);
    service.logger = { warn() {} };
    return { node, calls, repository, axios, cache, service };
}

test('manual rescan validates complete IPv4/IPv6 data and persists against both captured revisions', async () => {
    const f = fixture();
    f.node.ipInventory = {
        revision: scanRevision,
        scannedAt: new Date(0),
        addresses: [],
        generatedAddresses: [],
    };
    const result = await f.service.rescan(uuid, revision);
    assert.equal(result.isOk, true);
    assert(result.response instanceof NodeResponseModel);
    assert.equal(f.calls.requests, 1);
    assert.equal(f.calls.writes.length, 1);
    assert.deepEqual(f.calls.writes[0], {
        uuid,
        addresses: ['192.0.2.1', '2001:db8::1'],
        expectedControlRevision: revision,
        expectedScanRevision: scanRevision,
        mode: 'refresh',
    });
    assert.deepEqual(result.response.ipScan.addresses, ['192.0.2.1', '2001:db8::1']);
    assert.equal('generatedAddresses' in result.response.ipScan, false);
    assert.equal('ipInventory' in result.response, false);
});

test('disabled nodes and all-off management never dispatch a scan', async () => {
    for (const change of [
        (f) => {
            f.node.isDisabled = true;
        },
        (f) => {
            f.node.controlAddresses[0].enabled = false;
        },
    ]) {
        const f = fixture();
        change(f);
        assert.equal((await f.service.rescan(uuid, revision)).code, 'A270');
        assert.equal(f.calls.requests, 0);
        assert.equal(f.calls.writes.length, 0);
    }
});

test('stale UI revisions and deleted nodes are rejected before any node request', async () => {
    const f = fixture();
    assert.equal((await f.service.rescan(uuid, nextRevision)).code, 'A266');
    f.repository.findByUUID = async () => null;
    assert.equal((await f.service.rescan(uuid, revision)).code, 'A011');
    assert.equal(f.calls.requests, 0);
});

test('unsupported optional endpoints retain all saved addresses', async () => {
    for (const code of [
        'NODE_HTTP_404',
        'NODE_HTTP_405',
        'NODE_HTTP_501',
        'NODE_NETWORK_ADDRESSES_UNSUPPORTED',
    ]) {
        const f = fixture();
        f.axios.getNodeNetworkAddresses = async () => ({ isOk: false, code });
        assert.equal((await f.service.rescan(uuid, revision)).code, 'A268');
        assert.equal(f.calls.writes.length, 0);
    }
});

test('transport/auth/proxy failures and route backoff cannot clear the inventory', async () => {
    for (const [code, expected] of [
        ['NODE_PROXY_UNAVAILABLE', 'A267'],
        ['NODE_HTTP_401', 'A267'],
        ['ECONNRESET', 'A267'],
        ['CERT_HAS_EXPIRED', 'A267'],
        ['ETIMEDOUT', 'A267'],
        ['NODE_ROUTE_BUSY', 'A271'],
        ['NODE_ROUTE_DISABLED', 'A270'],
    ]) {
        const f = fixture();
        f.axios.getNodeNetworkAddresses = async () => ({ isOk: false, code });
        assert.equal((await f.service.rescan(uuid, revision)).code, expected);
        assert.equal(f.calls.writes.length, 0);
    }
});

test('malformed/incomplete/unsafe/oversized node inventories cannot reach persistence', async () => {
    for (const response of [
        {},
        { addresses: [], complete: false },
        { addresses: ['node.test'], complete: true },
        { addresses: ['127.0.0.1'], complete: true },
        { addresses: ['fe80::1'], complete: true },
        { addresses: Array(65).fill('192.0.2.1'), complete: true },
    ]) {
        const f = fixture();
        f.axios.getNodeNetworkAddresses = async () => ({ isOk: true, response });
        assert.equal((await f.service.rescan(uuid, revision)).code, 'A269');
        assert.equal(f.calls.writes.length, 0);
    }
});

test('a valid complete empty response is distinct from a failed or incomplete scan', async () => {
    const f = fixture();
    f.axios.getNodeNetworkAddresses = async () => ({
        isOk: true,
        response: { addresses: [], complete: true },
    });
    assert.equal((await f.service.rescan(uuid, revision)).isOk, true);
    assert.deepEqual(f.calls.writes[0].addresses, []);
});

test('a concurrent control edit or scan CAS conflict is reported without retrying the node RPC', async () => {
    const f = fixture();
    f.repository.applyIpScan = async () => {
        throw new controls.NodeControlRevisionConflictError();
    };
    assert.equal((await f.service.rescan(uuid, revision)).code, 'A266');
    assert.equal(f.calls.requests, 1);
});

test('one in-flight node scan is shared while each caller gets an independent response model', async () => {
    const f = fixture();
    const ready = deferred();
    f.axios.getNodeNetworkAddresses = async () => {
        f.calls.requests++;
        return ready.promise;
    };
    const pending = Array.from({ length: 8 }, () => f.service.rescan(uuid, revision));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.calls.requests, 1);
    ready.resolve({ isOk: true, response: { addresses: ['192.0.2.1'], complete: true } });
    const responses = await Promise.all(pending);
    assert.equal(f.calls.writes.length, 1);
    assert.equal(
        responses.every((result) => result.isOk),
        true,
    );
    assert.notEqual(responses[0].response, responses[1].response);
    responses[0].response.ipScan.addresses.push('192.0.2.2');
    assert.deepEqual(responses[1].response.ipScan.addresses, ['192.0.2.1']);
    assert.equal(f.service.pending.size, 0);
});

test('a rejected scan drains the pending entry and a later explicit attempt can recover', async () => {
    const f = fixture();
    f.axios.getNodeNetworkAddresses = async () => {
        f.calls.requests++;
        throw Error('synthetic failure');
    };
    assert.equal((await f.service.rescan(uuid, revision)).code, 'A267');
    assert.equal(f.service.pending.size, 0);
    f.axios.getNodeNetworkAddresses = async () => {
        f.calls.requests++;
        return { isOk: true, response: { addresses: [], complete: true } };
    };
    assert.equal((await f.service.rescan(uuid, revision)).isOk, true);
    assert.equal(f.calls.requests, 2);
});

test('a cache outage after a committed scan cannot become a false save failure', async () => {
    const f = fixture();
    f.cache.getOne = async () => {
        throw Error('cache offline');
    };
    assert.equal((await f.service.rescan(uuid, revision)).isOk, true);
    assert.equal(f.calls.writes.length, 1);
});

test('first authenticated telemetry schedules one complete authoritative address request', async () => {
    const f = fixture();
    assert.equal((await f.service.observe(uuid, revision)).isOk, true);
    assert.equal(f.calls.requests, 1);
    assert.equal(f.calls.writes[0].mode, 'scheduled');
    assert.deepEqual(f.calls.writes[0].addresses, ['192.0.2.1', '2001:db8::1']);
});

test('the persisted thirty-minute interval survives a new service instance and expires at its boundary', async (t) => {
    const now = Date.parse('2026-11-15T10:00:00.000Z');
    let clock = now;
    t.mock.method(Date, 'now', () => clock);
    const f = fixture();
    f.node.ipInventory = {
        revision: scanRevision,
        scannedAt: new Date(now - 20 * 60 * 1000),
        addresses: [],
        generatedAddresses: [],
    };
    assert.equal((await f.service.observe(uuid, revision)).response, null);
    const restarted = new NodeIpInventoryService(f.repository, f.axios, f.cache);
    assert.equal((await restarted.observe(uuid, revision)).response, null);
    assert.equal(f.calls.writes.length, 0);
    clock += 10 * 60 * 1000;
    assert.equal((await restarted.observe(uuid, revision)).isOk, true);
    assert.equal(f.calls.writes.length, 1);
    assert.equal(f.calls.writes[0].mode, 'scheduled');
    assert.equal(f.calls.requests, 1);
});

test('invalid or incomplete automatic endpoint replies cannot change the saved inventory', async () => {
    for (const response of [
        {},
        { complete: false, addresses: [] },
        { complete: true, addresses: ['127.0.0.1'] },
        { complete: true, addresses: ['https://node.test/'] },
        { complete: true, addresses: ['::1'] },
    ]) {
        const f = fixture();
        f.axios.getNodeNetworkAddresses = async () => ({ isOk: true, response });
        assert.equal((await f.service.observe(uuid, revision)).code, 'A269');
        assert.equal(f.calls.writes.length, 0);
        assert.equal(f.node.ipInventory, null);
    }
});

test('automatic unsupported scans back off while an explicit rescan can retry immediately', async (t) => {
    let now = Date.parse('2026-11-15T10:00:00.000Z');
    t.mock.method(Date, 'now', () => now);
    const f = fixture();
    f.axios.getNodeNetworkAddresses = async () => {
        f.calls.requests++;
        return { isOk: false, code: 'NODE_HTTP_404' };
    };
    assert.equal((await f.service.observe(uuid, revision)).code, 'A268');
    assert.equal((await f.service.observe(uuid, revision)).response, null);
    assert.equal(f.calls.requests, 1);
    assert.equal((await f.service.rescan(uuid, revision)).code, 'A268');
    assert.equal(f.calls.requests, 2);
    now += 30 * 60 * 1000;
    assert.equal((await f.service.observe(uuid, revision)).code, 'A268');
    assert.equal(f.calls.requests, 3);
    assert.equal(f.calls.writes.length, 0);
});

test('transient scan failures retry after one minute without advancing successful-scan state', async (t) => {
    let now = Date.parse('2026-11-15T10:00:00.000Z');
    t.mock.method(Date, 'now', () => now);
    const f = fixture();
    f.axios.getNodeNetworkAddresses = async () => {
        f.calls.requests++;
        return { isOk: false, code: 'NODE_HTTP_503' };
    };
    assert.equal((await f.service.observe(uuid, revision)).code, 'A267');
    now += 59_999;
    assert.equal((await f.service.observe(uuid, revision)).response, null);
    assert.equal(f.calls.requests, 1);
    now++;
    assert.equal((await f.service.observe(uuid, revision)).code, 'A267');
    assert.equal(f.calls.requests, 2);
    assert.equal(f.calls.writes.length, 0);
    assert.equal(f.node.ipInventory, null);
});

test('the actual rescan endpoint requires an explicit node write scope and rejects read-only or missing identities', () => {
    const permissions = require('./api-permissions-fixture.cjs');
    const endpoint = permissions.endpoints.find(
        (entry) => entry.url === '/api/nodes/{uuid}/actions/rescan-ips',
    );
    assert(endpoint, 'The actual controller must publish the documented rescan route');
    assert.equal(endpoint.method, 'POST');
    assert.equal(permissions.authorize(endpoint, contract.ROLE.ADMIN), true);
    for (const scopes of [['nodes:rescan-ips'], ['nodes:write'], ['nodes:*'], ['*']])
        assert.equal(
            permissions.authorize(endpoint, contract.ROLE.API, scopes),
            true,
            JSON.stringify(scopes),
        );
    for (const scopes of [[], ['nodes:read'], ['nodes:get'], ['users:write']])
        assert.equal(
            permissions.authorize(endpoint, contract.ROLE.API, scopes),
            false,
            JSON.stringify(scopes),
        );
    assert.equal(permissions.authorize(endpoint, 'unknown', ['*']), false);
    assert.equal(permissions.authorize(endpoint, undefined, ['*']), false);
});

test('the public request schema accepts only a current UUID and cannot accept an injected address list', () => {
    assert.equal(
        contract.RescanNodeIpsCommand.RequestBodySchema.safeParse({ controlRevision: 'bad' })
            .success,
        false,
    );
    assert.equal(
        contract.RescanNodeIpsCommand.RequestParamSchema.safeParse({ uuid: 'bad' }).success,
        false,
    );
    assert.deepEqual(
        contract.RescanNodeIpsCommand.RequestBodySchema.parse({
            controlRevision: revision,
            addresses: ['127.0.0.1'],
            generatedAddresses: ['192.0.2.1'],
            proxyUrl: 'socks5://attacker.test',
        }),
        { controlRevision: revision },
    );
});
