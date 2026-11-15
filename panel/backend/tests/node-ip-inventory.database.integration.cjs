require('reflect-metadata');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { Client } = require('pg');
const { TransactionHost } = require('@nestjs-cls/transactional');
const { TransactionalAdapterPrisma } = require('@nestjs-cls/transactional-adapter-prisma');
const { PrismaClient } = require('./prisma-test-client.cjs');
const {
    repositoryRuntime,
    deferred,
    conflict,
    start,
    after,
} = require('./node-ip-inventory-persistence.test.cjs');

const url = process.env.NODE_CONTROL_TEST_DATABASE_URL;
if (process.env.NODE_CONTROL_TEST_REQUIRED === '1')
    assert(url, 'Set NODE_CONTROL_TEST_DATABASE_URL for the required PostgreSQL checks');
if (url) {
    const target = new URL(url);
    assert.equal(target.protocol, 'postgresql:');
    assert(['127.0.0.1', 'localhost'].includes(target.hostname), 'PostgreSQL must be loopback');
    assert.equal(target.port, '55439');
    assert.equal(target.pathname, '/postgres');
    assert.equal(target.username, 'remnacust_ci_owner');
    assert(!target.password && !target.hash, 'Use the disposable passwordless CI database');
    assert.equal(target.searchParams.get('schema') ?? 'public', 'public');
    for (const key of target.searchParams.keys())
        assert(
            ['schema', 'connection_limit', 'pool_timeout', 'connect_timeout'].includes(key),
            'Unsupported PostgreSQL fixture connection parameter',
        );
    assert.equal(process.env.NODE_CONTROL_TEST_DISPOSABLE, '1');
}

async function within(promise, message) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(Error(message)), 10_000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function waitForRowLock(observer, holder, waiter) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const row = (
            await observer.query(
                `SELECT $1::integer = ANY(pg_blocking_pids(pid)) AS blocked, query
            FROM pg_stat_activity WHERE pid=$2::integer`,
                [holder.pid, waiter.pid],
            )
        ).rows[0];
        if (row?.blocked) {
            assert.match(row.query, /\bFROM\s+(?:public\.)?"?nodes"?[\s\S]*FOR\s+UPDATE/i);
            assert.match(row.query, /control_revision/);
            return;
        }
        await delay(10);
    }
    assert.fail('The stale inventory transaction never waited on the parent node row lock');
}

