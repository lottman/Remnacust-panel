require('reflect-metadata');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { TransactionHost } = require('@nestjs-cls/transactional');
const { TransactionalAdapterPrisma } = require('@nestjs-cls/transactional-adapter-prisma');
const load = require('./load-typescript.cjs');

const source = path.join(__dirname, '../src');
const copy = (value) => structuredClone(value);
const conflict = (error) => error.constructor.name === 'NodeControlRevisionConflictError';
const start = new Date('2026-11-15T00:00:00.000Z');
const after = (milliseconds) => new Date(start.getTime() + milliseconds);

function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function repositoryRuntime() {
    const mocks = {
        '../constants/nodes/ip-statuses': load(
            path.join(
                __dirname,
                '../libs/contract/constants/nodes/ip-statuses/node-ip-statuses.constant.ts',
            ),
        ),
    };
    const controls = load(path.join(source, 'modules/nodes/node-control-addresses.ts'), mocks);
    const entities = load(path.join(source, 'modules/nodes/entities/nodes.entity.ts'), {
        ...mocks,
        '@modules/config-profiles/entities': load(
            path.join(source, 'modules/config-profiles/entities/config-profile-inbound.entity.ts'),
        ),
        '@modules/infra-billing/entities': load(
            path.join(source, 'modules/infra-billing/entities/infra-provider.entity.ts'),
        ),
    });
    const { NodesConverter } = load(path.join(source, 'modules/nodes/nodes.converter.ts'), {
        ...mocks,
        '@common/converter/universalConverter': load(
            path.join(source, 'common/converter/universalConverter.ts'),
        ),
        './entities/nodes.entity': entities,
    });
    const { NodesRepository } = load(
        path.join(source, 'modules/nodes/repositories/nodes.repository.ts'),
        {
            ...mocks,
            '../entities/nodes.entity': entities,
            '../node-control-addresses': controls,
            '../nodes.converter': { NodesConverter },
            '@common/database': {},
            '@common/helpers/kysely/get-kysely-uuid': load(
                path.join(source, 'common/helpers/kysely/get-kysely-uuid.ts'),
            ),
            '@common/helpers/kysely/values': {},
        },
    );
    return { NodesRepository, NodesConverter, ...entities, ...controls };
}

