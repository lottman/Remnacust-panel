const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const { controlledRepository, after } = require('./node-ip-inventory-persistence.test.cjs');

const root = path.resolve(__dirname, '..');
const mocks = {
    '../constants/nodes/ip-statuses': load(
        path.join(root, 'libs/contract/constants/nodes/ip-statuses/node-ip-statuses.constant.ts'),
    ),
};
const { planNodeIpInventory } = load(
    path.join(root, 'src/modules/nodes/node-ip-inventory.ts'),
    mocks,
);
const { NodeIpInventoryService } = load(
    path.join(root, 'src/modules/nodes/node-ip-inventory.service.ts'),
    {
        ...mocks,
        '@contract/constants': require('../libs/contract/build/backend'),
        '@remnawave/node-contract': require('@remnawave/node-contract'),
        '@common/axios': {},
        '@common/types': {
            ok: (response) => ({ isOk: true, response }),
            fail: (error) => ({ isOk: false, ...error }),
        },
        './entities': {},
        './models': {},
        './nodes-system-cache.service': {},
        './repositories/nodes.repository': {},
    },
);

const before = () => ({
    address: 'node.example.test',
    controlAddresses: [
        { address: 'node.example.test', enabled: true },
        { address: '192.0.2.1', enabled: true },
        { address: '2001:db8::1', enabled: false },
        { address: '198.51.100.5', enabled: false },
    ],
    ips: [
        { ip: '192.0.2.1', status: 'INBOUND' },
        { ip: '2001:db8::1', status: 'OUTBOUND' },
        { ip: '198.51.100.5', status: 'RESERVE' },
    ],
    ipInventory: {
        addresses: ['192.0.2.1', '2001:db8::1'],
        generatedAddresses: ['2001:db8::1'],
    },
});

test('scheduled complete inventory removes detached confirmed IPv4 and retains manual NAT, DNS and surviving IPv6 settings', () => {
    const result = planNodeIpInventory(before(), ['2001:db8::1', '192.0.2.2'], 'scheduled');
    assert.deepEqual(result.controlAddresses, [
        { address: 'node.example.test', enabled: true },
        { address: '2001:db8::1', enabled: false },
        { address: '198.51.100.5', enabled: false },
        { address: '192.0.2.2', enabled: true },
    ]);
    assert.deepEqual(result.ips, [
        { ip: '2001:db8::1', status: 'OUTBOUND' },
        { ip: '198.51.100.5', status: 'RESERVE' },
        { ip: '192.0.2.2', status: 'INBOUND' },
    ]);
});

test('a configured literal IP becomes inventory-managed only after the node confirms it and disappears on a later full scan', () => {
    const node = before();
    node.ipInventory = null;
    const first = planNodeIpInventory(node, ['192.0.2.1'], 'scheduled');
    assert.ok(first.generatedAddresses.includes('192.0.2.1'));
    const second = planNodeIpInventory({ ...node, ...first, ipInventory: first }, [], 'refresh');
    assert.equal(
        second.controlAddresses.some((row) => row.address === '192.0.2.1'),
        false,
    );
    assert.ok(second.controlAddresses.some((row) => row.address === '198.51.100.5'));
    assert.ok(second.controlAddresses.some((row) => row.address === 'node.example.test'));
});

test('a complete empty inventory can remove a previously confirmed last route without reviving the legacy address', () => {
    const node = before();
    node.address = '192.0.2.1';
    node.controlAddresses = [{ address: '192.0.2.1', enabled: true }];
    node.ips = [{ ip: '192.0.2.1', status: 'INBOUND' }];
    node.ipInventory.generatedAddresses = [];
    const result = planNodeIpInventory(node, [], 'scheduled');
    assert.deepEqual(result.controlAddresses, []);
    assert.deepEqual(result.ips, []);
});