test(
    'node IP inventory forward migration and real CLS/Prisma repository persistence',
    {
        skip:
            !url &&
            'No NODE_CONTROL_TEST_DATABASE_URL; local PostgreSQL is deliberately not started',
        timeout: 180_000,
    },
    async (t) => {
        const runtime = repositoryRuntime();
        const observer = new Client({ connectionString: url, statement_timeout: 10_000 });
        const migrationClient = new Client({ connectionString: url, statement_timeout: 10_000 });
        const hooks = new AsyncLocalStorage();
        const schema = 'rc_node_ip_inventory_' + randomUUID().replaceAll('-', '');
        assert(/^[a-z0-9_]+$/.test(schema));
        const created = [];
        const pending = [];
        const releases = [];
        let schemaCreated = false;
        let migrationTransaction = false;
        let transactions;
        const observe = async (uuid) =>
            (
                await observer.query(
                    `SELECT
        (SELECT to_jsonb(n) FROM public.nodes n WHERE n.uuid=$1) AS node,
        (SELECT to_jsonb(i) FROM public.xera_node_ip_inventory i WHERE i.node_uuid=$1) AS inventory,
        (SELECT revision::text FROM public.xera_node_route_revision WHERE id=1) AS epoch`,
                    [uuid],
                )
            ).rows[0];
        const identity = async () =>
            (
                await transactions.tx
                    .$queryRaw`SELECT pg_backend_pid() AS pid, txid_current()::text AS xid`
            )[0];
        const trace = async (operation, args, query) => {
            const hook = hooks.getStore();
            if (!hook || (args.where?.uuid ?? args.where?.nodeUuid) !== hook.uuid)
                return query(args);
            const before = await identity();
            assert.equal(transactions.isTransactionActive(), true);
            const row = await query(args);
            const afterIdentity = await identity();
            hook.events.push({ operation, before, after: afterIdentity, row });
            if (operation === 'findUniqueOrThrow') {
                const inventory = await transactions.tx.nodeIpInventory.findUnique({
                    where: { nodeUuid: hook.uuid },
                });
                assert.deepEqual(row.ipInventory, inventory);
                hook.visible = await observe(hook.uuid);
                if (hook.refetchError) throw hook.refetchError;
            }
            return row;
        };
        const prisma = new PrismaClient({ datasourceUrl: url }).$extends({
            query: {
                nodes: {
                    async $allOperations({ operation, args, query }) {
                        if (!['update', 'findUniqueOrThrow'].includes(operation))
                            return query(args);
                        return trace(operation, args, query);
                    },
                },
                nodeIpInventory: {
                    async upsert({ args, query }) {
                        return trace('inventory upsert', args, query);
                    },
                },
            },
        });
        const adapter = new TransactionalAdapterPrisma({
            prismaInjectionToken: PrismaClient,
            defaultTxOptions: { maxWait: 10_000, timeout: 25_000 },
        });
        const options = adapter.optionsFactory(prisma);
        transactions = new TransactionHost({
            ...options,
            defaultTxOptions: adapter.defaultTxOptions,
            wrapWithTransaction: (config, fn, set) =>
                options.wrapWithTransaction(
                    config,
                    async () => {
                        const id = await identity();
                        const hook = hooks.getStore();
                        if (hook) {
                            hook.transactions.push(id);
                            hook.entered?.resolve(id);
                        }
                        const result = await fn();
                        if (hook?.written) {
                            hook.written.resolve(result);
                            await hook.release.promise;
                        }
                        if (hook?.rollbackError) throw hook.rollbackError;
                        return result;
                    },
                    set,
                ),
        });
        const repository = new runtime.NodesRepository(
            transactions,
            {},
            new runtime.NodesConverter(),
        );
        const createNode = async (patch) => {
            const uuid = randomUUID();
            const address = `inventory-${uuid}.example.test`;
            created.push(uuid);
            return repository.create(
                new runtime.NodesEntity({
                    uuid,
                    name: `ipi-${uuid}`,
                    address,
                    port: 2222,
                    proxyUrl: null,
                    isConnected: true,
                    isDisabled: false,
                    ips: [],
                    controlAddresses: [{ address, enabled: true }],
                    ...patch,
                }),
            );
        };
        const scan = (node, addresses, extra = {}) =>
            repository.applyIpScan({
                uuid: node.uuid,
                addresses,
                expectedControlRevision: node.controlRevision,
                expectedScanRevision: node.ipInventory?.revision ?? null,
                mode: 'refresh',
                now: start,
                ...extra,
            });
        const hookFor = (uuid) => ({ uuid, events: [], transactions: [] });
        const track = (promise) => {
            const outcome = promise.then(
                (value) => ({ value }),
                (error) => ({ error }),
            );
            pending.push(outcome);
            return outcome;
        };
        const gateOrFailure = (gate, outcome) =>
            within(
                Promise.race([
                    gate.promise,
                    outcome.then((result) => {
                        throw (
                            result.error ?? Error('Transaction finished before the expected gate')
                        );
                    }),
                ]),
                'The real repository transaction did not reach its expected gate',
            );
        try {
            await observer.connect();
            await migrationClient.connect();
            const role = (
                await observer.query(
                    'SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user',
                )
            ).rows[0];
            assert.deepEqual(role, {
                name: 'remnacust_ci_owner',
                rolsuper: false,
                rolcreatedb: false,
                rolcreaterole: false,
            });
            const major = Math.floor(
                Number(
                    (await observer.query('SHOW server_version_num')).rows[0].server_version_num,
                ) / 10_000,
            );
            assert([14, 15, 16, 17, 18].includes(major));
            if (process.env.NODE_CONTROL_TEST_PG_VERSION)
                assert.equal(major, Number(process.env.NODE_CONTROL_TEST_PG_VERSION.split('.')[0]));
            const migrations = fs
                .readdirSync(path.join(__dirname, '../prisma/migrations'))
                .filter((name) =>
                    fs.existsSync(
                        path.join(__dirname, '../prisma/migrations', name, 'migration.sql'),
                    ),
                );
            const applied = (
                await observer.query(`SELECT count(*)::integer AS count FROM public._prisma_migrations
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)
            ).rows[0];
            assert.equal(
                applied.count,
                migrations.length,
                'The public fixture database must be fully migrated',
            );
            assert.equal(
                (
                    await observer.query(`SELECT count(*)::integer AS count FROM public._prisma_migrations
            WHERE migration_name='20261115000000_node_ip_inventory' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`)
                ).rows[0].count,
                1,
            );
            t.diagnostic(
                `PostgreSQL ${major}; restricted CI owner; ${applied.count} migrations; actual Transactional/CLS/Prisma`,
            );

            await t.test(
                'forward SQL preserves old nodes, rolls back DDL, enforces both array limits and FK cascades',
                async () => {
                    await migrationClient.query(`CREATE SCHEMA "${schema}"`);
                    schemaCreated = true;
                    await migrationClient.query(`CREATE TABLE "${schema}".nodes (uuid uuid PRIMARY KEY, address text NOT NULL,
                ips jsonb NOT NULL, control_addresses jsonb NOT NULL, control_revision uuid NOT NULL)`);
                    const old = randomUUID();
                    await migrationClient.query(
                        `INSERT INTO "${schema}".nodes VALUES ($1,$2,$3,$4,$5)`,
                        [
                            old,
                            'OLD.Node.Example.TEST.',
                            JSON.stringify([{ ip: '2001:0DB8::1', status: 'OUTBOUND' }]),
                            JSON.stringify([{ address: 'node.example.test', enabled: false }]),
                            randomUUID(),
                        ],
                    );
                    const oldRow = (
                        await migrationClient.query(
                            `SELECT to_jsonb(n) AS node FROM "${schema}".nodes n WHERE uuid=$1`,
                            [old],
                        )
                    ).rows[0];
                    const sql = fs
                        .readFileSync(
                            path.join(
                                __dirname,
                                '../prisma/migrations/20261115000000_node_ip_inventory/migration.sql',
                            ),
                            'utf8',
                        )
                        .replace(/\bpublic\./g, `"${schema}".`);
                    const migrate = async () => {
                        await migrationClient.query('BEGIN');
                        migrationTransaction = true;
                        await migrationClient.query(`SET LOCAL search_path TO "${schema}", public`);
                        await migrationClient.query(sql);
                        assert.deepEqual(
                            (
                                await migrationClient.query(
                                    `SELECT to_jsonb(n) AS node FROM "${schema}".nodes n WHERE uuid=$1`,
                                    [old],
                                )
                            ).rows[0],
                            oldRow,
                        );
                    };
                    await migrate();
                    await migrationClient.query('ROLLBACK');
                    migrationTransaction = false;
                    assert.equal(
                        (
                            await migrationClient.query('SELECT to_regclass($1)::text AS name', [
                                `${schema}.xera_node_ip_inventory`,
                            ])
                        ).rows[0].name,
                        null,
                    );
                    await migrate();
                    await migrationClient.query('COMMIT');
                    migrationTransaction = false;
                    const valid = Array.from({ length: 64 }, (_, i) => `2001:db8::${i + 1}`);
                    await migrationClient.query(
                        `INSERT INTO "${schema}".xera_node_ip_inventory
                (node_uuid,addresses,generated_addresses,scanned_at) VALUES ($1,$2,$2,$3)`,
                        [old, valid, start],
                    );
                    const before = (
                        await migrationClient.query(
                            `SELECT * FROM "${schema}".xera_node_ip_inventory WHERE node_uuid=$1`,
                            [old],
                        )
                    ).rows[0];
                    assert.match(before.revision, /^[a-f0-9-]{36}$/);
                    for (const column of ['addresses', 'generated_addresses']) {
                        await assert.rejects(
                            migrationClient.query(
                                `UPDATE "${schema}".xera_node_ip_inventory
                    SET "${column}"=$2 WHERE node_uuid=$1`,
                                [old, Array(65).fill('192.0.2.1')],
                            ),
                            (error) => error.code === '23514',
                        );
                        assert.deepEqual(
                            (
                                await migrationClient.query(
                                    `SELECT * FROM "${schema}".xera_node_ip_inventory WHERE node_uuid=$1`,
                                    [old],
                                )
                            ).rows[0],
                            before,
                        );
                    }
                    await assert.rejects(
                        migrationClient.query(
                            `INSERT INTO "${schema}".xera_node_ip_inventory
                (node_uuid,scanned_at) VALUES ($1,$2)`,
                            [randomUUID(), start],
                        ),
                        (error) => error.code === '23503',
                    );
                    await migrationClient.query('BEGIN');
                    migrationTransaction = true;
                    await migrationClient.query(
                        `UPDATE "${schema}".xera_node_ip_inventory SET addresses='{}',revision=gen_random_uuid(),scanned_at=$2 WHERE node_uuid=$1`,
                        [old, after(1000)],
                    );
                    await migrationClient.query('ROLLBACK');
                    migrationTransaction = false;
                    assert.deepEqual(
                        (
                            await migrationClient.query(
                                `SELECT * FROM "${schema}".xera_node_ip_inventory WHERE node_uuid=$1`,
                                [old],
                            )
                        ).rows[0],
                        before,
                    );
                    const replacement = randomUUID();
                    await migrationClient.query(
                        `UPDATE "${schema}".nodes SET uuid=$2 WHERE uuid=$1`,
                        [old, replacement],
                    );
                    assert.equal(
                        (
                            await migrationClient.query(
                                `SELECT node_uuid FROM "${schema}".xera_node_ip_inventory`,
                            )
                        ).rows[0].node_uuid,
                        replacement,
                    );
                    await migrationClient.query(`DELETE FROM "${schema}".nodes WHERE uuid=$1`, [
                        replacement,
                    ]);
                    assert.equal(
                        (
                            await migrationClient.query(
                                `SELECT count(*)::integer AS count FROM "${schema}".xera_node_ip_inventory`,
                            )
                        ).rows[0].count,
                        0,
                    );
                },
            );

            await t.test(
                'first append discovers IPv4/IPv6, durable due edge appends, and manual refresh deletes only generated addresses',
                async () => {
                    const address = `manual-${randomUUID()}.example.test`;
                    let node = await createNode({
                        address,
                        controlAddresses: [
                            { address, enabled: true },
                            { address: '192.0.2.50', enabled: false },
                        ],
                        ips: [{ ip: '192.0.2.50', status: 'OUTBOUND' }],
                    });
                    node = await scan(node, ['192.0.2.1', '2001:0DB8::1'], { mode: 'append' });
                    assert.deepEqual(node.ipInventory.addresses, ['192.0.2.1', '2001:db8::1']);
                    assert.deepEqual(node.ipInventory.generatedAddresses, [
                        '192.0.2.1',
                        '2001:db8::1',
                    ]);
                    const before = await observe(node.uuid);
                    const restarted = new runtime.NodesRepository(
                        transactions,
                        {},
                        new runtime.NodesConverter(),
                    );
                    await restarted.applyIpScan({
                        uuid: node.uuid,
                        addresses: ['192.0.2.2'],
                        expectedControlRevision: node.controlRevision,
                        expectedScanRevision: randomUUID(),
                        mode: 'append',
                        now: after(1_800_000 - 1),
                    });
                    assert.deepEqual(await observe(node.uuid), before);
                    node = await scan(node, ['192.0.2.2'], {
                        mode: 'append',
                        now: after(1_800_000),
                    });
                    assert.deepEqual(
                        node.controlAddresses.map((row) => row.address),
                        [address, '192.0.2.50', '192.0.2.1', '2001:db8::1', '192.0.2.2'],
                    );
                    assert.deepEqual(node.ipInventory.generatedAddresses, [
                        '192.0.2.1',
                        '2001:db8::1',
                        '192.0.2.2',
                    ]);
                    node = await scan(node, ['2001:db8::1']);
                    assert.deepEqual(node.controlAddresses, [
                        { address, enabled: true },
                        { address: '192.0.2.50', enabled: false },
                        { address: '2001:db8::1', enabled: true },
                    ]);
                    assert.deepEqual(node.ips, [
                        { ip: '192.0.2.50', status: 'OUTBOUND' },
                        { ip: '2001:db8::1', status: 'INBOUND' },
                    ]);
                    assert.deepEqual(node.ipInventory.generatedAddresses, ['2001:db8::1']);
                },
            );

            await t.test(
                'all-off state and existing manual IP provenance survive observation and empty refresh',
                async () => {
                    const node = await createNode();
                    let disabled = await repository.update(
                        { uuid: node.uuid, controlAddresses: [] },
                        node.controlRevision,
                    );
                    disabled = await scan(disabled, ['192.0.2.3'], { mode: 'initial' });
                    assert.equal(
                        disabled.controlAddresses.every((row) => !row.enabled),
                        true,
                    );
                    assert.equal(disabled.isConnected, false);
                    assert.equal(disabled.isConnecting, false);
                    disabled = await scan(disabled, ['2001:db8::3'], {
                        mode: 'append',
                        now: after(1_800_000),
                    });
                    assert.equal(
                        disabled.controlAddresses.every((row) => !row.enabled),
                        true,
                    );
                    disabled = await scan(disabled, []);
                    assert.deepEqual(disabled.controlAddresses, [
                        { address: node.address, enabled: false },
                    ]);
                    assert.deepEqual(disabled.ipInventory.addresses, []);
                    const manual = await createNode({
                        ips: [{ ip: '192.0.2.50', status: 'OUTBOUND' }],
                        controlAddresses: [{ address: '192.0.2.50', enabled: false }],
                    });
                    let observed = await scan(manual, ['192.0.2.50'], { mode: 'initial' });
                    assert.deepEqual(observed.ipInventory.generatedAddresses, []);
                    observed = await scan(observed, []);
                    assert.deepEqual(observed.controlAddresses, [
                        { address: '192.0.2.50', enabled: false },
                    ]);
                    assert.deepEqual(observed.ips, [{ ip: '192.0.2.50', status: 'OUTBOUND' }]);
                },
            );

            await t.test(
                'metadata-only scan rotates scan UUID without control revision or route epoch changes',
                async () => {
                    let node = await createNode();
                    node = await scan(node, ['192.0.2.4', '2001:db8::4']);
                    const before = await observe(node.uuid);
                    const refreshed = await scan(node, ['192.0.2.4', '2001:db8::4'], {
                        now: after(1000),
                    });
                    const stored = await observe(node.uuid);
                    assert.deepEqual(stored.node, before.node);
                    assert.equal(stored.epoch, before.epoch);
                    assert.notEqual(refreshed.ipInventory.revision, node.ipInventory.revision);
                    assert.equal(refreshed.controlRevision, node.controlRevision);
                    assert.deepEqual(refreshed.ipInventory.scannedAt, after(1000));
                    const reversed = await scan(refreshed, ['2001:db8::4', '192.0.2.4'], {
                        now: after(2000),
                    });
                    const reordered = await observe(node.uuid);
                    assert.deepEqual(reordered.node, stored.node);
                    assert.equal(reordered.epoch, stored.epoch);
                    assert.notEqual(reversed.ipInventory.revision, refreshed.ipInventory.revision);
                },
            );

            for (const mode of ['refresh', 'append'])
                await t.test(
                    `concurrent ${mode} waits on the node row lock and rejects stale scan revision after same-root metadata commit`,
                    async (scope) => {
                        let node = await createNode();
                        node = await scan(node, ['2001:db8::5']);
                        const before = await observe(node.uuid);
                        const first = {
                            ...hookFor(node.uuid),
                            entered: deferred(),
                            written: deferred(),
                            release: deferred(),
                        };
                        const second = { ...hookFor(node.uuid), entered: deferred() };
                        releases.push(first.release);
                        const offset = pending.length;
                        scope.after(async () => {
                            first.release.resolve();
                            await Promise.all(pending.slice(offset));
                        });
                        const a = track(
                            hooks.run(first, () =>
                                scan(node, ['2001:db8::5'], { now: after(1000) }),
                            ),
                        );
                        const holder = await gateOrFailure(first.entered, a);
                        const uncommitted = await gateOrFailure(first.written, a);
                        assert.deepEqual(await observe(node.uuid), before);
                        assert.equal(uncommitted.controlRevision, node.controlRevision);
                        assert.notEqual(
                            uncommitted.ipInventory.revision,
                            node.ipInventory.revision,
                        );
                        const b = track(
                            hooks.run(second, () =>
                                scan(node, ['2001:db8::5'], { mode, now: after(1_801_000) }),
                            ),
                        );
                        const waiter = await gateOrFailure(second.entered, b);
                        assert.notEqual(holder.pid, waiter.pid);
                        await waitForRowLock(observer, holder, waiter);
                        first.release.resolve();
                        const resultA = await a;
                        assert.ifError(resultA.error);
                        const resultB = await b;
                        assert(
                            resultB.error && conflict(resultB.error),
                            'The waiting stale scan must reject',
                        );
                        const stored = await observe(node.uuid);
                        assert.equal(stored.node.control_revision, node.controlRevision);
                        assert.equal(stored.epoch, before.epoch);
                        assert.equal(stored.inventory.revision, resultA.value.ipInventory.revision);
                    },
                );

            await t.test(
                'old root revision rejects ABA and generic user omission cannot remove generated addresses',
                async () => {
                    let node = await createNode();
                    node = await scan(node, ['192.0.2.6']);
                    const old = node;
                    node = await repository.update(
                        { uuid: node.uuid, port: 2223 },
                        node.controlRevision,
                    );
                    node = await repository.update(
                        { uuid: node.uuid, port: 2222 },
                        node.controlRevision,
                    );
                    const before = await observe(node.uuid);
                    await assert.rejects(scan(old, ['2001:db8::6']), conflict);
                    assert.deepEqual(await observe(node.uuid), before);
                    const updated = await repository.update(
                        {
                            uuid: node.uuid,
                            controlAddresses: [{ address: node.address, enabled: true }],
                        },
                        node.controlRevision,
                    );
                    assert.deepEqual(updated.controlAddresses, [
                        { address: node.address, enabled: true },
                        { address: '192.0.2.6', enabled: false },
                    ]);
                    assert.deepEqual(updated.ipInventory, node.ipInventory);
                },
            );

            for (const failure of ['refetch', 'commit', 'metadata refetch'])
                await t.test(
                    `${failure} failure proves final refetch and inventory writes share the real rollback transaction`,
                    async () => {
                        let node = await createNode();
                        node = await scan(node, ['192.0.2.7']);
                        const before = await observe(node.uuid);
                        const error = Error('Injected inventory transaction failure');
                        const hook = {
                            ...hookFor(node.uuid),
                            ...(failure === 'commit'
                                ? { rollbackError: error }
                                : { refetchError: error }),
                        };
                        await assert.rejects(
                            hooks.run(hook, () =>
                                scan(
                                    node,
                                    failure === 'metadata refetch'
                                        ? ['192.0.2.7']
                                        : ['2001:db8::7'],
                                    { now: after(1000) },
                                ),
                            ),
                            (value) => value === error,
                        );
                        assert.deepEqual(await observe(node.uuid), before);
                        assert.equal(hook.transactions.length, 1);
                        assert.deepEqual(
                            hook.events.map((event) => event.operation),
                            failure === 'metadata refetch'
                                ? ['inventory upsert', 'findUniqueOrThrow']
                                : ['update', 'inventory upsert', 'findUniqueOrThrow'],
                        );
                        for (const event of hook.events) {
                            assert.deepEqual(event.before, hook.transactions[0]);
                            assert.deepEqual(event.after, hook.transactions[0]);
                        }
                        assert.deepEqual(hook.visible, before);
                        const refetched = hook.events.at(-1).row;
                        assert.notEqual(refetched.ipInventory.revision, node.ipInventory.revision);
                    },
                );

            await t.test(
                '64 input addresses and 65 combined routes are accepted while overflow rolls back without truncation',
                async () => {
                    const input = Array.from({ length: 64 }, (_, i) => `2001:db8::${i + 1}`);
                    let node = await createNode();
                    node = await scan(node, input);
                    assert.equal(node.controlAddresses.length, 65);
                    assert.equal(node.ipInventory.addresses.length, 64);
                    assert.equal(node.ipInventory.generatedAddresses.length, 64);
                    assert.equal(node.ips.length, 64);
                    const before = await observe(node.uuid);
                    for (const addresses of [Array(65).fill('192.0.2.1'), ['192.0.2.1']]) {
                        await assert.rejects(
                            scan(node, addresses, { mode: 'append', now: after(1_800_000) }),
                        );
                        assert.deepEqual(await observe(node.uuid), before);
                    }
                    await prisma.nodes.delete({ where: { uuid: node.uuid } });
                    assert.equal(
                        await prisma.nodeIpInventory.findUnique({ where: { nodeUuid: node.uuid } }),
                        null,
                    );
                },
            );
        } finally {
            for (const release of releases) release.resolve();
            await Promise.all(pending);
            try {
                if (migrationTransaction) await migrationClient.query('ROLLBACK');
                if (created.length)
                    await prisma.nodes.deleteMany({ where: { uuid: { in: created } } });
            } finally {
                try {
                    if (schemaCreated)
                        await migrationClient.query(`DROP SCHEMA "${schema}" CASCADE`);
                } finally {
                    await Promise.all([
                        observer.end(),
                        migrationClient.end(),
                        prisma.$disconnect(),
                    ]);
                }
            }
        }
    },
);
