const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55439');
assert.equal(url.pathname, '/postgres');
const prisma = new PrismaClient({ datasourceUrl: url.href });
const root = path.join(__dirname, '../prisma/migrations');
const previous = fs.readFileSync(
    path.join(root, '20260927040000_host_tag_limit_switches/migration.sql'),
    'utf8',
);
const previousState = fs.readFileSync(
    path.join(root, '20260930010000_personal_unlimited_limits/migration.sql'),
    'utf8',
);
const seed = fs
    .readFileSync(path.join(__dirname, 'fixtures/host-policy-seed.sql'), 'utf8')
    .split('DO $$ BEGIN')[0]
    .replace('BEGIN;', '');
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const rollback = new Error('ROLLBACK_QUOTA_SCOPE_FIXTURE');
const normalized = (rows) =>
    rows
        .map((row) =>
            JSON.stringify(row, (_, value) =>
                typeof value === 'bigint' ? value.toString() : value,
            ),
        )
        .sort();

async function main() {
    let comparisons = 0;
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n, 0n);
    try {
        await prisma.$transaction(
            async (tx) => {
                await tx.$executeRawUnsafe(
                    'CREATE TEMP TABLE quota_scope_fixture(id integer) ON COMMIT DROP',
                );
                for (const name of ['xera_limit_raw', 'xera_limit_entitled']) {
                    const definition = previous.match(
                        new RegExp(`CREATE OR REPLACE FUNCTION ${name}\\([\\s\\S]*?\\$\\$;`),
                    )?.[0];
                    assert(definition);
                    await tx.$executeRawUnsafe(
                        definition.replace(`FUNCTION ${name}`, `FUNCTION pg_temp.before_${name}`),
                    );
                }
                const definition = previousState.match(
                    /CREATE OR REPLACE FUNCTION xera_limit_state\([\s\S]*?\$\$;/,
                )?.[0];
                assert(definition);
                await tx.$executeRawUnsafe(
                    definition
                        .replace(
                            'FUNCTION xera_limit_state',
                            'FUNCTION pg_temp.before_xera_limit_state',
                        )
                        .replace('FROM xera_limit_raw(', 'FROM pg_temp.before_xera_limit_raw('),
                );
                for (const statement of seed.split(';').filter((value) => value.trim()))
                    await tx.$executeRawUnsafe(statement);
                await tx.$executeRaw`INSERT INTO xera_host_tag_limits(tag,user_traffic_limit_bytes) VALUES ('alpha',10000),('beta',0),('quote'';--',20000)`;
                await tx.$executeRaw`UPDATE hosts SET tags=ARRAY['alpha','beta','alpha','quote'';--',NULL],user_traffic_limit_bytes=10000 WHERE uuid=${a}::uuid`;
                await tx.$executeRaw`INSERT INTO xera_host_quota_usage(user_id,host_uuid,node_id,created_at,total_bytes) VALUES
                (901,${a}::uuid,901,current_date,1200),(901,${a}::uuid,901,current_date-2,800),(901,${b}::uuid,901,current_date,3000)`;
                await tx.$executeRaw`INSERT INTO xera_legacy_tag_quota_usage(tag,user_id,node_id,created_at,total_bytes) VALUES ('alpha',901,901,current_date,700)`;
                for (let phase = 0; phase < 3; phase++) {
                    if (phase === 1)
                        await tx.$executeRaw`UPDATE hosts SET use_tag_traffic_limit=false,traffic_multiplier=2.5`;
                    if (phase === 2) {
                        await tx.$executeRaw`UPDATE hosts SET use_tag_traffic_limit=true,traffic_limit_reset_value=1,traffic_limit_reset_unit='DAYS',traffic_limit_reset_anchor_at=now() WHERE uuid=${a}::uuid`;
                        await tx.$executeRaw`INSERT INTO xera_limit_scopes(kind,key,paused) VALUES ('HOST',${a},true),('TAG','alpha',false)`;
                        await tx.$executeRaw`INSERT INTO xera_limit_user_adjustments(kind,key,user_id,window_start,bonus_bytes,paused,unlimited,reset_base)
                        VALUES ('HOST',${a},901,current_date,1000,false,true,'{}'),('TAG','alpha',901,'1970-01-01',2000,true,false,${JSON.stringify({ [a]: 500, legacy: 100 })}::jsonb)`;
                    }
                    for (const [kind, key] of [
                        ['HOST', a],
                        ['HOST', b],
                        ['HOST', 'invalid-uuid'],
                        ['HOST', a.toUpperCase()],
                        ['HOST', null],
                        ['TAG', 'alpha'],
                        ['TAG', 'beta'],
                        ['TAG', "quote';--"],
                        ['TAG', 'missing'],
                        ['TAG', ''],
                        ['TAG', null],
                        ['OTHER', 'alpha'],
                        [null, 'alpha'],
                    ])
                        for (const user of [901, 902, null]) {
                            const args = [kind, key, user];
                            for (const name of ['xera_limit_entitled', 'xera_limit_state']) {
                                const expression = name === 'xera_limit_entitled' ? '' : '* FROM ';
                                const alias = name === 'xera_limit_entitled' ? ' AS value' : '';
                                const current = await tx.$queryRawUnsafe(
                                    `SELECT ${expression}public.${name}($1::text,$2::text,$3::bigint)${alias}`,
                                    ...args,
                                );
                                const original = await tx.$queryRawUnsafe(
                                    `SELECT ${expression}pg_temp.before_${name}($1::text,$2::text,$3::bigint)${alias}`,
                                    ...args,
                                );
                                assert.deepEqual(
                                    normalized(current),
                                    normalized(original),
                                    `${phase}:${name}:${kind}:${key}:${user}`,
                                );
                                comparisons++;
                            }
                            for (const [window, factor] of [
                                ['1970-01-01', 1],
                                ['2099-01-01', 2.5],
                            ]) {
                                const current = await tx.$queryRawUnsafe(
                                    'SELECT * FROM public.xera_limit_raw($1::text,$2::text,$3::bigint,$4::date,$5::float8)',
                                    ...args,
                                    window,
                                    factor,
                                );
                                const original = await tx.$queryRawUnsafe(
                                    'SELECT * FROM pg_temp.before_xera_limit_raw($1::text,$2::text,$3::bigint,$4::date,$5::float8)',
                                    ...args,
                                    window,
                                    factor,
                                );
                                assert.deepEqual(
                                    normalized(current),
                                    normalized(original),
                                    `${phase}:raw:${kind}:${key}:${user}`,
                                );
                                comparisons++;
                            }
                        }
                }
                const indexes =
                    await tx.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN('hosts_uuid_text_lookup','hosts_traffic_tags_lookup')`;
                assert.equal(indexes.length, 2);
                throw rollback;
            },
            { timeout: 30000 },
        );
    } catch (error) {
        if (error !== rollback) throw error;
    }
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n, 0n);
    process.stdout.write(
        `${JSON.stringify({ quotaScopeComparisons: comparisons, fixtureRolledBack: true })}\n`,
    );
}

main()
    .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
