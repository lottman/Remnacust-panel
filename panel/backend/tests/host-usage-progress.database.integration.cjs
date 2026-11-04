const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { TransactionHost } = require('@nestjs-cls/transactional');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const {
    PrismaTxDriver,
} = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');

const url = process.env.HOST_USAGE_PROGRESS_TEST_DATABASE_URL;
assert.ok(url, 'Set HOST_USAGE_PROGRESS_TEST_DATABASE_URL');
const target = new URL(url);
assert.equal(target.protocol, 'postgresql:');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55439');
assert.equal(target.pathname, '/remnacust_test_host_usage_batch');
assert.equal(target.username, 'postgres');
assert.equal(target.password, '');
assert.equal(target.search, '');
assert.equal(target.hash, '');

const prisma = new PrismaClient({ datasourceUrl: url });
let failCommit = 0,
    commits = 0,
    failAck = false,
    loseCommitAck = false,
    loseDeleteAck = false,
    beforeAck = null;
const batchSizes = [];
const log = (message) => process.stdout.write(message + '\n');
const tx = new TransactionHost({
    defaultTxOptions: {},
    getFallbackInstance: () => prisma,
    wrapWithTransaction: (options, fn, set) =>
        prisma
            .$transaction(async (client) => {
                set(client);
                const result = await fn();
                const [size] =
                    await client.$queryRaw`SELECT COALESCE(NULLIF(current_setting('remnacust_test.receipts',true),''),'0')::int AS n`;
                if (failCommit && commits + 1 === failCommit)
                    throw Error('simulated commit failure');
                batchSizes.push(size.n);
                return result;
            }, options)
            .then((result) => {
                commits++;
                if (loseCommitAck) {
                    loseCommitAck = false;
                    throw Error('commit ACK lost');
                }
                return result;
            }),
});
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
const pending = new Map();
const cache = {
    hgetallParsed: async () => Object.fromEntries(pending),
    hsetJson: async (_key, id, value) => {
        pending.set(id, value);
    },
    createPipeline: () => {
        let command;
        return {
            hscan: () => {
                command = ['scan'];
            },
            hdel: (_key, id) => {
                command = ['delete', id];
            },
            exec: async () => {
                assert.equal(tx.isTransactionActive(), false);
                if (command[0] === 'scan')
                    return [
                        [
                            null,
                            [
                                '0',
                                [...pending].flatMap(([id, value]) => [id, JSON.stringify(value)]),
                            ],
                        ],
                    ];
                const [row] =
                    await prisma.$queryRaw`SELECT count(*) AS n FROM xera_host_usage_receipts WHERE id=${command[1]}::uuid`;
                assert.equal(row.n, 1n, 'ACK requires a durable committed SQL receipt');
                if (beforeAck) {
                    const hook = beforeAck;
                    beforeAck = null;
                    await hook();
                }
                if (failAck) throw Error('simulated ACK failure');
                pending.delete(command[1]);
                if (loseDeleteAck) {
                    loseDeleteAck = false;
                    throw Error('delete ACK lost');
                }
                return [[null, 1]];
            },
        };
    },
};
const { HostUsageService } = load(
    path.join(__dirname, '../src/common/host-policy/host-usage.service.ts'),
    {
        '@common/database': {},
        '@common/raw-cache': {},
        '@common/utils/host-identity': load(
            path.join(__dirname, '../src/common/utils/host-identity.ts'),
        ),
    },
);
const service = () => new HostUsageService(db, cache, tx);
const host = '11111111-1111-4111-8111-111111111111';
const total = async () =>
    (
        await prisma.$queryRaw`SELECT COALESCE(sum(total_bytes),0)::bigint AS n FROM xera_host_quota_usage WHERE user_id=901 AND host_uuid=${host}::uuid`
    )[0].n;
const stage = (count) => {
    for (let i = 0; i < count; i++)
        pending.set(randomUUID(), {
            day: '2026-11-04',
            records: [{ userId: '901', hostUuid: host, bytes: '3' }],
        });
};

