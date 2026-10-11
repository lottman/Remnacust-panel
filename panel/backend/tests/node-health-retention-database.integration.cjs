// Use only the disposable PostgreSQL fixture reserved by source-check CI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const load = require('./load-typescript.cjs');
const { NodeHealthLogService } = load(path.join(__dirname, '../src/modules/nodes/node-health-log.service.ts'), { '@common/database/prisma.service': {} });

async function main() {
    const db = new PrismaClient({ datasourceUrl: 'postgresql://postgres@127.0.0.1:55439/postgres' });
    const uuid = '99999999-0000-4000-8000-000000000990';
    const service = new NodeHealthLogService(db);
    const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261011020000_health_log_retention/migration.sql'), 'utf8');
    const apply = async () => {
        for (const statement of migration.split(';').filter(value => value.trim())) await db.$executeRawUnsafe(statement);
    };
    try {
        assert.equal(await service.retentionDays(), 3, 'fresh migration default');
        await db.$executeRaw`UPDATE xera_node_health_log_settings SET retention_days=30 WHERE id=1`;
        await apply(); assert.equal(await service.retentionDays(), 3, 'old default is migrated');
        await db.$executeRaw`UPDATE xera_node_health_log_settings SET retention_days=7 WHERE id=1`;
        await apply(); assert.equal(await service.retentionDays(), 7, 'custom retention is preserved');
        await db.$executeRaw`UPDATE xera_node_health_log_settings SET retention_days=3 WHERE id=1`;
        await db.$executeRaw`INSERT INTO nodes(id, uuid, name, address) VALUES (990, ${uuid}::uuid, 'health-retention-audit', '127.0.0.1')`;
        await db.$executeRaw`INSERT INTO xera_node_health_logs(node_uuid, checked_at, status)
            SELECT ${uuid}::uuid, now()-interval '4 days', 'ok' FROM generate_series(1, 5010)`;
        const recent = new Date(Date.now() - 3 * 86400000 + 60000);
        await db.$executeRaw`INSERT INTO xera_node_health_logs(node_uuid, checked_at, status)
            VALUES (${uuid}::uuid, ${recent}, 'error'), (${uuid}::uuid, now()+interval '1 day', 'retry')`;
        await service.cleanup();
        const count = async () => Number((await db.$queryRaw`SELECT count(*) FROM xera_node_health_logs WHERE node_uuid=${uuid}::uuid`)[0].count);
        assert.equal(await count(), 2, 'batch cleanup removes expired records only');
        await db.$executeRaw`INSERT INTO xera_node_health_logs(node_uuid, checked_at, status) VALUES (${uuid}::uuid, now()-interval '4 days', 'unreachable')`;
        let locked, release;
        const acquired = new Promise(resolve => { locked = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        const holding = db.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM xera_node_health_logs WHERE node_uuid=${uuid}::uuid AND status='unreachable' FOR UPDATE`;
            locked(); await gate;
        }, { timeout: 15000 });
        try { await acquired; await service.cleanup(); assert.equal(await count(), 3, 'maintenance skips locked records'); }
        finally { release(); await holding; }
        await service.cleanup(); assert.equal(await count(), 2, 'next maintenance removes formerly locked records');
        const options = (await db.$queryRaw`SELECT reloptions FROM pg_class WHERE oid='xera_node_health_logs'::regclass`)[0].reloptions;
        assert.ok(options.includes('autovacuum_vacuum_scale_factor=0.02'));
        console.log('PASS PostgreSQL: 3-day fresh/upgrade defaults, preserved custom retention, 5010-row multi-batch expiry, fresh/future records, SKIP LOCKED recovery and autovacuum settings');
    } finally {
        await db.$executeRaw`DELETE FROM nodes WHERE uuid=${uuid}::uuid`;
        await db.$disconnect();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
