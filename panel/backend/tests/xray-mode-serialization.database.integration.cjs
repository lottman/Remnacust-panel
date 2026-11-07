const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { Client } = require('pg');
const fs = require('node:fs');
const load = require('./load-typescript.cjs');
const { PrismaClient } = require('./prisma-test-client.cjs');
const root = path.join(__dirname, '../src/common/xray-mode');
const { XrayModeService } = load(path.join(root, 'xray-mode.service.ts'), {
    '@common/database/prisma.service': {},
});
const { rethrowXrayModeConflict, hasXrayDatabaseCode } = load(
    path.join(root, 'xray-mode-conflict.ts'),
);
const validatorFile = path.join(
    __dirname,
    '../src/common/helpers/xray-config/xray-config.validator.ts',
);
const validatorMocks = Object.fromEntries(
    [...fs.readFileSync(validatorFile, 'utf8').matchAll(/from '([^']+)'/g)]
        .filter((x) => x[1].startsWith('@'))
        .map((x) => [x[1], {}]),
);
const { XRayConfig } = load(validatorFile, validatorMocks);
const { customCoreConfigPaths } = load(path.join(root, 'xray-mode-policy.ts'));
const postgresMajor = Number(process.env.XRAY_MODE_TEST_PG_MAJOR ?? 18);
assert.ok([14,15,16,17,18].includes(postgresMajor));

