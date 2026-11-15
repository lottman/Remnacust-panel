const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const { routeCandidates, routeRevision } = load(
    path.join(__dirname, '../src/common/axios/node-control-route.ts'),
);

const base = {
    uuid: '11111111-1111-4111-8111-111111111111',
    address: 'old.example.test',
    port: 7289,
    proxyUrl: 'socks5://proxy.example.test:2080',
    ips: [{ ip: '192.0.2.9', status: 'MANAGEMENT' }],
};

test('canonical management order replaces the legacy address and old role-based fallback', () => {
    assert.deepEqual(
        routeCandidates({
            ...base,
            controlAddresses: [
                { address: '2001:db8::2', enabled: true },
                { address: base.address, enabled: false },
                { address: '192.0.2.3', enabled: true },
            ],
        }),
        ['2001:db8::2', '192.0.2.3'],
    );
});

test('an empty or entirely disabled management list never restores the legacy primary route', () => {
    assert.deepEqual(routeCandidates({ ...base, controlAddresses: [] }), []);
    assert.deepEqual(
        routeCandidates({ ...base, controlAddresses: [{ address: base.address, enabled: false }] }),
        [],
    );
});

test('canonical management supports normalized domains and IPv6 without duplicate candidates', () => {
    assert.deepEqual(
        routeCandidates({
            ...base,
            controlAddresses: [
                { address: 'NODE.EXAMPLE.TEST.', enabled: true },
                { address: '[2001:0db8::2]', enabled: true },
                { address: '2001:db8::2', enabled: true },
                { address: 'https://wrong.example.test/path', enabled: true },
            ],
        }),
        ['node.example.test', '2001:db8::2'],
    );
});

test('disable, enable and reorder management addresses invalidate route generations', () => {
    const controlAddresses = [
        { address: base.address, enabled: true },
        { address: '192.0.2.2', enabled: true },
    ];
    const initial = routeRevision({ ...base, controlAddresses });
    assert.notEqual(
        initial,
        routeRevision({ ...base, controlAddresses: [...controlAddresses].reverse() }),
    );
    assert.notEqual(
        initial,
        routeRevision({
            ...base,
            controlAddresses: controlAddresses.map((row, i) => ({ ...row, enabled: i !== 0 })),
        }),
    );
});

test('legacy callers still use only the primary and management/reserve routes before migration', () => {
    assert.deepEqual(routeCandidates(base), [base.address, '192.0.2.9']);
});

const schema = load(
    path.join(__dirname, '../libs/contract/models/node-control-addresses.schema.ts'),
);
const helpers = load(path.join(__dirname, '../src/modules/nodes/node-control-addresses.ts'));

test('control address validation normalizes equivalent forms and rejects authority injection', () => {
    assert.deepEqual(
        schema.NodeControlAddressesSchema.parse([
            { address: '[2001:0DB8::1]', enabled: true },
            { address: ' NODE_SERVICE. ', enabled: false },
        ]),
        [
            { address: '2001:db8::1', enabled: true },
            { address: 'node_service', enabled: false },
        ],
    );
    for (const address of [
        'https://node.test',
        'user:password@node.test',
        'node.test/path',
        'node.test\r\nX-Test:value',
        'fe80::1%eth0',
        '[fe80::1%eth0]',
        'node.test:7289',
        '127.0.0.1/8',
    ]) {
        assert.equal(
            schema.NodeControlAddressesSchema.safeParse([{ address, enabled: true }]).success,
            false,
            address,
        );
    }
    assert.equal(
        schema.NodeControlAddressesSchema.safeParse([
            { address: '[2001:db8::1]', enabled: true },
            { address: '2001:0db8::1', enabled: false },
        ]).success,
        false,
    );
});

test('international management domains remain valid after migrating from the legacy address', () => {
    const address = 'ПРИМЕР.РФ.';
    const expected = 'xn--e1afmkfd.xn--p1ai';
    assert.equal(new URL(`https://${address}`).hostname.replace(/\.$/, ''), expected);
    assert.deepEqual(helpers.legacyNodeControlAddresses({ address, ips: [] }), [
        { address: expected, enabled: true },
    ]);
    assert.deepEqual(schema.NodeControlAddressesSchema.parse([{ address, enabled: true }]), [
        { address: expected, enabled: true },
    ]);
    assert.deepEqual(
        routeCandidates({
            ...base,
            address,
            ips: [],
            controlAddresses: [{ address, enabled: true }],
        }),
        [expected],
    );
});

test('legacy duplicate roles and equivalent IPv6 preserve every permitted management route', () => {
    assert.deepEqual(
        helpers.legacyNodeControlAddresses({
            address: 'node.test',
            ips: [
                { ip: '192.0.2.1', status: 'OUTBOUND' },
                { ip: '192.0.2.1', status: 'RESERVE' },
                { ip: '2001:0db8::1', status: 'OUTBOUND' },
                { ip: '2001:db8::1', status: 'MANAGEMENT' },
            ],
        }),
        [
            { address: 'node.test', enabled: true },
            { address: '192.0.2.1', enabled: true },
            { address: '2001:db8::1', enabled: true },
        ],
    );
    assert.deepEqual(
        helpers.canonicalNodeControlAddresses([
            { address: '2001:0db8::1', enabled: false },
            { address: '2001:db8::1', enabled: true },
        ]),
        [{ address: '2001:db8::1', enabled: true }],
    );
});

