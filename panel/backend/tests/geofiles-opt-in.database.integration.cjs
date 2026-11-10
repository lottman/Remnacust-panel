const assert = require('node:assert/strict');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

test(
    'the 250000 migration preserves existing values and defaults while retaining a database range check',
    {
        skip: !process.env.GEOFILES_OPTIN_TEST_DATABASE_URL,
        timeout: 10000,
    },
    async () => {
        const url = new URL(process.env.GEOFILES_OPTIN_TEST_DATABASE_URL);
        assert.equal(url.hostname, '127.0.0.1');
        assert.equal(url.username, 'remnacust_ci_owner');
        assert.equal(process.env.GEOFILES_OPTIN_TEST_DISPOSABLE, '1');
        const db = new Client({ connectionString: url.href, statement_timeout: 5000 });
        try {
            await db.connect();
            await db.query(`CREATE TEMP TABLE subscription_settings (
            id integer PRIMARY KEY,
            geofiles_inline_rule_limit integer NOT NULL DEFAULT 20000,
            CONSTRAINT geofiles_inline_rule_limit_range CHECK (geofiles_inline_rule_limit BETWEEN 1 AND 50000)
        )`);
            await db.query('INSERT INTO pg_temp.subscription_settings VALUES(1,50000)');
            await assert.rejects(
                db.query('INSERT INTO pg_temp.subscription_settings VALUES(2,50001)'),
                (error) => error.code === '23514',
            );
            await db.query('SET search_path = pg_temp, public');
            await db.query(
                fs.readFileSync(
                    path.join(
                        __dirname,
                        '../prisma/migrations/20261110020000_geofiles_inline_rule_limit_250k/migration.sql',
                    ),
                    'utf8',
                ),
            );
            await db.query('INSERT INTO pg_temp.subscription_settings VALUES(2,250000)');
            await db.query('INSERT INTO pg_temp.subscription_settings(id) VALUES(3)');
            assert.deepEqual(
                (
                    await db.query(
                        'SELECT geofiles_inline_rule_limit AS value FROM pg_temp.subscription_settings ORDER BY id',
                    )
                ).rows,
                [{ value: 50000 }, { value: 250000 }, { value: 20000 }],
            );
            for (const value of [0, 250001]) {
                await assert.rejects(
                    db.query(
                        'UPDATE pg_temp.subscription_settings SET geofiles_inline_rule_limit=$1 WHERE id=1',
                        [value],
                    ),
                    (error) =>
                        error.code === '23514' &&
                        error.constraint === 'geofiles_inline_rule_limit_range',
                );
            }
        } finally {
            await db.end();
        }
    },
);

