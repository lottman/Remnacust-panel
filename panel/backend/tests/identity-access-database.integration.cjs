const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('./prisma-test-client.cjs');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const { identityAccessQuery } = load(path.join(__dirname, '../src/common/host-policy/identity-access-query.ts'));
const { autoselectRouteUuid } = load(path.join(__dirname, '../src/common/host-policy/autoselect-route-policy.ts'));
const { PrismaTxDriver } = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');

async function main() {
    const url = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:55439/postgres';
    const target = new URL(url);
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '55439');
    const prisma = new PrismaClient({ datasourceUrl: url });
    try {
        assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n, 0n);
        await prisma.$transaction(async tx => {
            const seed = fs.readFileSync(path.join(__dirname, 'fixtures/host-policy-seed.sql'), 'utf8').split('DO $$ BEGIN')[0].replace('BEGIN;', '');
            for (const statement of seed.split(';').filter(s => s.trim())) await tx.$executeRawUnsafe(statement);
            await tx.$executeRawUnsafe(`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password,status)
                SELECT 100000+n,'access-'||n,'access-'||n,now()+CASE WHEN n%7=0 THEN interval '-1 day' ELSE interval '1 day' END,
                    'test',md5(n::text)::uuid,'test',CASE n%6 WHEN 0 THEN 'ACTIVE' WHEN 1 THEN 'EXPIRED' WHEN 2 THEN 'FROZEN'
                    WHEN 3 THEN 'DISABLED' WHEN 4 THEN 'LIMITED' ELSE 'ACTIVE' END FROM generate_series(1,3000) n`);
            await tx.$executeRawUnsafe(`INSERT INTO internal_squad_members(internal_squad_uuid,user_id)
                SELECT CASE WHEN id%9=0 THEN '22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa' ELSE '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' END::uuid,id
                FROM users WHERE id>100000`);
            await tx.$executeRawUnsafe(`INSERT INTO hwid_user_devices(hwid,user_id,blocked)
                SELECT 'device-'||d,u.id,u.id%10=0 AND d=1 FROM users u CROSS JOIN generate_series(1,2) d WHERE u.id>100000`);
            await tx.$executeRawUnsafe(`INSERT INTO xera_hwid_registration_policy(user_id,registration_allowed)
                SELECT id,false FROM users WHERE id>100000 AND id%11=0`);
            await tx.$executeRawUnsafe(`INSERT INTO xera_host_identities(user_id,host_uuid,device_key,hwid,parent_vless_uuid)
                SELECT u.id,h.uuid,COALESCE(d.hwid,''),d.hwid,
                    CASE WHEN u.id%13=0 THEN md5('rotated')::uuid ELSE u.vless_uuid END
                FROM users u CROSS JOIN hosts h CROSS JOIN (VALUES (NULL::text),('device-1'),('device-2'),('unknown')) d(hwid) WHERE u.id>100000`);
            const owner = '11111111-1111-4111-8111-111111111111';
            const source = '22222222-2222-4222-8222-222222222222';
            const route = autoselectRouteUuid(owner, source);
            await tx.$executeRaw`INSERT INTO xera_autoselect_routes(uuid,owner_host_uuid,source_host_uuid) VALUES(${route}::uuid,${owner}::uuid,${source}::uuid)`;
            await tx.$executeRawUnsafe(`INSERT INTO xera_autoselect_identities(user_id,route_uuid,device_key,hwid,parent_vless_uuid)
                SELECT u.id,r.uuid,COALESCE(d.hwid,''),d.hwid,u.vless_uuid FROM users u CROSS JOIN xera_autoselect_routes r
                CROSS JOIN (VALUES (NULL::text),('device-1')) d(hwid) WHERE u.id>100000`);
            for (const table of ['users', 'hosts', 'hwid_user_devices', 'internal_squad_members', 'xera_host_identities', 'xera_autoselect_identities'])
                await tx.$executeRawUnsafe('ANALYZE ' + table);
            const db = new k.Kysely({ dialect: {
                createDriver: () => new PrismaTxDriver({ tx }), createAdapter: () => new k.PostgresAdapter(),
                createIntrospector: db => new k.PostgresIntrospector(db), createQueryCompiler: () => new k.PostgresQueryCompiler(),
            } });
            const requested = k.sql`SELECT user_id,host_uuid,host_uuid AS owner_uuid,host_uuid AS source_uuid,hwid,parent_vless_uuid AS parent FROM xera_host_identities
                UNION ALL SELECT k.user_id,r.uuid,r.owner_host_uuid,r.source_host_uuid,k.hwid,k.parent_vless_uuid
                FROM xera_autoselect_identities k JOIN xera_autoselect_routes r ON r.uuid=k.route_uuid`;
            const batch = identityAccessQuery(requested);
            const optimized = await k.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT count(*) FROM (${batch}) a WHERE a.allowed`.execute(db);
            const newPlan = optimized.rows[0]['QUERY PLAN'][0];
            console.log(JSON.stringify({ stage: 'batch', identities: 30000, ms: newPlan['Execution Time'] }));
            const comparison = await k.sql`SELECT count(*)::int AS mismatches FROM (${batch}) a
                WHERE a.allowed IS DISTINCT FROM xera_subscription_identity_allowed(a."userId"::bigint,a."hostUuid",a.hwid,a.parent)`.execute(db);
            assert.equal(comparison.rows[0].mismatches, 0);
            const sample = k.sql`SELECT * FROM (${requested}) r ORDER BY user_id,host_uuid,hwid LIMIT 1000`;
            const baseline = await k.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT count(*) FROM (${sample}) r
                WHERE xera_subscription_identity_allowed(r.user_id,r.host_uuid,r.hwid,r.parent)`.execute(db);
            const oldPlan = baseline.rows[0]['QUERY PLAN'][0];
            assert.doesNotMatch(JSON.stringify(newPlan), /xera_(?:host|subscription)_(?:identity|user)_allowed/);
            const count = await k.sql`SELECT count(*)::int AS total FROM (${batch}) a`.execute(db);
            assert.equal(count.rows[0].total, 30000);
            console.log(JSON.stringify({ identities: count.rows[0].total, mismatches: 0,
                batchMs: newPlan['Execution Time'], scalarSampleIdentities: 1000, scalarSampleMs: oldPlan['Execution Time'] }));
            throw Object.assign(new Error('rollback fixture'), { rollbackFixture: true });
        }, { timeout: 300000 });
    } catch (error) {
        if (!error.rollbackFixture) throw error;
        console.log('PASS batch identity authorization matches scalar rules for active, expired, frozen, disabled, limited, hidden, blocked, unknown and rotated identities');
    } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
