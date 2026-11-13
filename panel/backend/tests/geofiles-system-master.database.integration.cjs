const assert = require('node:assert/strict');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const enabled = !!process.env.GEOFILES_OPTIN_TEST_DATABASE_URL;
if (process.env.GEOFILES_MASTER_TEST_REQUIRED === '1') {
    assert(enabled, 'GEOFILES_OPTIN_TEST_DATABASE_URL is required for the master CI regression');
    assert.equal(process.env.GEOFILES_OPTIN_TEST_DISPOSABLE, '1');
}
const migration = (name) =>
    fs.readFileSync(path.join(__dirname, '../prisma/migrations', name, 'migration.sql'), 'utf8');
const previousMigration = migration('20261110030000_template_geofiles');
const masterMigration = migration('20261113010000_geofiles_system_master');

async function connect() {
    assert.equal(process.env.GEOFILES_OPTIN_TEST_DISPOSABLE, '1');
    const url = new URL(process.env.GEOFILES_OPTIN_TEST_DATABASE_URL);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.username, 'remnacust_ci_owner');
    const client = new Client({ connectionString: url.href, statement_timeout: 5000 });
    await client.connect();
    try {
        const role = (
            await client.query(
                'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user',
            )
        ).rows[0];
        assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
        if (process.env.GEOFILES_MASTER_TEST_PG_VERSION) {
            const version = (await client.query('SHOW server_version_num')).rows[0]
                .server_version_num;
            assert.equal(
                Math.floor(Number(version) / 10000),
                Number(process.env.GEOFILES_MASTER_TEST_PG_VERSION.split('.')[0]),
            );
        }
        return client;
    } catch (error) {
        await client.end();
        throw error;
    }
}

async function fixture(db, { oldEnabled = false, existing = true, settings = true } = {}) {
    const schema = 'rc_master_' + randomUUID().replaceAll('-', '');
    assert.match(schema, /^rc_master_[a-f0-9]{32}$/);
    const setting = randomUUID(),
        template = randomUUID();
    await db.query(`CREATE SCHEMA ${schema}`);
    try {
        await db.query(`CREATE TABLE ${schema}.subscription_settings (
        uuid uuid PRIMARY KEY,
        geofiles_enabled boolean NOT NULL DEFAULT false,
        serve_json_at_base_subscription boolean NOT NULL DEFAULT false,
        geofiles_inline_rule_limit integer NOT NULL DEFAULT 20000,
        CONSTRAINT geofiles_require_base_json CHECK (NOT geofiles_enabled OR serve_json_at_base_subscription))`);
        await db.query(`CREATE TABLE ${schema}.subscription_templates (
        uuid uuid PRIMARY KEY, name text NOT NULL DEFAULT 'saved',
        template_json jsonb NOT NULL DEFAULT '{"routing":{"rules":[{"domain":["geosite:manual","ext:manual.dat:sites"],"ip":["geoip:private"]}]},"geodata":{"assets":[{"url":"https://manual.example.test/geosite.dat","file":"geosite.dat"}]},"remnacust":{"geofiles":["saved-preference"]}}')`);
        if (settings)
            await db.query(
                `INSERT INTO ${schema}.subscription_settings(uuid,geofiles_enabled,serve_json_at_base_subscription) VALUES($1,$2,$2)`,
                [setting, oldEnabled],
            );
        if (existing)
            await db.query(`INSERT INTO ${schema}.subscription_templates(uuid) VALUES($1)`, [
                template,
            ]);
        await db.query(previousMigration.replaceAll('public.', schema + '.'));
        const before = (
            await db.query(`SELECT * FROM ${schema}.subscription_templates ORDER BY uuid`)
        ).rows;
        await db.query(masterMigration.replaceAll('public.', schema + '.'));
        return {
            schema,
            setting,
            template,
            before,
            state: async () =>
                (
                    await db.query(
                        `SELECT geofiles_system_enabled,geofiles_enabled,serve_json_at_base_subscription,geofiles_inline_rule_limit FROM ${schema}.subscription_settings WHERE uuid=$1`,
                        [setting],
                    )
                ).rows[0],
            flag: async () =>
                (
                    await db.query(
                        `SELECT geofiles_enabled FROM ${schema}.subscription_templates WHERE uuid=$1`,
                        [template],
                    )
                ).rows[0]?.geofiles_enabled,
            drop: () => db.query(`DROP SCHEMA ${schema} CASCADE`),
        };
    } catch (error) {
        await db.query('ROLLBACK');
        await db.query(`DROP SCHEMA ${schema} CASCADE`);
        throw error;
    }
}

