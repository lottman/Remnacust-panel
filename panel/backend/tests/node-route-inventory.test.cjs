const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const net = require('node:net');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');

test('route inventory owns one lazy bounded connection independently of the occupied billing pool', async () => {
    let created = 0,
        disconnected = 0,
        queries = 0;
    const clients = [];
    const { NodeRouteInventoryService } = load(
        path.join(__dirname, '../src/common/axios/node-route-inventory.service.ts'),
        {
            '@common/config/app-config/typed-config.service': {},
            '../database/postgres-adapter': {
                createPrismaClient(url) {
                    const parsed = new URL(url);
                    assert.equal(parsed.searchParams.get('connection_limit'), '1');
                    assert.equal(parsed.searchParams.get('pool_timeout'), '1');
                    assert.equal(parsed.searchParams.get('connect_timeout'), '1');
                    const parameters = new (require('pg').Client)({ connectionString: url })
                        .connectionParameters;
                    assert.equal(Number(parameters.statement_timeout), 1500);
                    assert.equal(Number(parameters.query_timeout), 1800);
                    assert.match(parameters.options, /-c statement_timeout=1500$/);
                    assert.match(parameters.options, /^-c search_path=public /);
                    assert.equal(parsed.searchParams.get('sslmode'), 'verify-full');
                    assert.notEqual(parameters.ssl, false);
                    assert.notEqual(parameters.ssl.rejectUnauthorized, false);
                    assert.equal(parsed.searchParams.get('schema'), 'public');
                    assert.equal(parsed.hostname, 'db.example.test');
                    created++;
                    const client = {
                        nodes: {
                            findMany: async () => {
                                queries++;
                                return [{ uuid: 'synthetic-node' }];
                            },
                        },
                        $disconnect: async () => {
                            disconnected++;
                        },
                    };
                    clients.push(client);
                    return client;
                },
            },
        },
    );
    const reader = new NodeRouteInventoryService({
        getOrThrow: () =>
            'postgresql://fixture:fixture@db.example.test/fixture?connection_limit=10&schema=public&sslmode=verify-full&statement_timeout=0&query_timeout=0&options=-c%20search_path%3Dpublic%20-c%20statement_timeout%3D0',
    });
    assert.equal(created, 0);
    const first = await reader.nodes.findMany({});
    assert.deepEqual(first, [{ uuid: 'synthetic-node' }]);
    assert.equal(reader.nodes, clients[0].nodes);
    assert.equal(created, 1);
    assert.equal(queries, 1);
    await reader.onModuleDestroy();
    assert.equal(disconnected, 1);
    const idle = new NodeRouteInventoryService({
        getOrThrow: () => {
            throw Error('Must remain lazy');
        },
    });
    await idle.onModuleDestroy();
    assert.equal(created, 1);
});

function revisionFixture(query) {
    let created = 0;
    const { NodeRouteInventoryService } = load(
        path.join(__dirname, '../src/common/axios/node-route-inventory.service.ts'),
        {
            '@common/config/app-config/typed-config.service': {},
            '../database/postgres-adapter': {
                createPrismaClient: () => {
                    created++;
                    return { nodes: {}, $queryRaw: query, $disconnect: async () => {} };
                },
            },
        },
    );
    return {
        reader: new NodeRouteInventoryService({
            getOrThrow: () => 'postgresql://fixture@db.example.test/fixture',
        }),
        created: () => created,
    };
}

test('revision reads share concurrent work only and every later call sees the database generation', async () => {
    let complete,
        calls = 0;
    const revision = randomUUID();
    const { reader, created } = revisionFixture((sql, ...parameters) => {
        calls++;
        assert.equal(
            sql.join(''),
            'SELECT revision::text AS revision FROM public.xera_node_route_revision WHERE id = 1',
        );
        assert.deepEqual(parameters, []);
        return new Promise((resolve) => {
            complete = resolve;
        });
    });
    assert.equal(created(), 0);
    const pending = Array.from({ length: 64 }, () => reader.readRevision());
    await Promise.resolve();
    assert.equal(calls, 1);
    complete([{ revision }]);
    assert.deepEqual(await Promise.all(pending), Array(64).fill(revision));
    const next = reader.readRevision(),
        changed = randomUUID();
    await Promise.resolve();
    assert.equal(calls, 2);
    complete([{ revision: changed }]);
    assert.equal(await next, changed);
    assert.equal(created(), 1);
    await reader.onModuleDestroy();
});

test('revision errors and missing or invalid rows fail closed and do not poison the next read', async () => {
    let result,
        calls = 0;
    const { reader } = revisionFixture(async () => {
        calls++;
        if (result instanceof Error) throw result;
        return result;
    });
    for (const value of [
        new Error('synthetic database timeout'),
        [],
        [{ revision: '' }],
        [{ revision: 3 }],
        [{ revision: 'not-a-uuid' }],
        [{ revision: randomUUID() }, { revision: randomUUID() }],
    ]) {
        result = value;
        const results = await Promise.allSettled(
            Array.from({ length: 8 }, () => reader.readRevision()),
        );
        assert(results.every((value) => value.status === 'rejected'));
    }
    result = [{ revision: randomUUID() }];
    assert.equal(await reader.readRevision(), result[0].revision);
    assert.equal(calls, 7);
    await reader.onModuleDestroy();
});

test('shutdown drains a scheduled revision read before disconnecting its lazily created pool', async () => {
    const events = [],
        revision = randomUUID();
    const { NodeRouteInventoryService } = load(
        path.join(__dirname, '../src/common/axios/node-route-inventory.service.ts'),
        {
            '@common/config/app-config/typed-config.service': {},
            '../database/postgres-adapter': {
                createPrismaClient: () => ({
                    $queryRaw: async () => {
                        events.push('query');
                        return [{ revision }];
                    },
                    $disconnect: async () => {
                        events.push('disconnect');
                    },
                }),
            },
        },
    );
    const reader = new NodeRouteInventoryService({
        getOrThrow: () => 'postgresql://fixture@db.example.test/fixture',
    });
    const pending = reader.readRevision();
    await reader.onModuleDestroy();
    assert.equal(await pending, revision);
    assert.deepEqual(events, ['query', 'disconnect']);
});

test(
    'the actual Prisma pg client bounds a stalled local connection and releases its socket',
    { timeout: 8000 },
    async (t) => {
        const sockets = new Set();
        let connectedAt;
        const server = net.createServer((socket) => {
            connectedAt = performance.now();
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
            socket.resume();
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const adapter = load(path.join(__dirname, '../src/common/database/postgres-adapter.ts'));
        const { NodeRouteInventoryService } = load(
            path.join(__dirname, '../src/common/axios/node-route-inventory.service.ts'),
            {
                '@common/config/app-config/typed-config.service': {},
                '../database/postgres-adapter': adapter,
            },
        );
        const reader = new NodeRouteInventoryService({
            getOrThrow: () =>
                `postgresql://synthetic@127.0.0.1:${server.address().port}/rc_route_pool_stalled?sslmode=disable`,
        });
        t.after(async () => {
            for (const socket of sockets) socket.destroy();
            await reader.onModuleDestroy();
            await new Promise((resolve) => server.close(resolve));
        });
        await assert.rejects(
            reader.nodes.findMany({ select: { uuid: true } }),
            /timeout|timed out/i,
        );
        assert.equal(typeof connectedAt, 'number');
        assert(
            performance.now() - connectedAt < 1900,
            'inventory connection must stop within its own bounded wait',
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(sockets.size, 0);
    },
);
