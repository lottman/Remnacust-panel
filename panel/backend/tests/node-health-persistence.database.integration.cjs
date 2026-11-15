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
const { healthRuntime, deferred } = require('./node-health-persistence.test.cjs');

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
                timer = setTimeout(() => reject(Error(message)), 10000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function waitForRowLock(observer, holder, waiter) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        const row = (
            await observer.query(
                `SELECT $1::integer = ANY(pg_blocking_pids(pid)) AS blocked, query
            FROM pg_stat_activity WHERE pid=$2::integer`,
                [holder.pid, waiter.pid],
            )
        ).rows[0];
        if (row?.blocked) {
            assert.match(row.query, /FROM\s+(?:public\.)?"?nodes"?[\s\S]*FOR\s+UPDATE/i);
            assert.match(row.query, /control_revision/);
            return;
        }
        await delay(10);
    }
    assert.fail('The stale health transaction did not wait on the actual parent row lock');
}

test(
    'node health observation migration and actual handler/Prisma/CLS persistence',
    {
        skip:
            !url &&
            'No NODE_CONTROL_TEST_DATABASE_URL; local PostgreSQL is deliberately not started',
        timeout: 180000,
    },
    async (t) => {
        const runtime = healthRuntime();
        const observer = new Client({ connectionString: url, statement_timeout: 10000 });
        const migration = new Client({ connectionString: url, statement_timeout: 10000 });
        const hooks = new AsyncLocalStorage();
        const schema = 'rc_node_health_' + randomUUID().replaceAll('-', '');
        assert(/^rc_node_health_[a-f0-9]+$/.test(schema));
        const created = [],
            pending = [],
            releases = [];
        let schemaCreated = false,
            migrationTransaction = false,
            transactions;
        const observe = async (uuid) =>
            (
                await observer.query(
                    `SELECT
        (SELECT to_jsonb(n) FROM public.nodes n WHERE n.uuid=$1) AS node,
        (SELECT to_jsonb(h) FROM public.xera_node_health_observations h WHERE h.node_uuid=$1) AS watermark,
        (SELECT revision::text FROM public.xera_node_route_revision WHERE id=1) AS epoch`,
                    [uuid],
                )
            ).rows[0];
        const identity = async () =>
            (
                await transactions.tx
                    .$queryRaw`SELECT pg_backend_pid() AS pid, txid_current()::text AS xid`
            )[0];
        const prisma = new PrismaClient({ datasourceUrl: url }).$extends({
            query: {
                nodes: {
                    async update({ args, query }) {
                        const hook = hooks.getStore();
                        if (hook?.uuid !== args.where.uuid) return query(args);
                        const before = await identity();
                        assert.equal(transactions.isTransactionActive(), true);
                        const row = await query(args);
                        const watermark = await transactions.tx.$queryRaw`
                SELECT control_revision::text AS revision,observed_at::text AS at,attempt,healthy
                FROM xera_node_health_observations WHERE node_uuid=${hook.uuid}::uuid`;
                        hook.writes.push({ before, after: await identity(), row, watermark });
                        hook.visible = await observe(hook.uuid);
                        if (hook.persistError)
                            throw Error('Injected error after actual node write');
                        return row;
                    },
                },
            },
        });
        const adapter = new TransactionalAdapterPrisma({
            prismaInjectionToken: PrismaClient,
            defaultTxOptions: { maxWait: 10000, timeout: 25000 },
        });
        const options = adapter.optionsFactory(prisma);
        transactions = new TransactionHost({
            ...options,
            defaultTxOptions: adapter.defaultTxOptions,
            wrapWithTransaction: (config, fn, set) =>
                options.wrapWithTransaction(
                    config,
                    async () => {
                        const hook = hooks.getStore();
                        const id = await identity();
                        hook?.transactions.push(id);
                        hook?.entered?.resolve(id);
                        const result = await fn();
                        hook?.written?.resolve(result);
                        if (hook?.release) await hook.release.promise;
                        if (hook?.rollback)
                            throw Error('Injected rollback after actual persistence');
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
        const handler = new runtime.UpdateNodeHandler(repository);
        handler.logger = { error() {} };
        const makeNode = async () => {
            const uuid = randomUUID();
            created.push(uuid);
            const address = `health-${uuid}.example.test`;
            return repository.create(
                new runtime.NodesEntity({
                    uuid,
                    name: `health-${uuid}`,
                    address,
                    port: 2222,
                    proxyUrl: null,
                    ips: [],
                    isConnected: false,
                    isDisabled: false,
                    controlAddresses: [{ address, enabled: true }],
                }),
            );
        };
        const update = (node, at, attempt = 1, healthy = true, revision = node.controlRevision) =>
            handler.execute(
                new runtime.UpdateNodeCommand(
                    {
                        uuid: node.uuid,
                        isConnected: healthy,
                        lastStatusMessage: healthy ? '[HEALTHY]' : '[UNREACHABLE]',
                    },
                    revision,
                    { observedAt: at, attempt },
                ),
            );
        const hookFor = (uuid) => ({ uuid, writes: [], transactions: [] });
        const track = (promise) => {
            const result = promise.then(
                (value) => ({ value }),
                (error) => ({ error }),
            );
            pending.push(result);
            return result;
        };
        const gateOrFailure = (gate, result) =>
            within(
                Promise.race([
                    gate.promise,
                    result.then((outcome) => {
                        throw (
                            outcome.error ??
                            Error('Handler finished before the expected transaction gate')
                        );
                    }),
                ]),
                'Actual repository did not reach the expected transaction gate',
            );
        try {
            await observer.connect();
            await migration.connect();
            const role = (
                await observer.query(`SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole
            FROM pg_roles WHERE rolname=current_user`)
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
                ) / 10000,
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
            ).rows[0].count;
            assert.equal(applied, migrations.length, 'Use the fully migrated disposable fixture');
            assert.equal(
                (
                    await observer.query(`SELECT count(*)::integer AS count FROM public._prisma_migrations
            WHERE migration_name='20261115010000_node_health_observation' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`)
                ).rows[0].count,
                1,
            );
            t.diagnostic(
                `PostgreSQL ${major}; ${applied} migrations; actual command/handler/Transactional/CLS/Prisma`,
            );

            await t.test(
                'forward migration preserves old rows, rolls back DDL, constrains tuple fields and cascades deletion',
                async () => {
                    await migration.query(`CREATE SCHEMA "${schema}"`);
                    schemaCreated = true;
                    await migration.query(
                        `CREATE TABLE "${schema}".nodes(uuid uuid PRIMARY KEY,address text NOT NULL)`,
                    );
                    const uuid = randomUUID();
                    await migration.query(
                        `INSERT INTO "${schema}".nodes VALUES ($1,'old.example.test')`,
                        [uuid],
                    );
                    const old = (await migration.query(`SELECT * FROM "${schema}".nodes`)).rows;
                    const sql = fs
                        .readFileSync(
                            path.join(
                                __dirname,
                                '../prisma/migrations/20261115010000_node_health_observation/migration.sql',
                            ),
                            'utf8',
                        )
                        .replace(/\bpublic\./g, `"${schema}".`);
                    const apply = async () => {
                        await migration.query('BEGIN');
                        migrationTransaction = true;
                        await migration.query(`SET LOCAL search_path TO "${schema}",public`);
                        await migration.query(sql);
                        assert.deepEqual(
                            (await migration.query(`SELECT * FROM "${schema}".nodes`)).rows,
                            old,
                        );
                        assert.equal(
                            (
                                await migration.query(
                                    `SELECT count(*)::integer AS n FROM "${schema}".xera_node_health_observations`,
                                )
                            ).rows[0].n,
                            0,
                        );
                    };
                    await apply();
                    await migration.query('ROLLBACK');
                    migrationTransaction = false;
                    assert.equal(
                        (
                            await migration.query('SELECT to_regclass($1)::text AS name', [
                                `${schema}.xera_node_health_observations`,
                            ])
                        ).rows[0].name,
                        null,
                    );
                    await apply();
                    await migration.query('COMMIT');
                    migrationTransaction = false;
                    await migration.query(
                        `INSERT INTO "${schema}".xera_node_health_observations
                (node_uuid,control_revision,observed_at,attempt,healthy) VALUES ($1,$2,0,1,false)`,
                        [uuid, randomUUID()],
                    );
                    for (const at of ['-1', '9007199254740992'])
                        await assert.rejects(
                            migration.query(
                                `UPDATE "${schema}".xera_node_health_observations SET observed_at=$1`,
                                [at],
                            ),
                            (error) => error.code === '23514',
                        );
                    for (const attempt of [0, 3])
                        await assert.rejects(
                            migration.query(
                                `UPDATE "${schema}".xera_node_health_observations SET attempt=$1`,
                                [attempt],
                            ),
                            (error) => error.code === '23514',
                        );
                    await assert.rejects(
                        migration.query(
                            `UPDATE "${schema}".xera_node_health_observations SET healthy=NULL`,
                        ),
                        (error) => error.code === '23502',
                    );
                    await assert.rejects(
                        migration.query(
                            `INSERT INTO "${schema}".xera_node_health_observations
                VALUES ($1,$2,1,1,true)`,
                            [randomUUID(), randomUUID()],
                        ),
                        (error) => error.code === '23503',
                    );
                    await migration.query(`DELETE FROM "${schema}".nodes WHERE uuid=$1`, [uuid]);
                    assert.equal(
                        (
                            await migration.query(
                                `SELECT count(*)::integer AS n FROM "${schema}".xera_node_health_observations`,
                            )
                        ).rows[0].n,
                        0,
                    );
                },
            );

            await t.test(
                'actual same-R stale failure waits on the node lock then rejects after newer success commits',
                async () => {
                    const node = await makeNode();
                    const before = await observe(node.uuid);
                    const fresh = {
                        ...hookFor(node.uuid),
                        entered: deferred(),
                        written: deferred(),
                        release: deferred(),
                    };
                    const stale = { ...hookFor(node.uuid), entered: deferred() };
                    releases.push(fresh.release);
                    const newerResult = track(hooks.run(fresh, () => update(node, 200, 1, true)));
                    const holder = await gateOrFailure(fresh.entered, newerResult);
                    await gateOrFailure(fresh.written, newerResult);
                    assert.deepEqual(
                        await observe(node.uuid),
                        before,
                        'watermark and node stay invisible until commit',
                    );
                    const olderResult = track(hooks.run(stale, () => update(node, 100, 2, false)));
                    const waiter = await gateOrFailure(stale.entered, olderResult);
                    await waitForRowLock(observer, holder, waiter);
                    fresh.release.resolve();
                    assert.equal((await newerResult).value.isOk, true);
                    const rejected = (await olderResult).value;
                    assert.equal(rejected.isOk, false);
                    assert.equal(rejected.code, 'A266');
                    const saved = await observe(node.uuid);
                    assert.equal(saved.node.is_connected, true);
                    assert.equal(saved.watermark.observed_at, 200);
                    assert.equal(saved.watermark.healthy, true);
                    assert.equal(saved.node.control_revision, node.controlRevision);
                    assert.equal(saved.epoch, before.epoch);
                    assert.equal(fresh.writes.length, 1);
                    assert.equal(stale.writes.length, 0);
                    assert.deepEqual(fresh.writes[0].before, fresh.writes[0].after);
                    assert.equal(fresh.writes[0].watermark[0].at, '200');
                },
            );

            await t.test(
                'SQL tuple predicate rejects duplicates and stale attempts, with healthy winning equal-order ties',
                async () => {
                    const node = await makeNode();
                    assert.equal((await update(node, 100, 2, false)).isOk, true);
                    for (const [at, attempt, healthy, accepted] of [
                        [99, 2, true, false],
                        [100, 1, true, false],
                        [100, 2, false, false],
                        [100, 2, true, true],
                        [100, 2, false, false],
                        [100, 2, true, false],
                        [101, 1, false, true],
                    ]) {
                        const before = await observe(node.uuid);
                        const hook = hookFor(node.uuid);
                        const result = await hooks.run(hook, () =>
                            update(node, at, attempt, healthy),
                        );
                        assert.equal(result.isOk, accepted);
                        if (!accepted) {
                            assert.equal(result.code, 'A266');
                            assert.equal(hook.writes.length, 0);
                            assert.deepEqual(await observe(node.uuid), before);
                        }
                    }
                },
            );

            await t.test(
                'control revision changes reset ordering while old revision observations remain fenced',
                async () => {
                    const node = await makeNode();
                    assert.equal((await update(node, 1000)).isOk, true);
                    const changed = await repository.update(
                        { uuid: node.uuid, port: 2223 },
                        node.controlRevision,
                    );
                    assert.notEqual(changed.controlRevision, node.controlRevision);
                    assert.equal((await update(changed, 1, 1, false)).isOk, true);
                    const before = await observe(node.uuid);
                    assert.equal((await update(node, 2000)).code, 'A266');
                    assert.deepEqual(await observe(node.uuid), before);
                    assert.equal(before.watermark.control_revision, changed.controlRevision);
                    assert.equal(before.watermark.observed_at, 1);
                },
            );

            for (const fault of ['persistError', 'rollback'])
                await t.test(
                    `${fault} rolls back both actual watermark and node writes and permits retry`,
                    async () => {
                        const node = await makeNode();
                        const before = await observe(node.uuid);
                        const hook = { ...hookFor(node.uuid), [fault]: true };
                        const failed = await hooks.run(hook, () => update(node, 100));
                        assert.equal(failed.isOk, false);
                        assert.equal(hook.writes.length, 1);
                        assert.equal(hook.writes[0].watermark[0].at, '100');
                        assert.deepEqual(hook.visible, before);
                        assert.deepEqual(await observe(node.uuid), before);
                        assert.equal((await update(node, 100)).isOk, true);
                    },
                );

            await t.test(
                'ordinary handler updates create no watermark; node deletion cascades committed observations',
                async () => {
                    const node = await makeNode();
                    assert.equal(
                        (
                            await handler.execute(
                                new runtime.UpdateNodeCommand(
                                    { uuid: node.uuid, lastStatusMessage: '[MANUAL]' },
                                    node.controlRevision,
                                ),
                            )
                        ).isOk,
                        true,
                    );
                    assert.equal((await observe(node.uuid)).watermark, null);
                    assert.equal((await update(node, 0)).isOk, true);
                    await repository.deleteByUUID(node.uuid);
                    const deleted = await observe(node.uuid);
                    assert.equal(deleted.node, null);
                    assert.equal(deleted.watermark, null);
                },
            );
        } finally {
            for (const release of releases) release.resolve();
            await Promise.all(pending);
            try {
                if (migrationTransaction) await migration.query('ROLLBACK');
                if (created.length)
                    await prisma.nodes.deleteMany({ where: { uuid: { in: created } } });
            } finally {
                try {
                    if (schemaCreated) await migration.query(`DROP SCHEMA "${schema}" CASCADE`);
                } finally {
                    await Promise.all([observer.end(), migration.end(), prisma.$disconnect()]);
                }
            }
        }
    },
);
