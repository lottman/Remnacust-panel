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
const { repositoryRuntime, deferred } = require('./node-ip-inventory-persistence.test.cjs');

const root = path.join(__dirname, '../src/modules/nodes');
const copy = (value) => structuredClone(value);

function healthRuntime() {
    const runtime = repositoryRuntime();
    const { UpdateNodeCommand } = load(
        path.join(root, 'commands/update-node/update-node.command.ts'),
    );
    const { UpdateNodeHandler } = load(
        path.join(root, 'commands/update-node/update-node.handler.ts'),
        {
            '@contract/constants': { ERRORS: require('../libs/contract/build/backend').ERRORS },
            '@common/types': load(path.join(root, '../../common/types/result.type.ts')),
            '../../node-control-addresses': runtime,
            '../../repositories/nodes.repository': runtime,
            './update-node.command': { UpdateNodeCommand },
        },
    );
    return { ...runtime, UpdateNodeCommand, UpdateNodeHandler };
}

function controlledHealth() {
    const runtime = healthRuntime();
    const uuid = randomUUID();
    let stored = {
        node: {
            uuid,
            id: 1n,
            name: 'controlled-health',
            address: 'node.example.test',
            port: 2222,
            proxyUrl: null,
            ips: [],
            controlAddresses: [{ address: 'node.example.test', enabled: true }],
            controlRevision: randomUUID(),
            isConnected: false,
            isConnecting: false,
            isDisabled: false,
            lastStatusMessage: null,
            lastStatusChange: null,
            configProfileInboundsToNodes: [],
            provider: null,
            ipInventory: null,
        },
        watermark: null,
    };
    const hooks = new AsyncLocalStorage();
    const events = [];
    let sequence = 0;
    let queue = Promise.resolve();
    let transactions;
    const prisma = {
        async $transaction(work) {
            const previous = queue;
            const release = deferred();
            queue = release.promise;
            hooks.getStore()?.requested?.resolve();
            await previous;
            const draft = copy(stored);
            const id = ++sequence;
            let client;
            const touch = (operation) => {
                assert.equal(transactions.isTransactionActive(), true);
                assert.equal(transactions.tx, client);
                events.push({ operation, id, visible: copy(stored) });
            };
            client = {
                async $queryRaw(strings, ...parameters) {
                    const sql = strings.join('?');
                    if (/FROM nodes[\s\S]*FOR UPDATE/.test(sql)) {
                        touch('root lock');
                        assert.equal(parameters[0], uuid);
                        return [copy(draft.node)];
                    }
                    touch('watermark SQL');
                    assert.match(sql, /INSERT INTO xera_node_health_observations/);
                    assert.match(sql, /ON CONFLICT[\s\S]*WHERE[\s\S]*RETURNING/);
                    assert.match(
                        sql,
                        /NOT xera_node_health_observations\.healthy AND EXCLUDED\.healthy/,
                    );
                    const [selected, controlRevision, at, attempt, healthy] = parameters;
                    assert.equal(selected, uuid);
                    const next = { controlRevision, observedAt: BigInt(at), attempt, healthy };
                    const old = draft.watermark;
                    const accepted =
                        !old ||
                        old.controlRevision !== controlRevision ||
                        next.observedAt > old.observedAt ||
                        (next.observedAt === old.observedAt &&
                            (attempt > old.attempt ||
                                (attempt === old.attempt && !old.healthy && healthy)));
                    if (!accepted) return [];
                    draft.watermark = next;
                    return [{ nodeUuid: uuid }];
                },
                nodes: {
                    async update({ where, data }) {
                        touch('node write');
                        assert.equal(where.uuid, uuid);
                        Object.assign(
                            draft.node,
                            copy(
                                Object.fromEntries(
                                    Object.entries(data).filter(([, value]) => value !== undefined),
                                ),
                            ),
                        );
                        if (hooks.getStore()?.persistError)
                            throw Error('Injected persistence failure');
                        return copy(draft.node);
                    },
                    async findUniqueOrThrow() {
                        touch('final refetch');
                        return copy(draft.node);
                    },
                },
            };
            try {
                const result = await work(client);
                const hook = hooks.getStore();
                hook?.written?.resolve(result);
                if (hook?.release) await hook.release.promise;
                if (hook?.rollback) throw Error('Injected rollback after persistence');
                stored = draft;
                return result;
            } finally {
                release.resolve();
            }
        },
    };
    const adapter = new TransactionalAdapterPrisma({
        prismaInjectionToken: Symbol('controlled health Prisma'),
    });
    transactions = new TransactionHost(adapter.optionsFactory(prisma));
    const repository = new runtime.NodesRepository(transactions, {}, new runtime.NodesConverter());
    const handler = new runtime.UpdateNodeHandler(repository);
    handler.logger = { error() {} };
    const command = (at, attempt = 1, healthy = true, revision = stored.node.controlRevision) =>
        new runtime.UpdateNodeCommand(
            {
                uuid,
                isConnected: healthy,
                lastStatusMessage: healthy ? '[HEALTHY]' : '[UNREACHABLE]',
            },
            revision,
            { observedAt: at, attempt },
        );
    return {
        ...runtime,
        uuid,
        repository,
        handler,
        transactions,
        hooks,
        events,
        command,
        snapshot: () => copy(stored),
        rotate: () => {
            stored.node.controlRevision = randomUUID();
            return stored.node.controlRevision;
        },
    };
}

