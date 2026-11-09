const assert = require('node:assert/strict');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

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
