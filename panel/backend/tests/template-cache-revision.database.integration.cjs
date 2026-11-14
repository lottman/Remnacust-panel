const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { Client } = require('pg');

if (process.env.TEMPLATE_CACHE_TEST_REQUIRED === '1')
    assert(process.env.TEMPLATE_CACHE_TEST_DATABASE_URL, 'Set TEMPLATE_CACHE_TEST_DATABASE_URL');

for (const table of ['subscription_templates', 'external_squads']) {
    test(
        `${table}: restricted-owner cache epoch follows committed statements, rollback and concurrent writers`,
        {
            skip: !process.env.TEMPLATE_CACHE_TEST_DATABASE_URL,
            timeout: 60_000,
        },
        async () => {
            const url = new URL(process.env.TEMPLATE_CACHE_TEST_DATABASE_URL);
            assert.equal(url.hostname, '127.0.0.1');
            assert.equal(url.pathname, '/postgres');
            assert.equal(url.port, '55439');
            assert.equal(url.username, 'remnacust_ci_owner');
            assert.equal(process.env.TEMPLATE_CACHE_TEST_DISPOSABLE, '1');
            const clients = [0, 1, 2].map(
                () =>
                    new Client({
                        connectionString: url.href,
                        statement_timeout: 15_000,
                    }),
            );
            const [observer, writer, concurrent] = clients;
            const ids = [];
            const rowName = (label, id) =>
                label.slice(0, 10) + '-' + id.replaceAll('-', '').slice(0, 16);
            const epoch = async (client = observer) => {
                const result = await client.query(
                    'SELECT revision::text FROM public.xera_template_cache_revision WHERE id=1',
                );
                assert.equal(result.rows.length, 1);
                assert.match(result.rows[0].revision, /^[a-f0-9-]{36}$/);
                return result.rows[0].revision;
            };
            const insert = async (client, name) => {
                const id = randomUUID();
                ids.push(id);
                await client.query(
                    table === 'subscription_templates'
                        ? `INSERT INTO subscription_templates(uuid,name,template_type,template_json)
            VALUES ($1,$2,'SINGBOX','{}')`
                        : 'INSERT INTO external_squads(uuid,name) VALUES ($1,$2)',
                    [id, rowName(name, id)],
                );
                return id;
            };
            const transaction = async (work) => {
                await writer.query('BEGIN');
                try {
                    return await work();
                } finally {
                    await writer.query('ROLLBACK');
                }
            };
            try {
                await Promise.all(clients.map((client) => client.connect()));
                const role = (
                    await observer.query(`SELECT rolsuper,rolcreatedb,rolcreaterole,
            current_setting('server_version') AS version FROM pg_roles WHERE rolname=current_user`)
                ).rows[0];
                assert.deepEqual(
                    [role.rolsuper, role.rolcreatedb, role.rolcreaterole],
                    [false, false, false],
                );
                if (process.env.TEMPLATE_CACHE_TEST_PG_VERSION)
                    assert.equal(
                        role.version.split(' ')[0],
                        process.env.TEMPLATE_CACHE_TEST_PG_VERSION,
                    );
                const migrations = fs
                    .readdirSync(path.join(__dirname, '../prisma/migrations'), {
                        withFileTypes: true,
                    })
                    .filter((entry) => entry.isDirectory())
                    .map((entry) => entry.name)
                    .sort();
                const applied = (
                    await observer.query(`SELECT migration_name FROM _prisma_migrations
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`)
                ).rows.map((row) => row.migration_name);
                assert.deepEqual(applied, migrations);
                assert.ok(applied.includes('20261107200000_template_cache_revision'));
                assert.ok(applied.includes('20261114000000_external_squad_cache_revision'));
                const owner = (
                    await observer.query(`SELECT pg_get_userbyid(relowner) AS owner FROM pg_class
            WHERE oid='public.xera_template_cache_revision'::regclass`)
                ).rows[0];
                assert.equal(owner.owner, url.username);
                assert.equal(
                    (
                        await observer.query(
                            `SELECT tgtype::int AS type FROM pg_trigger
            WHERE tgname=$1 AND NOT tgisinternal`,
                            [
                                table === 'subscription_templates'
                                    ? 'xera_template_cache_revision_changed'
                                    : 'xera_external_squad_cache_revision_changed',
                            ],
                        )
                    ).rows[0].type,
                    60,
                );

                for (const operation of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
                    const target = await insert(observer, operation);
                    const before = await epoch();
                    const mutate = async () => {
                        if (operation === 'INSERT') await insert(writer, operation + '-pending');
                        if (operation === 'UPDATE')
                            await writer.query(`UPDATE ${table} SET name=$1 WHERE uuid=$2`, [
                                rowName('pending', target),
                                target,
                            ]);
                        if (operation === 'DELETE')
                            await writer.query(`DELETE FROM ${table} WHERE uuid=$1`, [target]);
                        if (operation === 'TRUNCATE')
                            await writer.query(`TRUNCATE ${table} CASCADE`);
                    };
                    await transaction(async () => {
                        await mutate();
                        assert.notEqual(
                            await epoch(writer),
                            before,
                            operation + ' has a transaction-local epoch',
                        );
                        assert.equal(
                            await epoch(),
                            before,
                            operation + ' cannot expose an uncommitted epoch',
                        );
                    });
                    assert.equal(await epoch(), before, operation + ' rollback restores its epoch');
                    assert.equal(
                        (
                            await observer.query(
                                `SELECT count(*)::int AS n FROM ${table} WHERE uuid=$1`,
                                [target],
                            )
                        ).rows[0].n,
                        1,
                    );
                    await writer.query('BEGIN');
                    await mutate();
                    const pending = await epoch(writer);
                    await writer.query('COMMIT');
                    assert.equal(
                        await epoch(),
                        pending,
                        operation + ' commit publishes exactly its epoch',
                    );
                    assert.notEqual(pending, before);
                }

                const a = await insert(observer, 'concurrent-A');
                const b = await insert(observer, 'concurrent-B');
                const secondPid = (await concurrent.query('SELECT pg_backend_pid() AS pid')).rows[0]
                    .pid;
                for (const firstFinish of ['ROLLBACK', 'COMMIT']) {
                    const before = await epoch();
                    await writer.query('BEGIN');
                    await concurrent.query('BEGIN');
                    await writer.query(`UPDATE ${table} SET name=$1 WHERE uuid=$2`, [
                        rowName('first-' + firstFinish, a),
                        a,
                    ]);
                    const firstEpoch = await epoch(writer);
                    assert.equal(await epoch(), before);
                    const secondWrite = concurrent.query(
                        `UPDATE ${table} SET name=$1 WHERE uuid=$2`,
                        [rowName('second-' + firstFinish, b), b],
                    );
                    const deadline = Date.now() + 5000;
                    for (;;) {
                        const active = (
                            await observer.query(
                                'SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',
                                [secondPid],
                            )
                        ).rows[0];
                        if (active?.wait_event_type === 'Lock') break;
                        assert.ok(
                            Date.now() < deadline,
                            'second writer must reach the epoch row lock',
                        );
                        await delay(10);
                    }
                    await writer.query(firstFinish);
                    await secondWrite;
                    assert.equal(await epoch(), firstFinish === 'COMMIT' ? firstEpoch : before);
                    const secondEpoch = await epoch(concurrent);
                    assert.notEqual(secondEpoch, before);
                    assert.notEqual(secondEpoch, firstEpoch);
                    await concurrent.query('COMMIT');
                    assert.equal(await epoch(), secondEpoch);
                    assert.equal(
                        (await observer.query(`SELECT name FROM ${table} WHERE uuid=$1`, [b]))
                            .rows[0].name,
                        rowName('second-' + firstFinish, b),
                    );
                }
                process.stdout.write(
                    JSON.stringify({
                        postgres: role.version,
                        table,
                        restrictedOwner: true,
                        migrations: applied.length,
                        committedOperations: ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'],
                        rollback: true,
                        concurrentCommitAndRollback: true,
                    }) + '\n',
                );
            } finally {
                for (const client of clients) await client.query('ROLLBACK').catch(() => {});
                if (ids.length)
                    await observer
                        .query(`DELETE FROM ${table} WHERE uuid=ANY($1::uuid[])`, [ids])
                        .catch(() => {});
                await Promise.all(clients.map((client) => client.end().catch(() => {})));
            }
        },
    );
}