(async () => {
    try {
        assert.equal(
            (await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,
            target.pathname.slice(1),
        );
        assert.equal(
            (await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n,
            0n,
            'Refuse populated test database',
        );
        assert.equal(
            (await prisma.$queryRaw`SELECT count(*) AS n FROM xera_host_usage_receipts`)[0].n,
            0n,
        );
        await prisma.$transaction(async (client) => {
            const seed = fs
                .readFileSync(path.join(__dirname, 'fixtures/host-policy-seed.sql'), 'utf8')
                .replace('BEGIN;', '');
            for (const statement of seed.split(';').filter((value) => value.trim()))
                await client.$executeRawUnsafe(statement);
        });
        await prisma.$executeRawUnsafe(`CREATE FUNCTION xera_audit_receipt_budget() RETURNS trigger LANGUAGE plpgsql AS $$
            DECLARE n int := COALESCE(NULLIF(current_setting('remnacust_test.receipts',true),''),'0')::int+1;
            BEGIN
                IF n>8 THEN RAISE EXCEPTION 'transaction receipt budget exceeded'; END IF;
                PERFORM set_config('remnacust_test.receipts',n::text,true);
                RETURN NEW;
            END $$`);
        await prisma.$executeRawUnsafe(
            'CREATE TRIGGER xera_audit_receipt_budget BEFORE INSERT ON xera_host_usage_receipts FOR EACH ROW EXECUTE FUNCTION xera_audit_receipt_budget()',
        );

        stage(75);
        await service().drain(901n);
        assert.equal(await total(), 225n);
        assert.equal(pending.size, 0);
        assert.ok(batchSizes.length > 1 && batchSizes.every((size) => size >= 0 && size <= 8));
        log('PASS bounded real SQL commits drain 75 receipts despite Redis COUNT overshoot');

        stage(25);
        failCommit = commits + 2;
        await assert.rejects(service().drain(901n), /simulated commit failure/);
        assert.ok((await total()) > 225n && (await total()) < 300n);
        assert.equal((await total()) + BigInt(pending.size) * 3n, 300n);
        failCommit = 0;
        await service().drain(901n);
        assert.equal(await total(), 300n);
        log('PASS later SQL rollback preserves earlier progress and reentry bills exactly once');

        stage(25);
        failAck = true;
        await assert.rejects(service().drain(901n), /simulated ACK failure/);
        assert.equal(pending.size, 25);
        failAck = false;
        await Promise.all([service().drain(901n), service().drain(901n)]);
        assert.equal(await total(), 375n);
        assert.equal(pending.size, 0);
        log('PASS lost ACK and concurrent restarted collectors cannot double bill');

        failCommit = commits + 1;
        let reads = 0;
        await assert.rejects(
            service().collect(901n, async () => {
                reads++;
                return {
                    isOk: true,
                    response: {
                        users: [
                            {
                                username: `901~${'a'.repeat(24)}~h${host.replaceAll('-', '')}`,
                                uplink: 2,
                                downlink: 3,
                            },
                        ],
                    },
                };
            }),
            /simulated commit failure/,
        );
        assert.equal(reads, 1);
        assert.equal(pending.size, 1);
        failCommit = 0;
        await service().drain(901n);
        assert.equal(await total(), 380n);
        log('PASS destructive sample survives capture transaction rollback and is replayable');

        stage(9);
        beforeAck = async () =>
            prisma.$executeRaw`INSERT INTO xera_quota_restore_state(singleton,generation,restored_at) VALUES(true,gen_random_uuid(),clock_timestamp())`;
        await assert.rejects(service().drain(901n), /QUOTA_RESTORE_REQUIRES_RECONCILIATION/);
        assert.ok(pending.size > 0);
        const fencedTotal = await total();
        await assert.rejects(
            service().collect(901n, async () =>
                assert.fail('destructive read through restore fence'),
            ),
            /QUOTA_RESTORE_REQUIRES_RECONCILIATION/,
        );
        assert.equal(await total(), fencedTotal);
        await prisma.$executeRaw`UPDATE xera_quota_restore_state SET reconciled_at=clock_timestamp()`;
        await service().drain(901n);
        assert.equal(await total(), 407n);
        assert.equal(pending.size, 0);
        log(
            'PASS restore fence interrupts batch ACK and billing; reconciliation safely resumes remaining receipts',
        );

        let enterRead, releaseRead;
        const enteredRead = new Promise((resolve) => {
            enterRead = resolve;
        });
        const readGate = new Promise((resolve) => {
            releaseRead = resolve;
        });
        const collecting = service().collect(901n, async () => {
            enterRead();
            await readGate;
            return {
                isOk: true,
                response: {
                    users: [
                        {
                            username: `901~${'a'.repeat(24)}~h${host.replaceAll('-', '')}`,
                            uplink: 2,
                            downlink: 3,
                        },
                    ],
                },
            };
        });
        await enteredRead;
        let drained = false;
        const draining = service()
            .drain(901n)
            .then(async () => {
                drained = true;
                assert.equal(
                    await total(),
                    412n,
                    'empty drain must wait for in-flight capture and bill its sample',
                );
            });
        try {
            let waiting = false;
            for (let attempt = 0; attempt < 100; attempt++) {
                assert.equal(drained, false, 'empty drain cannot bypass the destructive-read lock');
                const [locks] =
                    await prisma.$queryRaw`SELECT count(*) AS n FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory' AND NOT granted`;
                if (locks.n > 0n) {
                    waiting = true;
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.equal(waiting, true, 'drain must wait on the existing SQL node lock');
        } finally {
            releaseRead();
            await Promise.all([collecting, draining]);
        }
        log(
            'PASS empty drain waits for an in-flight destructive capture before completing cutover debt',
        );

        stage(1);
        loseCommitAck = true;
        await assert.rejects(service().drain(901n), /commit ACK lost/);
        assert.equal(await total(), 415n);
        assert.equal(pending.size, 1);
        await service().drain(901n);
        assert.equal(await total(), 415n);
        stage(2);
        loseDeleteAck = true;
        await assert.rejects(service().drain(901n), /delete ACK lost/);
        assert.equal(await total(), 421n);
        assert.equal(pending.size, 1);
        await service().drain(901n);
        assert.equal(await total(), 421n);
        assert.equal(pending.size, 0);
        log(
            'PASS ambiguous successful SQL commit and HDEL outcomes replay without duplicate or missing bytes',
        );
    } finally {
        await prisma.$disconnect();
    }
})().catch((error) => {
    process.stderr.write(String(error.stack ?? error) + '\n');
    process.exitCode = 1;
});