test('canonical omissions and explicit empty lists disable saved addresses without deleting them', () => {
    const before = {
        ...base,
        controlAddresses: [
            { address: base.address, enabled: true },
            { address: '192.0.2.2', enabled: true },
        ],
    };
    assert.deepEqual(
        helpers.reconcileNodeControlAddresses(before, { controlAddresses: [] }),
        before.controlAddresses.map((row) => ({ ...row, enabled: false })),
    );
    assert.deepEqual(
        helpers.reconcileNodeControlAddresses(before, {
            controlAddresses: [
                { address: '2001:db8::1', enabled: true },
                { address: '192.0.2.2', enabled: true },
            ],
        }),
        [
            { address: '2001:db8::1', enabled: true },
            { address: '192.0.2.2', enabled: true },
            { address: base.address, enabled: false },
        ],
    );
    assert.deepEqual(helpers.reconcileNodeControlAddresses(before, {}), before.controlAddresses);
    assert.equal(before.controlAddresses[0].enabled, true);
});

test('legacy metadata writes do not silently restore an explicitly disabled primary', () => {
    const before = {
        ...base,
        ips: [],
        controlAddresses: [{ address: base.address, enabled: false }],
    };
    assert.deepEqual(
        helpers.reconcileNodeControlAddresses(before, { address: base.address, ips: [] }),
        before.controlAddresses,
    );
    assert.deepEqual(helpers.reconcileNodeControlAddresses(before, { address: 'new.test' }), [
        { address: 'new.test', enabled: true },
        { address: base.address, enabled: false },
    ]);
});

test('retained address limits reject replacement overflow without erasing old rows', () => {
    const controlAddresses = Array.from({ length: 65 }, (_, index) => ({
        address: `node${index}.test`,
        enabled: false,
    }));
    assert.equal(
        helpers.reconcileNodeControlAddresses({ controlAddresses }, { controlAddresses }).length,
        65,
    );
    assert.throws(
        () =>
            helpers.reconcileNodeControlAddresses(
                { controlAddresses },
                {
                    controlAddresses: [{ address: 'new.test', enabled: true }],
                },
            ),
        (error) => error.constructor.name === 'NodeControlAddressLimitError',
    );
    assert.equal(controlAddresses.length, 65);
});

const { NodesRepository } = load(
    path.join(__dirname, '../src/modules/nodes/repositories/nodes.repository.ts'),
    {
        '@nestjs-cls/transactional': {
            Transactional: () => (_target, _property, descriptor) => descriptor,
        },
        '@common/helpers/kysely/get-kysely-uuid': { getKyselyUuid: (value) => value },
        '@common/helpers/kysely/values': {},
        '../entities/nodes.entity': {
            NodesEntity: class {
                constructor(row) {
                    Object.assign(this, row);
                }
            },
        },
        '../nodes.converter': {},
    },
);

test('actual repository checks the locked revision before changing addresses or inbound links', async () => {
    const uuid = base.uuid,
        revision = '22222222-2222-4222-8222-222222222222';
    let writes = 0,
        locked = 0;
    const before = {
        ...base,
        controlAddresses: [{ address: base.address, enabled: true }],
        controlRevision: revision,
    };
    let written;
    const tx = {
        $queryRaw: async (sql) => {
            assert(sql.join('?').includes('FOR UPDATE'));
            locked++;
            return [structuredClone(before)];
        },
        nodes: {
            update: async (value) => {
                writes++;
                written = value.data;
                return value.data;
            },
            findUniqueOrThrow: async () => written,
        },
    };
    const repo = new NodesRepository({ tx }, {}, {});
    await assert.rejects(
        repo.update({ uuid, controlAddresses: [] }, '33333333-3333-4333-8333-333333333333', [
            'inbound',
        ]),
        (error) => error.constructor.name === 'NodeControlRevisionConflictError',
    );
    assert.equal(writes, 0);
    const result = await repo.update({ uuid, controlAddresses: [] }, revision, [
        'inbound',
        'inbound',
    ]);
    assert.deepEqual(result.controlAddresses, [{ address: base.address, enabled: false }]);
    assert.deepEqual(result.configProfileInboundsToNodes, {
        deleteMany: {},
        createMany: { data: [{ configProfileInboundUuid: 'inbound' }] },
    });
    assert.equal(writes, 1);
    assert.equal(locked, 2);
});

test('bulk profile assignment deduplicates nodes and memberships before its atomic writes', async () => {
    const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const updates = [],
        inserted = [];
    const chain = {
        where() {
            return this;
        },
        async executeTakeFirst() {
            return {};
        },
        values(rows) {
            const keys = rows.map((row) => `${row.nodeUuid}/${row.configProfileInboundUuid}`);
            if (new Set(keys).size !== keys.length)
                throw Error('duplicate key violates membership primary key');
            inserted.push(...rows);
            return this;
        },
    };
    const repo = new NodesRepository(
        {
            tx: {
                $queryRaw: async () => [],
                $executeRaw: async () => 0,
                nodes: {
                    updateMany: async (value) => {
                        updates.push(value);
                        return { count: 2 };
                    },
                },
            },
        },
        {
            kysely: {
                deleteFrom() {
                    return chain;
                },
                insertInto() {
                    return chain;
                },
            },
        },
        {},
    );
    await repo.assignProfile([second, first, second, first.toUpperCase()], 'profile', [
        'inbound',
        'inbound',
    ]);
    assert.deepEqual(updates[0].where.uuid.in, [first, second]);
    assert.deepEqual(inserted, [
        { nodeUuid: first, configProfileInboundUuid: 'inbound' },
        { nodeUuid: second, configProfileInboundUuid: 'inbound' },
    ]);
});
