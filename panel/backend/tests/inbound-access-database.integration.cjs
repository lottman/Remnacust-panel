const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('./prisma-test-client.cjs');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const { inboundAccessQuery } = load(path.join(__dirname, '../src/common/host-policy/inbound-access-query.ts'));
const { PrismaTxDriver } = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');

async function main() {
    const url = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:55439/postgres';
    const target = new URL(url);
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '55439');
    assert.equal(target.pathname, '/postgres');
    const prisma = new PrismaClient({ datasourceUrl: url });
    try {
        assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n, 0n);
        await prisma.$transaction(async tx => {
            const seed = fs.readFileSync(path.join(__dirname, 'fixtures/host-policy-seed.sql'), 'utf8').split('DO $$ BEGIN')[0].replace('BEGIN;', '');
            for (const statement of seed.split(';').filter(s => s.trim())) await tx.$executeRawUnsafe(statement);
            await tx.$executeRawUnsafe(`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password,status,frozen_until)
                SELECT 100000+n,'inbound-'||n,'inbound-'||n,now()+CASE WHEN n%7=0 THEN interval '-1 day' ELSE interval '1 day' END,
                    'test',md5(n::text)::uuid,'test',CASE n%6 WHEN 0 THEN 'ACTIVE' WHEN 1 THEN 'EXPIRED' WHEN 2 THEN 'FROZEN'
                    WHEN 3 THEN 'DISABLED' WHEN 4 THEN 'LIMITED' ELSE 'ACTIVE' END, CASE WHEN n%6=2 THEN (statement_timestamp() AT TIME ZONE 'UTC')+interval '1 day' ELSE NULL END FROM generate_series(1,5000) n`);
            await tx.$executeRawUnsafe(`INSERT INTO internal_squad_members(internal_squad_uuid,user_id)
                SELECT CASE WHEN id%9=0 THEN '22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa' ELSE '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' END::uuid,id
                FROM users WHERE id>100000`);
            for (const table of ['users','hosts','internal_squad_members','internal_squad_inbounds','internal_squad_host_links'])
                await tx.$executeRawUnsafe('ANALYZE ' + table);
            const db = new k.Kysely({ dialect: {
                createDriver: () => new PrismaTxDriver({ tx }), createAdapter: () => new k.PostgresAdapter(),
                createIntrospector: db => new k.PostgresIntrospector(db), createQueryCompiler: () => new k.PostgresQueryCompiler(),
            } });
            const candidates = k.sql`SELECT DISTINCT sm.user_id,si.inbound_uuid FROM internal_squad_members sm
                JOIN internal_squad_inbounds si ON si.internal_squad_uuid=sm.internal_squad_uuid`;
            const batch = inboundAccessQuery(candidates);
            const old = k.sql`SELECT c.* FROM (${candidates}) c JOIN users u ON u.id=c.user_id
                WHERE (u.status='ACTIVE' AND u.expire_at>now() AND NOT era_inbound_only_when_inactive(u.id,c.inbound_uuid))
                    OR era_host_subscription_allowed(u.id,c.inbound_uuid)`;
            const compare = async () => {
                const result = await k.sql`SELECT count(*)::int AS n FROM (
                    (SELECT * FROM (${old}) o EXCEPT SELECT * FROM (${batch}) b)
                    UNION ALL (SELECT * FROM (${batch}) b EXCEPT SELECT * FROM (${old}) o)
                ) mismatch`.execute(db);
                assert.equal(result.rows[0].n, 0);
            };
            await compare();
            const plan = (await k.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT count(*) FROM (${batch}) a`.execute(db)).rows[0]['QUERY PLAN'][0];
            assert.doesNotMatch(JSON.stringify(plan), /era_(?:host_subscription_allowed|inbound_only_when_inactive)/);
            const baseline = (await k.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT count(*) FROM (${old}) a`.execute(db)).rows[0]['QUERY PLAN'][0];
            console.log(JSON.stringify({ users: 5002, mismatches: 0, batchMs: plan['Execution Time'], baseline78Ms: baseline['Execution Time'] }));
            const native = inboundAccessQuery(candidates, ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
            const unsafe = await k.sql`SELECT count(*)::int AS n FROM (${native}) a JOIN users u ON u.id=a.user_id
                WHERE u.status<>'ACTIVE' OR u.expire_at<=now()`.execute(db);
            assert.equal(unsafe.rows[0].n, 0, 'native nodes must never get inactive exception credentials without destination isolation');
            const { UsersRepository } = source('modules/users/repositories/users.repository.ts', {
                '@common/host-policy/inbound-access-query': { inboundAccessQuery },
                '@common/helpers/kysely': { getKyselyUuid: value => k.sql`${value}::uuid` },
                '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
            });
            const repository = new UsersRepository({}, { kysely: db.withPlugin(new k.CamelCasePlugin()) }, {});
            repository.logger = { log() {} };
            const expected = (await native.execute(db)).rows.map(row => row.user_id.toString()).sort();
            const streamed = [];
            for await (const chunk of repository.getUsersForConfigStream(
                [{ uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', tag: 'shared' }],
                new Set(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']),
            )) streamed.push(...chunk);
            assert.deepEqual(streamed.map(row => row.id.toString()).sort(), expected);
            assert(streamed.every(row => row.tags.length === 1 && row.tags[0] === 'shared'));
            await tx.$executeRawUnsafe('UPDATE hosts SET always_available=true,only_when_inactive=true');
            await compare();
            await tx.$executeRawUnsafe('UPDATE hosts SET is_disabled=true');
            await compare();
            await tx.$executeRawUnsafe('DELETE FROM hosts');
            await compare();
            throw Object.assign(Error('rollback fixture'), { rollbackFixture: true });
        }, { timeout: 300000 });
    } catch (error) {
        if (!error.rollbackFixture) throw error;
        console.log('PASS native inbound authorization matches baseline; inactive exceptions remain closed on native nodes');
    } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
