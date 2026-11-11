const assert = require('node:assert/strict');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { PrismaClient } = require('./prisma-test-client.cjs');
const k = require('kysely');
const {
    PrismaTxDriver,
} = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const load = require('./load-typescript.cjs');
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
async function main(timezone) {
    const port = process.env.REMNACUST_TEST_DATABASE_PORT || '55439';
    assert.ok(['55439', '55449'].includes(port), 'Only disposable database ports are accepted');
    const user = process.env.REMNACUST_TEST_DATABASE_USER || 'postgres';
    assert.ok(
        ['postgres', 'rc_device_ci'].includes(user),
        'Only disposable database roles are accepted',
    );
    const prisma = new PrismaClient({
        datasourceUrl: `postgresql://${user}@127.0.0.1:${port}/postgres`,
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
        fromEntityToPrismaModel: (x) => x,
        fromPrismaModelToEntity: (x) => x,
    });
    const transaction = (fn) =>
        prisma.$transaction(async (client) => {
            await client.$queryRaw`SELECT set_config('TimeZone',${timezone},true)`;
            return context.run(client, fn);
        });
    const id = 993n;
    try {
        await tx.tx
            .$executeRaw`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password) VALUES(${id},'freeze-access-audit','freeze-access-audit',(clock_timestamp() AT TIME ZONE 'UTC')+interval '9 days','test',gen_random_uuid(),'test')`;
        await transaction(() => tx.tx.$executeRaw`UPDATE users SET status='FROZEN' WHERE id=${id}`);
        const [frozen] =
            await prisma.$queryRaw`SELECT status,expire_at,frozen_at,(extract(epoch FROM expire_at-frozen_at)*1000)::bigint AS remaining FROM users WHERE id=${id}`;
        assert.equal(frozen.status, 'FROZEN');
        assert.ok(frozen.remaining > 9n * 86400000n - 5000n && frozen.remaining <= 9n * 86400000n);
        const competing = await Promise.all([
            repo.claimUserAccessReconciliation(),
            repo.claimUserAccessReconciliation(),
        ]);
        const claimed = competing.flat().filter((task) => task.userId === id);
        assert.equal(claimed.length, 1, 'concurrent workers must not claim the same user');
        const [first] = claimed;
        assert.equal(first.userId, id);
        await repo.finishUserAccessReconciliation(first, false);
        const [delayed] =
            await prisma.$queryRaw`SELECT next_attempt_at>now() AS delayed FROM xera_user_access_reconciliation WHERE user_id=${id}`;
        assert.equal(delayed.delayed, true);
        await transaction(() => tx.tx.$executeRaw`UPDATE users SET status='FROZEN' WHERE id=${id}`);
        const [repeated] =
            await prisma.$queryRaw`SELECT expire_at,frozen_at FROM users WHERE id=${id}`;
        assert.equal(+repeated.expire_at, +frozen.expire_at);
        assert.equal(+repeated.frozen_at, +frozen.frozen_at);
        await assert.rejects(
            transaction(async () => {
                await tx.tx.$executeRaw`UPDATE users SET status='ACTIVE' WHERE id=${id}`;
                throw Error('test-only rollback');
            }),
            /test-only rollback/,
        );
        assert.equal(
            (await prisma.$queryRaw`SELECT status FROM users WHERE id=${id}`)[0].status,
            'FROZEN',
        );
        assert.equal(
            (
                await prisma.$queryRaw`SELECT revision::text FROM xera_user_access_reconciliation WHERE user_id=${id}`
            )[0].revision,
            first.revision,
        );
        await tx.tx.$executeRawUnsafe(
            'ALTER TABLE users DISABLE TRIGGER a_remnacust_freeze_user_lifetime',
        );
        try {
            await tx.tx
                .$executeRaw`UPDATE users SET expire_at=expire_at-interval '30 days',frozen_at=frozen_at-interval '30 days' WHERE id=${id}`;
        } finally {
            await tx.tx.$executeRawUnsafe(
                'ALTER TABLE users ENABLE TRIGGER a_remnacust_freeze_user_lifetime',
            );
        }
        await transaction(() => tx.tx.$executeRaw`UPDATE users SET status='ACTIVE' WHERE id=${id}`);
        const [resumed] =
            await prisma.$queryRaw`SELECT status,frozen_at,(extract(epoch FROM expire_at-(statement_timestamp() AT TIME ZONE 'UTC'))*1000)::bigint AS remaining FROM users WHERE id=${id}`;
        assert.equal(resumed.status, 'ACTIVE');
        assert.equal(resumed.frozen_at, null);
        assert.ok(
            resumed.remaining <= frozen.remaining && resumed.remaining > frozen.remaining - 5000n,
        );
        const [second] = await repo.claimUserAccessReconciliation();
        assert.notEqual(second.revision, first.revision);
        await repo.finishUserAccessReconciliation(first, true);
        assert.equal(
            (
                await prisma.$queryRaw`SELECT revision::text FROM xera_user_access_reconciliation WHERE user_id=${id}`
            )[0].revision,
            second.revision,
        );
        await repo.finishUserAccessReconciliation(second, true);
        assert.equal(
            (
                await prisma.$queryRaw`SELECT count(*)::int AS n FROM xera_user_access_reconciliation WHERE user_id=${id}`
            )[0].n,
            0,
        );
        await tx.tx.$executeRawUnsafe(
            "CREATE FUNCTION xera_test_reject_user_access() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only outbox failure'; END $$",
        );
        await tx.tx.$executeRawUnsafe(
            'CREATE TRIGGER xera_test_reject_user_access BEFORE INSERT ON xera_user_access_reconciliation FOR EACH ROW EXECUTE FUNCTION xera_test_reject_user_access()',
        );
        await assert.rejects(
            transaction(() => tx.tx.$executeRaw`UPDATE users SET status='FROZEN' WHERE id=${id}`),
            /test-only outbox failure/,
        );
        assert.equal(
            (await prisma.$queryRaw`SELECT status,frozen_at FROM users WHERE id=${id}`)[0].status,
            'ACTIVE',
        );
        await tx.tx.$executeRawUnsafe(
            'DROP TRIGGER xera_test_reject_user_access ON xera_user_access_reconciliation',
        );
        await tx.tx.$executeRawUnsafe('DROP FUNCTION xera_test_reject_user_access()');
        await transaction(() => tx.tx.$executeRaw`UPDATE users SET status='FROZEN' WHERE id=${id}`);
        await prisma.users.delete({ where: { id } });
        assert.equal(
            (
                await prisma.$queryRaw`SELECT count(*)::int AS n FROM xera_user_access_reconciliation WHERE user_id=${id}`
            )[0].n,
            0,
        );
        process.stdout.write(
            'PASS PostgreSQL ' +
                timezone +
                ': freeze/resume exact lifetime, repeated freeze, rollback, durable retry without HWIDs, stale worker fencing and deletion cascade\n',
        );
    } finally {
        await tx.tx.$executeRawUnsafe(
            'DROP TRIGGER IF EXISTS xera_test_reject_user_access ON xera_user_access_reconciliation',
        );
        await tx.tx.$executeRawUnsafe('DROP FUNCTION IF EXISTS xera_test_reject_user_access()');
        await prisma.users.deleteMany({ where: { id } });
        await prisma.$disconnect();
    }
}
(async () => {
    for (const timezone of ['UTC', 'Europe/Moscow', 'America/New_York']) await main(timezone);
})().catch((error) => {
    process.stderr.write(String(error.stack || error) + '\n');
    process.exitCode = 1;
});