function defineTests() {
    test('actual health command retains typed observation and the actual handler persists its watermark', async () => {
        const f = controlledHealth();
        const command = f.command(100, 1, false);
        assert.deepEqual(command.healthObservation, { observedAt: 100, attempt: 1 });
        const result = await f.handler.execute(command);
        assert.equal(result.isOk, true);
        assert(result.response instanceof f.NodesEntity);
        assert.deepEqual(f.snapshot().watermark, {
            controlRevision: command.expectedControlRevision,
            observedAt: 100n,
            attempt: 1,
            healthy: false,
        });
        assert.equal(new Set(f.events.map((event) => event.id)).size, 1);
        assert.deepEqual(
            f.events.map((event) => event.operation),
            ['root lock', 'watermark SQL', 'root lock', 'node write'],
        );
    });

    test('same-revision failure that reaches SQL after newer success cannot overwrite it', async () => {
        const f = controlledHealth();
        const newer = { written: deferred(), release: deferred() };
        const older = { requested: deferred() };
        const current = f.hooks.run(newer, () => f.handler.execute(f.command(200, 1, true)));
        let stale;
        try {
            await newer.written.promise;
            stale = f.hooks.run(older, () => f.handler.execute(f.command(100, 2, false)));
            await older.requested.promise;
            assert.equal(f.snapshot().watermark, null, 'uncommitted health remains invisible');
        } finally {
            newer.release.resolve();
        }
        assert.equal((await current).isOk, true);
        const result = await stale;
        assert.equal(result.isOk, false);
        assert.equal(result.code, 'A266');
        assert.equal(f.snapshot().node.isConnected, true);
        assert.equal(f.snapshot().watermark.observedAt, 200n);
        assert.equal(f.events.filter((event) => event.operation === 'node write').length, 1);
    });

    test('tuple ordering rejects older attempts and duplicates while same-attempt healthy wins a failure tie', async () => {
        const f = controlledHealth();
        assert.equal((await f.handler.execute(f.command(100, 2, false))).isOk, true);
        for (const [at, attempt, healthy, accepted] of [
            [99, 2, true, false],
            [100, 1, true, false],
            [100, 2, false, false],
            [100, 2, true, true],
            [100, 2, false, false],
            [100, 2, true, false],
            [101, 1, false, true],
        ]) {
            const before = f.snapshot();
            const writes = f.events.filter((event) => event.operation === 'node write').length;
            const result = await f.handler.execute(f.command(at, attempt, healthy));
            assert.equal(result.isOk, accepted);
            if (!accepted) {
                assert.equal(result.code, 'A266');
                assert.deepEqual(f.snapshot(), before);
                assert.equal(
                    f.events.filter((event) => event.operation === 'node write').length,
                    writes,
                );
            }
        }
    });

    test('new control revision resets the observation epoch and an old revision cannot restore it', async () => {
        const f = controlledHealth();
        const old = f.command(1000);
        assert.equal((await f.handler.execute(old)).isOk, true);
        const next = f.rotate();
        assert.equal((await f.handler.execute(f.command(1, 1, false, next))).isOk, true);
        const before = f.snapshot();
        const result = await f.handler.execute(
            f.command(2000, 2, true, old.expectedControlRevision),
        );
        assert.equal(result.code, 'A266');
        assert.deepEqual(f.snapshot(), before);
        assert.equal(before.watermark.controlRevision, next);
        assert.equal(before.watermark.observedAt, 1n);
    });

    for (const hook of [{ persistError: true }, { rollback: true }])
        test(`actual CLS transaction rolls back watermark and health on ${hook.persistError ? 'persistence failure' : 'late rollback'}`, async () => {
            const f = controlledHealth();
            const before = f.snapshot();
            const command = f.command(100);
            const result = await f.hooks.run(hook, () => f.handler.execute(command));
            assert.equal(result.isOk, false);
            assert.deepEqual(f.snapshot(), before);
            assert.equal(f.transactions.isTransactionActive(), false);
            assert.equal(
                (await f.handler.execute(command)).isOk,
                true,
                'rolled back observation can retry',
            );
        });

    test('invalid observations and missing revision are rejected before repository SQL', async () => {
        for (const observation of [
            { observedAt: -1, attempt: 1 },
            { observedAt: 0.5, attempt: 1 },
            { observedAt: Number.MAX_SAFE_INTEGER + 1, attempt: 1 },
            { observedAt: NaN, attempt: 1 },
            { observedAt: Infinity, attempt: 1 },
            { observedAt: 1, attempt: 0 },
            { observedAt: 1, attempt: 3 },
        ]) {
            const f = controlledHealth();
            const command = new f.UpdateNodeCommand(
                { uuid: f.uuid, isConnected: true },
                f.snapshot().node.controlRevision,
                observation,
            );
            assert.equal((await f.handler.execute(command)).isOk, false);
            assert.equal(f.events.length, 0);
        }
        const f = controlledHealth();
        assert.equal(
            (
                await f.handler.execute(
                    new f.UpdateNodeCommand({ uuid: f.uuid }, undefined, {
                        observedAt: 1,
                        attempt: 1,
                    }),
                )
            ).isOk,
            false,
        );
        assert.equal(f.events.length, 0);
    });

    test('ordinary commands remain compatible without creating a health watermark', async () => {
        const f = controlledHealth();
        const result = await f.handler.execute(
            new f.UpdateNodeCommand(
                { uuid: f.uuid, lastStatusMessage: '[MANUAL]' },
                f.snapshot().node.controlRevision,
            ),
        );
        assert.equal(result.isOk, true);
        assert.equal(f.snapshot().watermark, null);
        assert.equal(f.snapshot().node.lastStatusMessage, '[MANUAL]');
    });

    test('database integration guards reject unsafe targets before constructing a client', () => {
        const filename = path.join(__dirname, 'node-health-persistence.database.integration.cjs');
        const code = fs.readFileSync(filename, 'utf8');
        const validate = (env) => {
            const registered = [];
            class Forbidden {
                constructor() {
                    assert.fail('Guard must run before client construction');
                }
            }
            new Function('require', 'module', 'exports', 'process', '__dirname', code)(
                (id) =>
                    id === 'node:test'
                        ? (name, options) => registered.push({ name, options })
                        : id === 'pg'
                          ? { Client: Forbidden }
                          : id === './prisma-test-client.cjs'
                            ? { PrismaClient: Forbidden }
                            : require(id),
                { exports: {} },
                {},
                { env },
                __dirname,
            );
            return registered;
        };
        const valid = 'postgresql://remnacust_ci_owner@127.0.0.1:55439/postgres?schema=public';
        assert.match(validate({})[0].options.skip, /deliberately not started/);
        assert.throws(() => validate({ NODE_CONTROL_TEST_REQUIRED: '1', DATABASE_URL: valid }));
        const env = {
            NODE_CONTROL_TEST_DATABASE_URL: valid,
            NODE_CONTROL_TEST_DISPOSABLE: '1',
            NODE_CONTROL_TEST_REQUIRED: '1',
        };
        assert.equal(validate(env)[0].options.skip, false);
        for (const target of [
            valid.replace('127.0.0.1', 'remote.example.test'),
            valid.replace('55439', '5432'),
            valid.replace('/postgres?', '/production?'),
            valid.replace('remnacust_ci_owner@', 'postgres@'),
            valid.replace('remnacust_ci_owner@', 'remnacust_ci_owner:password@'),
            valid.replace('postgresql:', 'postgres:'),
            valid.replace('schema=public', 'schema=other'),
            valid + '#fragment',
            valid + '&sslmode=disable',
        ])
            assert.throws(() => validate({ ...env, NODE_CONTROL_TEST_DATABASE_URL: target }));
        assert.throws(() => validate({ ...env, NODE_CONTROL_TEST_DISPOSABLE: '0' }));
    });
}

module.exports = { healthRuntime, controlledHealth, deferred };
if (require.main === module) defineTests();
