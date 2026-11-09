const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Client } = require('pg');
const url = process.env.DOMAIN_ACCESS_TEST_DATABASE_URL;
test(
    'domain access migration enforces safe defaults, references and rollback under a restricted owner',
    { skip: !url, timeout: 30000 },
    async () => {
        const client = new Client({ connectionString: url });
        const name = 'rc_domain_' + randomUUID().replaceAll('-', '');
        let created = false,
            roleCreated = false;
        await client.connect();
        try {
            const initial = (
                await client.query(
                    'SELECT current_user AS name, rolsuper FROM pg_roles WHERE rolname = current_user',
                )
            ).rows[0];
            if (initial.rolsuper) {
                await client.query(
                    `CREATE ROLE ${name} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`,
                );
                roleCreated = true;
                await client.query(`CREATE SCHEMA ${name} AUTHORIZATION ${name}`);
                created = true;
                await client.query(`SET ROLE ${name}`);
            } else {
                await client.query(`CREATE SCHEMA ${name}`);
                created = true;
            }
            await client.query(`SET search_path TO ${name}, pg_catalog`);
            const flags = (
                await client.query(
                    'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user',
                )
            ).rows[0];
            assert.deepEqual(flags, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
            await client.query(
                'CREATE TABLE subscription_domains (uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(), kind VARCHAR(7) NOT NULL)',
            );
            const old = (
                await client.query(
                    "INSERT INTO subscription_domains(kind) VALUES ('PRIMARY') RETURNING uuid",
                )
            ).rows[0].uuid;
            await client.query(
                fs.readFileSync(
                    path.join(
                        __dirname,
                        '../prisma/migrations/20261109100000_subscription_domain_access/migration.sql',
                    ),
                    'utf8',
                ),
            );
            const constraint = (
                await client.query(
                    "SELECT condeferrable, confdeltype FROM pg_constraint WHERE conrelid='subscription_domains'::regclass AND contype='f'",
                )
            ).rows[0];
            assert.deepEqual(constraint, { condeferrable: false, confdeltype: 'a' });
            assert.equal(
                (
                    await client.query(
                        'SELECT access_mode FROM subscription_domains WHERE uuid=$1',
                        [old],
                    )
                ).rows[0].access_mode,
                'OPEN',
            );
            const cdn = (
                await client.query(
                    "INSERT INTO subscription_domains(kind) VALUES ('CDN') RETURNING uuid",
                )
            ).rows[0].uuid;
            await client.query(
                "UPDATE subscription_domains SET access_mode='REDIRECT', redirect_domain_uuid=$1 WHERE uuid=$2",
                [cdn, old],
            );
            await assert.rejects(
                client.query('DELETE FROM subscription_domains WHERE uuid=$1', [cdn]),
                { code: '23503' },
            );
            for (const statement of [
                "UPDATE subscription_domains SET access_mode='UNKNOWN'",
                "UPDATE subscription_domains SET access_mode='CDN_ONLY' WHERE kind='CDN'",
                "UPDATE subscription_domains SET redirect_domain_uuid=NULL WHERE access_mode='REDIRECT'",
            ])
                await assert.rejects(client.query(statement), { code: '23514' });
            await client.query('BEGIN');
            await client.query(
                "UPDATE subscription_domains SET access_mode='OPEN', redirect_domain_uuid=NULL WHERE uuid=$1",
                [old],
            );
            await client.query('ROLLBACK');
            assert.equal(
                (
                    await client.query(
                        'SELECT access_mode FROM subscription_domains WHERE uuid=$1',
                        [old],
                    )
                ).rows[0].access_mode,
                'REDIRECT',
            );
            await client.query(
                "UPDATE subscription_domains SET access_mode='OPEN', redirect_domain_uuid=NULL WHERE uuid=$1",
                [old],
            );
            await client.query('DELETE FROM subscription_domains WHERE uuid=$1', [cdn]);
        } finally {
            await client.query('ROLLBACK').catch(() => {});
            await client.query('RESET ROLE');
            if (created) await client.query(`DROP SCHEMA ${name} CASCADE`);
            if (roleCreated) await client.query(`DROP ROLE ${name}`);
            await client.end();
        }
    },
);