const disabled = (error) => error?.code === '23514' && error.message === 'GEOFILES_SYSTEM_DISABLED';
const baseJson = (error) =>
    error.code === '23514' && error.constraint === 'geofiles_system_require_base_json';
const summary = (error) => error.code === '23514' && error.message === 'GEOFILES_PER_TEMPLATE';

test(
    'migration 205 defaults legacy and empty states off while retaining all template preferences and aggregate',
    {
        skip: !enabled,
        timeout: 20000,
    },
    async () => {
        const db = await connect();
        try {
            for (const options of [
                { oldEnabled: true },
                { oldEnabled: false },
                { existing: false },
                { existing: false, settings: false },
            ]) {
                const f = await fixture(db, options);
                try {
                    assert.deepEqual(
                        (
                            await db.query(
                                `SELECT * FROM ${f.schema}.subscription_templates ORDER BY uuid`,
                            )
                        ).rows,
                        f.before,
                    );
                    if (options.settings === false)
                        await db.query(
                            `INSERT INTO ${f.schema}.subscription_settings(uuid) VALUES($1)`,
                            [f.setting],
                        );
                    const initial = await f.state();
                    assert.equal(initial.geofiles_system_enabled, false);
                    assert.equal(initial.geofiles_enabled, options.oldEnabled === true);
                    assert.equal(initial.geofiles_inline_rule_limit, 20000);
                    await db.query(
                        `UPDATE ${f.schema}.subscription_settings SET serve_json_at_base_subscription=false WHERE uuid=$1`,
                        [f.setting],
                    );
                    assert.equal((await f.state()).geofiles_enabled, initial.geofiles_enabled);
                    await assert.rejects(
                        db.query(
                            `UPDATE ${f.schema}.subscription_settings SET geofiles_system_enabled=true WHERE uuid=$1`,
                            [f.setting],
                        ),
                        baseJson,
                    );
                    await db.query(
                        `UPDATE ${f.schema}.subscription_settings SET geofiles_system_enabled=true,serve_json_at_base_subscription=true WHERE uuid=$1`,
                        [f.setting],
                    );
                    assert.equal((await f.state()).geofiles_enabled, initial.geofiles_enabled);
                    await db.query(
                        `UPDATE ${f.schema}.subscription_settings SET geofiles_system_enabled=false,serve_json_at_base_subscription=false WHERE uuid=$1`,
                        [f.setting],
                    );
                    assert.deepEqual(
                        (
                            await db.query(
                                `SELECT * FROM ${f.schema}.subscription_templates ORDER BY uuid`,
                            )
                        ).rows,
                        f.before,
                    );
                } finally {
                    await f.drop();
                }
            }
        } finally {
            await db.end();
        }
    },
);

test(
    'restricted-owner database gate rejects enable/insert while off but permits unchanged true saves, disable and manual JSON',
    {
        skip: !enabled,
        timeout: 15000,
    },
    async () => {
        const db = await connect();
        const f = await fixture(db, { oldEnabled: true });
        try {
            await db.query(
                `UPDATE ${f.schema}.subscription_settings SET serve_json_at_base_subscription=false`,
            );
            await db.query(
                `UPDATE ${f.schema}.subscription_templates SET name='renamed',geofiles_enabled=true WHERE uuid=$1`,
                [f.template],
            );
            assert.equal(await f.flag(), true);
            assert.deepEqual(
                (
                    await db.query(
                        `SELECT template_json FROM ${f.schema}.subscription_templates WHERE uuid=$1`,
                        [f.template],
                    )
                ).rows[0].template_json,
                f.before[0].template_json,
            );
            const other = randomUUID();
            await assert.rejects(
                db.query(
                    `INSERT INTO ${f.schema}.subscription_templates(uuid,geofiles_enabled) VALUES($1,true)`,
                    [other],
                ),
                disabled,
            );
            await db.query(`INSERT INTO ${f.schema}.subscription_templates(uuid) VALUES($1)`, [
                other,
            ]);
            await assert.rejects(
                db.query(
                    `UPDATE ${f.schema}.subscription_templates SET geofiles_enabled=true WHERE uuid=$1`,
                    [other],
                ),
                disabled,
            );
            await assert.rejects(
                db.query(`UPDATE ${f.schema}.subscription_settings SET geofiles_enabled=false`),
                summary,
            );
            await db.query(
                `UPDATE ${f.schema}.subscription_templates SET geofiles_enabled=false WHERE uuid=$1`,
                [f.template],
            );
            assert.equal((await f.state()).geofiles_enabled, false);
            await db.query(
                `UPDATE ${f.schema}.subscription_settings SET geofiles_system_enabled=true,serve_json_at_base_subscription=true`,
            );
            assert.equal((await f.state()).geofiles_enabled, false);
            assert.equal((await f.state()).geofiles_system_enabled, true);
            await db.query(
                `UPDATE ${f.schema}.subscription_templates SET geofiles_enabled=true WHERE uuid=$1`,
                [other],
            );
            assert.equal((await f.state()).geofiles_enabled, true);
            await db.query(`DELETE FROM ${f.schema}.subscription_templates WHERE uuid=$1`, [other]);
            assert.equal((await f.state()).geofiles_enabled, false);
            assert.equal((await f.state()).geofiles_system_enabled, true);
            await db.query(
                `UPDATE ${f.schema}.subscription_templates SET geofiles_enabled=true WHERE uuid=$1`,
                [f.template],
            );
            await db.query(`TRUNCATE ${f.schema}.subscription_templates`);
            assert.equal((await f.state()).geofiles_enabled, false);
            assert.equal((await f.state()).geofiles_system_enabled, true);
        } finally {
            await f.drop();
            await db.end();
        }
    },
);