test(
    `PG${postgresMajor} serializes global flavor changes with real DB writers and preserves cleanup/outbox`,
    {
        skip: !process.env.XRAY_MODE_TEST_DATABASE_URL,
        timeout: 60000,
    },
    async (t) => {
        const url = new URL(process.env.XRAY_MODE_TEST_DATABASE_URL);
        assert.equal(url.hostname, '127.0.0.1');
        assert.equal(url.pathname, '/xray_mode_guard_test');
        assert.equal(url.username, 'mode_guard_owner');
        assert.ok(Number(url.port) >= 1024);
        const prisma = new PrismaClient({ datasourceUrl: url.href });
        const writer = new Client({ connectionString: url.href });
        const observer = new Client({ connectionString: url.href });
        await writer.connect();
        await observer.connect();
        const service = new XrayModeService(prisma);
        const node = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        const disabledNode = 'cccccccc-cccc-4ccc-8ccc-cccccccccccd';
        const profile = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const inbound = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        const host = '11111111-1111-4111-8111-111111111111';
        const template = '99999999-9999-4999-8999-999999999999';
        const custom = JSON.stringify({ inbounds: [{ streamSettings: { network: 'xera-http' } }] });
        const deferred = () => {
            let resolve;
            const promise = new Promise((r) => {
                resolve = r;
            });
            return { promise, resolve };
        };
        const waitFor = async (predicate) => {
            const deadline = Date.now() + 5000;
            while (!(await predicate())) {
                assert.ok(Date.now() < deadline, 'bounded concurrency barrier');
                await delay(5);
            }
        };
        const conflict = (error) => {
            assert.ok(hasXrayDatabaseCode(error, 'P0C01'));
            assert.throws(
                () => rethrowXrayModeConflict(error),
                (mapped) =>
                    mapped.getStatus() === 409 && mapped.errorCode === 'CUSTOM_XRAY_REQUIRED',
            );
            return true;
        };
        try {
            const info = (
                await observer.query(
                    `SELECT current_setting('server_version_num')::integer AS version, rolsuper FROM pg_roles WHERE rolname=current_user`,
                )
            ).rows[0];
            assert.ok(info.version >= postgresMajor*10000 && info.version < (postgresMajor+1)*10000);
            assert.equal(info.rolsuper, false);
            await observer.query(
                `INSERT INTO config_profiles(uuid,name,config) VALUES ($1,'mode-guard','{}');`,
                [profile],
            );
            await observer.query(
                `INSERT INTO config_profile_inbounds(uuid,profile_uuid,tag,type,raw_inbound) VALUES ($1,$2,'mode-guard','vless','{}')`,
                [inbound, profile],
            );
            await observer.query(
                `INSERT INTO nodes(id,uuid,name,address,active_config_profile_uuid) VALUES (901,$1,'mode-guard','127.0.0.1',$2)`,
                [node, profile],
            );
            await observer.query(
                `INSERT INTO hosts(uuid,remark,address,port) VALUES ($1,'mode-guard','example.test',443)`,
                [host],
            );
            await observer.query(
                `INSERT INTO nodes(id,uuid,name,address,is_disabled) VALUES (902,$1,'mode-guard-disabled','127.0.0.2',true)`,
                [disabledNode],
            );
            await observer.query(
                `INSERT INTO xera_node_port_plans(node_uuid,enabled) VALUES ($1,true)`,
                [disabledNode],
            );
            await observer.query(
                `INSERT INTO subscription_templates(uuid,name,template_type,template_json) VALUES ($1,'mode-guard','XRAY_JSON','{}')`,
                [template],
            );
            await observer.query(
                `INSERT INTO xera_host_tag_limits(tag,user_traffic_limit_bytes) VALUES ('mode-guard',10)`,
            );
            await observer.query(`INSERT INTO xera_limit_scopes(kind,key) VALUES ('HOST',$1)`, [
                host,
            ]);
            await observer.query(
                `INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password) VALUES (901,'mode-guard','mode-guard',now()+interval '1 day','fixture','dddddddd-dddd-4ddd-8ddd-dddddddddddd','fixture')`,
            );
            await observer.query(
                `INSERT INTO xera_limit_user_adjustments(kind,key,user_id,window_start) VALUES ('HOST',$1,901,current_date)`,
                [host],
            );

            await t.test(
                'writer first: preflight waits outside TX and sees committed custom configuration',
                async () => {
                    await writer.query('BEGIN');
                    await writer.query(`UPDATE config_profiles SET config=$2 WHERE uuid=$1`, [
                        profile,
                        custom,
                    ]);
                    let retries = 0;
                    const wrapped = {
                        $transaction: async (...args) => {
                            try {
                                return await prisma.$transaction(...args);
                            } catch (error) {
                                if (hasXrayDatabaseCode(error, '55P03')) retries++;
                                throw error;
                            }
                        },
                    };
                    const changing = new XrayModeService(wrapped).change('default', 0);
                    const denied = assert.rejects(
                        changing,
                        (e) => e.getResponse().code === 'DEFAULT_XRAY_BLOCKED',
                    );
                    await waitFor(() => retries > 0);
                    await writer.query('COMMIT');
                    await denied;
                    assert.deepEqual(await service.get(true), { mode: 'custom', revision: 0 });
                    assert.equal(await service.pendingApply(), undefined);
                    await observer.query(`UPDATE config_profiles SET config='{}' WHERE uuid=$1`, [
                        profile,
                    ]);
                },
            );

            await t.test(
                'mode first: a queued writer sees committed default and cannot mutate',
                async () => {
                    const locked = deferred(),
                        release = deferred();
                    const wrapped = {
                        $transaction: (work, opts) =>
                            prisma.$transaction(
                                (tx) =>
                                    work(
                                        new Proxy(tx, {
                                            get(target, key) {
                                                if (key === '$queryRaw')
                                                    return async (strings, ...values) => {
                                                        const result = await target.$queryRaw(
                                                            strings,
                                                            ...values,
                                                        );
                                                        if (
                                                            strings
                                                                .join('')
                                                                .includes('FOR UPDATE NOWAIT')
                                                        ) {
                                                            locked.resolve();
                                                            await release.promise;
                                                        }
                                                        return result;
                                                    };
                                                const value = Reflect.get(target, key);
                                                return typeof value === 'function'
                                                    ? value.bind(target)
                                                    : value;
                                            },
                                        }),
                                    ),
                                opts,
                            ),
                    };
                    const changing = new XrayModeService(wrapped).change('default', 0);
                    await locked.promise;
                    const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
                    const write = writer.query(
                        `UPDATE hosts SET speed_limit_mbps=123 WHERE uuid=$1`,
                        [host],
                    );
                    const denied = assert.rejects(write, conflict);
                    await waitFor(
                        async () =>
                            (
                                await observer.query(
                                    `SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1`,
                                    [pid],
                                )
                            ).rows[0]?.waiting,
                    );
                    release.resolve();
                    assert.deepEqual(await changing, { mode: 'default', revision: 1 });
                    await denied;
                    assert.notEqual(
                        (
                            await observer.query(
                                'SELECT speed_limit_mbps FROM hosts WHERE uuid=$1',
                                [host],
                            )
                        ).rows[0].speed_limit_mbps,
                        123,
                    );
                    assert.equal(await service.pendingApply(), 1);
                },
            );

            const blocked = [
                [
                    'reenable custom port plan',
                    `UPDATE nodes SET is_disabled=false WHERE uuid='${disabledNode}'`,
                ],
                [
                    'new reserve',
                    `INSERT INTO xera_quota_reserves(kind,key,user_id,window_start,node_uuid,instance_uuid,ceiling_bytes) VALUES ('HOST','${host}',901,current_date,'${node}',gen_random_uuid(),100)`,
                ],
                ['host bulk', `UPDATE hosts SET speed_limit_mbps=12`],
                [
                    'tag',
                    `UPDATE xera_host_tag_limits SET user_traffic_limit_bytes=20 WHERE tag='mode-guard'`,
                ],
                [
                    'profile',
                    `UPDATE config_profiles SET config='${custom}' WHERE uuid='${profile}'`,
                ],
                [
                    'snippet',
                    `INSERT INTO config_profile_snippets(name,snippet) VALUES ('mode-guard','${custom}')`,
                ],
                [
                    'inbound',
                    `UPDATE config_profile_inbounds SET raw_inbound='${custom}' WHERE uuid='${inbound}'`,
                ],
                [
                    'template',
                    `UPDATE subscription_templates SET template_json='${custom}' WHERE uuid='${template}'`,
                ],
                [
                    'port',
                    `INSERT INTO xera_node_port_plans(node_uuid,enabled) VALUES ('${node}',true)`,
                ],
                [
                    'quota',
                    `INSERT INTO xera_quota_node_modes(node_uuid,phase) VALUES ('${node}','FENCING')`,
                ],
                ['pause', `UPDATE xera_limit_scopes SET paused=true WHERE key='${host}'`],
                [
                    'bonus',
                    `UPDATE xera_limit_user_adjustments SET bonus_bytes=100 WHERE key='${host}'`,
                ],
                [
                    'unlimited',
                    `UPDATE xera_limit_user_adjustments SET unlimited=true WHERE key='${host}'`,
                ],
                [
                    'limit action',
                    `INSERT INTO xera_limit_actions(id,kind,key,action,affected_users,selection) VALUES (gen_random_uuid(),'HOST','${host}','RESET',1,'{}')`,
                ],
            ];
            for (const [name, sql] of blocked)
                await t.test('default rejects ' + name + ' atomically', async () => {
                    await assert.rejects(prisma.$executeRawUnsafe(sql), conflict);
                });

            await t.test(
                'actual Prisma ORM conflicts retain safe HTTP409 classification',
                async () => {
                    await assert.rejects(
                        prisma.hosts.update({
                            where: { uuid: host },
                            data: { speedLimitMbps: 22 },
                        }),
                        conflict,
                    );
                    assert.equal(
                        (
                            await observer.query(
                                'SELECT count(*)::int AS count FROM xera_limit_actions',
                            )
                        ).rows[0].count,
                        0,
                    );
                },
            );
            await t.test(
                'cleanup, neutral and unchanged saved settings remain writable',
                async () => {
                    await observer.query(
                        `UPDATE hosts SET speed_limit_mbps=0,remark='ordinary edit' WHERE uuid=$1`,
                        [host],
                    );
                    await observer.query(
                        `UPDATE xera_host_tag_limits SET user_traffic_limit_bytes=user_traffic_limit_bytes WHERE tag='mode-guard'`,
                    );
                    await observer.query(
                        `UPDATE xera_host_tag_limits SET user_traffic_limit_bytes=0 WHERE tag='mode-guard'`,
                    );
                    await observer.query(
                        `INSERT INTO xera_node_port_plans(node_uuid,enabled) VALUES ($1,false)`,
                        [node],
                    );
                    await observer.query(`DELETE FROM xera_node_port_plans WHERE node_uuid=$1`, [
                        node,
                    ]);
                    await observer.query(`DELETE FROM xera_quota_node_modes WHERE node_uuid=$1`, [
                        node,
                    ]);
                    await observer.query(
                        `UPDATE xera_limit_user_adjustments SET unlimited=false,paused=false,bonus_bytes=0,reset_base='{}' WHERE key=$1`,
                        [host],
                    );
                    await observer.query(
                        `INSERT INTO xera_limit_actions(id,kind,key,action,affected_users,selection) VALUES (gen_random_uuid(),'HOST',$1,'LIMITED',1,'{}')`,
                        [host],
                    );
                },
            );
            await t.test(
                'busy outbox acknowledgement stays pending and stale revision cannot clear it',
                async () => {
                    await writer.query('BEGIN');
                    await writer.query('SELECT id FROM xera_xray_settings WHERE id=1 FOR SHARE');
                    await service.markQueued(1);
                    assert.equal(await service.pendingApply(), 1);
                    await writer.query('COMMIT');
                    await service.markQueued(0);
                    assert.equal(await service.pendingApply(), 1);
                    await service.markQueued(1);
                    assert.equal(await service.pendingApply(), undefined);
                },
            );
            await t.test(
                'concurrent CAS has exactly one winner; custom restores writes and durable apply',
                async () => {
                    const results = await Promise.allSettled([
                        service.change('custom', 1),
                        service.change('custom', 1),
                    ]);
                    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
                    assert.equal(
                        results.find((r) => r.status === 'rejected').reason.getResponse().code,
                        'XRAY_SETTINGS_CHANGED',
                    );
                    assert.deepEqual(await service.get(true), { mode: 'custom', revision: 2 });
                    assert.equal(await service.pendingApply(), 2);
                    await observer.query(`UPDATE hosts SET speed_limit_mbps=20 WHERE uuid=$1`, [
                        host,
                    ]);
                },
            );
            await t.test(
                'legacy recovery metadata and deletion stay available without activating quota',
                async () => {
                    await observer.query(
                        `INSERT INTO xera_quota_node_modes(node_uuid,phase) VALUES ($1,'FENCING')`,
                        [node],
                    );
                    await observer.query(`UPDATE xera_xray_settings SET mode='default' WHERE id=1`);
                    await observer.query(
                        `UPDATE xera_quota_node_modes SET legacy_usage_drained_at=clock_timestamp() WHERE node_uuid=$1`,
                        [node],
                    );
                    await assert.rejects(
                        observer.query(
                            `UPDATE xera_quota_node_modes SET phase='ACTIVE' WHERE node_uuid=$1`,
                            [node],
                        ),
                        conflict,
                    );
                    await observer.query(`DELETE FROM xera_quota_node_modes WHERE node_uuid=$1`, [
                        node,
                    ]);
                    await observer.query(`UPDATE xera_xray_settings SET mode='custom' WHERE id=1`);
                },
            );
            const snippets = new Map([
                [
                    'mode-custom-rule',
                    [
                        {
                            type: 'field',
                            outboundTag: 'direct',
                            webhook: { url: 'https://example.invalid/hook' },
                        },
                    ],
                ],
                [
                    'mode-custom-out',
                    [
                        {
                            tag: 'custom',
                            protocol: 'freedom',
                            streamSettings: { network: 'xera-http' },
                        },
                    ],
                ],
                ['mode-custom-balance', [{ tag: 'custom', network: 'xera-http' }]],
                ['mode-root', [{ routing: { rules: [{ snippet: 'mode-custom-rule' }] } }]],
                [
                    'mode-protected',
                    [{ inbounds: [{ protocol: 'olcrtc' }], stats: { hostPolicy: {} } }],
                ],
                ['mode-safe-root', [{ routing: { rules: [] } }]],
                [
                    'mode-safe-rule',
                    [{ type: 'field', outboundTag: 'direct', domain: ['example.invalid'] }],
                ],
                ['mode-one-pass', [{ snippet: 'mode-custom-rule' }]],
            ]);
            for (const [name, snippet] of snippets)
                await observer.query(
                    `INSERT INTO config_profile_snippets(name,snippet) VALUES ($1,$2)`,
                    [name, JSON.stringify(snippet)],
                );
            const base = () => ({
                inbounds: [
                    { tag: 'vless', protocol: 'vless', port: 443, settings: { clients: [] } },
                ],
                outbounds: [{ tag: 'direct', protocol: 'freedom' }],
            });
            const cases = [
                [
                    'routing rule',
                    { ...base(), routing: { rules: [{ snippet: 'mode-custom-rule' }] } },
                    true,
                ],
                ['outbound', { ...base(), outbounds: [{ snippet: 'mode-custom-out' }] }, true],
                [
                    'balancer',
                    { ...base(), routing: { balancers: [{ snippet: 'mode-custom-balance' }] } },
                    true,
                ],
                ['root and nested rule', { ...base(), snippets: ['mode-root'] }, true],
                ['protected root keys', { ...base(), snippets: ['mode-protected'] }, false],
                [
                    'explicit root wins',
                    { ...base(), snippets: ['mode-root'], routing: { rules: [] } },
                    false,
                ],
                [
                    'later root wins',
                    { ...base(), snippets: ['mode-root', 'mode-safe-root'] },
                    false,
                ],
                [
                    'missing references',
                    {
                        ...base(),
                        snippets: ['mode-missing'],
                        routing: { rules: [{ snippet: 'mode-missing' }] },
                    },
                    false,
                ],
                [
                    'ordinary reference',
                    { ...base(), routing: { rules: [{ snippet: 'mode-safe-rule' }] } },
                    false,
                ],
                [
                    'array replacement is single pass',
                    { ...base(), routing: { rules: [{ snippet: 'mode-one-pass' }] } },
                    false,
                ],
            ];
            for (const [name, config, expected] of cases)
                await t.test(
                    'SQL snippet semantics match actual runtime expansion: ' + name,
                    async () => {
                        const runtime = new XRayConfig(structuredClone(config));
                        runtime.replaceSnippets(snippets);
                        assert.equal(
                            customCoreConfigPaths(runtime.getConfig()).length > 0,
                            expected,
                        );
                        const result = (
                            await observer.query(
                                `SELECT xera_xray_config_uses_custom_snippets($1::jsonb) AS blocked`,
                                [JSON.stringify(config)],
                            )
                        ).rows[0];
                        assert.equal(result.blocked, expected);
                    },
                );
            await t.test(
                'referenced live custom snippet blocks mode CAS without changing state or outbox',
                async () => {
                    await observer.query(`UPDATE config_profiles SET config=$2 WHERE uuid=$1`, [
                        profile,
                        JSON.stringify(cases[0][1]),
                    ]);
                    await assert.rejects(
                        service.change('default', 2),
                        (error) =>
                            error.getResponse().code === 'DEFAULT_XRAY_BLOCKED' &&
                            error
                                .getResponse()
                                .blockers.some(
                                    (x) =>
                                        x.id === profile && x.paths.includes('referenced-snippet'),
                                ),
                    );
                    assert.deepEqual(await service.get(true), { mode: 'custom', revision: 2 });
                    assert.equal(await service.pendingApply(), 2);
                    await observer.query(`UPDATE config_profiles SET config='{}' WHERE uuid=$1`, [
                        profile,
                    ]);
                    await observer.query(
                        `INSERT INTO config_profiles(uuid,name,config) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','mode-inactive-custom',$1)`,
                        [JSON.stringify(cases[0][1])],
                    );
                    await service.change('default', 2);
                },
            );
            await t.test(
                'stock writes cannot introduce custom references, create their payload or activate a renamed payload',
                async () => {
                    for (const config of cases.filter((x) => x[2]).map((x) => x[1]))
                        await assert.rejects(
                            observer.query(`UPDATE config_profiles SET config=$2 WHERE uuid=$1`, [
                                profile,
                                JSON.stringify(config),
                            ]),
                            conflict,
                        );
                    await assert.rejects(
                        observer.query(
                            `UPDATE config_profile_snippets SET snippet=$2 WHERE name=$1`,
                            ['mode-safe-rule', JSON.stringify(snippets.get('mode-custom-rule'))],
                        ),
                        conflict,
                    );
                    await assert.rejects(
                        observer.query(
                            `INSERT INTO config_profile_snippets(name,snippet) VALUES ('mode-new-rule',$1)`,
                            [JSON.stringify(snippets.get('mode-custom-rule'))],
                        ),
                        conflict,
                    );
                    await assert.rejects(
                        observer.query(
                            `UPDATE config_profile_snippets SET name='mode-renamed-rule' WHERE name='mode-custom-rule'`,
                        ),
                        conflict,
                    );
                    await assert.rejects(
                        observer.query(
                            `INSERT INTO config_profile_snippets(name,snippet) VALUES ('mode-nested-root',$1)`,
                            [JSON.stringify(snippets.get('mode-root'))],
                        ),
                        conflict,
                    );
                    for (const config of cases.filter((x) => !x[2]).map((x) => x[1]))
                        await observer.query(`UPDATE config_profiles SET config=$2 WHERE uuid=$1`, [
                            profile,
                            JSON.stringify(config),
                        ]);
                    await observer.query(
                        `INSERT INTO config_profile_snippets(name,snippet) VALUES ('mode-new-safe',$1)`,
                        [JSON.stringify(snippets.get('mode-safe-rule'))],
                    );
                    await assert.rejects(
                        observer.query(
                            `UPDATE xera_node_port_plans SET revision=revision+1 WHERE node_uuid=$1`,
                            [disabledNode],
                        ),
                        conflict,
                    );
                    await assert.rejects(
                        observer.query(
                            `UPDATE nodes SET active_config_profile_uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab' WHERE uuid=$1`,
                            [node],
                        ),
                        conflict,
                    );
                    assert.equal(
                        (
                            await observer.query(`SELECT is_disabled FROM nodes WHERE uuid=$1`, [
                                disabledNode,
                            ])
                        ).rows[0].is_disabled,
                        true,
                    );
                    assert.equal(
                        (
                            await observer.query(
                                `SELECT count(*)::int AS count FROM config_profile_snippets WHERE name IN ('mode-new-rule','mode-renamed-rule','mode-nested-root')`,
                            )
                        ).rows[0].count,
                        0,
                    );
                },
            );
            await t.test(
                'resolver budget fails closed only for expansion, not large ordinary stock configurations',
                async () => {
                    const large = { ...base(), remarks: 'x'.repeat(1100000) };
                    assert.equal(
                        (
                            await observer.query(
                                `SELECT xera_xray_config_uses_custom_snippets($1::jsonb) AS blocked`,
                                [JSON.stringify(large)],
                            )
                        ).rows[0].blocked,
                        false,
                    );
                    large.snippets = ['mode-safe-root'];
                    assert.equal(
                        (
                            await observer.query(
                                `SELECT xera_xray_config_uses_custom_snippets($1::jsonb) AS blocked`,
                                [JSON.stringify(large)],
                            )
                        ).rows[0].blocked,
                        true,
                    );
                },
            );
        } finally {
            await writer.query('ROLLBACK').catch(() => {});
            await Promise.all([writer.end(), observer.end(), prisma.$disconnect()]);
        }
    },
);
