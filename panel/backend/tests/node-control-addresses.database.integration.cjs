require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { Client } = require('pg');
const { TransactionHost } = require('@nestjs-cls/transactional');
const { TransactionalAdapterPrisma } = require('@nestjs-cls/transactional-adapter-prisma');
const k = require('kysely');
const {
    PrismaTxDriver,
} = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const { PrismaClient } = require('./prisma-test-client.cjs');
const load = require('./load-typescript.cjs');

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

const sourceRoot = path.join(__dirname, '../src');
const controls = load(path.join(sourceRoot, 'modules/nodes/node-control-addresses.ts'));
const entities = load(path.join(sourceRoot, 'modules/nodes/entities/nodes.entity.ts'), {
    '@modules/config-profiles/entities': load(
        path.join(sourceRoot, 'modules/config-profiles/entities/config-profile-inbound.entity.ts'),
    ),
    '@modules/infra-billing/entities': load(
        path.join(sourceRoot, 'modules/infra-billing/entities/infra-provider.entity.ts'),
    ),
});
const { NodesConverter } = load(path.join(sourceRoot, 'modules/nodes/nodes.converter.ts'), {
    '@common/converter/universalConverter': load(
        path.join(sourceRoot, 'common/converter/universalConverter.ts'),
    ),
    './entities/nodes.entity': entities,
});
const { NodesRepository } = load(
    path.join(sourceRoot, 'modules/nodes/repositories/nodes.repository.ts'),
    {
        '../entities/nodes.entity': entities,
        '../node-control-addresses': controls,
        '@common/database': {},
        '@common/helpers/kysely/get-kysely-uuid': load(
            path.join(sourceRoot, 'common/helpers/kysely/get-kysely-uuid.ts'),
        ),
        '@common/helpers/kysely/values': {},
    },
);
const { NodeRouteInventoryService } = load(
    path.join(sourceRoot, 'common/axios/node-route-inventory.service.ts'),
);
const { NodeRouteRegistryService } = load(
    path.join(sourceRoot, 'common/axios/node-route-registry.service.ts'),
    {
        '../constants/nodes/ip-statuses': load(
            path.join(__dirname, '../libs/contract/constants/nodes/ip-statuses/index.ts'),
        ),
    },
);
const { routeCandidates } = load(path.join(sourceRoot, 'common/axios/node-control-route.ts'));
const leaseTypes = load(path.join(sourceRoot, 'queue/_nodes/port-plan-lease.service.ts'), {
    '@common/database': {},
});
const { CustomCamelCasePlugin, JSON_COLUMNS } = load(
    path.join(sourceRoot, 'common/database/camel-case.plugin.ts'),
);

function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
async function within(promise, message) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), 10_000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
async function epoch(client, schema = 'public') {
    assert(/^[a-z0-9_]+$/.test(schema));
    const rows = (
        await client.query(
            `SELECT revision::text AS revision FROM "${schema}".xera_node_route_revision WHERE id=1`,
        )
    ).rows;
    assert.equal(rows.length, 1, 'The migrated database must contain its global route epoch');
    return rows[0].revision;
}
async function waitForRowLock(observer, holder, waiter, controlColumns = true) {
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
            if (controlColumns) {
                assert.match(row.query, /control_addresses/i);
                assert.match(row.query, /control_revision/i);
            } else assert.match(row.query, /ORDER\s+BY\s+"?uuid"?[\s\S]*FOR\s+UPDATE/i);
            return;
        }
        await delay(10);
    }
    assert.fail('The second repository transaction never waited on the node control row lock');
}

