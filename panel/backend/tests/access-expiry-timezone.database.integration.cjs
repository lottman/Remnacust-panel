const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('./prisma-test-client.cjs');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const {
    PrismaTxDriver,
} = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const { hostUserAccessQuery } = load(
    path.join(__dirname, '../src/common/host-policy/host-user-access-query.ts'),
);
const { inboundAccessQuery } = load(
    path.join(__dirname, '../src/common/host-policy/inbound-access-query.ts'),
);
const { UsersRepository } = source('modules/users/repositories/users.repository.ts', {
    '../entities': {
        UserWithResolvedInboundEntity: class {
            constructor(row) {
                Object.assign(this, row);
            }
        },
    },
});
async function main() {
    const url = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:55439/postgres';
    const target = new URL(url);
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '55439');
    assert.equal(target.pathname, '/postgres');
    const prisma = new PrismaClient({ datasourceUrl: url });
    try {
        assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n, 0n);
        await prisma.$transaction(
            async (tx) => {
                const seed = fs
                    .readFileSync(path.join(__dirname, 'fixtures/host-policy-seed.sql'), 'utf8')
                    .split('DO $$ BEGIN')[0]
                    .replace('BEGIN;', '');
                for (const statement of seed.split(';').filter((s) => s.trim()))
                    await tx.$executeRawUnsafe(statement);
                const renewal = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc';
                await tx.$executeRaw`INSERT INTO config_profile_inbounds(uuid,profile_uuid,tag,type,raw_inbound)
                VALUES(${renewal}::uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','renewal','vless','{}')`;
                await tx.$executeRaw`INSERT INTO internal_squad_inbounds(internal_squad_uuid,inbound_uuid)
                VALUES('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',${renewal}::uuid)`;
                await tx.$executeRaw`UPDATE hosts SET config_profile_inbound_uuid=${renewal}::uuid WHERE only_when_inactive`;
                const db = new k.Kysely({
                    dialect: {
                        createDriver: () => new PrismaTxDriver({ tx }),
                        createAdapter: () => new k.PostgresAdapter(),
                        createIntrospector: (db) => new k.PostgresIntrospector(db),
                        createQueryCompiler: () => new k.PostgresQueryCompiler(),
                    },
                });
                const repository = new UsersRepository(
                    {},
                    { kysely: db.withPlugin(new k.CamelCasePlugin()) },
                    {},
                );
                const cases = [
                    [-3600000, false],
                    [-1, false],
                    [0, false],
                    [1, true],
                    [3600000, true],
                ];
                for (const timezone of ['UTC', 'Europe/Moscow', 'America/New_York']) {
                    await tx.$queryRaw`SELECT set_config('TimeZone',${timezone},true)`;
                    for (const [offset, active] of cases) {
                        await tx.$executeRaw`UPDATE users SET status='ACTIVE',expire_at=date_trunc('milliseconds',now() AT TIME ZONE 'UTC')+${offset}*interval '1 millisecond' WHERE id=901`;
                        const expected = active
                            ? '11111111-1111-4111-8111-111111111111'
                            : '22222222-2222-4222-8222-222222222222';
                        const candidates = k.sql`SELECT 901::bigint AS user_id,uuid AS host_uuid FROM hosts`;
                        const hosts = (await hostUserAccessQuery(candidates).execute(db)).rows;
                        assert.deepEqual(
                            hosts.map((r) => r.host_uuid),
                            [expected],
                            timezone + ' batch host offset=' + offset,
                        );
                        const legacy =
                            await tx.$queryRaw`SELECT uuid FROM hosts WHERE xera_host_user_allowed(901,uuid)`;
                        assert.deepEqual(
                            legacy.map((r) => r.uuid),
                            [expected],
                            timezone + ' scalar host offset=' + offset,
                        );
                        const expectedInbound = active
                            ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
                            : renewal;
                        const inbounds = (
                            await inboundAccessQuery(
                                k.sql`SELECT 901::bigint AS user_id,uuid AS inbound_uuid FROM config_profile_inbounds`,
                            ).execute(db)
                        ).rows;
                        assert.deepEqual(
                            inbounds.map((r) => r.inbound_uuid),
                            [expectedInbound],
                            timezone + ' batch inbound offset=' + offset,
                        );
                        const exceptions =
                            await tx.$queryRaw`SELECT era_host_subscription_allowed(901,${renewal}::uuid) AS allowed`;
                        assert.equal(
                            exceptions[0].allowed,
                            !active,
                            timezone + ' scalar inactive offset=' + offset,
                        );
                        const single = await repository.getUserWithResolvedInbounds(901n);
                        assert.deepEqual(
                            single.inbounds.map((i) => i.uuid),
                            [expectedInbound],
                            timezone + ' single resolution offset=' + offset,
                        );
                        const bulk = await repository.getUsersWithResolvedInbounds([901n]);
                        assert.deepEqual(
                            bulk[0].inbounds.map((i) => i.uuid),
                            [expectedInbound],
                            timezone + ' bulk resolution offset=' + offset,
                        );
                    }
                }
                throw Object.assign(Error('rollback fixture'), { rollbackFixture: true });
            },
            { timeout: 30000 },
        );
    } catch (error) {
        if (!error.rollbackFixture) throw error;
        console.log(
            'PASS UTC/Moscow/New_York: fixed UTC expiration oracle, active/inactive host boundaries and single/bulk credentials',
        );
    } finally {
        await prisma.$disconnect();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
