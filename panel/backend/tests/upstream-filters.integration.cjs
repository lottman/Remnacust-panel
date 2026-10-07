const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { database, userFilter, reportFilter } = require('./upstream-filter-fixture.cjs');

async function main() {
    const url = process.env.REMNACUST_TEST_POSTGRES_URL;
    assert.ok(url, 'Set REMNACUST_TEST_POSTGRES_URL to a disposable PostgreSQL database');
    const endpoint = new URL(url);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname), 'Test database must be on loopback');
    assert.equal(endpoint.pathname, '/remnacust_upstream_test', 'Use the dedicated test database');
    const prisma = new PrismaClient({ datasourceUrl: url });
    const db = database();
    try {
        await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe('CREATE TEMP TABLE users(id bigint PRIMARY KEY, telegram_id bigint, username text)');
            await tx.$executeRawUnsafe('CREATE TEMP TABLE nodes(id bigint PRIMARY KEY, uuid uuid, name text, country_code text)');
            await tx.$executeRawUnsafe('CREATE TEMP TABLE torrent_blocker_reports(id bigint PRIMARY KEY, user_id bigint, node_id bigint, report jsonb, created_at timestamptz)');
            await tx.$executeRawUnsafe("INSERT INTO users VALUES (12, 12345, 'first'), (123, NULL, 'second'), (312, 99123, 'third'), (9007199254740993, 9, 'bigint')");
            await tx.$executeRawUnsafe("INSERT INTO nodes VALUES (12, '00000000-0000-0000-0000-000000000012', 'first', 'RU'), (123, '00000000-0000-0000-0000-000000000123', 'second', 'NL'), (312, '00000000-0000-0000-0000-000000000312', 'third', 'DE'), (9007199254740993, '00000000-0000-0000-0000-000000000004', 'bigint', 'FR')");
            await tx.$executeRawUnsafe("INSERT INTO torrent_blocker_reports SELECT id, id, id, '{}'::jsonb, now() FROM users");
            const rows = async (builder) => {
                const query = builder.compile();
                return await tx.$queryRawUnsafe(query.sql, ...query.parameters);
            };
            assert.deepEqual(await rows(userFilter(db, 'id', '12')), [{ id: 12n }]);
            assert.deepEqual(await rows(userFilter(db, 'id', '9007199254740993')), [{ id: 9007199254740993n }]);
            for (const id of ['id', 'telegramId']) {
                assert.deepEqual(await rows(userFilter(db, id, 'invalid')), []);
            }
            assert.deepEqual((await rows(userFilter(db, 'telegramId', '123'))).map((row) => row.id).sort(), [12n, 312n]);
            for (const id of ['id', 'userId', 'nodeId']) {
                assert.deepEqual((await rows(reportFilter(db, id, '12'))).map((row) => row.id), [12n]);
                assert.deepEqual((await rows(reportFilter(db, id, '9007199254740993'))).map((row) => row.id), [9007199254740993n]);
                assert.deepEqual(await rows(reportFilter(db, id, 'invalid')), []);
            }
        }, { timeout: 15000 });
        console.log('PASS: PostgreSQL exact IDs, bigint precision, invalid input and partial Telegram ID search');
    } finally {
        await prisma.$disconnect();
        await db.destroy();
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
