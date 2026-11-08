const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const load = require('./load-typescript.cjs');
const url = process.env.REMNACUST_ROUTE_POOL_TEST_URL;

test('committed route reads succeed while the only billing-pool connection is held', { skip: !url }, async () => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, '127.0.0.1');
    assert.match(parsed.pathname, /^\/rc_route_pool_/);
    const schema = 'route_pool_' + randomUUID().replaceAll('-', '');
    const admin = new (require('pg').Client)({ connectionString: url, connectionTimeoutMillis: 3000 });
    const adapter = load(path.join(__dirname, '../src/common/database/postgres-adapter.ts'));
    const { NodeRouteInventoryService } = load(path.join(__dirname, '../src/common/axios/node-route-inventory.service.ts'), {
        '@common/config/app-config/typed-config.service': {},
        '../database/postgres-adapter': adapter,
    });
    const { NodeRouteRegistryService } = load(path.join(__dirname, '../src/common/axios/node-route-registry.service.ts'), {
        '../constants/nodes/ip-statuses': load(path.join(__dirname, '../libs/contract/constants/nodes/ip-statuses/node-ip-statuses.constant.ts')),
        '@common/config/app-config/typed-config.service': {},
        '@common/raw-cache': {},
        './node-route-inventory.service': { NodeRouteInventoryService },
    });
    await admin.connect();
    let main, reader;
    try {
        await admin.query(`CREATE SCHEMA "${schema}"`);
        await admin.query(`CREATE TABLE "${schema}".nodes(uuid uuid PRIMARY KEY,address text,port int,proxy_url text,ips jsonb,is_disabled boolean)`);
        const uuid = randomUUID();
        await admin.query(`INSERT INTO "${schema}".nodes VALUES($1,'node.example.test',2222,NULL,'[]',false)`, [uuid]);
        parsed.searchParams.set('schema', schema);
        parsed.searchParams.set('connection_limit', '1');
        parsed.searchParams.set('connect_timeout', '1');
        parsed.searchParams.set('pool_timeout', '1');
        main = adapter.createPrismaClient(parsed.toString());
        reader = new NodeRouteInventoryService({ getOrThrow: () => parsed.toString() });
        const cache = { get: async () => null, set: async () => {} };
        await main.$transaction(async tx => {
            await tx.$queryRaw`SELECT 1`;
            const shared = new NodeRouteRegistryService(main, cache);
            await assert.rejects(shared.get({ uuid }), error => error.code === 'NODE_ROUTE_BUSY');
            const isolated = new NodeRouteRegistryService(reader, cache);
            const current = await isolated.get({ uuid });
            assert.equal(current.address, 'node.example.test');
            assert.equal(await isolated.isCurrent(current), true);
            assert.equal((await tx.$queryRaw`SELECT 1 AS value`)[0].value, 1);
        }, { timeout: 10_000 });
    } finally {
        await main?.$disconnect();
        await reader?.onModuleDestroy();
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
    }
});
