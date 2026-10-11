// Real pg_dump/pg_restore against the disposable database, never production.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const load = require('./load-typescript.cjs');
const { backupDumpArguments } = load(
    path.join(__dirname, '../src/modules/backups/backup-dump-options.ts'),
);

const docker = (...args) =>
    process.platform === 'win32'
        ? ['wsl', ['-d', 'Ubuntu-24.04', '-u', 'root', '-e', 'docker', ...args]]
        : ['docker', args];
const client = (args, input) => {
    const [binary, command] = docker(
        'run',
        '--rm',
        ...(input ? ['-i'] : []),
        '--network',
        'host',
        'mirror.gcr.io/library/postgres:17.6',
        ...args,
    );
    return execFileSync(binary, command, { input, maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
};
async function main() {
    const connection = 'postgresql://postgres@127.0.0.1:55439/postgres';
    const db = new PrismaClient({ datasourceUrl: connection });
    const restoreName = 'xera_backup_audit_' + randomBytes(8).toString('hex');
    assert.match(restoreName, /^xera_backup_audit_[a-f0-9]{16}$/);
    const nodeUuid = '99999999-0000-4000-8000-000000000991';
    let restored;
    let created = false;
    try {
        await db.$executeRaw`INSERT INTO nodes(id,uuid,name,address) VALUES (991,${nodeUuid}::uuid,'backup-dump-audit','127.0.0.1')`;
        await db.$executeRaw`INSERT INTO xera_node_health_logs(node_uuid,status,message)
            SELECT ${nodeUuid}::uuid,'ok',substring((SELECT string_agg(md5(g.i::text || j::text || random()::text),'') FROM generate_series(1,16) j),1,500)
            FROM generate_series(1,5000) g(i)`;
        await db.$executeRaw`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password)
            VALUES (991,'backup-dump-audit','backup-dump-audit',now()+interval '1 day','audit-key',gen_random_uuid(),'audit-key')`;
        await db.hwidUserDevices.create({
            data: { userId: 991n, hwid: 'backup-banned-device', blocked: true },
        });
        const before = (await db.$queryRaw`SELECT to_jsonb(u) AS data FROM users u WHERE id=991`)[0]
            .data;
        const args = backupDumpArguments(new URL(connection));
        const baseline = client([
            'pg_dump',
            ...args.filter((arg) => !arg.startsWith('--exclude-table-data=')),
        ]);
        const compact = client(['pg_dump', ...args]);
        assert.ok(
            compact.length < baseline.length / 2,
            'diagnostic samples no longer dominate the dump',
        );
        const toc = client(['pg_restore', '--list'], compact).toString();
        assert.match(toc, /TABLE public xera_node_health_logs/);
        assert.doesNotMatch(toc, /TABLE DATA public xera_node_health_logs/);
        assert.match(toc, /TABLE DATA public users/);
        await db.$executeRawUnsafe('CREATE DATABASE ' + restoreName);
        created = true;
        const restoredUrl = new URL(connection);
        restoredUrl.pathname = '/' + restoreName;
        client(['pg_restore', '--exit-on-error', '--no-owner', '--dbname=' + restoredUrl], compact);
        restored = new PrismaClient({ datasourceUrl: restoredUrl.toString() });
        const after = (
            await restored.$queryRaw`SELECT to_jsonb(u) AS data FROM users u WHERE id=991`
        )[0].data;
        assert.deepEqual(
            after,
            before,
            'user identity, credentials and settings survive restoration',
        );
        assert.equal(
            (
                await restored.hwidUserDevices.findUnique({
                    where: { hwid_userId: { hwid: 'backup-banned-device', userId: 991n } },
                })
            ).blocked,
            true,
        );
        assert.equal(
            Number((await restored.$queryRaw`SELECT count(*) FROM xera_node_health_logs`)[0].count),
            0,
        );
        assert.deepEqual(
            await restored.$queryRaw`SELECT * FROM xera_node_health_log_settings`,
            await db.$queryRaw`SELECT * FROM xera_node_health_log_settings`,
        );
        console.log(
            JSON.stringify({
                status: 'PASSED',
                baselineBytes: baseline.length,
                compactBytes: compact.length,
                reductionPercent: Math.round(100 * (1 - compact.length / baseline.length)),
                checks: 'real dump/restore; diagnostic schema retained; users, keys, HWID ban and retention settings preserved',
            }),
        );
    } finally {
        await restored?.$disconnect();
        if (created) await db.$executeRawUnsafe('DROP DATABASE ' + restoreName);
        await db.$executeRaw`DELETE FROM nodes WHERE uuid=${nodeUuid}::uuid`;
        await db.users.deleteMany({ where: { id: 991n } });
        await db.$disconnect();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