test(
    'geofile opt-in defaults off, rejects invalid and concurrent transitions, and advances committed cache generations',
    {
        skip: !process.env.GEOFILES_OPTIN_TEST_DATABASE_URL,
        timeout: 30000,
    },
    async () => {
        const url = new URL(process.env.GEOFILES_OPTIN_TEST_DATABASE_URL);
        assert.equal(url.hostname, '127.0.0.1');
        assert.equal(url.username, 'remnacust_ci_owner');
        assert.equal(process.env.GEOFILES_OPTIN_TEST_DISPOSABLE, '1');
        const clients = [0, 1, 2].map(
            () => new Client({ connectionString: url.href, statement_timeout: 10000 }),
        );
        const [db, writer, rival] = clients;
        const id = randomUUID();
        const epoch = async () =>
            (await db.query('SELECT revision::text FROM xera_template_cache_revision WHERE id=1'))
                .rows[0].revision;
        const state = async () =>
            (
                await db.query(
                    'SELECT geofiles_enabled,serve_json_at_base_subscription FROM subscription_settings WHERE uuid=$1',
                    [id],
                )
            ).rows[0];
        try {
            await Promise.all(clients.map((client) => client.connect()));
            const role = (
                await db.query(
                    'SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user',
                )
            ).rows[0];
            assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
            await db.query(
                "INSERT INTO subscription_settings(uuid,custom_remarks) VALUES($1,'{}')",
                [id],
            );
            assert.deepEqual(await state(), {
                geofiles_enabled: false,
                serve_json_at_base_subscription: false,
            });
            const threshold = async () =>
                (
                    await db.query(
                        'SELECT geofiles_inline_rule_limit AS value FROM subscription_settings WHERE uuid=$1',
                        [id],
                    )
                ).rows[0].value;
            assert.equal(await threshold(), 20000);
            const beforeLimit = await epoch();
            for (const value of [0, -1, 250001]) {
                await assert.rejects(
                    db.query(
                        'UPDATE subscription_settings SET geofiles_inline_rule_limit=$2 WHERE uuid=$1',
                        [id, value],
                    ),
                    (error) =>
                        error.code === '23514' &&
                        error.constraint === 'geofiles_inline_rule_limit_range',
                );
                assert.equal(await epoch(), beforeLimit);
            }
            for (const value of [1, 50000, 250000, 20000]) {
                const before = await epoch();
                await writer.query('BEGIN');
                await writer.query(
                    'UPDATE subscription_settings SET geofiles_inline_rule_limit=$2 WHERE uuid=$1',
                    [id, value],
                );
                assert.equal(await threshold(), 20000);
                await writer.query('ROLLBACK');
                assert.equal(await epoch(), before);
                await db.query(
                    'UPDATE subscription_settings SET geofiles_inline_rule_limit=$2 WHERE uuid=$1',
                    [id, value],
                );
                assert.equal(await threshold(), value);
                assert.notEqual(await epoch(), before);
                await db.query(
                    'UPDATE subscription_settings SET geofiles_inline_rule_limit=20000 WHERE uuid=$1',
                    [id],
                );
            }
            const initial = await epoch();
            await assert.rejects(
                db.query('UPDATE subscription_settings SET geofiles_enabled=true WHERE uuid=$1', [
                    id,
                ]),
                (error) =>
                    error.code === '23514' && error.constraint === 'geofiles_require_base_json',
            );
            assert.equal(await epoch(), initial);
            await writer.query('BEGIN');
            await writer.query(
                'UPDATE subscription_settings SET geofiles_enabled=true,serve_json_at_base_subscription=true WHERE uuid=$1',
                [id],
            );
            assert.equal(await epoch(), initial, 'uncommitted switches are invisible');
            await writer.query('ROLLBACK');
            assert.equal(await epoch(), initial);
            await db.query(
                'UPDATE subscription_settings SET serve_json_at_base_subscription=true WHERE uuid=$1',
                [id],
            );
            assert.notEqual(await epoch(), initial);
            await writer.query('BEGIN');
            await writer.query(
                'UPDATE subscription_settings SET geofiles_enabled=true WHERE uuid=$1',
                [id],
            );
            const pid = (await rival.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
            const pending = rival
                .query(
                    'UPDATE subscription_settings SET serve_json_at_base_subscription=false WHERE uuid=$1',
                    [id],
                )
                .then(
                    () => ({ ok: true }),
                    (error) => ({ error }),
                );
            let blocked = false;
            for (let n = 0; n < 100; n++) {
                const row = (
                    await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [
                        pid,
                    ])
                ).rows[0];
                if (row?.wait_event_type === 'Lock') {
                    blocked = true;
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert(blocked, 'competing updates must actually overlap');
            await writer.query('COMMIT');
            const result = await pending;
            assert.equal(result.error?.code, '23514');
            assert.deepEqual(await state(), {
                geofiles_enabled: true,
                serve_json_at_base_subscription: true,
            });
            await db.query(
                'UPDATE subscription_settings SET geofiles_enabled=false,serve_json_at_base_subscription=false WHERE uuid=$1',
                [id],
            );
            assert.deepEqual(await state(), {
                geofiles_enabled: false,
                serve_json_at_base_subscription: false,
            });
            const before = await epoch();
            await db.query('DELETE FROM subscription_settings WHERE uuid=$1', [id]);
            assert.notEqual(await epoch(), before);
        } finally {
            await Promise.allSettled([writer.query('ROLLBACK'), rival.query('ROLLBACK')]);
            await db.query('DELETE FROM subscription_settings WHERE uuid=$1', [id]);
            await Promise.allSettled(clients.map((client) => client.end()));
        }
    },
);