function controlledRepository(patch = {}, inventory = null) {
    const runtime = repositoryRuntime();
    const uuid = randomUUID();
    let stored = {
        node: {
            uuid,
            id: 1n,
            name: 'isolated-inventory-fixture',
            address: 'node.example.test',
            port: 2222,
            proxyUrl: null,
            ips: [],
            isDisabled: false,
            isConnected: true,
            isConnecting: false,
            controlAddresses: [{ address: 'node.example.test', enabled: true }],
            controlRevision: randomUUID(),
            provider: null,
            configProfileInboundsToNodes: [],
            ...copy(patch),
        },
        inventory: copy(inventory),
        suppressed: [],
        epoch: randomUUID(),
    };
    const hooks = new AsyncLocalStorage();
    const events = [];
    let sequence = 0;
    let queue = Promise.resolve();
    let host;
    const prisma = {
        async $transaction(action) {
            const previous = queue;
            const release = deferred();
            queue = release.promise;
            await previous;
            const draft = copy(stored);
            const id = ++sequence;
            let client;
            const touch = (operation) => {
                assert.equal(host.isTransactionActive(), true);
                assert.equal(host.tx, client);
                events.push({ operation, id, visible: copy(stored), draft: copy(draft) });
            };
            const row = () => ({ ...copy(draft.node), ipInventory: copy(draft.inventory) });
            client = {
                async $queryRaw(strings, selected) {
                    touch('lock');
                    assert.match(strings.join('?'), /FROM nodes[\s\S]*FOR UPDATE/);
                    assert.equal(selected, uuid);
                    return [copy(draft.node)];
                },
                nodeSuppressedAddress: {
                    async findMany({ where }) {
                        touch('suppressed read');
                        assert.equal(where.nodeUuid, uuid);
                        return draft.suppressed.map((address) => ({ address }));
                    },
                    async createMany({ data }) {
                        touch('suppressed write');
                        assert.ok(data.every((row) => row.nodeUuid === uuid));
                        draft.suppressed = [
                            ...new Set([
                                ...draft.suppressed,
                                ...data.map(({ address }) => address),
                            ]),
                        ];
                    },
                    async deleteMany({ where }) {
                        touch('suppressed clear');
                        assert.equal(where.nodeUuid, uuid);
                        draft.suppressed = draft.suppressed.filter(
                            (address) => !where.address.in.includes(address),
                        );
                    },
                },
                nodeIpInventory: {
                    async findUnique({ where }) {
                        touch('inventory read');
                        assert.equal(where.nodeUuid, uuid);
                        return copy(draft.inventory);
                    },
                    async upsert({ where, create, update }) {
                        touch('inventory write');
                        assert.equal(where.nodeUuid, uuid);
                        draft.inventory = draft.inventory
                            ? { ...draft.inventory, ...copy(update) }
                            : copy(create);
                        return copy(draft.inventory);
                    },
                },
                nodes: {
                    async update({ where, data }) {
                        touch('node write');
                        assert.equal(where.uuid, uuid);
                        const changesControl = [
                            'address',
                            'port',
                            'proxyUrl',
                            'ips',
                            'controlAddresses',
                            'isDisabled',
                        ].some(
                            (key) =>
                                data[key] !== undefined &&
                                JSON.stringify(data[key]) !== JSON.stringify(draft.node[key]),
                        );
                        Object.assign(
                            draft.node,
                            copy(
                                Object.fromEntries(
                                    Object.entries(data).filter(([, value]) => value !== undefined),
                                ),
                            ),
                        );
                        if (changesControl) {
                            draft.node.controlRevision = randomUUID();
                            draft.epoch = randomUUID();
                        }
                        return row();
                    },
                    async findUniqueOrThrow({ where, include }) {
                        touch('final refetch');
                        assert.equal(where.uuid, uuid);
                        assert.equal(include.ipInventory, true);
                        const result = row();
                        const hook = hooks.getStore();
                        hook?.refetched?.resolve(result);
                        if (hook?.release) await hook.release.promise;
                        if (hook?.refetchError) throw hook.refetchError;
                        return result;
                    },
                },
            };
            try {
                const result = await action(client);
                if (hooks.getStore()?.rollback) throw Error('Injected transaction rollback');
                stored = draft;
                return result;
            } finally {
                release.resolve();
            }
        },
    };
    const adapter = new TransactionalAdapterPrisma({
        prismaInjectionToken: Symbol('controlled Prisma'),
    });
    host = new TransactionHost(adapter.optionsFactory(prisma));
    const makeRepository = () =>
        new runtime.NodesRepository(host, {}, new runtime.NodesConverter());
    const repository = makeRepository();
    const scan = (addresses, options = {}) =>
        repository.applyIpScan({
            uuid,
            addresses,
            expectedControlRevision: stored.node.controlRevision,
            expectedScanRevision: stored.inventory?.revision ?? null,
            mode: 'refresh',
            now: start,
            ...options,
        });
    return {
        ...runtime,
        repository,
        makeRepository,
        host,
        hooks,
        events,
        scan,
        snapshot: () => copy(stored),
        uuid,
    };
}

