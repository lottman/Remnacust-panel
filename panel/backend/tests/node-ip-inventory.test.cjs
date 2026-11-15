const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');

const helperFile = path.join(__dirname, '../src/modules/nodes/node-ip-inventory.ts');
const mocks = {
    '../constants/nodes/ip-statuses': load(
        path.join(
            __dirname,
            '../libs/contract/constants/nodes/ip-statuses/node-ip-statuses.constant.ts',
        ),
    ),
};
const base = () => ({
    address: 'node.example.test',
    ips: [],
    controlAddresses: [{ address: 'node.example.test', enabled: true }],
    ipInventory: null,
});
const plan = (before, addresses, mode = 'refresh') =>
    load(helperFile, mocks).planNodeIpInventory(before, addresses, mode);

test('initial discovery adds canonical IPv4 and IPv6 behind the manual management name', () => {
    const result = plan(base(), ['192.0.2.4', '2001:0DB8:0:0::4', '2001:db8::4'], 'initial');
    assert.deepEqual(result.controlAddresses, [
        { address: 'node.example.test', enabled: true },
        { address: '192.0.2.4', enabled: true },
        { address: '2001:db8::4', enabled: true },
    ]);
    assert.deepEqual(result.generatedAddresses, ['192.0.2.4', '2001:db8::4']);
    assert.deepEqual(result.ips, [
        { ip: '192.0.2.4', status: 'INBOUND' },
        { ip: '2001:db8::4', status: 'INBOUND' },
    ]);
});

test('refresh removes disappeared generated addresses while preserving manual DNS and IP entries', () => {
    const before = base();
    before.controlAddresses.push(
        { address: '192.0.2.10', enabled: true },
        { address: '2001:db8::10', enabled: false },
        { address: '192.0.2.20', enabled: false },
    );
    before.ips = [{ ip: '192.0.2.10', status: 'OUTBOUND' }];
    before.ipInventory = {
        addresses: ['192.0.2.10', '2001:db8::10'],
        generatedAddresses: ['192.0.2.10', '2001:db8::10'],
    };
    const result = plan(before, ['2001:db8::10', '192.0.2.30']);
    assert.deepEqual(result.controlAddresses, [
        { address: 'node.example.test', enabled: true },
        { address: '2001:db8::10', enabled: false },
        { address: '192.0.2.20', enabled: false },
        { address: '192.0.2.30', enabled: true },
    ]);
    assert.deepEqual(result.generatedAddresses, ['2001:db8::10', '192.0.2.30']);
    assert.deepEqual(
        result.ips.map((entry) => entry.ip),
        ['2001:db8::10', '192.0.2.30'],
    );
});

test('initialization never guesses provenance or deletes imported/manual legacy addresses', () => {
    const before = base();
    before.controlAddresses.push({ address: '192.0.2.50', enabled: false });
    before.ips = [{ ip: '192.0.2.50', status: 'INBOUND' }];
    const result = plan(before, ['2001:db8::50'], 'initial');
    assert.ok(result.controlAddresses.some((entry) => entry.address === '192.0.2.50'));
    assert.deepEqual(result.generatedAddresses, ['2001:db8::50']);
});

test('observing an existing manual address does not turn it into a removable generated address', () => {
    const before = base();
    before.controlAddresses.push({ address: '192.0.2.50', enabled: true });
    const first = plan(before, ['192.0.2.50']);
    assert.deepEqual(first.generatedAddresses, []);
    const second = plan({ ...before, ...first, ipInventory: first }, []);
    assert.ok(second.controlAddresses.some((entry) => entry.address === '192.0.2.50'));
});

test('newly found addresses never reactivate management when every existing address is disabled', () => {
    const before = base();
    before.controlAddresses[0].enabled = false;
    const result = plan(before, ['192.0.2.1', '2001:db8::1']);
    assert.equal(
        result.controlAddresses.every((entry) => !entry.enabled),
        true,
    );
});