function serviceFixture() {
    const f = controlledRepository();
    let requests = 0;
    let response = { isOk: true, response: { complete: true, addresses: ['192.0.2.2'] } };
    const repository = {
        findByUUID: async () =>
            new f.NodesEntity({ ...f.snapshot().node, ipInventory: f.snapshot().inventory }),
        applyIpScan: (input) => f.repository.applyIpScan({ ...input, now: after(1_800_000) }),
    };
    const service = new NodeIpInventoryService(
        repository,
        {
            getNodeNetworkAddresses: async () => {
                requests++;
                return response;
            },
        },
        {},
    );
    service.logger = { warn() {} };
    return {
        ...f,
        service,
        get requests() {
            return requests;
        },
        set response(value) {
            response = value;
        },
    };
}

test('due automatic reconciliation uses the complete authenticated endpoint rather than the telemetry hint', async () => {
    const f = serviceFixture();
    await f.scan(['192.0.2.1'], { mode: 'initial' });
    const node = f.snapshot().node;
    const result = await f.service.observe(f.uuid, node.controlRevision);
    assert.equal(result.isOk, true);
    assert.equal(f.requests, 1);
    assert.deepEqual(f.snapshot().inventory.addresses, ['192.0.2.2']);
    assert.equal(
        f.snapshot().node.controlAddresses.some((row) => row.address === '192.0.2.1'),
        false,
    );
});

test('an incomplete endpoint response cannot retire any saved address or advance the successful scan time', async () => {
    const f = serviceFixture();
    await f.scan(['192.0.2.1'], { mode: 'initial' });
    const snapshot = f.snapshot();
    f.response = { isOk: true, response: { complete: false, addresses: [] } };
    const result = await f.service.observe(f.uuid, snapshot.node.controlRevision);
    assert.equal(result.isOk, false);
    assert.equal(result.code, 'A269');
    assert.deepEqual(f.snapshot(), snapshot);
});

test('an API-alive node can refresh a known inventory while Core telemetry is absent', async () => {
    const f = serviceFixture();
    await f.scan(['192.0.2.1'], { mode: 'initial' });
    const result = await f.service.observe(f.uuid, f.snapshot().node.controlRevision);
    assert.equal(result.isOk, true);
    assert.equal(f.requests, 1);
    assert.deepEqual(f.snapshot().inventory.addresses, ['192.0.2.2']);
});

test('the repository durable interval gates scheduled reconciliation even with a stale queued scan revision', async () => {
    const f = controlledRepository();
    const node = await f.scan(['192.0.2.1'], { mode: 'initial' });
    const snapshot = f.snapshot();
    await f.repository.applyIpScan({
        uuid: f.uuid,
        addresses: ['192.0.2.2'],
        expectedControlRevision: node.controlRevision,
        expectedScanRevision: node.ipInventory.revision,
        mode: 'scheduled',
        now: after(1_799_999),
    });
    assert.deepEqual(f.snapshot(), snapshot);
});

test('retired legacy anchors cannot reappear in geo or SSH address consumers after an authoritative control-list update', () => {
    const backend = load(path.join(root, 'src/modules/nodes/node-control-addresses.ts'), mocks);
    const frontend = load(
        path.join(root, '../frontend/src/shared/utils/node-control-addresses.ts'),
        { '@remnawave/backend-contract': require('../libs/contract/build/backend') },
    );
    const node = {
        address: '192.0.2.1',
        controlAddresses: [{ address: '2001:db8::2', enabled: true }],
        ips: [{ ip: '2001:db8::2', status: 'INBOUND' }],
    };
    assert.deepEqual(backend.configuredNodeAddresses(node), ['2001:db8::2']);
    assert.deepEqual(frontend.getConfiguredNodeAddresses(node), ['2001:db8::2']);
    assert.deepEqual(frontend.getNodeLiteralIps(node), ['2001:db8::2']);
    const empty = { ...node, controlAddresses: [], ips: [] };
    assert.deepEqual(backend.configuredNodeAddresses(empty), []);
    assert.deepEqual(frontend.getConfiguredNodeAddresses(empty), []);
    assert.equal(frontend.getNodeSshDefaultAddress(empty), '');
});
