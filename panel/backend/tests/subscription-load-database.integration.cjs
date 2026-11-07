const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('./prisma-test-client.cjs');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const { inboundAccessQuery } = load(path.join(__dirname, '../src/common/host-policy/inbound-access-query.ts'));
const { identityAccessQuery } = load(path.join(__dirname, '../src/common/host-policy/identity-access-query.ts'));
const { PrismaTxDriver } = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');

async function main() {
    const url = new URL(process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:55439/postgres');
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55439'); assert.equal(url.pathname, '/postgres');
    url.searchParams.set('connection_limit', '8'); url.searchParams.set('pool_timeout', '10');
    const prisma = new PrismaClient({ datasourceUrl: url.href });
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n, 0n);
    const db = new k.Kysely({ dialect: {
        createDriver: () => new PrismaTxDriver({ tx: prisma }), createAdapter: () => new k.PostgresAdapter(),
        createIntrospector: db => new k.PostgresIntrospector(db), createQueryCompiler: () => new k.PostgresQueryCompiler(),
    } });
    try {
        const seed = fs.readFileSync(path.join(__dirname, 'fixtures/host-policy-seed.sql'), 'utf8').split('DO $$ BEGIN')[0].replace('BEGIN;', '');
        await prisma.$transaction(async tx => {
            for (const statement of seed.split(';').filter(s => s.trim())) await tx.$executeRawUnsafe(statement);
            await tx.$executeRawUnsafe(`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password)
                SELECT 100000+n,'soak-'||n,'soak-'||n,now()+interval '1 day','test',md5(n::text)::uuid,'test'
                FROM generate_series(1,5000) n`);
            await tx.$executeRawUnsafe(`INSERT INTO internal_squad_members(internal_squad_uuid,user_id)
                SELECT '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id FROM users WHERE id>100000`);
            await tx.$executeRawUnsafe(`INSERT INTO hwid_user_devices(hwid,user_id)
                SELECT 'device-'||n,u.id FROM users u CROSS JOIN generate_series(1,2) n WHERE u.id>100000`);
            await tx.$executeRawUnsafe(`INSERT INTO xera_host_identities(user_id,host_uuid,device_key,hwid,parent_vless_uuid)
                SELECT u.id,h.uuid,COALESCE(d.hwid,''),d.hwid,u.vless_uuid FROM users u CROSS JOIN hosts h
                CROSS JOIN (VALUES(NULL::text),('device-1'),('device-2')) d(hwid) WHERE u.id>100000`);
        }, { timeout: 30000 });
        await prisma.$executeRawUnsafe('ANALYZE');
        const samples = [], profileSamples = [];
        const started = performance.now();
        for (let round = 0; round < 300; round++) {
            await Promise.all(Array.from({ length: 20 }, async (_, index) => {
                const id = 100001 + ((round * 20 + index) % 5000);
                const begin = performance.now();
                const query = identityAccessQuery(k.sql`SELECT user_id,host_uuid,host_uuid AS owner_uuid,
                    host_uuid AS source_uuid,hwid,parent_vless_uuid AS parent FROM xera_host_identities WHERE user_id=${id}`);
                const result = await query.execute(db);
                assert.equal(result.rows.length, 6);
                assert.equal(result.rows.filter(row => row.allowed).length, 3);
                samples.push(performance.now() - begin);
            }));
            if (round % 25 === 0) {
                const begin = performance.now();
                const query = inboundAccessQuery(k.sql`SELECT sm.user_id,si.inbound_uuid FROM internal_squad_members sm
                    JOIN internal_squad_inbounds si ON si.internal_squad_uuid=sm.internal_squad_uuid`);
                assert((await query.execute(db)).rows.length >= 5000);
                profileSamples.push(performance.now() - begin);
            }
            await new Promise(resolve => setTimeout(resolve, 150));
        }
        const stalled = await prisma.$queryRaw`SELECT count(*) AS n FROM pg_stat_activity
            WHERE datname=current_database() AND state='idle in transaction'`;
        assert.equal(stalled[0].n, 0n);
        const percentile = (values, ratio) => [...values].sort((a,b) => a-b)[Math.floor((values.length-1)*ratio)];
        assert(percentile(samples, .95) < 2000, 'sustained subscription authorization must not reach multi-second pool queues');
        console.log(JSON.stringify({ subscriptions: samples.length, identities: 30000, profileBuilds: profileSamples.length,
            durationSeconds: Math.round((performance.now()-started)/1000), p95Ms: Math.round(percentile(samples,.95)),
            firstHalfP95Ms: Math.round(percentile(samples.slice(0,3000),.95)),
            lastHalfP95Ms: Math.round(percentile(samples.slice(3000),.95)),
            maxProfileMs: Math.round(Math.max(...profileSamples)), idleTransactions: 0 }));
        console.log('PASS sustained concurrent subscription authorization and full-profile reads with a bounded eight-connection pool');
    } finally {
        await prisma.$executeRawUnsafe('DELETE FROM users WHERE id IN(901,902) OR id>100000');
        await prisma.$executeRawUnsafe('DELETE FROM hosts');
        await prisma.$executeRawUnsafe('DELETE FROM nodes WHERE id=901');
        await prisma.$executeRawUnsafe('DELETE FROM internal_squads');
        await prisma.$executeRawUnsafe('DELETE FROM config_profiles');
        await prisma.$disconnect();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