test('surviving address status and disabled state remain unchanged during refresh', () => {
    const before = base();
    before.controlAddresses.push({ address: '2001:db8::1', enabled: false });
    before.ips = [{ ip: '2001:0db8::1', status: 'OUTBOUND' }];
    before.ipInventory = { generatedAddresses: ['2001:db8::1'], addresses: ['2001:db8::1'] };
    const result = plan(before, ['2001:db8::1']);
    assert.deepEqual(result.ips, [{ ip: '2001:db8::1', status: 'OUTBOUND' }]);
    assert.equal(result.controlAddresses[1].enabled, false);
});

test('a complete empty scan removes only generated rows and keeps manual management available', () => {
    const before = base();
    before.controlAddresses.push({ address: '192.0.2.1', enabled: true });
    before.ipInventory = { generatedAddresses: ['192.0.2.1'], addresses: ['192.0.2.1'] };
    const result = plan(before, []);
    assert.deepEqual(result.controlAddresses, base().controlAddresses);
    assert.deepEqual(result.ips, []);
    assert.deepEqual(result.generatedAddresses, []);
});

test('initialization is append-only even when an inventory was supplied by an old job', () => {
    const before = base();
    before.controlAddresses.push({ address: '192.0.2.1', enabled: false });
    before.ipInventory = { generatedAddresses: ['192.0.2.1'], addresses: ['192.0.2.1'] };
    const result = plan(before, ['192.0.2.2'], 'initial');
    assert.ok(result.controlAddresses.some((entry) => entry.address === '192.0.2.1'));
});

test('invalid address data is rejected before mutating the caller snapshot', () => {
    for (const address of [
        'https://node.test/',
        'node.test',
        'fe80::1%eth0',
        '192.0.2.1/32',
        'bad',
    ]) {
        const before = base();
        const snapshot = structuredClone(before);
        assert.throws(() => plan(before, [address]), { name: 'ZodError' });
        assert.deepEqual(before, snapshot);
    }
});

test('discovery refuses overflow rather than silently losing saved control addresses', () => {
    const before = base();
    for (let index = 1; index <= 64; index++) {
        before.controlAddresses.push({ address: `manual-${index}.example.test`, enabled: false });
    }
    const snapshot = structuredClone(before);
    assert.throws(() => plan(before, ['192.0.2.1']), /limit|65/i);
    assert.deepEqual(before, snapshot);
});

test('an oversized discovered inventory is refused before truncation or deduplication', () => {
    assert.throws(() => plan(base(), Array(65).fill('192.0.2.1')), { name: 'ZodError' });
});

test('network scan planning does not mutate source arrays or retain caller-owned references', () => {
    const before = base();
    const addresses = ['192.0.2.1'];
    const result = plan(before, addresses);
    result.controlAddresses[0].enabled = false;
    result.addresses.push('192.0.2.2');
    assert.equal(before.controlAddresses[0].enabled, true);
    assert.deepEqual(addresses, ['192.0.2.1']);
});

test('automatic checks append new addresses and retain missing discovered addresses until explicit rescan', () => {
    const before = base();
    before.controlAddresses.push({ address: '192.0.2.1', enabled: false });
    before.ips = [{ ip: '192.0.2.1', status: 'OUTBOUND' }];
    before.ipInventory = { addresses: ['192.0.2.1'], generatedAddresses: ['192.0.2.1'] };
    const automatic = plan(before, ['2001:db8::2'], 'append');
    assert.deepEqual(automatic.ips, [
        { ip: '192.0.2.1', status: 'OUTBOUND' },
        { ip: '2001:db8::2', status: 'INBOUND' },
    ]);
    assert.equal(automatic.controlAddresses[1].enabled, false);
    assert.deepEqual(automatic.generatedAddresses, ['192.0.2.1', '2001:db8::2']);
    const refreshed = plan({ ...before, ...automatic, ipInventory: automatic }, ['2001:db8::2']);
    assert.equal(
        refreshed.controlAddresses.some((entry) => entry.address === '192.0.2.1'),
        false,
    );
    assert.deepEqual(refreshed.ips, [{ ip: '2001:db8::2', status: 'INBOUND' }]);
});
