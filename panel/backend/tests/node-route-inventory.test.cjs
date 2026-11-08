const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const load = require('./load-typescript.cjs');

test('route inventory owns one lazy bounded connection independently of the occupied billing pool', async () => {
    let created = 0, disconnected = 0, queries = 0;
    const clients = [];
    const { NodeRouteInventoryService } = load(path.join(__dirname, '../src/common/axios/node-route-inventory.service.ts'), {
        '@common/config/app-config/typed-config.service': {},
        '../database/postgres-adapter': { createPrismaClient(url) {
            const parsed = new URL(url);
            assert.equal(parsed.searchParams.get('connection_limit'), '1');
            assert.equal(parsed.searchParams.get('pool_timeout'), '10');
            assert.equal(parsed.searchParams.get('schema'), 'public');
            assert.equal(parsed.hostname, 'db.example.test');
            created++;
            const client = { nodes: { findMany: async () => { queries++; return [{ uuid: 'synthetic-node' }]; } },
                $disconnect: async () => { disconnected++; } };
            clients.push(client);
            return client;
        } },
    });
    const reader = new NodeRouteInventoryService({ getOrThrow: () => 'postgresql://fixture:fixture@db.example.test/fixture?connection_limit=10&schema=public' });
    assert.equal(created, 0);
    const first = await reader.nodes.findMany({});
    assert.deepEqual(first, [{ uuid: 'synthetic-node' }]);
    assert.equal(reader.nodes, clients[0].nodes);
    assert.equal(created, 1);
    assert.equal(queries, 1);
    await reader.onModuleDestroy();
    assert.equal(disconnected, 1);
    const idle = new NodeRouteInventoryService({ getOrThrow: () => { throw Error('Must remain lazy'); } });
    await idle.onModuleDestroy();
    assert.equal(created, 1);
});
