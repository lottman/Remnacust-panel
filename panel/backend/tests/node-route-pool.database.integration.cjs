const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const load = require('./load-typescript.cjs');
const url = process.env.REMNACUST_ROUTE_POOL_TEST_URL;

test(
    'route inventory has independent bounded PostgreSQL queries and authoritative generations',
    { skip: !url, timeout: 30000 },
    async (t) => {
        const parsed = new URL(url);
        assert.equal(parsed.hostname, '127.0.0.1');
        assert.match(parsed.pathname, /^\/rc_route_pool_/);
        const schema = 'route_pool_' + randomUUID().replaceAll('-', '');
        const admin = new (require('pg').Client)({
            connectionString: url,
            connectionTimeoutMillis: 3000,
        });
        const adapter = load(path.join(__dirname, '../src/common/database/postgres-adapter.ts'));
        let inventoryClient;
        const { NodeRouteInventoryService } = load(
            path.join(__dirname, '../src/common/axios/node-route-inventory.service.ts'),
            {
                '@common/config/app-config/typed-config.service': {},
                '../database/postgres-adapter': {
                    createPrismaClient: (value) => {
                        assert.equal(inventoryClient, undefined);
                        return (inventoryClient = adapter.createPrismaClient(value));
                    },
                },
            },
        );
        const { NodeRouteRegistryService } = load(
            path.join(__dirname, '../src/common/axios/node-route-registry.service.ts'),
            {
                '../constants/nodes/ip-statuses': load(
                    path.join(
                        __dirname,
                        '../libs/contract/constants/nodes/ip-statuses/node-ip-statuses.constant.ts',
                    ),
                ),
                '@common/config/app-config/typed-config.service': {},
                '@common/raw-cache': {},
                './node-route-inventory.service': { NodeRouteInventoryService },
            },
        );
        await admin.connect();
        let main,
            reader,
            createdRevision = false,
            revisionReady = false,
            originalRevision;
        try {
            await admin.query(`CREATE SCHEMA "${schema}"`);
            await admin.query(`CREATE TABLE "${schema}".nodes(uuid uuid PRIMARY KEY,address text,port int,proxy_url text,ips jsonb,
            control_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
            control_revision uuid NOT NULL DEFAULT gen_random_uuid(),is_disabled boolean)`);
            const uuid = randomUUID();
            await admin.query(
                `INSERT INTO "${schema}".nodes(uuid,address,port,proxy_url,ips,control_addresses,is_disabled)
            VALUES($1,'node.example.test',2222,NULL,'[]','[{"address":"node.example.test","enabled":true}]',false)`,
                [uuid],
            );
            if (
                !(
                    await admin.query(
                        `SELECT to_regclass('public.xera_node_route_revision') AS relation`,
                    )
                ).rows[0].relation
            ) {
                await admin.query(
                    `CREATE TABLE public.xera_node_route_revision(id integer PRIMARY KEY CHECK(id=1),revision uuid NOT NULL)`,
                );
                createdRevision = true;
            }
            originalRevision = (
                await admin.query(
                    `SELECT revision::text AS revision FROM public.xera_node_route_revision WHERE id=1`,
                )
            ).rows[0]?.revision;
            revisionReady = true;
            await admin.query(
                `INSERT INTO public.xera_node_route_revision(id,revision) VALUES(1,$1) ON CONFLICT(id) DO NOTHING`,
                [randomUUID()],
            );
            parsed.searchParams.set('schema', schema);
            parsed.searchParams.set('connection_limit', '1');
            parsed.searchParams.set('connect_timeout', '1');
            parsed.searchParams.set('pool_timeout', '1');
            main = adapter.createPrismaClient(parsed.toString());
            reader = new NodeRouteInventoryService({ getOrThrow: () => parsed.toString() });
            const cache = { get: async () => null, set: async () => {} };
            const select = {
                uuid: true,
                address: true,
                port: true,
                proxyUrl: true,
                ips: true,
                controlAddresses: true,
                controlRevision: true,
                isDisabled: true,
            };
            await t.test(
                'committed route and generation reads succeed while the only billing connection is held',
                async () => {
                    await main.$transaction(
                        async (tx) => {
                            await tx.$queryRaw`SELECT 1`;
                            const shared = new NodeRouteRegistryService(
                                {
                                    nodes: main.nodes,
                                    readRevision: async () =>
                                        (
                                            await main.$queryRaw`SELECT revision::text AS revision FROM public.xera_node_route_revision WHERE id=1`
                                        )[0].revision,
                                },
                                cache,
                            );
                            await assert.rejects(
                                shared.get({ uuid }),
                                (error) => error.code === 'NODE_ROUTE_BUSY',
                            );
                            const isolated = new NodeRouteRegistryService(reader, cache);
                            const current = await isolated.get({ uuid });
                            assert.equal(current.address, 'node.example.test');
                            assert.equal(await isolated.isCurrent(current), true);
                            assert.equal(typeof (await reader.readRevision()), 'string');
                            assert.equal((await tx.$queryRaw`SELECT 1 AS value`)[0].value, 1);
                        },
                        { timeout: 10_000 },
                    );
                    const settings =
                        await inventoryClient.$queryRaw`SELECT setting::int AS timeout FROM pg_settings WHERE name='statement_timeout'`;
                    assert.equal(settings[0].timeout, 1500);
                },
            );
            await t.test(
                'each later generation read observes commit and ignores uncommitted changes without a TTL',
                async () => {
                    const before = await reader.readRevision(),
                        revision = randomUUID();
                    await admin.query('BEGIN');
                    try {
                        await admin.query(
                            'UPDATE public.xera_node_route_revision SET revision=$1 WHERE id=1',
                            [revision],
                        );
                        assert.equal(await reader.readRevision(), before);
                        await admin.query('COMMIT');
                    } finally {
                        await admin.query('ROLLBACK');
                    }
                    assert.equal(await reader.readRevision(), revision);
                },
            );
            const waitingQueries = async () => {
                await admin.query('SELECT pg_stat_clear_snapshot()');
                return (
                    await admin.query(`SELECT count(*)::int AS count FROM pg_stat_activity
                WHERE datname=current_database() AND application_name='remnacust-node-route-inventory'
                  AND state='active' AND wait_event_type='Lock'`)
                ).rows[0].count;
            };
            const waitForQuery = async () => {
                const deadline = performance.now() + 1000;
                while (performance.now() < deadline) {
                    if (await waitingQueries()) return;
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
                assert.fail('inventory query never reached the PostgreSQL relation lock');
            };
            await t.test(
                'PostgreSQL cancels a blocked findMany and its connection immediately serves revision reads',
                async () => {
                    await admin.query('BEGIN');
                    try {
                        await admin.query(`LOCK TABLE "${schema}".nodes IN ACCESS EXCLUSIVE MODE`);
                        const started = performance.now();
                        const blocked = Promise.allSettled([
                            reader.nodes.findMany({ select, take: 10001 }),
                        ]);
                        await waitForQuery();
                        const queued = reader.nodes.findMany({ select: { uuid: true } });
                        await assert.rejects(queued, /timeout|timed out/i);
                        const [result] = await blocked;
                        assert.equal(result.status, 'rejected');
                        assert.match(result.reason.message, /statement timeout/i);
                        assert(
                            performance.now() - started < 2300,
                            'PostgreSQL statement cancellation exceeded its bounded wait',
                        );
                        assert.equal(await waitingQueries(), 0);
                        assert.equal(typeof (await reader.readRevision()), 'string');
                    } finally {
                        await admin.query('ROLLBACK');
                    }
                    assert.equal((await reader.nodes.findMany({ select }))[0].uuid, uuid);
                },
            );
            await t.test(
                'concurrent revision reads send one cancellable statement and recover after timeout or a missing row',
                async () => {
                    await admin.query('BEGIN');
                    try {
                        await admin.query(
                            'LOCK TABLE public.xera_node_route_revision IN ACCESS EXCLUSIVE MODE',
                        );
                        const pending = Promise.allSettled(
                            Array.from({ length: 64 }, () => reader.readRevision()),
                        );
                        await waitForQuery();
                        assert.equal(await waitingQueries(), 1);
                        const results = await pending;
                        assert(
                            results.every(
                                (result) =>
                                    result.status === 'rejected' &&
                                    /statement timeout/i.test(result.reason.message),
                            ),
                        );
                        assert.equal(await waitingQueries(), 0);
                        assert.equal(
                            (await reader.nodes.findMany({ select: { uuid: true } }))[0].uuid,
                            uuid,
                        );
                    } finally {
                        await admin.query('ROLLBACK');
                    }
                    await admin.query('DELETE FROM public.xera_node_route_revision WHERE id=1');
                    await assert.rejects(reader.readRevision(), /revision is unavailable/);
                    const revision = randomUUID();
                    await admin.query(
                        'INSERT INTO public.xera_node_route_revision(id,revision) VALUES(1,$1)',
                        [revision],
                    );
                    assert.equal(await reader.readRevision(), revision);
                    const connections =
                        await admin.query(`SELECT count(*)::int AS count FROM pg_stat_activity
                WHERE datname=current_database() AND application_name='remnacust-node-route-inventory'`);
                    assert.equal(connections.rows[0].count, 1);
                },
            );
        } finally {
            await admin.query('ROLLBACK');
            await main?.$disconnect();
            await reader?.onModuleDestroy();
            await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            if (createdRevision) await admin.query('DROP TABLE public.xera_node_route_revision');
            else if (revisionReady && originalRevision)
                await admin.query(
                    'INSERT INTO public.xera_node_route_revision(id,revision) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision',
                    [originalRevision],
                );
            else if (revisionReady)
                await admin.query('DELETE FROM public.xera_node_route_revision WHERE id=1');
            await admin.end();
        }
    },
);