async function waiting(db, pid) {
    for (let attempt = 0; attempt < 100; attempt++) {
        const state = (
            await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])
        ).rows[0];
        if (state?.wait_event_type === 'Lock') return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('competing template/settings operations did not overlap on a database lock');
}

test(
    'master transitions and template enables serialize on existing row locks, with rollback preserving flags',
    {
        skip: !enabled,
        timeout: 20000,
    },
    async () => {
        const db = await connect(),
            writer = await connect(),
            rival = await connect();
        const f = await fixture(db);
        try {
            const rivalPid = (await rival.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
            const change = () =>
                rival
                    .query(
                        `UPDATE ${f.schema}.subscription_templates SET geofiles_enabled=true WHERE uuid=$1`,
                        [f.template],
                    )
                    .then(
                        () => null,
                        (error) => error,
                    );
            await writer.query('BEGIN');
            await writer.query(
                `UPDATE ${f.schema}.subscription_settings SET geofiles_system_enabled=true,serve_json_at_base_subscription=true`,
            );
            const afterEnable = change();
            await waiting(db, rivalPid);
            await writer.query('COMMIT');
            assert.equal(await afterEnable, null);
            assert.equal(await f.flag(), true);
            assert.equal((await f.state()).geofiles_enabled, true);

            await db.query(`UPDATE ${f.schema}.subscription_templates SET geofiles_enabled=false`);
            await writer.query('BEGIN');
            await writer.query(
                `UPDATE ${f.schema}.subscription_settings SET geofiles_system_enabled=false,serve_json_at_base_subscription=false`,
            );
            const afterDisable = change();
            await waiting(db, rivalPid);
            await writer.query('COMMIT');
            assert(disabled(await afterDisable));
            assert.equal(await f.flag(), false);
            assert.equal((await f.state()).geofiles_enabled, false);

            await db.query(
                `UPDATE ${f.schema}.subscription_settings SET geofiles_system_enabled=true,serve_json_at_base_subscription=true`,
            );
            await writer.query('BEGIN');
            await writer.query(
                `UPDATE ${f.schema}.subscription_templates SET geofiles_enabled=true WHERE uuid=$1`,
                [f.template],
            );
            const pendingOff = rival
                .query(
                    `UPDATE ${f.schema}.subscription_settings SET geofiles_system_enabled=false,serve_json_at_base_subscription=false`,
                )
                .then(
                    () => null,
                    (error) => error,
                );
            await waiting(db, rivalPid);
            await writer.query('COMMIT');
            assert.equal(await pendingOff, null);
            assert.equal(await f.flag(), true);
            assert.deepEqual(await f.state(), {
                geofiles_system_enabled: false,
                geofiles_enabled: true,
                serve_json_at_base_subscription: false,
                geofiles_inline_rule_limit: 20000,
            });

            await writer.query('BEGIN');
            await writer.query(
                `UPDATE ${f.schema}.subscription_settings SET geofiles_system_enabled=true,serve_json_at_base_subscription=true`,
            );
            await writer.query(
                `UPDATE ${f.schema}.subscription_templates SET geofiles_enabled=false`,
            );
            await writer.query('ROLLBACK');
            assert.equal(await f.flag(), true);
            assert.equal((await f.state()).geofiles_system_enabled, false);
            assert.equal((await f.state()).geofiles_enabled, true);
        } finally {
            await Promise.allSettled([writer.query('ROLLBACK'), rival.query('ROLLBACK')]);
            await f.drop();
            await Promise.allSettled([db.end(), writer.end(), rival.end()]);
        }
    },
);
