const assert = require('node:assert/strict');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

test(
    'template migration preserves previous opt-in, defaults new templates off and keeps the summary read-only',
    {
        skip: !process.env.GEOFILES_OPTIN_TEST_DATABASE_URL,
        timeout: 15000,
    },
    async () => {
        const url = new URL(process.env.GEOFILES_OPTIN_TEST_DATABASE_URL);
        assert.equal(url.hostname, '127.0.0.1');
        assert.equal(url.username, 'remnacust_ci_owner');
        assert.equal(process.env.GEOFILES_OPTIN_TEST_DISPOSABLE, '1');
        const db = new Client({ connectionString: url.href, statement_timeout: 5000 });
        await db.connect();
        try {
            for (const [enabled, hasExisting] of [
                [false, true],
                [true, true],
                [true, false],
            ]) {
                const schema = 'rc_geofile_' + randomUUID().replaceAll('-', '');
                assert.match(schema, /^rc_geofile_[a-f0-9]{32}$/);
                await db.query(`CREATE SCHEMA ${schema}`);
                try {
                    await db.query(`CREATE TABLE ${schema}.subscription_settings (
                    uuid uuid PRIMARY KEY, geofiles_enabled boolean NOT NULL DEFAULT false,
                    serve_json_at_base_subscription boolean NOT NULL DEFAULT false,
                    CONSTRAINT geofiles_require_base_json CHECK (NOT geofiles_enabled OR serve_json_at_base_subscription))`);
                    await db.query(
                        `CREATE TABLE ${schema}.subscription_templates (uuid uuid PRIMARY KEY)`,
                    );
                    const setting = randomUUID(),
                        existing = randomUUID(),
                        fresh = randomUUID();
                    await db.query(`INSERT INTO ${schema}.subscription_settings VALUES($1,$2,$2)`, [
                        setting,
                        enabled,
                    ]);
                    if (hasExisting)
                        await db.query(`INSERT INTO ${schema}.subscription_templates VALUES($1)`, [
                            existing,
                        ]);
                    const migration = fs.readFileSync(
                        path.join(
                            __dirname,
                            '../prisma/migrations/20261110030000_template_geofiles/migration.sql',
                        ),
                        'utf8',
                    );
                    await db.query(migration.replaceAll('public.', schema + '.'));
                    if (hasExisting)
                        assert.equal(
                            (
                                await db.query(
                                    `SELECT geofiles_enabled FROM ${schema}.subscription_templates WHERE uuid=$1`,
                                    [existing],
                                )
                            ).rows[0].geofiles_enabled,
                            enabled,
                        );
                    assert.equal(
                        (
                            await db.query(
                                `SELECT geofiles_enabled FROM ${schema}.subscription_settings`,
                            )
                        ).rows[0].geofiles_enabled,
                        enabled && hasExisting,
                    );
                    await db.query(
                        `INSERT INTO ${schema}.subscription_templates(uuid) VALUES($1)`,
                        [fresh],
                    );
                    assert.equal(
                        (
                            await db.query(
                                `SELECT geofiles_enabled FROM ${schema}.subscription_templates WHERE uuid=$1`,
                                [fresh],
                            )
                        ).rows[0].geofiles_enabled,
                        false,
                    );
                    await assert.rejects(
                        db.query(`UPDATE ${schema}.subscription_settings SET geofiles_enabled=$1`, [
                            !(enabled && hasExisting),
                        ]),
                        (error) =>
                            error.code === '23514' && error.message === 'GEOFILES_PER_TEMPLATE',
                    );
                    await db.query(`TRUNCATE ${schema}.subscription_templates`);
                    assert.equal(
                        (
                            await db.query(
                                `SELECT geofiles_enabled FROM ${schema}.subscription_settings`,
                            )
                        ).rows[0].geofiles_enabled,
                        false,
                    );
                } finally {
                    await db.query(`DROP SCHEMA ${schema} CASCADE`);
                }
            }
        } finally {
            await db.end();
        }
    },
);

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
    'per-template geofiles default off, preserve isolation and reject concurrent JSON conflicts',
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
        const templateIds = [randomUUID(), randomUUID()];
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
            for (const templateId of templateIds)
                await db.query(
                    "INSERT INTO subscription_templates(uuid,name,template_type,template_json) VALUES($1,$2,'XRAY_JSON','{}')",
                    [templateId, 'geofile-' + templateId],
                );
            const flag = async (templateId) =>
                (
                    await db.query(
                        'SELECT geofiles_enabled FROM subscription_templates WHERE uuid=$1',
                        [templateId],
                    )
                ).rows[0]?.geofiles_enabled;
            const change = (client, templateId, value) =>
                client.query(
                    'UPDATE subscription_templates SET geofiles_enabled=$2 WHERE uuid=$1',
                    [templateId, value],
                );
            const barrier = async () => {
                const pid = (await rival.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
                return async () => {
                    for (let n = 0; n < 100; n++) {
                        if (
                            (
                                await db.query(
                                    'SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',
                                    [pid],
                                )
                            ).rows[0]?.wait_event_type === 'Lock'
                        )
                            return;
                        await new Promise((resolve) => setTimeout(resolve, 10));
                    }
                    assert.fail('competing changes did not overlap on the real row lock');
                };
            };
            assert.equal(await flag(templateIds[0]), false);
            assert.equal(await flag(templateIds[1]), false);
            const initial = await epoch();
            await assert.rejects(
                change(db, templateIds[0], true),
                (error) => error.code === '23514' && error.message === 'GEOFILES_REQUIRE_BASE_JSON',
            );
            assert.equal(await epoch(), initial);
            await writer.query('BEGIN');
            await writer.query(
                'UPDATE subscription_settings SET serve_json_at_base_subscription=true WHERE uuid=$1',
                [id],
            );
            await change(writer, templateIds[0], true);
            assert.equal(await epoch(), initial);
            assert.equal(await flag(templateIds[0]), false);
            await writer.query('ROLLBACK');
            assert.equal(await epoch(), initial);
            await db.query(
                'UPDATE subscription_settings SET serve_json_at_base_subscription=true WHERE uuid=$1',
                [id],
            );
            const wait = await barrier();
            await writer.query('BEGIN');
            await change(writer, templateIds[0], true);
            const pending = rival
                .query(
                    'UPDATE subscription_settings SET serve_json_at_base_subscription=false WHERE uuid=$1',
                    [id],
                )
                .then(
                    () => null,
                    (error) => error,
                );
            await wait();
            await writer.query('COMMIT');
            assert.equal((await pending)?.code, '23514');
            assert.equal(await flag(templateIds[0]), true);
            assert.equal(await flag(templateIds[1]), false);
            assert.deepEqual(await state(), {
                geofiles_enabled: true,
                serve_json_at_base_subscription: true,
            });
            await assert.rejects(
                db.query('UPDATE subscription_settings SET geofiles_enabled=false WHERE uuid=$1', [
                    id,
                ]),
                (error) => error.code === '23514' && error.message === 'GEOFILES_PER_TEMPLATE',
            );
            await change(db, templateIds[1], true);
            await change(db, templateIds[0], false);
            assert.equal((await state()).geofiles_enabled, true);
            const beforeRollback = await epoch();
            await writer.query('BEGIN');
            await change(writer, templateIds[1], false);
            assert.equal(await epoch(), beforeRollback);
            await writer.query('ROLLBACK');
            assert.equal(await epoch(), beforeRollback);
            assert.equal(await flag(templateIds[1]), true);
            await change(db, templateIds[1], false);
            assert.equal((await state()).geofiles_enabled, false);
            await writer.query('BEGIN');
            await writer.query(
                'UPDATE subscription_settings SET serve_json_at_base_subscription=false WHERE uuid=$1',
                [id],
            );
            const rejectedEnable = change(rival, templateIds[1], true).then(
                () => null,
                (error) => error,
            );
            await wait();
            await writer.query('COMMIT');
            assert.equal((await rejectedEnable)?.message, 'GEOFILES_REQUIRE_BASE_JSON');
            assert.equal(await flag(templateIds[1]), false);
            await db.query(
                'UPDATE subscription_settings SET serve_json_at_base_subscription=true WHERE uuid=$1',
                [id],
            );
            await change(db, templateIds[0], true);
            await db.query('DELETE FROM subscription_templates WHERE uuid=$1', [templateIds[0]]);
            assert.equal((await state()).geofiles_enabled, false);
            await db.query('DELETE FROM subscription_templates WHERE uuid=$1', [templateIds[1]]);
            await db.query(
                'UPDATE subscription_settings SET serve_json_at_base_subscription=false WHERE uuid=$1',
                [id],
            );
            const before = await epoch();
            await db.query('DELETE FROM subscription_settings WHERE uuid=$1', [id]);
            assert.notEqual(await epoch(), before);
        } finally {
            await Promise.allSettled([writer.query('ROLLBACK'), rival.query('ROLLBACK')]);
            await db.query('DELETE FROM subscription_templates WHERE uuid = ANY($1::uuid[])', [
                templateIds,
            ]);
            await db.query('DELETE FROM subscription_settings WHERE uuid=$1', [id]);
            await Promise.allSettled(clients.map((client) => client.end()));
        }
    },
);
