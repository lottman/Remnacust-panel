const assert = require('node:assert/strict');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const load = require('./load-typescript.cjs');

const url = new URL(process.env.SYSTEM_DIAGNOSTICS_TEST_ADMIN_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55439');
assert.equal(url.pathname, '/postgres');
url.searchParams.set('connection_limit', '1');
url.searchParams.set('pool_timeout', '5');
const admin = new PrismaClient({ datasourceUrl: url.href });
const clients = [];
const roles = [];
const readerRole = `ci_diagnostics_${process.pid}_reader`;
const foreignRole = `ci_diagnostics_${process.pid}_foreign`;
const { SystemDiagnosticsService } = load(
    path.join(__dirname, '../src/modules/system/system-diagnostics.service.ts'),
    { '@common/database/prisma.service': {} },
);

function client(role) {
    const target = new URL(url);
    target.username = role;
    target.password = '';
    const prisma = new PrismaClient({ datasourceUrl: target.href });
    clients.push(prisma);
    return prisma;
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

async function main() {
    for (const role of [readerRole, foreignRole]) {
        assert.match(role, /^ci_diagnostics_[0-9]+_(reader|foreign)$/);
        await admin.$executeRawUnsafe(
            `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
        );
        roles.push(role);
    }
    const holder = client(readerRole);
    const waiter = client(readerRole);
    const reader = client(readerRole);
    const foreign = client(foreignRole);
    const gate = deferred();
    const holderReady = deferred();
    const foreignReady = deferred();
    const lock = BigInt(process.pid) + 7713931000n;
    const holding = holder.$transaction(
        async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lock}::bigint)::text`;
            holderReady.resolve();
            await gate.promise;
        },
        { timeout: 15000 },
    );
    const foreignHolding = foreign.$transaction(
        async (tx) => {
            await tx.$queryRaw`SELECT 1 AS alive`;
            foreignReady.resolve();
            await gate.promise;
        },
        { timeout: 15000 },
    );
    void holding.catch(holderReady.reject);
    void foreignHolding.catch(foreignReady.reject);
    let waiting;
    try {
        await Promise.all([holderReady.promise, foreignReady.promise]);
        waiting = waiter.$transaction(
            (tx) => tx.$queryRaw`SELECT pg_advisory_xact_lock(${lock}::bigint)::text`,
            { timeout: 15000 },
        );
        void waiting.catch(() => {});
        const deadline = Date.now() + 5000;
        for (;;) {
            const [row] =
                await admin.$queryRaw`SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity
                WHERE datname=current_database() AND usename=${readerRole} AND wait_event_type='Lock'`;
            if (row.count === 1) break;
            assert(Date.now() < deadline, 'The same-role waiter must reach its advisory lock');
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const [foreignSession] =
            await admin.$queryRaw`SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity
            WHERE datname=current_database() AND usename=${foreignRole}`;
        assert.equal(foreignSession.count, 1);
        const snapshot = await new SystemDiagnosticsService(reader).getSnapshot();
        assert.equal(snapshot.status, 'ok');
        assert.equal(snapshot.database.visibility, 'complete');
        assert.equal(snapshot.database.connections, 2);
        assert.equal(snapshot.database.activeQueries, 1);
        assert.equal(snapshot.database.lockWaits, 1);
        assert.equal(snapshot.database.idleInTransaction, 1);
        assert(snapshot.database.longestQuerySeconds >= 0);
    } finally {
        gate.resolve();
        await Promise.allSettled([holding, foreignHolding, waiting]);
        await Promise.allSettled([holder, waiter, foreign].map((prisma) => prisma.$disconnect()));
    }
    const [privileges] = await reader.$queryRaw`SELECT rolsuper,rolcreatedb,rolcreaterole,
        pg_has_role(current_user,'pg_read_all_stats','MEMBER') AS allstats
        FROM pg_catalog.pg_roles WHERE rolname=current_user`;
    assert.deepEqual(privileges, {
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        allstats: false,
    });
    const snapshot = await new SystemDiagnosticsService(reader).getSnapshot();
    assert.equal(snapshot.status, 'ok');
    assert.equal(
        snapshot.database.connections,
        0,
        'The monitoring connection must exclude its own PID',
    );
    assert.equal(snapshot.database.activeQueries, 0);
    assert.equal(snapshot.database.lockWaits, 0);
    assert.equal(snapshot.database.idleInTransaction, 0);
    const [server] =
        await admin.$queryRaw`SELECT current_setting('server_version_num')::integer AS version`;
    assert.equal(
        snapshot.database.version,
        `${Math.floor(server.version / 10000)}.${server.version % 10000}`,
    );
    process.stdout.write(
        `${JSON.stringify({ version: snapshot.database.version, restrictedRole: true, foreignRoleExcluded: true, selfPidExcluded: true })}\n`,
    );
}

main()
    .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await Promise.allSettled(clients.map((prisma) => prisma.$disconnect()));
        try {
            for (const role of roles.reverse())
                await admin.$executeRawUnsafe(`DROP ROLE "${role}"`);
        } finally {
            await admin.$disconnect();
        }
    });