function defineTests() {
    test('database fixture URL and CI-required guard refuse unsafe targets without constructing a database client', () => {
        const filename = path.join(__dirname, 'node-ip-inventory.database.integration.cjs');
        const code = fs.readFileSync(filename, 'utf8');
        const validate = (env) => {
            const registered = [];
            const forbidden = class {
                constructor() {
                    assert.fail('Guard validation must not construct a database client');
                }
            };
            new Function('require', 'module', 'exports', 'process', '__dirname', code)(
                (id) => {
                    if (id === 'node:test')
                        return (name, options) => registered.push({ name, options });
                    if (id === 'pg') return { Client: forbidden };
                    if (id === './prisma-test-client.cjs') return { PrismaClient: forbidden };
                    return require(id);
                },
                { exports: {} },
                {},
                { env },
                __dirname,
            );
            return registered;
        };
        const valid = 'postgresql://remnacust_ci_owner@127.0.0.1:55439/postgres?schema=public';
        assert.match(validate({})[0].options.skip, /deliberately not started/);
        assert.throws(
            () => validate({ NODE_CONTROL_TEST_REQUIRED: '1', DATABASE_URL: valid }),
            /Set NODE_CONTROL_TEST_DATABASE_URL/,
        );
        const environment = {
            NODE_CONTROL_TEST_DATABASE_URL: valid,
            NODE_CONTROL_TEST_DISPOSABLE: '1',
            NODE_CONTROL_TEST_REQUIRED: '1',
        };
        assert.equal(validate(environment)[0].options.skip, false);
        assert.throws(() => validate({ ...environment, NODE_CONTROL_TEST_DISPOSABLE: '0' }));
        for (const address of [
            valid.replace('postgresql:', 'postgres:'),
            valid.replace('127.0.0.1', 'database.example.test'),
            valid.replace('55439', '5432'),
            valid.replace('/postgres?', '/production?'),
            valid.replace('remnacust_ci_owner@', 'postgres@'),
            valid.replace('remnacust_ci_owner@', 'remnacust_ci_owner:fixture-password@'),
            valid.replace('schema=public', 'schema=other'),
            valid + '&sslmode=disable',
            valid + '#fragment',
        ])
            assert.throws(() =>
                validate({ ...environment, NODE_CONTROL_TEST_DATABASE_URL: address }),
            );
    });

    test('real Transactional/TransactionHost/Prisma adapter keep lock, inventory writes and final entity refetch in one CLS transaction', async () => {
        const f = controlledRepository();
        const baseline = f.snapshot();
        const hook = { refetched: deferred(), release: deferred() };
        const operation = f.hooks.run(hook, () =>
            f.scan(['192.0.2.1', '2001:0DB8::1'], { mode: 'initial' }),
        );
        try {
            const pending = await hook.refetched.promise;
            assert.deepEqual(f.snapshot(), baseline);
            assert.deepEqual(pending.ipInventory.addresses, ['192.0.2.1', '2001:db8::1']);
        } finally {
            hook.release.resolve();
        }
        const result = await operation;
        assert(result instanceof f.NodesEntity);
        assert.deepEqual(result.ipInventory, f.snapshot().inventory);
        assert.notEqual(result.controlRevision, baseline.node.controlRevision);
        assert.equal(new Set(f.events.map((event) => event.id)).size, 1);
        assert.deepEqual(
            f.events.map((event) => event.operation),
            [
                'lock',
                'inventory read',
                'suppressed read',
                'node write',
                'inventory write',
                'final refetch',
            ],
        );
        assert.equal(f.host.isTransactionActive(), false);
    });

    test('automatic reconciliation has a durable 30 minute gate and retires detached addresses', async () => {
        const f = controlledRepository();
        const initial = await f.scan(['192.0.2.1', '2001:db8::1'], { mode: 'initial' });
        const baseline = f.snapshot();
        await f.makeRepository().applyIpScan({
            uuid: f.uuid,
            addresses: ['192.0.2.2'],
            expectedControlRevision: initial.controlRevision,
            expectedScanRevision: initial.ipInventory.revision,
            mode: 'scheduled',
            now: after(30 * 60 * 1000 - 1),
        });
        assert.deepEqual(f.snapshot(), baseline);
        const result = await f.scan(['192.0.2.2'], {
            mode: 'scheduled',
            now: after(30 * 60 * 1000),
        });
        assert.deepEqual(
            result.controlAddresses.map((row) => row.address),
            ['node.example.test', '192.0.2.2'],
        );
        assert.deepEqual(result.ipInventory.generatedAddresses, ['192.0.2.2']);
        assert.deepEqual(result.ipInventory.addresses, ['192.0.2.2']);
    });

    test('a recreated inventory service honors the saved timestamp before requesting a complete inventory', async () => {
        const f = controlledRepository();
        let now = start;
        const repository = {
            findByUUID: async () =>
                new f.NodesEntity({ ...f.snapshot().node, ipInventory: f.snapshot().inventory }),
            applyIpScan: (input) => f.repository.applyIpScan({ ...input, now }),
        };
        const { NodeIpInventoryService } = load(
            path.join(source, 'modules/nodes/node-ip-inventory.service.ts'),
            {
                '@contract/constants': load(
                    path.join(__dirname, '../libs/contract/constants/errors/errors.ts'),
                ),
                '@common/types': load(path.join(source, 'common/types/result.type.ts')),
                './models': {},
                './node-control-addresses': {
                    NodeControlAddressLimitError: f.NodeControlAddressLimitError,
                    NodeControlRevisionConflictError: f.NodeControlRevisionConflictError,
                },
                '../constants/nodes/ip-statuses': load(
                    path.join(
                        __dirname,
                        '../libs/contract/constants/nodes/ip-statuses/node-ip-statuses.constant.ts',
                    ),
                ),
            },
            {
                Date: class extends Date {
                    static now() {
                        return now.getTime();
                    }
                },
            },
        );
        const makeService = () =>
            new NodeIpInventoryService(
                repository,
                {
                    getNodeNetworkAddresses: async () => ({
                        isOk: true,
                        response: {
                            complete: true,
                            addresses:
                                now.getTime() < after(1_800_000).getTime()
                                    ? ['2001:db8::1']
                                    : ['2001:db8::2'],
                        },
                    }),
                },
                {},
            );
        let result = await makeService().observe(f.uuid, f.snapshot().node.controlRevision);
        assert.equal(result.isOk, true);
        const before = f.snapshot();
        now = after(1_800_000 - 1);
        result = await makeService().observe(f.uuid, before.node.controlRevision);
        assert.equal(result.isOk, true);
        assert.equal(result.response, null);
        assert.deepEqual(f.snapshot(), before);
        now = after(1_800_000);
        result = await makeService().observe(f.uuid, before.node.controlRevision);
        assert.equal(result.isOk, true);
        assert.deepEqual(f.snapshot().inventory.generatedAddresses, ['2001:db8::2']);
        assert.deepEqual(f.snapshot().inventory.scannedAt, now);
    });

    test('an identical routing scan rotates the durable scan UUID but not control revision or route epoch', async () => {
        const f = controlledRepository();
        await f.scan(['192.0.2.1', '2001:db8::1']);
        const baseline = f.snapshot();
        const result = await f.scan(['192.0.2.1', '2001:db8::1'], { now: after(60_000) });
        assert.notEqual(result.ipInventory.revision, baseline.inventory.revision);
        assert.equal(result.controlRevision, baseline.node.controlRevision);
        assert.equal(f.snapshot().epoch, baseline.epoch);
        assert.deepEqual(result.ipInventory.scannedAt, after(60_000));
        assert.equal(f.events.filter((event) => event.operation === 'node write').length, 1);
        await assert.rejects(
            f.scan(['192.0.2.1'], { expectedScanRevision: baseline.inventory.revision }),
            conflict,
        );
    });

    test('reordering the same scan set cannot reorder saved IP roles or churn routing revisions', async () => {
        const f = controlledRepository();
        await f.scan(['192.0.2.1', '2001:db8::1']);
        const before = f.snapshot();
        await f.scan(['2001:db8::1', '192.0.2.1']);
        assert.equal(f.snapshot().node.controlRevision, before.node.controlRevision);
        assert.equal(f.snapshot().epoch, before.epoch);
        assert.deepEqual(f.snapshot().node.ips, before.node.ips);
        assert.notEqual(f.snapshot().inventory.revision, before.inventory.revision);
    });

    test('fresh scheduled reconciliation ignores a stale scan revision but still rejects a stale root control revision first', async () => {
        const f = controlledRepository();
        await f.scan(['2001:db8::1']);
        const old = f.snapshot();
        await f.scan(['2001:db8::1'], { now: after(1000) });
        const current = f.snapshot();
        await f.scan(['2001:db8::2'], {
            mode: 'scheduled',
            now: after(2000),
            expectedScanRevision: old.inventory.revision,
        });
        assert.deepEqual(f.snapshot(), current);
        await assert.rejects(
            f.scan(['2001:db8::2'], {
                mode: 'scheduled',
                now: after(2000),
                expectedScanRevision: old.inventory.revision,
                expectedControlRevision: randomUUID(),
            }),
            conflict,
        );
        assert.deepEqual(f.snapshot(), current);
    });

    for (const mode of ['scheduled', 'refresh'])
        test(`stale scan revision conflicts during due ${mode} even when control revision is unchanged`, async () => {
            const f = controlledRepository();
            await f.scan(['2001:db8::1']);
            const old = f.snapshot();
            await f.scan(['2001:db8::1'], { now: after(1000) });
            const current = f.snapshot();
            assert.equal(current.node.controlRevision, old.node.controlRevision);
            await assert.rejects(
                f.scan(['2001:db8::2'], {
                    mode,
                    now: after(31 * 60 * 1000),
                    expectedScanRevision: old.inventory.revision,
                }),
                conflict,
            );
            assert.deepEqual(f.snapshot(), current);
        });

    test('manual refresh removes only generated control rows and preserves manual order, IP roles and disabled flags', async () => {
        const f = controlledRepository({
            controlAddresses: [
                { address: 'node.example.test', enabled: true },
                { address: '192.0.2.50', enabled: false },
            ],
            ips: [{ ip: '192.0.2.50', status: 'OUTBOUND' }],
        });
        await f.scan(['192.0.2.1', '2001:db8::1'], { mode: 'initial' });
        const result = await f.scan(['2001:db8::1'], { mode: 'refresh' });
        assert.deepEqual(result.controlAddresses, [
            { address: 'node.example.test', enabled: true },
            { address: '192.0.2.50', enabled: false },
            { address: '2001:db8::1', enabled: true },
        ]);
        assert.deepEqual(result.ips, [
            { ip: '192.0.2.50', status: 'OUTBOUND' },
            { ip: '2001:db8::1', status: 'UNKNOWN' },
        ]);
        assert.deepEqual(result.ipInventory.generatedAddresses, ['2001:db8::1']);
    });

    test('manual removal clears its role, survives scans, and explicit re-add restores discovery', async () => {
        const f = controlledRepository();
        const ip = '2001:db8::20';
        const node = await f.scan([ip], { mode: 'initial' });
        const retained = node.controlAddresses.filter(({ address }) => address !== ip);
        const removed = await f.repository.update(
            { uuid: f.uuid, controlAddresses: retained },
            node.controlRevision,
            undefined,
            [ip],
        );
        assert.deepEqual(removed.controlAddresses, retained);
        assert.deepEqual(removed.ips, []);
        assert.deepEqual(f.snapshot().suppressed, [ip]);
        assert.notEqual(removed.controlRevision, node.controlRevision);

        const rescanned = await f.scan(['2001:0DB8::20', '192.0.2.10']);
        assert.equal(
            rescanned.controlAddresses.some(({ address }) => address === ip),
            false,
        );
        assert.deepEqual(rescanned.ips, [{ ip: '192.0.2.10', status: 'UNKNOWN' }]);

        await f.repository.update(
            {
                uuid: f.uuid,
                controlAddresses: [...rescanned.controlAddresses, { address: ip, enabled: false }],
                ips: [...rescanned.ips, { ip, status: 'OUTBOUND' }],
            },
            rescanned.controlRevision,
        );
        assert.deepEqual(f.snapshot().suppressed, []);
        const restored = await f.scan([ip, '192.0.2.10']);
        assert.deepEqual(
            restored.ips.find((row) => row.ip === ip),
            { ip, status: 'OUTBOUND' },
        );
        assert.equal(
            restored.controlAddresses.find(({ address }) => address === ip).enabled,
            false,
        );
    });

    test('stale removal, last-enabled removal and a failed transaction leave addresses and suppression intact', async () => {
        const f = controlledRepository({
            controlAddresses: [
                { address: 'node.example.test', enabled: true },
                { address: '192.0.2.1', enabled: false },
            ],
        });
        const before = f.snapshot();
        await assert.rejects(
            f.repository.update(
                { uuid: f.uuid, controlAddresses: before.node.controlAddresses.slice(1) },
                before.node.controlRevision,
                undefined,
                ['node.example.test'],
            ),
            (error) => error instanceof f.NodeLastControlAddressError,
        );
        await assert.rejects(
            f.repository.update(
                { uuid: f.uuid, controlAddresses: before.node.controlAddresses.slice(0, 1) },
                randomUUID(),
                undefined,
                ['192.0.2.1'],
            ),
            (error) => error instanceof f.NodeControlRevisionConflictError,
        );
        await assert.rejects(
            f.hooks.run({ rollback: true }, () =>
                f.repository.update(
                    { uuid: f.uuid, controlAddresses: before.node.controlAddresses.slice(0, 1) },
                    before.node.controlRevision,
                    undefined,
                    ['192.0.2.1'],
                ),
            ),
            /Injected transaction rollback/,
        );
        assert.deepEqual(f.snapshot(), before);
    });

    test('all-off management remains off through initial discovery, append and empty manual refresh', async () => {
        const f = controlledRepository({
            controlAddresses: [{ address: 'node.example.test', enabled: false }],
        });
        await f.scan(['192.0.2.1'], { mode: 'initial' });
        await f.scan(['2001:db8::1'], { mode: 'scheduled', now: after(30 * 60 * 1000) });
        assert.equal(
            f.snapshot().node.controlAddresses.every((row) => !row.enabled),
            true,
        );
        const refreshed = await f.scan([]);
        assert.deepEqual(refreshed.controlAddresses, [
            { address: 'node.example.test', enabled: false },
        ]);
        assert.equal(refreshed.isConnected, false);
        assert.equal(refreshed.isConnecting, false);
        assert.deepEqual(refreshed.ipInventory.generatedAddresses, []);
    });

    test('generic user updates retain omitted generated routes and cannot write inventory provenance', async () => {
        const f = controlledRepository();
        await f.scan(['192.0.2.1']);
        const before = f.snapshot();
        await f.repository.update(
            {
                uuid: f.uuid,
                controlAddresses: [{ address: 'node.example.test', enabled: true }],
                ipInventory: {
                    addresses: [],
                    generatedAddresses: [],
                    revision: randomUUID(),
                    scannedAt: start,
                },
            },
            before.node.controlRevision,
        );
        assert.deepEqual(f.snapshot().node.controlAddresses, [
            { address: 'node.example.test', enabled: true },
            { address: '192.0.2.1', enabled: false },
        ]);
        assert.deepEqual(f.snapshot().inventory, before.inventory);
    });

    test('public node response exposes only ISO scan time and copied observed addresses, never provenance or scan revision', async () => {
        const f = controlledRepository({
            consumptionMultiplier: 1_000_000_000n,
            nodeConsumptionMultiplier: 1_000_000_000n,
        });
        const entity = await f.scan(['2001:db8::1']);
        const { NodeResponseModel } = load(
            path.join(source, 'modules/nodes/models/node.response.model.ts'),
            {
                '@common/utils/nano': load(path.join(source, 'common/utils/nano/nano.util.ts')),
            },
        );
        const response = new NodeResponseModel(entity, {
            controlRevision: entity.controlRevision,
            versions: null,
        });
        assert.deepEqual(response.ipScan, {
            addresses: ['2001:db8::1'],
            scannedAt: start.toISOString(),
        });
        assert.equal(Object.hasOwn(response, 'ipInventory'), false);
        assert.equal(Object.hasOwn(response.ipScan, 'revision'), false);
        assert.equal(Object.hasOwn(response.ipScan, 'generatedAddresses'), false);
        response.ipScan.addresses.push('192.0.2.2');
        assert.deepEqual(entity.ipInventory.addresses, ['2001:db8::1']);
    });

    test('control revision rejects ABA after a route value changes and is restored', async () => {
        const f = controlledRepository();
        await f.scan(['192.0.2.1']);
        const old = f.snapshot();
        await f.repository.update({ uuid: f.uuid, port: 2223 }, old.node.controlRevision);
        await f.repository.update({ uuid: f.uuid, port: 2222 }, f.snapshot().node.controlRevision);
        assert.notEqual(f.snapshot().node.controlRevision, old.node.controlRevision);
        const current = f.snapshot();
        await assert.rejects(
            f.scan(['192.0.2.2'], { expectedControlRevision: old.node.controlRevision }),
            conflict,
        );
        assert.deepEqual(f.snapshot(), current);
    });

    for (const failure of ['refetchError', 'rollback'])
        test(`${failure} rolls back routing, provenance, scan UUID and timestamp together`, async () => {
            const f = controlledRepository();
            await f.scan(['192.0.2.1']);
            const before = f.snapshot();
            const hook =
                failure === 'refetchError'
                    ? { refetchError: Error('Injected final refetch failure') }
                    : { rollback: true };
            await assert.rejects(
                f.hooks.run(hook, () => f.scan(['2001:db8::2'])),
                /Injected/,
            );
            assert.deepEqual(f.snapshot(), before);
        });

    test('invalid scan input, raw 65-entry overflow and combined route overflow leave persistent state unchanged', async () => {
        const f = controlledRepository({
            controlAddresses: Array.from({ length: 65 }, (_, i) => ({
                address: `manual-${i}.example.test`,
                enabled: false,
            })),
        });
        for (const addresses of [['bad'], Array(65).fill('192.0.2.1'), ['2001:db8::1']]) {
            const before = f.snapshot();
            await assert.rejects(f.scan(addresses));
            assert.deepEqual(f.snapshot(), before);
        }
    });
}

module.exports = { repositoryRuntime, controlledRepository, deferred, conflict, start, after };
if (require.main === module) defineTests();
