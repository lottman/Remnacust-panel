require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { Client } = require('pg');
const { TransactionHost } = require('@nestjs-cls/transactional');
const { TransactionalAdapterPrisma } = require('@nestjs-cls/transactional-adapter-prisma');
const { PrismaClient } = require('./prisma-test-client.cjs');
const load = require('./load-typescript.cjs');

const url = process.env.ACTIVE_EXPIRY_TEST_DATABASE_URL;
if (process.env.ACTIVE_EXPIRY_TEST_REQUIRED === '1')
    assert(url, 'Set ACTIVE_EXPIRY_TEST_DATABASE_URL');
if (url) {
    const target = new URL(url);
    assert.equal(target.protocol, 'postgresql:');
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '55439');
    assert.equal(target.pathname, '/postgres');
    assert.equal(target.username, 'remnacust_ci_owner');
    assert.equal(target.password, '');
    assert.equal(target.hash, '');
    assert.equal(process.env.ACTIVE_EXPIRY_TEST_DISPOSABLE, '1');
}

function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

async function within(promise, label) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(label)), 10000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

test(
    'real repository decorators serialize legacy active-expiry omission and roll back under PostgreSQL',
    {
        skip: !url,
        timeout: 60000,
    },
    async (t) => {
        const prisma = new PrismaClient({ datasourceUrl: url });
        const observer = new Client({ connectionString: url, statement_timeout: 10000 });
        const hooks = new AsyncLocalStorage();
        const adapter = new TransactionalAdapterPrisma({
            prismaInjectionToken: PrismaClient,
            defaultTxOptions: { maxWait: 10000, timeout: 20000 },
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
                        hook?.entered?.resolve(identity);
                        const result = await fn();
                        if (hook?.written) {
                            hook.written.resolve();
                            await hook.release.promise;
                        }
                        if (hook?.rollback)
                            throw new Error('Injected active-expiry commit rollback');
                        return result;
                    },
                    set,
                ),
        });
        const sourceRoot = path.join(__dirname, '../src');
        const shared = load(path.join(sourceRoot, 'common/converter/universalConverter.ts'));
        const custom = load(
            path.join(
                __dirname,
                '../libs/contract/models/subscription-settings/custom-remarks.schema.ts',
            ),
        );
        const entities = load(
            path.join(sourceRoot, 'modules/external-squads/entities/external-squad.entity.ts'),
        );
        const { ExternalSquadConverter } = load(
            path.join(sourceRoot, 'modules/external-squads/external-squads.converter.ts'),
            { '@common/converter/universalConverter': shared },
        );
        const { SubscriptionSettingsConverter } = load(
            path.join(
                sourceRoot,
                'modules/subscription-settings/subscription-settings.converter.ts',
            ),
            { '@common/converter/universalConverter': shared },
        );
        const { ExternalSquadRepository } = load(
            path.join(
                sourceRoot,
                'modules/external-squads/repositories/external-squad.repository.ts',
            ),
            {
                '@common/utils': load(path.join(sourceRoot, 'common/utils/convert-type.ts')),
                '@common/helpers': {},
                '@common/helpers/kysely/values': {},
                '../entities': entities,
            },
        );
        const { SubscriptionSettingsRepository } = load(
            path.join(
                sourceRoot,
                'modules/subscription-settings/repositories/subscription-settings.repository.ts',
            ),
        );
        const repositories = [
            [
                'global',
                new SubscriptionSettingsRepository(
                    transactions,
                    new SubscriptionSettingsConverter(),
                ),
                prisma.subscriptionSettings,
            ],
            [
                'external',
                new ExternalSquadRepository(transactions, {}, new ExternalSquadConverter()),
                prisma.externalSquads,
            ],
        ];
        const initial = {
            rules: [
                {
                    id: randomUUID(),
                    enabled: true,
                    daysBeforeExpiry: 3,
                    scope: 'all',
                    internalSquadUuids: [],
                    externalSquadUuids: [],
                    remarks: ['Soon', '{HOSTS}'],
                },
            ],
        };
        const remarks = (label, activeExpiry) => ({
            ...custom.DEFAULT_SUBSCRIPTION_REMARKS,
            expiredUsers: [label],
            ...(activeExpiry === undefined ? {} : { activeExpiry }),
        });
        const created = [];
        const pending = [];
        const releases = [];
        const track = (promise) => {
            const outcome = promise.then(
                (value) => ({ value }),
                (error) => ({ error }),
            );
            pending.push(outcome);
            return outcome;
        };
        const gateOrFailure = (gate, outcome, label) =>
            within(
                Promise.race([
                    gate.promise,
                    outcome.then((result) => {
                        throw result.error ?? new Error(label);
                    }),
                ]),
                label,
            );
        try {
            await observer.connect();
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
            if (process.env.ACTIVE_EXPIRY_TEST_PG_VERSION) {
                const version = (await observer.query('SHOW server_version')).rows[0]
                    .server_version;
                assert.equal(
                    version.split('.')[0],
                    process.env.ACTIVE_EXPIRY_TEST_PG_VERSION.split('.')[0],
                );
            }
            for (const [kind, repository, model] of repositories)
                await t.test(kind, async (scope) => {
                    const uuid = randomUUID();
                    await model.create({
                        data: {
                            uuid,
                            customRemarks: remarks('Initial', initial),
                            ...(kind === 'external' ? { name: 'ae-' + uuid.slice(0, 20) } : {}),
                        },
                    });
                    created.push({ model, uuid });
                    const replacement = { rules: [{ ...initial.rules[0], daysBeforeExpiry: 9 }] };
                    const firstHook = {
                        entered: deferred(),
                        written: deferred(),
                        release: deferred(),
                    };
                    releases.push(firstHook.release);
                    const pendingStart = pending.length;
                    scope.after(async () => {
                        firstHook.release.resolve();
                        await Promise.all(pending.slice(pendingStart));
                    });
                    const first = track(
                        hooks.run(firstHook, () =>
                            repository.update({
                                uuid,
                                customRemarks: remarks('New UI', replacement),
                            }),
                        ),
                    );
                    const firstIdentity = await gateOrFailure(
                        firstHook.entered,
                        first,
                        'Repository update did not enter its real CLS/Prisma transaction',
                    );
                    await gateOrFailure(
                        firstHook.written,
                        first,
                        'Repository update did not reach its uncommitted write',
                    );
                    assert.deepEqual(
                        (await model.findUniqueOrThrow({ where: { uuid } })).customRemarks
                            .activeExpiry,
                        initial,
                    );
                    const secondHook = { entered: deferred() };
                    const second = track(
                        hooks.run(secondHook, () =>
                            repository.update({ uuid, customRemarks: remarks('Old client') }),
                        ),
                    );
                    const secondIdentity = await gateOrFailure(
                        secondHook.entered,
                        second,
                        'Legacy update did not enter an independent transaction',
                    );
                    assert.notEqual(firstIdentity.pid, secondIdentity.pid);
                    assert.notEqual(firstIdentity.xid, secondIdentity.xid);
                    let blocked = false;
                    const lockDeadline = Date.now() + 10000;
                    while (Date.now() < lockDeadline) {
                        blocked = (
                            await observer.query(
                                'SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS blocked',
                                [firstIdentity.pid, secondIdentity.pid],
                            )
                        ).rows[0].blocked;
                        if (blocked) break;
                        await delay(10);
                    }
                    assert(blocked, 'Legacy update never waited for the new UI row lock');
                    firstHook.release.resolve();
                    for (const outcome of await Promise.all([first, second]))
                        if (outcome.error) throw outcome.error;
                    const saved = await model.findUniqueOrThrow({ where: { uuid } });
                    assert.deepEqual(saved.customRemarks.activeExpiry, replacement);
                    assert.deepEqual(saved.customRemarks.expiredUsers, ['Old client']);
                    await assert.rejects(
                        hooks.run({ rollback: true }, () =>
                            repository.update({
                                uuid,
                                customRemarks: remarks('Rollback', { rules: [] }),
                            }),
                        ),
                        /Injected active-expiry commit rollback/,
                    );
                    assert.deepEqual(
                        (await model.findUniqueOrThrow({ where: { uuid } })).customRemarks,
                        saved.customRemarks,
                    );
                    await repository.update({
                        uuid,
                        customRemarks: remarks('Explicit clear', { rules: [] }),
                    });
                    assert.deepEqual(
                        (await model.findUniqueOrThrow({ where: { uuid } })).customRemarks
                            .activeExpiry,
                        { rules: [] },
                    );
                    if (kind === 'external') {
                        await repository.update({ uuid, customRemarks: null });
                        assert.equal(
                            (await model.findUniqueOrThrow({ where: { uuid } })).customRemarks,
                            null,
                        );
                        await repository.update({
                            uuid,
                            customRemarks: remarks('Legacy override'),
                        });
                        assert.equal(
                            Object.hasOwn(
                                (await model.findUniqueOrThrow({ where: { uuid } })).customRemarks,
                                'activeExpiry',
                            ),
                            false,
                        );
                    }
                });
        } finally {
            for (const release of releases) release.resolve();
            await Promise.all(pending);
            try {
                for (const { model, uuid } of created.reverse())
                    await model.delete({ where: { uuid } });
            } finally {
                await Promise.all([observer.end(), prisma.$disconnect()]);
            }
        }
    },
);