test(
    'forward node-control migration and real transactional updates preserve canonical routes',
    {
        skip:
            !url &&
            'No NODE_CONTROL_TEST_DATABASE_URL; local PostgreSQL is deliberately not started',
        timeout: 120_000,
    },
    async (t) => {
        const observer = new Client({ connectionString: url, statement_timeout: 10_000 });
        const migrationClient = new Client({ connectionString: url, statement_timeout: 10_000 });
        const hooks = new AsyncLocalStorage();
        const observe = async (uuid) =>
            (
                await observer.query(
                    `SELECT (SELECT to_jsonb(n) FROM public.nodes n WHERE n.uuid=$1) AS node,
                        ARRAY(SELECT config_profile_inbound_uuid::text FROM public.config_profile_inbounds_to_nodes
                            WHERE node_uuid=$1 ORDER BY config_profile_inbound_uuid) AS inbounds,
                        (SELECT revision::text FROM public.xera_node_route_revision WHERE id=1) AS epoch`,
                    [uuid],
                )
            ).rows[0];
        const prisma = new PrismaClient({ datasourceUrl: url }).$extends({
            query: {
                nodes: {
                    async $allOperations({ operation, args, query }) {
                        const fault = hooks.getStore()?.finalRefetch;
                        if (
                            !fault ||
                            (args.where?.uuid ?? args.data?.uuid) !== fault.uuid ||
                            !['create', 'update', 'findUniqueOrThrow'].includes(operation)
                        )
                            return query(args);
                        const tx = transactions.tx;
                        const active = transactions.isTransactionActive();
                        const [before] =
                            await tx.$queryRaw`SELECT pg_backend_pid() AS pid, txid_current()::text AS xid`;
                        const row = await query(args);
                        const [after] =
                            await tx.$queryRaw`SELECT pg_backend_pid() AS pid, txid_current()::text AS xid`;
                        if (operation !== 'findUniqueOrThrow') {
                            fault.writes.push({ operation, active, before, after });
                            return row;
                        }
                        const [stored] =
                            await tx.$queryRaw`SELECT n.control_revision::text AS revision,
                            r.revision::text AS epoch FROM public.nodes n CROSS JOIN public.xera_node_route_revision r
                            WHERE n.uuid=${fault.uuid}::uuid AND r.id=1`;
                        const inbounds = (
                            await tx.configProfileInboundsToNodes.findMany({
                                where: { nodeUuid: fault.uuid },
                                select: { configProfileInboundUuid: true },
                                orderBy: { configProfileInboundUuid: 'asc' },
                            })
                        ).map((link) => link.configProfileInboundUuid);
                        fault.reads.push({
                            operation,
                            active,
                            before,
                            after,
                            row,
                            stored,
                            inbounds,
                            visible: await observe(fault.uuid),
                        });
                        throw fault.error;
                    },
                },
            },
        });
        const adapter = new TransactionalAdapterPrisma({
            prismaInjectionToken: PrismaClient,
            defaultTxOptions: { maxWait: 10_000, timeout: 20_000 },
        });
        const options = adapter.optionsFactory(prisma);
        const transactions = new TransactionHost({
            ...options,
            defaultTxOptions: adapter.defaultTxOptions,
            wrapWithTransaction: (config, fn, set) =>
                options.wrapWithTransaction(
                    config,
                    async () => {
                        assert(transactions.isTransactionActive());
                        const [identity] = await transactions.tx
                            .$queryRaw`SELECT pg_backend_pid() AS pid, txid_current()::text AS xid`;
                        const hook = hooks.getStore();
                        if (hook?.finalRefetch) hook.finalRefetch.transactions.push(identity);
                        hook?.entered?.resolve(identity);
                        const result = await fn();
                        if (hook?.written) {
                            hook.written.resolve(result);
                            await hook.release.promise;
                        }
                        if (hook?.rollback)
                            throw new Error('Injected node-control commit rollback');
                        return result;
                    },
                    set,
                ),
        });
        const db = {
            kysely: new k.Kysely({
                dialect: {
                    createDriver: () => {
                        const driver = new PrismaTxDriver(transactions);
                        const acquire = driver.acquireConnection.bind(driver);
                        driver.acquireConnection = async () => {
                            const connection = await acquire();
                            const execute = connection.executeQuery.bind(connection);
                            connection.executeQuery = async (query) => {
                                const result = await execute(query);
                                const hook = hooks.getStore();
                                if (
                                    hook?.linksDeleted &&
                                    /DELETE\s+FROM\s+"?config_profile_inbounds_to_nodes"?/i.test(
                                        query.sql,
                                    )
                                ) {
                                    hook.linksDeleted.resolve();
                                    await hook.continueLinks.promise;
                                }
                                return result;
                            };
                            return connection;
                        };
                        return driver;
                    },
                    createAdapter: () => new k.PostgresAdapter(),
                    createQueryCompiler: () => new k.PostgresQueryCompiler(),
                    createIntrospector: (database) => new k.PostgresIntrospector(database),
                },
                plugins: [new CustomCamelCasePlugin({ excludeColumns: JSON_COLUMNS })],
            }),
        };
        const repository = new NodesRepository(transactions, db, new NodesConverter());
        const leases = new leaseTypes.PortPlanLeaseService(db, transactions, {});
        const readerA = new NodeRouteInventoryService({ getOrThrow: () => url });
        const readerB = new NodeRouteInventoryService({ getOrThrow: () => url });
        const workerA = new NodeRouteRegistryService(readerA);
        const workerB = new NodeRouteRegistryService(readerB);
        const created = [],
            profiles = [],
            plugins = [],
            integrations = [],
            pending = [],
            releases = [];
        const track = (promise) => {
            const outcome = promise.then(
                (value) => ({ value }),
                (error) => ({ error }),
            );
            pending.push(outcome);
            return outcome;
        };
        const gateOrFailure = (gate, outcome, message) =>
            within(
                Promise.race([
                    gate.promise,
                    outcome.then((result) => {
                        throw result.error ?? new Error(message);
                    }),
                ]),
                message,
            );
        const held = (scope) => {
            const hook = { entered: deferred(), written: deferred(), release: deferred() };
            const start = pending.length;
            releases.push(hook.release);
            scope.after(async () => {
                hook.release.resolve();
                await Promise.all(pending.slice(start));
            });
            return hook;
        };
        const createNode = async (patch = {}, inboundUuids) => {
            const uuid = randomUUID(),
                address = `node-${uuid}.control.invalid`;
            const node = await repository.create(
                new entities.NodesEntity({
                    uuid,
                    name: `nct-${uuid.slice(0, 20)}`,
                    address,
                    port: 2222,
                    proxyUrl: null,
                    isConnected: true,
                    isDisabled: false,
                    ips: [],
                    controlAddresses: [{ address, enabled: true }],
                    ...patch,
                }),
                inboundUuids,
            );
            created.push(uuid);
            return node;
        };
        const createProfile = async (count = 2) => {
            const uuid = randomUUID();
            await prisma.configProfiles.create({
                data: { uuid, name: `ncp-${uuid.slice(0, 20)}`, config: {} },
            });
            profiles.push(uuid);
            const inbounds = [];
            for (let i = 0; i < count; i++) {
                const inbound = await prisma.configProfileInbounds.create({
                    data: {
                        uuid: randomUUID(),
                        profileUuid: uuid,
                        tag: `nci-${randomUUID()}`,
                        type: 'vless',
                    },
                });
                inbounds.push(inbound.uuid);
            }
            return { uuid, inbounds };
        };
        const createPlugin = async () => {
            const uuid = randomUUID();
            await prisma.nodePlugin.create({
                data: { uuid, name: `ncp-${uuid.slice(0, 20)}`, pluginConfig: {} },
            });
            plugins.push(uuid);
            return uuid;
        };
        const createIntegration = async () => {
            const uuid = randomUUID();
            await prisma.integrations.create({
                data: { uuid, name: `nci-${uuid.slice(0, 20)}`, config: {} },
            });
            integrations.push(uuid);
            return uuid;
        };
        const links = async (uuid) =>
            (
                await prisma.configProfileInboundsToNodes.findMany({
                    where: { nodeUuid: uuid },
                    select: { configProfileInboundUuid: true },
                    orderBy: { configProfileInboundUuid: 'asc' },
                })
            ).map((row) => row.configProfileInboundUuid);
        const refetchFault = (uuid) => ({
            uuid,
            error: new Error('Injected final node revision refetch failure'),
            transactions: [],
            writes: [],
            reads: [],
        });
        const assertRefetchTransaction = (fault, operation, before, inbounds) => {
            assert.equal(fault.transactions.length, 1);
            assert.equal(fault.writes.length, 1);
            assert.equal(fault.writes[0].operation, operation);
            assert.equal(fault.reads.length, 1);
            const read = fault.reads[0];
            for (const phase of [fault.writes[0], read]) {
                assert.equal(phase.active, true);
                assert.deepEqual(phase.before, fault.transactions[0]);
                assert.deepEqual(phase.after, fault.transactions[0]);
            }
            assert.equal(read.row.controlRevision, read.stored.revision);
            assert.match(read.stored.revision, /^[0-9a-f-]{36}$/);
            assert.notEqual(read.stored.epoch, before.epoch);
            assert.deepEqual(read.inbounds, [...inbounds].sort());
            assert.deepEqual(read.visible, before);
            return read.row;
        };
        const ip = (uuid, n) =>
            `2001:db8:${parseInt(uuid.slice(0, 4), 16).toString(16)}:${parseInt(uuid.slice(4, 8), 16).toString(16)}::${n}`;
        const schema = 'rc_node_control_' + randomUUID().replaceAll('-', '');
        let schemaCreated = false,
            migrationTransaction = false;
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
            assert(
                [14, 15, 16, 17, 18].includes(major),
                'Run this regression on PostgreSQL 14 through 18',
            );
            if (process.env.NODE_CONTROL_TEST_PG_VERSION)
                assert.equal(major, Number(process.env.NODE_CONTROL_TEST_PG_VERSION.split('.')[0]));
            t.diagnostic(
                `PostgreSQL ${major}; restricted CI owner; actual forward migration and CLS/Prisma repository`,
            );
            await epoch(observer);

            await t.test(
                'forward SQL preserves legacy domains and raw IPv6, ORs duplicate roles, and enforces 65 addresses',
                async () => {
                    assert(/^[a-z0-9_]+$/.test(schema));
                    await migrationClient.query(`CREATE SCHEMA "${schema}"`);
                    schemaCreated = true;
                    await migrationClient.query(`CREATE TABLE "${schema}".config_profiles (uuid uuid PRIMARY KEY, config jsonb NOT NULL DEFAULT '{}');
                CREATE TABLE "${schema}".config_profile_inbounds (uuid uuid PRIMARY KEY,
                    profile_uuid uuid REFERENCES "${schema}".config_profiles(uuid) ON DELETE CASCADE);
                CREATE TABLE "${schema}".node_plugin (uuid uuid PRIMARY KEY, plugin_config jsonb NOT NULL DEFAULT '{}');
                CREATE TABLE "${schema}".integrations (uuid uuid PRIMARY KEY, config jsonb NOT NULL DEFAULT '{}')`);
                    await migrationClient.query(`CREATE TABLE "${schema}".nodes (
                uuid uuid PRIMARY KEY, address text NOT NULL UNIQUE, port integer,
                proxy_url text, ips jsonb NOT NULL DEFAULT '[]', is_disabled boolean NOT NULL DEFAULT false,
                active_config_profile_uuid uuid REFERENCES "${schema}".config_profiles(uuid) ON DELETE SET NULL,
                active_plugin_uuid uuid REFERENCES "${schema}".node_plugin(uuid) ON DELETE SET NULL,
                integration_uuids uuid[] NOT NULL DEFAULT '{}',
                is_connected boolean NOT NULL DEFAULT false, is_connecting boolean NOT NULL DEFAULT false,
                last_status_message text, last_status_change timestamptz, updated_at timestamptz,
                traffic_used_bytes bigint NOT NULL DEFAULT 0
            )`);
                    await migrationClient.query(`CREATE TABLE "${schema}".config_profile_inbounds_to_nodes (
                node_uuid uuid REFERENCES "${schema}".nodes(uuid) ON DELETE CASCADE,
                config_profile_inbound_uuid uuid REFERENCES "${schema}".config_profile_inbounds(uuid) ON DELETE CASCADE,
                PRIMARY KEY(config_profile_inbound_uuid,node_uuid))`);
                    const id = randomUUID(),
                        ipv6Id = randomUUID(),
                        limitId = randomUUID();
                    const address = 'OLD.Node.Example.TEST.';
                    const ips = [
                        { ip: '2001:0DB8:0:0:0:0:0:9', status: 'OUTBOUND' },
                        { ip: '2001:db8::9', status: 'RESERVE' },
                        { ip: '192.0.2.10', status: 'OUTBOUND' },
                        { ip: '192.0.2.10', status: 'MANAGEMENT' },
                        { ip: '192.0.2.11', status: 'OUTBOUND' },
                        { ip: '2001:db8::8', status: 'MANAGEMENT' },
                    ];
                    const legacy = routeCandidates({
                        uuid: id,
                        address,
                        port: null,
                        proxyUrl: null,
                        ips,
                    });
                    await migrationClient.query(
                        `INSERT INTO "${schema}".nodes(uuid,address,ips) VALUES($1,$2,$3)`,
                        [id, address, JSON.stringify(ips)],
                    );
                    await migrationClient.query(
                        `INSERT INTO "${schema}".nodes(uuid,address,ips) VALUES($1,$2,$3)`,
                        [
                            ipv6Id,
                            '2001:0db8:0:0:0:0:0:7',
                            JSON.stringify([{ ip: '2001:db8::7', status: 'OUTBOUND' }]),
                        ],
                    );
                    const maxIps = Array.from({ length: 64 }, (_, i) => ({
                        ip: `192.0.2.${i + 1}`,
                        status: i === 63 ? 'RESERVE' : 'OUTBOUND',
                    }));
                    await migrationClient.query(
                        `INSERT INTO "${schema}".nodes(uuid,address,ips) VALUES($1,$2,$3)`,
                        [limitId, 'limit.example.test', JSON.stringify(maxIps)],
                    );
                    const sql = fs.readFileSync(
                        path.join(
                            __dirname,
                            '../prisma/migrations/20261114010000_node_control_addresses/migration.sql',
                        ),
                        'utf8',
                    );
                    await migrationClient.query('BEGIN');
                    migrationTransaction = true;
                    await migrationClient.query(sql.replace(/\bpublic\b/g, `"${schema}"`));
                    await migrationClient.query('COMMIT');
                    migrationTransaction = false;
                    const migrated = (
                        await observer.query(
                            `SELECT address, ips, control_addresses AS "controlAddresses",
                control_revision::text AS "controlRevision" FROM "${schema}".nodes WHERE uuid=$1`,
                            [id],
                        )
                    ).rows[0];
                    assert.equal(migrated.address, address);
                    assert.deepEqual(migrated.ips, ips);
                    assert.deepEqual(migrated.controlAddresses, [
                        { address: 'old.node.example.test', enabled: true },
                        { address: '2001:db8::9', enabled: true },
                        { address: '192.0.2.10', enabled: true },
                        { address: '192.0.2.11', enabled: false },
                        { address: '2001:db8::8', enabled: true },
                    ]);
                    assert.deepEqual(
                        routeCandidates({ ...migrated, uuid: id, port: null, proxyUrl: null }),
                        legacy,
                    );
                    const ipv6 = (
                        await observer.query(
                            `SELECT address, control_addresses AS addresses FROM "${schema}".nodes WHERE uuid=$1`,
                            [ipv6Id],
                        )
                    ).rows[0];
                    assert.equal(ipv6.address, '2001:0db8:0:0:0:0:0:7');
                    assert.deepEqual(ipv6.addresses, [{ address: '2001:db8::7', enabled: true }]);
                    assert.equal(
                        (
                            await observer.query(
                                `SELECT jsonb_array_length(control_addresses) AS count FROM "${schema}".nodes WHERE uuid=$1`,
                                [limitId],
                            )
                        ).rows[0].count,
                        65,
                    );
                    const beforeRejected = await epoch(observer, schema);
                    await assert.rejects(
                        observer.query(
                            `UPDATE "${schema}".nodes SET control_addresses=$2 WHERE uuid=$1`,
                            [
                                id,
                                JSON.stringify(
                                    Array.from({ length: 66 }, (_, i) => ({
                                        address: `node-${i}.invalid`,
                                        enabled: true,
                                    })),
                                ),
                            ],
                        ),
                        (error) => error.code === '23514',
                    );
                    await assert.rejects(
                        observer.query(
                            `UPDATE "${schema}".nodes SET control_addresses='{}' WHERE uuid=$1`,
                            [id],
                        ),
                        (error) => ['23514', '22023'].includes(error.code),
                    );
                    assert.equal(await epoch(observer, schema), beforeRejected);

                    await migrationClient.query('BEGIN');
                    migrationTransaction = true;
                    await migrationClient.query(
                        `UPDATE "${schema}".nodes SET control_addresses='[]' WHERE uuid=$1`,
                        [id],
                    );
                    assert.notEqual(await epoch(migrationClient, schema), beforeRejected);
                    assert.equal(await epoch(observer, schema), beforeRejected);
                    await migrationClient.query('ROLLBACK');
                    migrationTransaction = false;
                    assert.equal(await epoch(observer, schema), beforeRejected);
                    assert.deepEqual(
                        (
                            await observer.query(
                                `SELECT control_addresses AS addresses FROM "${schema}".nodes WHERE uuid=$1`,
                                [id],
                            )
                        ).rows[0].addresses,
                        migrated.controlAddresses,
                    );

                    await observer.query(
                        `UPDATE "${schema}".nodes SET is_connected=true,is_connecting=true,
                last_status_message='health',last_status_change=now(),updated_at=now(),traffic_used_bytes=42 WHERE uuid=$1`,
                        [id],
                    );
                    assert.equal(await epoch(observer, schema), beforeRejected);
                    assert.equal(
                        (
                            await observer.query(
                                `SELECT control_revision::text AS revision FROM "${schema}".nodes WHERE uuid=$1`,
                                [id],
                            )
                        ).rows[0].revision,
                        migrated.controlRevision,
                    );
                    await observer.query(
                        `UPDATE "${schema}".nodes SET address=address,port=port,proxy_url=proxy_url,
                ips=ips,control_addresses=control_addresses,is_disabled=is_disabled WHERE uuid=$1`,
                        [id],
                    );
                    assert.equal(await epoch(observer, schema), beforeRejected);
                    let revision = beforeRejected,
                        controlRevision = migrated.controlRevision;
                    for (const [column, value] of [
                        ['address', 'changed.example.test'],
                        ['port', 2222],
                        ['proxy_url', 'socks5://proxy.example.test:1080'],
                        ['ips', JSON.stringify([{ ip: '192.0.2.19', status: 'RESERVE' }])],
                        ['is_disabled', true],
                        ['control_addresses', '[]'],
                    ]) {
                        assert(
                            [
                                'address',
                                'port',
                                'proxy_url',
                                'ips',
                                'is_disabled',
                                'control_addresses',
                            ].includes(column),
                        );
                        const changed = (
                            await observer.query(
                                `UPDATE "${schema}".nodes SET ${column}=$2 WHERE uuid=$1
                    RETURNING control_revision::text AS revision`,
                                [id, value],
                            )
                        ).rows[0].revision;
                        const next = await epoch(observer, schema);
                        assert.notEqual(changed, controlRevision, column);
                        assert.notEqual(next, revision, column);
                        controlRevision = changed;
                        revision = next;
                    }
                    const added = randomUUID();
                    await observer.query(
                        `INSERT INTO "${schema}".nodes(uuid,address) VALUES($1,'insert.example.test')`,
                        [added],
                    );
                    let next = await epoch(observer, schema);
                    assert.notEqual(next, revision);
                    revision = next;
                    await observer.query(`DELETE FROM "${schema}".nodes WHERE uuid=$1`, [added]);
                    next = await epoch(observer, schema);
                    assert.notEqual(next, revision);
                    revision = next;
                    const truncateProfile = randomUUID(),
                        truncateInbound = randomUUID();
                    await observer.query(
                        `INSERT INTO "${schema}".config_profiles(uuid) VALUES($1)`,
                        [truncateProfile],
                    );
                    await observer.query(
                        `INSERT INTO "${schema}".config_profile_inbounds(uuid,profile_uuid) VALUES($1,$2)`,
                        [truncateInbound, truncateProfile],
                    );
                    await observer.query(
                        `UPDATE "${schema}".nodes SET active_config_profile_uuid=$2 WHERE uuid=$1`,
                        [id, truncateProfile],
                    );
                    await observer.query(
                        `INSERT INTO "${schema}".config_profile_inbounds_to_nodes(node_uuid,config_profile_inbound_uuid) VALUES($1,$2)`,
                        [id, truncateInbound],
                    );
                    const beforeTruncate = (
                        await observer.query(
                            `SELECT control_revision::text AS revision FROM "${schema}".nodes WHERE uuid=$1`,
                            [id],
                        )
                    ).rows[0].revision;
                    revision = await epoch(observer, schema);
                    await observer.query(`TRUNCATE "${schema}".config_profile_inbounds_to_nodes`);
                    assert.notEqual(
                        (
                            await observer.query(
                                `SELECT control_revision::text AS revision FROM "${schema}".nodes WHERE uuid=$1`,
                                [id],
                            )
                        ).rows[0].revision,
                        beforeTruncate,
                    );
                    assert.notEqual(await epoch(observer, schema), revision);
                    revision = await epoch(observer, schema);
                    await observer.query(
                        `TRUNCATE "${schema}".nodes, "${schema}".config_profile_inbounds_to_nodes`,
                    );
                    assert.notEqual(await epoch(observer, schema), revision);
                },
            );

            await t.test(
                'locked legacy updates merge against the committed canonical edit and fence another worker immediately',
                async (scope) => {
                    const node = await createNode();
                    const previousIp = ip(node.uuid, 1),
                        outboundIp = ip(node.uuid, 2),
                        addedIp = ip(node.uuid, 3);
                    const seeded = await repository.update({
                        uuid: node.uuid,
                        ips: [
                            { ip: previousIp, status: 'MANAGEMENT' },
                            { ip: outboundIp, status: 'OUTBOUND' },
                        ],
                    });
                    const initialA = await workerA.get({ uuid: node.uuid }),
                        initialB = await workerB.get({ uuid: node.uuid });
                    const oldEpoch = await epoch(observer);
                    const nextAddress = `new-${node.uuid}.control.invalid`;
                    const hook = held(scope);
                    const first = track(
                        hooks.run(hook, () =>
                            repository.update(
                                {
                                    uuid: node.uuid,
                                    controlAddresses: [
                                        { address: nextAddress, enabled: true },
                                        { address: node.address, enabled: false },
                                    ],
                                },
                                seeded.controlRevision,
                            ),
                        ),
                    );
                    const firstIdentity = await gateOrFailure(
                        hook.entered,
                        first,
                        'Canonical update did not enter its real CLS transaction',
                    );
                    await gateOrFailure(
                        hook.written,
                        first,
                        'Canonical update never reached an uncommitted write',
                    );
                    assert.equal(await epoch(observer), oldEpoch);
                    assert.equal(await workerB.isCurrent(initialB), true);
                    const legacyHook = { entered: deferred() };
                    const second = track(
                        hooks.run(legacyHook, () =>
                            repository.update({
                                uuid: node.uuid,
                                ips: [
                                    { ip: previousIp, status: 'MANAGEMENT' },
                                    { ip: addedIp, status: 'RESERVE' },
                                ],
                            }),
                        ),
                    );
                    const secondIdentity = await gateOrFailure(
                        legacyHook.entered,
                        second,
                        'Legacy update did not enter an independent transaction',
                    );
                    assert.notEqual(firstIdentity.pid, secondIdentity.pid);
                    assert.notEqual(firstIdentity.xid, secondIdentity.xid);
                    await waitForRowLock(observer, firstIdentity, secondIdentity);
                    hook.release.resolve();
                    for (const outcome of await Promise.all([first, second]))
                        if (outcome.error) throw outcome.error;
                    const saved = await repository.findByUUID(node.uuid);
                    assert.deepEqual(saved.controlAddresses, [
                        { address: nextAddress, enabled: true },
                        { address: node.address, enabled: false },
                        { address: previousIp, enabled: false },
                        { address: outboundIp, enabled: false },
                        { address: addedIp, enabled: true },
                    ]);
                    assert.equal(saved.address, node.address);
                    assert.equal(saved.isConnected, true);
                    assert.equal(saved.isDisabled, false);
                    assert.notEqual(await epoch(observer), oldEpoch);
                    assert.equal(await workerA.isCurrent(initialA), false);
                    assert.equal(await workerB.isCurrent(initialB), false);
                    assert.deepEqual(routeCandidates(await workerB.get({ uuid: node.uuid })), [
                        nextAddress,
                        addedIp,
                    ]);
                },
            );

            await t.test(
                'concurrent canonical CAS rejects the stale writer after its row lock and records management-disabled all-off',
                async (scope) => {
                    const node = await createNode();
                    const hook = held(scope);
                    const winner = track(
                        hooks.run(hook, () =>
                            repository.update(
                                {
                                    uuid: node.uuid,
                                    note: 'winner',
                                    controlAddresses: [{ address: node.address, enabled: false }],
                                },
                                node.controlRevision,
                            ),
                        ),
                    );
                    const firstIdentity = await gateOrFailure(
                        hook.entered,
                        winner,
                        'CAS writer did not enter a transaction',
                    );
                    await gateOrFailure(
                        hook.written,
                        winner,
                        'CAS writer did not reach its uncommitted update',
                    );
                    const oldEpoch = await epoch(observer);
                    const staleHook = { entered: deferred() };
                    const stale = track(
                        hooks.run(staleHook, () =>
                            repository.update(
                                {
                                    uuid: node.uuid,
                                    note: 'loser',
                                    controlAddresses: [{ address: node.address, enabled: true }],
                                },
                                node.controlRevision,
                            ),
                        ),
                    );
                    const secondIdentity = await gateOrFailure(
                        staleHook.entered,
                        stale,
                        'Stale CAS did not enter its transaction',
                    );
                    await waitForRowLock(observer, firstIdentity, secondIdentity);
                    hook.release.resolve();
                    const winnerResult = await winner;
                    if (winnerResult.error) throw winnerResult.error;
                    const staleResult = await stale;
                    assert(staleResult.error instanceof controls.NodeControlRevisionConflictError);
                    const saved = await prisma.nodes.findUniqueOrThrow({
                        where: { uuid: node.uuid },
                    });
                    assert.equal(saved.note, 'winner');
                    assert.equal(saved.address, node.address);
                    assert.equal(saved.isConnected, false);
                    assert.equal(saved.isConnecting, false);
                    assert.equal(saved.lastStatusMessage, '[NODE_CONTROL_DISABLED]');
                    assert.equal(saved.isDisabled, false);
                    assert.deepEqual(saved.controlAddresses, [
                        { address: node.address, enabled: false },
                    ]);
                    assert.deepEqual(routeCandidates(await workerB.get({ uuid: node.uuid })), []);
                    const committedEpoch = await epoch(observer);
                    assert.notEqual(committedEpoch, oldEpoch);
                    await assert.rejects(
                        repository.update(
                            { uuid: node.uuid, controlAddresses: [] },
                            node.controlRevision,
                        ),
                        (error) => error instanceof controls.NodeControlRevisionConflictError,
                    );
                    assert.equal(await epoch(observer), committedEpoch);
                },
            );

            await t.test(
                'rollback preserves both control revision and global epoch and does not consume the CAS token',
                async () => {
                    const node = await createNode();
                    const initial = await workerB.get({ uuid: node.uuid });
                    const before = await prisma.nodes.findUniqueOrThrow({
                        where: { uuid: node.uuid },
                    });
                    const oldEpoch = await epoch(observer);
                    await assert.rejects(
                        hooks.run({ rollback: true }, () =>
                            repository.update(
                                {
                                    uuid: node.uuid,
                                    note: 'rolled back',
                                    controlAddresses: [{ address: node.address, enabled: false }],
                                },
                                node.controlRevision,
                            ),
                        ),
                        /Injected node-control commit rollback/,
                    );
                    const saved = await prisma.nodes.findUniqueOrThrow({
                        where: { uuid: node.uuid },
                    });
                    assert.deepEqual(saved, before);
                    assert.equal(await epoch(observer), oldEpoch);
                    assert.equal(await workerB.isCurrent(initial), true);
                    const committed = await repository.update(
                        { uuid: node.uuid, controlAddresses: [] },
                        node.controlRevision,
                    );
                    assert.deepEqual(committed.controlAddresses, [
                        { address: node.address, enabled: false },
                    ]);
                    assert.notEqual(committed.controlRevision, node.controlRevision);
                    assert.equal(await workerB.isCurrent(initial), false);
                },
            );

            await t.test(
                'a 65-row canonical list can be disabled but an overflowing preserved-address merge rolls back',
                async () => {
                    const prefix = randomUUID();
                    const addresses = Array.from({ length: 65 }, (_, i) => ({
                        address: `cap-${prefix}-${i}.invalid`,
                        enabled: true,
                    }));
                    const node = await createNode({ controlAddresses: addresses });
                    const disabled = await repository.update(
                        { uuid: node.uuid, controlAddresses: [] },
                        node.controlRevision,
                    );
                    assert.deepEqual(
                        disabled.controlAddresses,
                        addresses.map((row) => ({ ...row, enabled: false })),
                    );
                    assert.equal(disabled.address, node.address);
                    const oldEpoch = await epoch(observer);
                    const before = await prisma.nodes.findUniqueOrThrow({
                        where: { uuid: node.uuid },
                    });
                    await assert.rejects(
                        repository.update(
                            {
                                uuid: node.uuid,
                                controlAddresses: [
                                    { address: `overflow-${prefix}.invalid`, enabled: true },
                                ],
                            },
                            disabled.controlRevision,
                        ),
                        (error) => error instanceof controls.NodeControlAddressLimitError,
                    );
                    assert.deepEqual(
                        await prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }),
                        before,
                    );
                    assert.equal(await epoch(observer), oldEpoch);
                },
            );

            await t.test(
                'real lifecycle and port-plan fences reject canonical ABA acknowledgements but accept unchanged heartbeat revisions',
                async () => {
                    const node = await createNode();
                    const stale = structuredClone(node);
                    await prisma.$executeRaw`INSERT INTO xera_node_port_plans(node_uuid) VALUES(${node.uuid}::uuid)`;
                    const lease = await leases.acquire(node.uuid);
                    assert(lease && lease !== 'busy');
                    let writes = 0;
                    const write = (message) => async () => {
                        writes++;
                        await transactions.tx.nodes.update({
                            where: { uuid: node.uuid },
                            data: { lastStatusMessage: message },
                        });
                        return message;
                    };
                    try {
                        const changed = await prisma.nodes.update({
                            where: { uuid: node.uuid },
                            data: {
                                controlAddresses: [
                                    {
                                        address: `changed-${node.uuid}.control.invalid`,
                                        enabled: true,
                                    },
                                ],
                            },
                        });
                        assert.notEqual(changed.controlRevision, stale.controlRevision);
                        assert.equal(
                            await leases.commitLifecycleStatus(stale, write('stale lifecycle B')),
                            undefined,
                        );
                        await assert.rejects(
                            lease.commit(write('stale lease B'), stale),
                            leaseTypes.PortPlanLeaseLostError,
                        );
                        const restored = await prisma.nodes.update({
                            where: { uuid: node.uuid },
                            data: { controlAddresses: stale.controlAddresses },
                        });
                        assert.deepEqual(restored.controlAddresses, stale.controlAddresses);
                        assert.equal(restored.address, stale.address);
                        assert.equal(restored.port, stale.port);
                        assert.equal(restored.proxyUrl, stale.proxyUrl);
                        assert.equal(
                            restored.activeConfigProfileUuid,
                            stale.activeConfigProfileUuid,
                        );
                        assert.equal(restored.isDisabled, stale.isDisabled);
                        assert.notEqual(restored.controlRevision, stale.controlRevision);
                        assert.notEqual(restored.controlRevision, changed.controlRevision);
                        assert.equal(
                            await leases.commitLifecycleStatus(stale, write('stale lifecycle A')),
                            undefined,
                        );
                        await assert.rejects(
                            lease.commit(write('stale lease A'), stale),
                            leaseTypes.PortPlanLeaseLostError,
                        );
                        assert.equal(writes, 0);
                        const fresh = await repository.findByUUID(node.uuid);
                        await repository.update({
                            uuid: node.uuid,
                            isConnected: false,
                            lastStatusMessage: 'heartbeat',
                            note: 'metadata only',
                        });
                        assert.equal(
                            (await repository.findByUUID(node.uuid)).controlRevision,
                            fresh.controlRevision,
                        );
                        assert.equal(
                            await leases.commitLifecycleStatus(fresh, write('fresh lifecycle')),
                            'fresh lifecycle',
                        );
                        assert.equal(
                            await lease.commit(write('fresh lease'), fresh),
                            'fresh lease',
                        );
                        assert.equal(writes, 2);
                        assert.equal(
                            (await repository.findByUUID(node.uuid)).lastStatusMessage,
                            'fresh lease',
                        );
                    } finally {
                        await lease.close();
                    }
                },
            );

            await t.test(
                'bulk assignment locks sorted nodes and exposes neither an empty link phase nor partial pending state',
                async (scope) => {
                    const oldProfile = await createProfile(),
                        target = await createProfile();
                    const nodes = [
                        await createNode({ activeConfigProfileUuid: oldProfile.uuid }, [
                            oldProfile.inbounds[0],
                        ]),
                        await createNode(
                            {
                                activeConfigProfileUuid: oldProfile.uuid,
                                controlAddresses: [],
                                lastStatusMessage: 'off-before',
                            },
                            [oldProfile.inbounds[0]],
                        ),
                        await createNode(
                            {
                                activeConfigProfileUuid: oldProfile.uuid,
                                isDisabled: true,
                                isConnected: false,
                                lastStatusMessage: 'disabled-before',
                            },
                            [oldProfile.inbounds[0]],
                        ),
                    ];
                    const before = await Promise.all(
                        nodes.map((node) =>
                            prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }),
                        ),
                    );
                    const oldEpoch = await epoch(observer);
                    const sorted = nodes.map((node) => node.uuid).sort();
                    const hook = {
                        entered: deferred(),
                        linksDeleted: deferred(),
                        continueLinks: deferred(),
                        written: deferred(),
                        release: deferred(),
                    };
                    releases.push(hook.continueLinks, hook.release);
                    let locked = false,
                        outcome;
                    scope.after(async () => {
                        try {
                            if (locked) await migrationClient.query('ROLLBACK');
                        } finally {
                            hook.continueLinks.resolve();
                            hook.release.resolve();
                            if (outcome) await outcome;
                        }
                    });
                    await migrationClient.query('BEGIN');
                    locked = true;
                    const holder = (await migrationClient.query('SELECT pg_backend_pid() AS pid'))
                        .rows[0];
                    await migrationClient.query(
                        'SELECT uuid FROM public.nodes WHERE uuid=$1 FOR UPDATE',
                        [sorted[0]],
                    );
                    outcome = track(
                        hooks.run(hook, () =>
                            repository.assignProfile(
                                [...sorted].reverse().concat(sorted[0]),
                                target.uuid,
                                [target.inbounds[1], target.inbounds[0], target.inbounds[1]],
                            ),
                        ),
                    );
                    const waiter = await gateOrFailure(
                        hook.entered,
                        outcome,
                        'Bulk assignment did not enter its CLS/Prisma transaction',
                    );
                    await waitForRowLock(observer, holder, waiter, false);
                    await prisma.$transaction(async (tx) => {
                        await tx.$queryRaw`SELECT uuid FROM public.nodes WHERE uuid=${sorted.at(-1)}::uuid FOR UPDATE NOWAIT`;
                    });
                    await migrationClient.query('ROLLBACK');
                    locked = false;
                    await gateOrFailure(
                        hook.linksDeleted,
                        outcome,
                        'Bulk assignment did not reach its delete-before-insert phase',
                    );
                    for (let i = 0; i < nodes.length; i++) {
                        assert.deepEqual(
                            await prisma.nodes.findUniqueOrThrow({
                                where: { uuid: nodes[i].uuid },
                            }),
                            before[i],
                        );
                        assert.deepEqual(await links(nodes[i].uuid), [oldProfile.inbounds[0]]);
                    }
                    assert.equal(await epoch(observer), oldEpoch);
                    hook.continueLinks.resolve();
                    await gateOrFailure(
                        hook.written,
                        outcome,
                        'Bulk assignment did not finish its uncommitted writes',
                    );
                    for (let i = 0; i < nodes.length; i++) {
                        assert.deepEqual(
                            await prisma.nodes.findUniqueOrThrow({
                                where: { uuid: nodes[i].uuid },
                            }),
                            before[i],
                        );
                        assert.deepEqual(await links(nodes[i].uuid), [oldProfile.inbounds[0]]);
                    }
                    hook.release.resolve();
                    const result = await outcome;
                    if (result.error) throw result.error;
                    for (let i = 0; i < nodes.length; i++) {
                        const saved = await prisma.nodes.findUniqueOrThrow({
                            where: { uuid: nodes[i].uuid },
                        });
                        assert.equal(saved.activeConfigProfileUuid, target.uuid);
                        assert.deepEqual(await links(nodes[i].uuid), [...target.inbounds].sort());
                        assert.notEqual(saved.controlRevision, before[i].controlRevision);
                        assert.equal(saved.isDisabled, before[i].isDisabled);
                        if (saved.isDisabled)
                            assert.equal(saved.lastStatusMessage, 'disabled-before');
                        else {
                            assert.equal(saved.isConnected, false);
                            assert.equal(saved.isConnecting, false);
                            assert.equal(
                                saved.lastStatusMessage,
                                i === 0 ? '[NODE_UPDATE_PENDING]' : '[NODE_CONTROL_DISABLED]',
                            );
                        }
                    }
                    assert.notEqual(await epoch(observer), oldEpoch);
                    assert.equal(
                        await leases.commitLifecycleStatus(nodes[0], async () =>
                            assert.fail('Old bulk profile ACK ran'),
                        ),
                        undefined,
                    );
                },
            );

            await t.test(
                'bulk assignment rolls back root, links, R and pending markers on commit or insertion failure',
                async () => {
                    const oldProfile = await createProfile(),
                        target = await createProfile();
                    const nodes = [
                        await createNode({ activeConfigProfileUuid: oldProfile.uuid }, [
                            oldProfile.inbounds[0],
                        ]),
                        await createNode({ activeConfigProfileUuid: oldProfile.uuid }, [
                            oldProfile.inbounds[1],
                        ]),
                    ];
                    const before = await Promise.all(
                        nodes.map((node) =>
                            prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }),
                        ),
                    );
                    const beforeLinks = await Promise.all(nodes.map((node) => links(node.uuid)));
                    const oldEpoch = await epoch(observer);
                    const ids = nodes.map((node) => node.uuid).reverse();
                    await assert.rejects(
                        hooks.run({ rollback: true }, () =>
                            repository.assignProfile(ids, target.uuid, target.inbounds),
                        ),
                        /Injected node-control commit rollback/,
                    );
                    for (let i = 0; i < nodes.length; i++) {
                        assert.deepEqual(
                            await prisma.nodes.findUniqueOrThrow({
                                where: { uuid: nodes[i].uuid },
                            }),
                            before[i],
                        );
                        assert.deepEqual(await links(nodes[i].uuid), beforeLinks[i]);
                    }
                    assert.equal(await epoch(observer), oldEpoch);
                    await assert.rejects(
                        repository.assignProfile(ids, target.uuid, [randomUUID()]),
                        (error) =>
                            error.code === 'P2010' &&
                            error.meta?.driverAdapterError?.cause?.originalCode === '23503',
                    );
                    for (let i = 0; i < nodes.length; i++) {
                        assert.deepEqual(
                            await prisma.nodes.findUniqueOrThrow({
                                where: { uuid: nodes[i].uuid },
                            }),
                            before[i],
                        );
                        assert.deepEqual(await links(nodes[i].uuid), beforeLinks[i]);
                    }
                    assert.equal(await epoch(observer), oldEpoch);
                    await repository.assignProfile(ids, target.uuid, target.inbounds);
                    for (const node of nodes) {
                        const saved = await repository.findByUUID(node.uuid);
                        assert.equal(saved.activeConfigProfileUuid, target.uuid);
                        assert.equal(saved.lastStatusMessage, '[NODE_UPDATE_PENDING]');
                        assert.deepEqual(await links(node.uuid), [...target.inbounds].sort());
                    }
                },
            );

            await t.test(
                'profile, plugin, integration and explicit R changes publish fresh inventory generations without heartbeat churn',
                async () => {
                    const profileA = await createProfile(),
                        profileB = await createProfile();
                    const pluginA = await createPlugin(),
                        pluginB = await createPlugin();
                    const integrationA = await createIntegration(),
                        integrationB = await createIntegration();
                    const node = await createNode({
                        activeConfigProfileUuid: profileA.uuid,
                        activePluginUuid: pluginA,
                        integrationUuids: [integrationA],
                    });
                    let previousEpoch = await epoch(observer);
                    for (const [field, a, b] of [
                        ['activeConfigProfileUuid', profileA.uuid, profileB.uuid],
                        ['activePluginUuid', pluginA, pluginB],
                        ['integrationUuids', [integrationA], [integrationB]],
                    ]) {
                        const before = await repository.findByUUID(node.uuid);
                        const changed = await repository.update(
                            { uuid: node.uuid, [field]: b },
                            before.controlRevision,
                        );
                        assert.notEqual(changed.controlRevision, before.controlRevision, field);
                        assert.equal(
                            changed.controlRevision,
                            (await prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }))
                                .controlRevision,
                        );
                        const restored = await repository.update(
                            { uuid: node.uuid, [field]: a },
                            changed.controlRevision,
                        );
                        assert.deepEqual(restored[field], before[field]);
                        assert.notEqual(restored.controlRevision, before.controlRevision, field);
                        assert.notEqual(restored.controlRevision, changed.controlRevision, field);
                        assert.equal(
                            restored.controlRevision,
                            (await prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }))
                                .controlRevision,
                        );
                        assert.equal(
                            await leases.commitLifecycleStatus(before, async () =>
                                assert.fail('Stale desired-field ACK ran'),
                            ),
                            undefined,
                        );
                        const changedEpoch = await epoch(observer);
                        assert.notEqual(changedEpoch, previousEpoch);
                        previousEpoch = changedEpoch;
                    }
                    const beforeTouch = await repository.findByUUID(node.uuid);
                    await prisma.$executeRaw`UPDATE public.nodes SET control_revision=gen_random_uuid() WHERE uuid=${node.uuid}::uuid`;
                    const touched = await repository.findByUUID(node.uuid);
                    assert.notEqual(touched.controlRevision, beforeTouch.controlRevision);
                    const nonceEpoch = await epoch(observer);
                    assert.notEqual(nonceEpoch, previousEpoch);
                    await prisma.nodes.update({
                        where: { uuid: node.uuid },
                        data: {
                            activeConfigProfileUuid: touched.activeConfigProfileUuid,
                            activePluginUuid: touched.activePluginUuid,
                            integrationUuids: touched.integrationUuids,
                        },
                    });
                    assert.equal(
                        (await repository.findByUUID(node.uuid)).controlRevision,
                        touched.controlRevision,
                    );
                    await repository.update({
                        uuid: node.uuid,
                        note: 'metadata only',
                        isConnected: false,
                        lastStatusMessage: 'heartbeat',
                        lastStatusChange: new Date(),
                    });
                    assert.equal(
                        (await repository.findByUUID(node.uuid)).controlRevision,
                        touched.controlRevision,
                    );
                    assert.equal(await epoch(observer), nonceEpoch);
                },
            );

            await t.test(
                'nested create rolls back its row, links, R and epoch when the final revision refetch fails',
                async () => {
                    const profile = await createProfile();
                    const uuid = randomUUID(),
                        address = `node-${uuid}.control.invalid`;
                    created.push(uuid);
                    const entity = new entities.NodesEntity({
                        uuid,
                        name: `nct-${uuid.slice(0, 20)}`,
                        address,
                        port: 2222,
                        proxyUrl: null,
                        isConnected: false,
                        isDisabled: false,
                        ips: [],
                        activeConfigProfileUuid: profile.uuid,
                        controlAddresses: [{ address, enabled: true }],
                        lastStatusMessage: '[NODE_UPDATE_PENDING]',
                    });
                    const before = await observe(uuid);
                    assert.equal(before.node, null);
                    assert.deepEqual(before.inbounds, []);
                    const fault = refetchFault(uuid);
                    await assert.rejects(
                        hooks.run({ finalRefetch: fault }, () =>
                            repository.create(entity, profile.inbounds),
                        ),
                        (error) => error === fault.error,
                    );
                    assert.deepEqual(await observe(uuid), before);
                    assert.equal(await prisma.nodes.findUnique({ where: { uuid } }), null);
                    assert.deepEqual(await links(uuid), []);
                    const read = assertRefetchTransaction(
                        fault,
                        'create',
                        before,
                        profile.inbounds,
                    );
                    assert.equal(read.activeConfigProfileUuid, profile.uuid);
                    assert.equal(read.lastStatusMessage, '[NODE_UPDATE_PENDING]');
                    const retry = await repository.create(entity, profile.inbounds);
                    assert.notEqual(retry.controlRevision, read.controlRevision);
                    assert.equal(
                        retry.controlRevision,
                        (await prisma.nodes.findUniqueOrThrow({ where: { uuid } })).controlRevision,
                    );
                    assert.deepEqual(await links(uuid), [...profile.inbounds].sort());
                },
            );

            await t.test(
                'profile-only updates with omitted CAS and routes roll back replacements and empty links on final refetch failure',
                async () => {
                    const oldProfile = await createProfile(),
                        target = await createProfile();
                    const node = await createNode(
                        {
                            activeConfigProfileUuid: oldProfile.uuid,
                            lastStatusMessage: 'before profile edit',
                        },
                        [oldProfile.inbounds[0]],
                    );
                    for (const inbounds of [target.inbounds, []]) {
                        const before = await observe(node.uuid);
                        const beforeRow = await prisma.nodes.findUniqueOrThrow({
                            where: { uuid: node.uuid },
                        });
                        const fault = refetchFault(node.uuid);
                        await assert.rejects(
                            hooks.run({ finalRefetch: fault }, () =>
                                repository.update(
                                    { uuid: node.uuid, activeConfigProfileUuid: target.uuid },
                                    undefined,
                                    inbounds,
                                ),
                            ),
                            (error) => error === fault.error,
                        );
                        assert.deepEqual(await observe(node.uuid), before);
                        assert.deepEqual(
                            await prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }),
                            beforeRow,
                        );
                        assert.deepEqual(await links(node.uuid), [oldProfile.inbounds[0]]);
                        const read = assertRefetchTransaction(fault, 'update', before, inbounds);
                        assert.equal(read.activeConfigProfileUuid, target.uuid);
                        assert.notEqual(read.controlRevision, beforeRow.controlRevision);
                    }
                    const retry = await repository.update(
                        { uuid: node.uuid, activeConfigProfileUuid: target.uuid },
                        undefined,
                        target.inbounds,
                    );
                    assert.notEqual(retry.controlRevision, node.controlRevision);
                    assert.equal(
                        retry.controlRevision,
                        (await prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }))
                            .controlRevision,
                    );
                    assert.deepEqual(await links(node.uuid), [...target.inbounds].sort());
                },
            );

            await t.test(
                'same-profile nested inbound create and update return post-trigger R and fence legacy acknowledgements',
                async () => {
                    const profile = await createProfile();
                    const [a, b] = profile.inbounds;
                    const node = await createNode({ activeConfigProfileUuid: profile.uuid }, [a]);
                    assert.equal(
                        node.controlRevision,
                        (await prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }))
                            .controlRevision,
                        'Nested create must return the revision after its link triggers',
                    );
                    assert.deepEqual(await links(node.uuid), [a]);
                    const oldEpoch = await epoch(observer);
                    const changed = await repository.update(
                        { uuid: node.uuid, activeConfigProfileUuid: profile.uuid },
                        node.controlRevision,
                        [b],
                    );
                    assert.equal(changed.activeConfigProfileUuid, node.activeConfigProfileUuid);
                    assert.notEqual(changed.controlRevision, node.controlRevision);
                    assert.equal(
                        changed.controlRevision,
                        (await prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }))
                            .controlRevision,
                        'Nested update must return the revision after its link triggers',
                    );
                    assert.deepEqual(await links(node.uuid), [b]);
                    assert.equal(
                        (
                            await prisma.$queryRaw`SELECT count(*)::int AS count FROM xera_node_port_plans WHERE node_uuid=${node.uuid}::uuid`
                        )[0].count,
                        0,
                    );
                    assert.equal(
                        await leases.commitLifecycleStatus(node, async () =>
                            assert.fail('Legacy inbound ACK ran'),
                        ),
                        undefined,
                    );
                    await prisma.$executeRaw`INSERT INTO xera_node_port_plans(node_uuid,enabled) VALUES(${node.uuid}::uuid,false)`;
                    const lease = await leases.acquire(node.uuid);
                    assert(lease && lease !== 'busy');
                    try {
                        const stale = await repository.findByUUID(node.uuid);
                        const restored = await repository.update(
                            { uuid: node.uuid, activeConfigProfileUuid: profile.uuid },
                            stale.controlRevision,
                            [a],
                        );
                        assert.deepEqual(await links(node.uuid), [a]);
                        assert.notEqual(restored.controlRevision, node.controlRevision);
                        assert.notEqual(restored.controlRevision, stale.controlRevision);
                        assert.equal(
                            restored.controlRevision,
                            (await prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }))
                                .controlRevision,
                        );
                        assert.equal(
                            await leases.commitLifecycleStatus(node, async () =>
                                assert.fail('ABA legacy inbound ACK ran'),
                            ),
                            undefined,
                        );
                        await assert.rejects(
                            lease.commit(
                                async () => assert.fail('ABA port-plan inbound ACK ran'),
                                node,
                            ),
                            leaseTypes.PortPlanLeaseLostError,
                        );
                        const beforeRollback = await repository.findByUUID(node.uuid);
                        const rollbackEpoch = await epoch(observer);
                        await assert.rejects(
                            hooks.run({ rollback: true }, () =>
                                repository.update(
                                    { uuid: node.uuid, activeConfigProfileUuid: profile.uuid },
                                    beforeRollback.controlRevision,
                                    [b],
                                ),
                            ),
                            /Injected node-control commit rollback/,
                        );
                        assert.equal(
                            (await repository.findByUUID(node.uuid)).controlRevision,
                            beforeRollback.controlRevision,
                        );
                        assert.deepEqual(await links(node.uuid), [a]);
                        assert.equal(await epoch(observer), rollbackEpoch);
                        const repeated = await repository.update(
                            { uuid: node.uuid, activeConfigProfileUuid: profile.uuid },
                            beforeRollback.controlRevision,
                            [a, a],
                        );
                        assert.equal(
                            repeated.controlRevision,
                            (await prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }))
                                .controlRevision,
                        );
                        assert.deepEqual(await links(node.uuid), [a]);
                        assert.notEqual(await epoch(observer), oldEpoch);
                    } finally {
                        await lease.close();
                    }
                },
            );

            await t.test(
                'direct, bulk and cascading inbound membership changes rotate only affected node revisions',
                async () => {
                    const profile = await createProfile(),
                        otherProfile = await createProfile();
                    const [a, b] = profile.inbounds;
                    const first = await createNode({ activeConfigProfileUuid: profile.uuid });
                    const second = await createNode({ activeConfigProfileUuid: profile.uuid });
                    const unrelated = await createNode({
                        activeConfigProfileUuid: otherProfile.uuid,
                    });
                    const oldEpoch = await epoch(observer);
                    await prisma.$executeRaw`INSERT INTO config_profile_inbounds_to_nodes(node_uuid,config_profile_inbound_uuid)
                VALUES(${first.uuid}::uuid,${a}::uuid),(${second.uuid}::uuid,${a}::uuid)`;
                    let firstR = (await repository.findByUUID(first.uuid)).controlRevision;
                    let secondR = (await repository.findByUUID(second.uuid)).controlRevision;
                    assert.notEqual(firstR, first.controlRevision);
                    assert.notEqual(secondR, second.controlRevision);
                    await prisma.$executeRaw`UPDATE config_profile_inbounds_to_nodes SET config_profile_inbound_uuid=${b}::uuid
                WHERE node_uuid=${first.uuid}::uuid AND config_profile_inbound_uuid=${a}::uuid`;
                    let next = (await repository.findByUUID(first.uuid)).controlRevision;
                    assert.notEqual(next, firstR);
                    firstR = next;
                    assert.equal(
                        (await repository.findByUUID(second.uuid)).controlRevision,
                        secondR,
                    );
                    for (const [from, to] of [
                        [first.uuid, second.uuid],
                        [second.uuid, first.uuid],
                    ]) {
                        await prisma.$executeRaw`UPDATE config_profile_inbounds_to_nodes SET node_uuid=${to}::uuid
                    WHERE node_uuid=${from}::uuid AND config_profile_inbound_uuid=${b}::uuid`;
                        next = (await repository.findByUUID(first.uuid)).controlRevision;
                        assert.notEqual(next, firstR);
                        firstR = next;
                        next = (await repository.findByUUID(second.uuid)).controlRevision;
                        assert.notEqual(next, secondR);
                        secondR = next;
                        assert.equal(
                            (await repository.findByUUID(unrelated.uuid)).controlRevision,
                            unrelated.controlRevision,
                        );
                    }
                    await prisma.configProfileInbounds.delete({ where: { uuid: b } });
                    next = (await repository.findByUUID(first.uuid)).controlRevision;
                    assert.notEqual(next, firstR);
                    firstR = next;
                    assert.equal(
                        (await repository.findByUUID(first.uuid)).activeConfigProfileUuid,
                        profile.uuid,
                    );
                    assert.deepEqual(await links(first.uuid), []);
                    assert.equal(
                        (await repository.findByUUID(second.uuid)).controlRevision,
                        secondR,
                    );
                    await prisma.$executeRaw`INSERT INTO config_profile_inbounds_to_nodes(node_uuid,config_profile_inbound_uuid)
                VALUES(${first.uuid}::uuid,${a}::uuid)`;
                    firstR = (await repository.findByUUID(first.uuid)).controlRevision;
                    await prisma.$executeRaw`DELETE FROM config_profile_inbounds_to_nodes
                WHERE node_uuid IN (${first.uuid}::uuid,${second.uuid}::uuid)`;
                    next = (await repository.findByUUID(first.uuid)).controlRevision;
                    assert.notEqual(next, firstR);
                    firstR = next;
                    next = (await repository.findByUUID(second.uuid)).controlRevision;
                    assert.notEqual(next, secondR);
                    secondR = next;
                    assert.deepEqual(await links(first.uuid), []);
                    assert.deepEqual(await links(second.uuid), []);
                    await prisma.$executeRaw`INSERT INTO config_profile_inbounds_to_nodes(node_uuid,config_profile_inbound_uuid)
                VALUES(${first.uuid}::uuid,${a}::uuid),(${second.uuid}::uuid,${a}::uuid)`;
                    firstR = (await repository.findByUUID(first.uuid)).controlRevision;
                    secondR = (await repository.findByUUID(second.uuid)).controlRevision;
                    await prisma.configProfiles.delete({ where: { uuid: profile.uuid } });
                    const firstAfter = await repository.findByUUID(first.uuid),
                        secondAfter = await repository.findByUUID(second.uuid);
                    assert.notEqual(firstAfter.controlRevision, firstR);
                    assert.notEqual(secondAfter.controlRevision, secondR);
                    assert.equal(firstAfter.activeConfigProfileUuid, null);
                    assert.equal(secondAfter.activeConfigProfileUuid, null);
                    assert.deepEqual(await links(first.uuid), []);
                    assert.deepEqual(await links(second.uuid), []);
                    assert.equal(
                        (await repository.findByUUID(unrelated.uuid)).controlRevision,
                        unrelated.controlRevision,
                    );
                    assert.notEqual(await epoch(observer), oldEpoch);
                },
            );

            await t.test(
                'returned entities normalize stored duplicates while ordinary health and metadata writes do not churn epochs',
                async () => {
                    const node = await createNode();
                    const ipv6 = ip(node.uuid, 9);
                    const duplicates = [
                        { address: `[${ipv6}]`, enabled: false },
                        { address: ipv6, enabled: true },
                        { address: node.address.toUpperCase() + '.', enabled: true },
                    ];
                    await prisma.nodes.update({
                        where: { uuid: node.uuid },
                        data: { controlAddresses: duplicates },
                    });
                    const oldEpoch = await epoch(observer);
                    const raw = await prisma.nodes.findUniqueOrThrow({
                        where: { uuid: node.uuid },
                    });
                    const returned = await repository.update({
                        uuid: node.uuid,
                        note: 'metadata only',
                    });
                    assert(returned instanceof entities.NodesEntity);
                    assert.deepEqual(returned.controlAddresses, [
                        { address: ipv6, enabled: true },
                        { address: node.address, enabled: true },
                    ]);
                    assert.deepEqual(
                        (await prisma.nodes.findUniqueOrThrow({ where: { uuid: node.uuid } }))
                            .controlAddresses,
                        duplicates,
                    );
                    assert.equal(await epoch(observer), oldEpoch);
                    const initial = await workerB.get({ uuid: node.uuid });
                    await repository.update({
                        uuid: node.uuid,
                        isConnected: false,
                        isConnecting: true,
                        lastStatusMessage: 'ordinary heartbeat',
                        lastStatusChange: new Date(),
                        trafficUsedBytes: 42n,
                    });
                    const healthy = await prisma.nodes.findUniqueOrThrow({
                        where: { uuid: node.uuid },
                    });
                    assert.equal(healthy.controlRevision, raw.controlRevision);
                    assert.equal(await epoch(observer), oldEpoch);
                    assert.equal(await workerB.isCurrent(initial), true);
                    const allOff = await createNode({ controlAddresses: [], isConnected: false });
                    assert.deepEqual(routeCandidates(await workerA.get({ uuid: allOff.uuid })), []);
                    assert.equal(allOff.isDisabled, false);
                    assert.equal(allOff.isConnected, false);
                },
            );
        } finally {
            for (const release of releases) release.resolve();
            await Promise.all(pending);
            try {
                try {
                    if (migrationTransaction) await migrationClient.query('ROLLBACK');
                } finally {
                    try {
                        try {
                            if (created.length)
                                await prisma.nodes.deleteMany({ where: { uuid: { in: created } } });
                        } finally {
                            if (profiles.length)
                                await prisma.configProfiles.deleteMany({
                                    where: { uuid: { in: profiles } },
                                });
                            if (plugins.length)
                                await prisma.nodePlugin.deleteMany({
                                    where: { uuid: { in: plugins } },
                                });
                            if (integrations.length)
                                await prisma.integrations.deleteMany({
                                    where: { uuid: { in: integrations } },
                                });
                        }
                    } finally {
                        if (schemaCreated)
                            await migrationClient.query(`DROP SCHEMA "${schema}" CASCADE`);
                    }
                }
            } finally {
                await Promise.all([
                    db.kysely.destroy(),
                    readerA.onModuleDestroy(),
                    readerB.onModuleDestroy(),
                    observer.end(),
                    migrationClient.end(),
                    prisma.$disconnect(),
                ]);
            }
        }
    },
);
