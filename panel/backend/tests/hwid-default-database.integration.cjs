// Actual seed and registration transactions, restricted to a disposable database.
const assert = require('node:assert/strict');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { PrismaClient } = require('./prisma-test-client.cjs');
const k = require('kysely');
const {
    PrismaTxDriver,
} = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const load = require('./load-typescript.cjs');
const defaults = load(path.join(__dirname, '../prisma/seed/default/hwid-settings.ts'));
const { seedSubscriptionSettings } = load(
    path.join(__dirname, '../prisma/seed/seeders/8_seed-subscription-settings.ts'),
    {
        '../default': defaults,
        '@libs/contracts/models': require('../libs/contract/build/backend/models'),
        consola: { start() {}, success() {} },
    },
);
const { HwidUserDevicesRepository } = load(
    path.join(
        __dirname,
        '../src/modules/hwid-user-devices/repositories/hwid-user-devices.repository.ts',
    ),
    {
        '@nestjs-cls/transactional': { Transactional: () => () => {}, TransactionHost: class {} },
        '@common/database': {},
        '@common/helpers': {},
        '../hwid-user-devices.converter': {},
        '../entities/hwid-user-device.entity': {},
    },
);

async function main() {
    const port = process.env.REMNACUST_TEST_DATABASE_PORT || '55439';
    assert.ok(['55439', '55449'].includes(port), 'Only disposable database ports are accepted');
    const prisma = new PrismaClient({
        datasourceUrl: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    });
    const context = new AsyncLocalStorage();
    const tx = {
        get tx() {
            return context.getStore() || prisma;
        },
    };
    const db = {
        kysely: new k.Kysely({
            dialect: {
                createDriver: () => new PrismaTxDriver(tx),
                createAdapter: () => new k.PostgresAdapter(),
                createIntrospector: (db) => new k.PostgresIntrospector(db),
                createQueryCompiler: () => new k.PostgresQueryCompiler(),
            },
        }),
    };
    const repo = new HwidUserDevicesRepository(tx, db, {
        fromEntityToPrismaModel: (value) => value,
        fromPrismaModelToEntity: (value) => value,
    });
    const transaction = (fn) =>
        prisma.$transaction((client) => context.run(client, fn), { timeout: 15000 });
    const previous = process.env.HWID_ENABLED_DEFAULT;
    const rollback = new Error('intentional fixture rollback');
    let created = false;
    try {
        // Roll back each settings scenario so even other fixtures keep their settings.
        for (const override of [undefined, 'true', 'false']) {
            if (override === undefined) delete process.env.HWID_ENABLED_DEFAULT;
            else process.env.HWID_ENABLED_DEFAULT = override;
            await assert.rejects(
                prisma.$transaction(async (client) => {
                    await client.subscriptionSettings.deleteMany();
                    await seedSubscriptionSettings(client);
                    let settings = await client.subscriptionSettings.findFirstOrThrow();
                    assert.equal(settings.hwidSettings.enabled, override !== 'false');
                    assert.equal(settings.hwidSettings.fallbackDeviceLimit, 999);
                    for (const enabled of [false, true]) {
                        const saved = {
                            enabled,
                            fallbackDeviceLimit: 3,
                            maxDevicesAnnounce: 'Saved limit',
                        };
                        await client.subscriptionSettings.update({
                            where: { uuid: settings.uuid },
                            data: { hwidSettings: saved },
                        });
                        await seedSubscriptionSettings(client);
                        settings = await client.subscriptionSettings.findFirstOrThrow();
                        assert.deepEqual(
                            settings.hwidSettings,
                            saved,
                            'startup must retain explicit choices',
                        );
                    }
                    await client.subscriptionSettings.update({
                        where: { uuid: settings.uuid },
                        data: { hwidSettings: require('@prisma/client').Prisma.DbNull },
                    });
                    await seedSubscriptionSettings(client);
                    const initialized = await client.subscriptionSettings.findFirstOrThrow();
                    assert.equal(initialized.hwidSettings.enabled, override !== 'false');
                    assert.deepEqual(initialized.customRemarks, settings.customRemarks);
                    assert.deepEqual(
                        initialized.customResponseHeaders,
                        settings.customResponseHeaders,
                    );
                    throw rollback;
                }),
                (error) => error === rollback,
            );
        }
        await prisma.users.create({
            data: {
                id: 994n,
                username: 'hwid-default-audit',
                shortUuid: 'hwid-default-audit',
                expireAt: new Date(Date.now() + 86400000),
                trojanPassword: 'fixture-password',
                vlessUuid: '6eeefad9-fb58-44b1-9c08-bd6b3853f69d',
                ssPassword: 'fixture-password',
            },
        });
        created = true;
        const register = (hwid, limit = 3) =>
            transaction(() => repo.createWithAdvisoryLock({ userId: 994n, hwid }, limit));
        const concurrent = await Promise.all(
            Array.from({ length: 12 }, (_, index) => register(`fixture-device-${index}`)),
        );
        assert.equal(concurrent.filter((result) => result.status === 'CREATED').length, 3);
        assert.equal(concurrent.filter((result) => result.status === 'LIMIT_REACHED').length, 9);
        const devices = await prisma.hwidUserDevices.findMany({ where: { userId: 994n } });
        assert.equal(devices.length, 3, 'simultaneous registrations must not exceed capacity');
        const existing = devices[0].hwid;
        assert.equal(
            (await register(existing, 1)).status,
            'EXISTS',
            'lowering the limit must retain known devices',
        );
        let releaseLock;
        let lockReady;
        const acquired = new Promise((resolve) => (lockReady = resolve));
        const held = prisma.$transaction(
            async (client) => {
                await client.$executeRaw`SELECT pg_advisory_xact_lock(${900000000n + 994n})`;
                lockReady();
                await new Promise((resolve) => (releaseLock = resolve));
            },
            { timeout: 15000 },
        );
        await acquired;
        let timer;
        try {
            const known = await Promise.race([
                register(existing),
                new Promise(
                    (_, reject) =>
                        (timer = setTimeout(
                            () => reject(Error('known device waited for registration lock')),
                            1000,
                        )),
                ),
            ]);
            assert.equal(known.status, 'EXISTS');
        } finally {
            clearTimeout(timer);
            releaseLock();
            await held;
        }
        await prisma.$executeRaw`INSERT INTO xera_device_reconciliation(user_id,hwid) VALUES(${994n},${existing}) ON CONFLICT DO NOTHING`;
        await prisma.$executeRaw`UPDATE xera_device_reconciliation SET attempts=4,next_attempt_at=now()+interval '5 minutes' WHERE user_id=${994n} AND hwid=${existing}`;
        const before =
            await prisma.$queryRaw`SELECT revision,attempts,next_attempt_at FROM xera_device_reconciliation WHERE user_id=${994n} AND hwid=${existing}`;
        await Promise.all(
            Array.from({ length: 100 }, () => register(existing)),
        );
        const after =
            await prisma.$queryRaw`SELECT revision,attempts,next_attempt_at FROM xera_device_reconciliation WHERE user_id=${994n} AND hwid=${existing}`;
        assert.deepEqual(
            after,
            before,
            'refresh must not reset an in-flight or failed reconciliation',
        );
        const client = require('pg');
        const native = new client.Client({
            connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`,
        });
        await native.connect();
        try {
            const busy = await native.query(
                "SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event='advisory' AND datname=current_database()",
            );
            assert.equal(busy.rows[0].n, 0, 'no stranded registration lock waiters');
        } finally {
            await native.end();
        }
        await transaction(() => repo.setRegistrationAllowed(994n, false));
        assert.equal((await register(existing)).status, 'EXISTS');
        assert.equal(
            (await register('fixture-unlimited-denied', Number.MAX_SAFE_INTEGER)).status,
            'REGISTRATION_BLOCKED',
        );
        await transaction(() => repo.setRegistrationAllowed(994n, true));
        assert.equal(
            (await register('fixture-unlimited-allowed', Number.MAX_SAFE_INTEGER)).status,
            'CREATED',
        );
        assert.equal((await register('fixture-full-denied')).status, 'LIMIT_REACHED');
        await prisma.hwidUserDevices.deleteMany({ where: { userId: 994n } });
        const duplicates = await Promise.all(
            Array.from({ length: 8 }, () => register('fixture-same-device', 1)),
        );
        assert.equal(duplicates.filter((result) => result.status === 'CREATED').length, 1);
        assert.equal(duplicates.filter((result) => result.status === 'EXISTS').length, 7);
        console.log(
            'PASS PostgreSQL HWID: enabled defaults, explicit override, saved settings, legacy initialization, concurrent capacity, duplicate registration and registration policy',
        );
    } finally {
        if (created) await prisma.users.deleteMany({ where: { id: 994n } });
        await prisma.$disconnect();
        if (previous === undefined) delete process.env.HWID_ENABLED_DEFAULT;
        else process.env.HWID_ENABLED_DEFAULT = previous;
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
