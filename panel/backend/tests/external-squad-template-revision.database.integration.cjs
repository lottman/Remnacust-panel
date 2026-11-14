const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const test = require('node:test');
const { Client } = require('pg');

const databaseUrl = process.env.TEMPLATE_CACHE_TEST_DATABASE_URL;
if (process.env.TEMPLATE_CACHE_TEST_REQUIRED === '1')
    assert(databaseUrl, 'Set TEMPLATE_CACHE_TEST_DATABASE_URL');
if (databaseUrl) {
    const target = new URL(databaseUrl);
    assert.equal(target.protocol, 'postgresql:');
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '55439');
    assert.equal(target.pathname, '/postgres');
    assert.equal(target.username, 'remnacust_ci_owner');
    assert(!target.password, 'Fixture URL must not include a password');
    assert(!target.hash, 'Fixture URL must not include a fragment');
    for (const [key, value] of target.searchParams) {
        assert(['connection_limit', 'pool_timeout'].includes(key));
        assert(/^\d+$/.test(value), 'Only numeric fixture pool parameters are allowed');
    }
    assert.equal(process.env.TEMPLATE_CACHE_TEST_DISPOSABLE, '1');
}

test(
    'external squad assignments advance the migrated revision through commit, rollback, cascades and concurrent writers',
    { skip: !databaseUrl, timeout: 60_000 },
    async (t) => {
        const clients = [0, 1, 2].map(
            () =>
                new Client({
                    connectionString: databaseUrl,
                    connectionTimeoutMillis: 5000,
                    statement_timeout: 10_000,
                    lock_timeout: 8000,
                }),
        );
        const [observer, writer, concurrent] = clients;
        const connected = new Set();
        const squadIds = new Set();
        const templateIds = new Set();
        const rowName = (id) => 'join-' + id.replaceAll('-', '').slice(0, 24);
        const epoch = async (client = observer) => {
            const { rows } = await client.query(
                'SELECT revision::text FROM public.xera_template_cache_revision WHERE id=1',
            );
            assert.equal(rows.length, 1);
            assert.match(rows[0].revision, /^[a-f0-9-]{36}$/);
            return rows[0].revision;
        };
        const assignments = async (client, squad) =>
            (
                await client.query(
                    `SELECT template_uuid, template_type FROM public.external_squads_templates
                     WHERE external_squad_uuid=$1 ORDER BY template_type`,
                    [squad],
                )
            ).rows;
        const fixture = async (assigned = true) => {
            const squad = randomUUID();
            squadIds.add(squad);
            assert(rowName(squad).length <= 30);
            await observer.query('INSERT INTO public.external_squads(uuid,name) VALUES($1,$2)', [
                squad,
                rowName(squad),
            ]);
            const templates = [randomUUID(), randomUUID()];
            for (const uuid of templates) {
                templateIds.add(uuid);
                await observer.query(
                    `INSERT INTO public.subscription_templates(uuid,name,template_type,template_json)
                     VALUES($1,$2,'SINGBOX','{}')`,
                    [uuid, rowName(uuid)],
                );
            }
            if (assigned)
                await observer.query(
                    `INSERT INTO public.external_squads_templates
                     (external_squad_uuid,template_uuid,template_type) VALUES($1,$2,'SINGBOX')`,
                    [squad, templates[0]],
                );
            return { squad, templates };
        };
        const verifyChange = async (mutate, read, expected) => {
            const before = await epoch();
            const original = await read(observer);
            for (const finish of ['ROLLBACK', 'COMMIT']) {
                await writer.query('BEGIN');
                let finished = false;
                try {
                    await mutate(writer);
                    const pending = await epoch(writer);
                    assert.notEqual(pending, before);
                    assert.deepEqual(await read(writer), expected);
                    assert.equal(await epoch(), before);
                    await writer.query(finish);
                    finished = true;
                    assert.equal(await epoch(), finish === 'COMMIT' ? pending : before);
                    assert.deepEqual(
                        await read(observer),
                        finish === 'COMMIT' ? expected : original,
                    );
                } finally {
                    if (!finished) await writer.query('ROLLBACK');
                }
            }
        };
        const errors = [];
        try {
            for (const client of clients) {
                await client.connect();
                connected.add(client);
            }
            const { rows: roles } = await observer.query(
                `SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,
                 current_setting('server_version') AS version FROM pg_roles WHERE rolname=current_user`,
            );
            assert.equal(roles[0].name, 'remnacust_ci_owner');
            assert.deepEqual(
                [roles[0].rolsuper, roles[0].rolcreatedb, roles[0].rolcreaterole],
                [false, false, false],
            );
            if (process.env.TEMPLATE_CACHE_TEST_PG_VERSION)
                assert.equal(
                    roles[0].version.split(' ')[0],
                    process.env.TEMPLATE_CACHE_TEST_PG_VERSION,
                );
            const { rows: migrations } = await observer.query(
                `SELECT migration_name FROM public._prisma_migrations
                 WHERE migration_name='20261114000000_external_squad_cache_revision'
                   AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
            );
            assert.equal(migrations.length, 1);
            const { rows: triggers } = await observer.query(
                `SELECT tgtype::int AS type,tgenabled AS enabled,
                 tgfoid='public.xera_advance_template_cache_revision()'::regprocedure AS expected_function
                 FROM pg_trigger WHERE tgrelid='public.external_squads_templates'::regclass
                   AND tgname='xera_external_squad_template_cache_revision_changed' AND NOT tgisinternal`,
            );
            assert.deepEqual(triggers, [{ type: 60, enabled: 'O', expected_function: true }]);
            const { rows: foreignKeys } = await observer.query(
                `SELECT parent.relname AS parent,con.confdeltype AS on_delete,con.confupdtype AS on_update
                 FROM pg_constraint con JOIN pg_class parent ON parent.oid=con.confrelid
                 WHERE con.conrelid='public.external_squads_templates'::regclass AND con.contype='f'
                 ORDER BY parent.relname`,
            );
            assert.deepEqual(foreignKeys, [
                { parent: 'external_squads', on_delete: 'c', on_update: 'c' },
                { parent: 'subscription_templates', on_delete: 'c', on_update: 'c' },
            ]);

            for (const operation of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
                await t.test(`${operation}: assignment-only rollback and commit`, async () => {
                    const f = await fixture(operation !== 'INSERT');
                    if (operation === 'UPDATE') {
                        const beforeRoot = await epoch();
                        await observer.query(
                            'UPDATE public.external_squads SET name=$1 WHERE uuid=$2',
                            ['root-' + f.squad.replaceAll('-', '').slice(0, 24), f.squad],
                        );
                        assert.notEqual(await epoch(), beforeRoot);
                    }
                    const mutate = async (client) => {
                        if (operation === 'INSERT')
                            await client.query(
                                `INSERT INTO public.external_squads_templates
                                 (external_squad_uuid,template_uuid,template_type) VALUES($1,$2,'SINGBOX')`,
                                [f.squad, f.templates[0]],
                            );
                        if (operation === 'UPDATE')
                            await client.query(
                                `UPDATE public.external_squads_templates SET template_uuid=$1
                                 WHERE external_squad_uuid=$2 AND template_type='SINGBOX'`,
                                [f.templates[1], f.squad],
                            );
                        if (operation === 'DELETE')
                            await client.query(
                                'DELETE FROM public.external_squads_templates WHERE external_squad_uuid=$1',
                                [f.squad],
                            );
                        if (operation === 'TRUNCATE') {
                            await client.query(
                                'LOCK TABLE public.external_squads_templates IN ACCESS EXCLUSIVE MODE',
                            );
                            const { rows } = await client.query(
                                `SELECT count(*)::int AS n FROM public.external_squads_templates
                                 WHERE NOT external_squad_uuid=ANY($1::uuid[])`,
                                [[...squadIds]],
                            );
                            assert.equal(
                                rows[0].n,
                                0,
                                'TRUNCATE may only remove fixture assignments',
                            );
                            await client.query('TRUNCATE public.external_squads_templates');
                        }
                    };
                    const expected = ['DELETE', 'TRUNCATE'].includes(operation)
                        ? []
                        : [
                              {
                                  template_uuid: f.templates[operation === 'UPDATE' ? 1 : 0],
                                  template_type: 'SINGBOX',
                              },
                          ];
                    await verifyChange(mutate, (client) => assignments(client, f.squad), expected);
                    assert.equal(
                        (
                            await observer.query(
                                'SELECT count(*)::int AS n FROM public.external_squads WHERE uuid=$1',
                                [f.squad],
                            )
                        ).rows[0].n,
                        1,
                    );
                    assert.equal(
                        (
                            await observer.query(
                                'SELECT count(*)::int AS n FROM public.subscription_templates WHERE uuid=ANY($1::uuid[])',
                                [f.templates],
                            )
                        ).rows[0].n,
                        2,
                    );
                });
            }

            for (const table of ['external_squads', 'subscription_templates']) {
                for (const operation of ['DELETE', 'UPDATE']) {
                    await t.test(`${table}: parent ${operation} cascades atomically`, async () => {
                        const f = await fixture();
                        const external = table === 'external_squads';
                        const oldId = external ? f.squad : f.templates[0];
                        const newId = randomUUID();
                        (external ? squadIds : templateIds).add(newId);
                        const read = async (client) => ({
                            parents: (
                                await client.query(
                                    `SELECT uuid FROM public.${table} WHERE uuid=ANY($1::uuid[]) ORDER BY uuid`,
                                    [[oldId, newId]],
                                )
                            ).rows.map((row) => row.uuid),
                            links: (
                                await client.query(
                                    `SELECT external_squad_uuid,template_uuid,template_type
                                     FROM public.external_squads_templates
                                     WHERE external_squad_uuid=ANY($1::uuid[]) ORDER BY template_type`,
                                    [[f.squad, ...(external ? [newId] : [])]],
                                )
                            ).rows,
                        });
                        await verifyChange(
                            (client) =>
                                operation === 'DELETE'
                                    ? client.query(`DELETE FROM public.${table} WHERE uuid=$1`, [
                                          oldId,
                                      ])
                                    : client.query(
                                          `UPDATE public.${table} SET uuid=$1 WHERE uuid=$2`,
                                          [newId, oldId],
                                      ),
                            read,
                            operation === 'DELETE'
                                ? { parents: [], links: [] }
                                : {
                                      parents: [newId],
                                      links: [
                                          {
                                              external_squad_uuid: external ? newId : f.squad,
                                              template_uuid: external ? f.templates[0] : newId,
                                              template_type: 'SINGBOX',
                                          },
                                      ],
                                  },
                        );
                    });
                }
            }

            await t.test(
                'a separate assignment writer waits for the root revision and publishes its own commit',
                async () => {
                    const root = await fixture();
                    const assignment = await fixture();
                    const writerPid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0]
                        .pid;
                    const concurrentPid = (await concurrent.query('SELECT pg_backend_pid() AS pid'))
                        .rows[0].pid;
                    for (const finish of ['ROLLBACK', 'COMMIT']) {
                        let secondWrite;
                        try {
                            const before = await epoch();
                            const nextTemplate =
                                assignment.templates[finish === 'ROLLBACK' ? 1 : 0];
                            await writer.query('BEGIN');
                            await concurrent.query('BEGIN');
                            await writer.query(
                                'UPDATE public.external_squads SET name=$1 WHERE uuid=$2',
                                [
                                    finish.toLowerCase() +
                                        '-' +
                                        root.squad.replaceAll('-', '').slice(0, 16),
                                    root.squad,
                                ],
                            );
                            const firstEpoch = await epoch(writer);
                            assert.notEqual(firstEpoch, before);
                            let secondFinished = false;
                            secondWrite = concurrent
                                .query(
                                    `UPDATE public.external_squads_templates SET template_uuid=$1
                                 WHERE external_squad_uuid=$2 AND template_type='SINGBOX'`,
                                    [nextTemplate, assignment.squad],
                                )
                                .then(
                                    (result) => {
                                        secondFinished = true;
                                        return { result };
                                    },
                                    (error) => {
                                        secondFinished = true;
                                        return { error };
                                    },
                                );
                            const deadline = Date.now() + 5000;
                            for (;;) {
                                const { rows } = await observer.query(
                                    'SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',
                                    [writerPid, concurrentPid],
                                );
                                if (rows[0].blocked) break;
                                assert(
                                    !secondFinished,
                                    'Assignment writer must wait for the shared revision',
                                );
                                assert(
                                    Date.now() < deadline,
                                    'Assignment writer did not reach the revision lock',
                                );
                                await delay(10);
                            }
                            assert.equal(await epoch(), before);
                            await writer.query(finish);
                            const outcome = await secondWrite;
                            if (outcome.error) throw outcome.error;
                            assert.equal(outcome.result.rowCount, 1);
                            assert.equal(await epoch(), finish === 'COMMIT' ? firstEpoch : before);
                            const secondEpoch = await epoch(concurrent);
                            assert.notEqual(secondEpoch, before);
                            assert.notEqual(secondEpoch, firstEpoch);
                            await concurrent.query('COMMIT');
                            assert.equal(await epoch(), secondEpoch);
                            assert.deepEqual(await assignments(observer, assignment.squad), [
                                { template_uuid: nextTemplate, template_type: 'SINGBOX' },
                            ]);
                        } finally {
                            await writer.query('ROLLBACK');
                            if (secondWrite) await secondWrite;
                            await concurrent.query('ROLLBACK');
                        }
                    }
                },
            );
        } catch (error) {
            errors.push(error);
        } finally {
            for (const client of [writer, concurrent, observer])
                if (connected.has(client))
                    try {
                        await client.query('ROLLBACK');
                    } catch (error) {
                        errors.push(error);
                    }
            if (connected.has(observer) && (squadIds.size || templateIds.size))
                try {
                    await observer.query('BEGIN');
                    await observer.query(
                        `DELETE FROM public.external_squads_templates
                         WHERE external_squad_uuid=ANY($1::uuid[]) OR template_uuid=ANY($2::uuid[])`,
                        [[...squadIds], [...templateIds]],
                    );
                    await observer.query(
                        'DELETE FROM public.external_squads WHERE uuid=ANY($1::uuid[])',
                        [[...squadIds]],
                    );
                    await observer.query(
                        'DELETE FROM public.subscription_templates WHERE uuid=ANY($1::uuid[])',
                        [[...templateIds]],
                    );
                    await observer.query('COMMIT');
                } catch (error) {
                    errors.push(error);
                    await observer
                        .query('ROLLBACK')
                        .catch((rollbackError) => errors.push(rollbackError));
                }
            const closed = await Promise.allSettled(clients.map((client) => client.end()));
            for (const result of closed)
                if (result.status === 'rejected') errors.push(result.reason);
        }
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1)
            throw new AggregateError(errors, 'Assignment revision test or cleanup failed');
    },
);
