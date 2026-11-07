const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { PrismaClient } = require('./prisma-test-client.cjs');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const {
    PrismaTxDriver,
} = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');

const url = process.env.QUOTA_POLICY_BATCH_TEST_DATABASE_URL;
assert.ok(url);
const target = new URL(url);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55439');
assert.equal(target.pathname, '/remnacust_test_quota_policy_batch');
const prisma = new PrismaClient({ datasourceUrl: url });
const cls = new AsyncLocalStorage();
const queries = [];
let epochBatches = 0,
    failBatch = 0;
const transactions = {
    isTransactionActive: () => !!cls.getStore(),
    get tx() {
        return cls.getStore() ?? prisma;
    },
    withTransaction: (options, fn) => prisma.$transaction((tx) => cls.run(tx, fn), options),
};
class RecordingDriver extends PrismaTxDriver {
    async acquireConnection() {
        const connection = await super.acquireConnection();
        return new Proxy(connection, {
            get(object, key) {
                if (key !== 'executeQuery') return Reflect.get(object, key);
                return async (query) => {
                    queries.push(query);
                    if (
                        query.sql.includes('INSERT INTO xera_quota_node_epochs') &&
                        ++epochBatches === failBatch
                    )
                        await transactions.tx.$executeRawUnsafe('SELECT 1/0');
                    return object.executeQuery(query);
                };
            },
        });
    }
}
const db = {
    kysely: new k.Kysely({
        dialect: {
            createDriver: () => new RecordingDriver(transactions),
            createAdapter: () => new k.PostgresAdapter(),
            createIntrospector: (value) => new k.PostgresIntrospector(value),
            createQueryCompiler: () => new k.PostgresQueryCompiler(),
        },
    }),
};
const { renderQuotaPolicy } = load(
    path.join(__dirname, '../src/common/host-policy/quota-policy.ts'),
);
const H = '11111111-1111-4111-8111-111111111111';
const N = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const I = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const E = '00000000-0000-0000-0000-000000000000';
const R = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const groups = ['host:' + H, 'tag:alpha'].map((key) => ({
    key,
    userLimit: '1000',
    trafficMultiplier: 1,
    hostUuids: [H],
    nodeUuids: [N],
    userSpeed: 0,
    deviceSpeed: 0,
    totalSpeed: 0,
    anchor: new Date(0),
    resetValue: 0,
    resetUnit: 'DAYS',
}));
const snapshot = () => ({ hosts: [], identities: [], groups, protectedInboundIds: new Set() });
const body = () => ({
    groups: Object.fromEntries(
        groups.map((g) => [g.key, { blockAll: true, blockedOwners: { 1000: true } }]),
    ),
    hosts: {},
});
const mode = { phase: 'ACTIVE', instance: I };
const resetQueries = () => {
    queries.length = 0;
    epochBatches = 0;
};
const epochRows = () =>
    prisma.$queryRaw`SELECT row_to_json(e)::text AS value FROM xera_quota_node_epochs e ORDER BY kind,key,user_id,window_start,node_uuid`;
const money = () => prisma.$queryRaw`SELECT
    (SELECT md5(jsonb_agg(to_jsonb(g) ORDER BY g.id)::text) FROM xera_quota_reserves g) AS grants,
    (SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY p.kind,p.key,p.user_id,p.window_start,p.budget_epoch)::text) FROM xera_quota_reserve_pools p) AS pools`;
async function render(revision, phase = 'ACTIVE') {
    const document = body();
    await transactions.withTransaction({ timeout: 30000 }, () =>
        renderQuotaPolicy(
            db,
            N,
            { ...mode, phase },
            snapshot(),
            document,
            String(revision),
            () => '',
        ),
    );
    return document;
}

async function main() {
    assert.equal((await prisma.$queryRaw`SELECT count(*) AS n FROM users`)[0].n, 0n);
    await prisma.$transaction(
        async (tx) => {
            const seed = fs
                .readFileSync(path.join(__dirname, 'fixtures/host-policy-seed.sql'), 'utf8')
                .replace('BEGIN;', '');
            for (const statement of seed.split(';').filter((value) => value.trim()))
                await tx.$executeRawUnsafe(statement);
            await tx.$executeRaw`INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password)
            SELECT n,'batch-'||n,'batch-'||n,(now() AT TIME ZONE 'UTC')+interval '1 day','test',md5(n::text)::uuid,'test'
            FROM generate_series(1000,2206) n`;
            await tx.$executeRaw`UPDATE hosts SET user_traffic_limit_bytes=1000 WHERE uuid=${H}::uuid`;
            await tx.$executeRaw`INSERT INTO xera_host_tag_limits(tag,user_traffic_limit_bytes) VALUES('alpha',1000)`;
            await tx.$executeRaw`INSERT INTO xera_limit_scopes(kind,key) VALUES('HOST',${H}),('TAG','alpha')`;
            await tx.$executeRaw`INSERT INTO xera_limit_user_adjustments(kind,key,user_id,window_start,unlimited)
            SELECT kind,key,2204,'1970-01-01',true FROM xera_limit_scopes`;
            await tx.$executeRaw`INSERT INTO xera_quota_reserve_pools(kind,key,user_id,window_start,budget_epoch,expires_at,baseline_bytes,limit_bytes)
            SELECT s.kind,s.key,u.id,CASE WHEN u.id=2206 THEN '1969-12-31' ELSE '1970-01-01' END::date,
                CASE WHEN u.id=2205 THEN ${R}::uuid ELSE ${E}::uuid END,
                now()+CASE WHEN u.id=2203 THEN interval '-1 day' ELSE interval '10 days' END,0,1000
            FROM users u CROSS JOIN xera_limit_scopes s WHERE u.id>=1000`;
            await tx.$executeRaw`INSERT INTO xera_quota_reserves(kind,key,user_id,window_start,budget_epoch,node_uuid,instance_uuid,ceiling_bytes,registration_required)
            SELECT kind,key,user_id,window_start,budget_epoch,${N}::uuid,${I}::uuid,100,false FROM xera_quota_reserve_pools`;
            await tx.$executeRaw`UPDATE xera_quota_reserves SET retired_at=now() WHERE user_id=2201`;
            await tx.$executeRaw`UPDATE xera_quota_reserves SET closed_usage_bytes=7,closed_at=now(),closed_revision=1 WHERE user_id=2202`;
        },
        { timeout: 30000 },
    );
    const financial = await money();
    resetQueries();
    const first = await render(100);
    const writes = queries.filter((q) => q.sql.includes('INSERT INTO xera_quota_node_epochs'));
    assert.deepEqual(
        writes.map((q) => q.parameters.length / 8),
        [500, 500, 201, 500, 500, 201],
    );
    assert(writes.every((q) => q.parameters.length <= 4000 && q.sql.length < 100000));
    for (const group of groups) {
        assert.equal(Object.keys(first.groups[group.key].reserves).length, 1201);
        assert.equal(first.groups[group.key].blockAll, false);
        for (let owner = 2201; owner <= 2206; owner++)
            assert.equal(first.groups[group.key].reserves[owner], undefined);
    }
    assert.equal((await epochRows()).length, 2402);
    assert.deepEqual(await money(), financial);
    console.log(
        'PASS 2402 eligible deliveries in six bounded SQL statements; retired/closed/expired/unlimited/old epoch/window excluded; bank unchanged',
    );

    await prisma.$executeRaw`UPDATE xera_quota_node_epochs SET applied_epoch=desired_epoch,applied_revision=99`;
    const applied = await epochRows();
    await render(100);
    await render(99);
    assert.deepEqual(await epochRows(), applied);
    await render(101, 'FENCING');
    assert.equal(
        (
            await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_node_epochs WHERE desired_revision=101 AND applied_revision=99 AND applied_epoch=${E}::uuid`
        )[0].n,
        2402n,
    );
    const fenced = await render(102, 'FENCING');
    assert(groups.every((g) => fenced.groups[g.key].fenceAll === true));
    assert.deepEqual(await money(), financial);
    console.log(
        'PASS same/older revision replay is a full no-op; newer revision preserves applied ACK and financial state; soft fencing retained',
    );

    const beforeFailure = await epochRows();
    resetQueries();
    failBatch = 2;
    await assert.rejects(render(103), /division by zero/);
    failBatch = 0;
    assert.equal(epochBatches, 2);
    assert.deepEqual(await epochRows(), beforeFailure);
    assert.deepEqual(await money(), financial);
    console.log('PASS real PostgreSQL failure on second batch rolls back the first batch');

    let release, entered;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const ready = new Promise((resolve) => {
        entered = resolve;
    });
    const winner = transactions.withTransaction({ timeout: 30000 }, async () => {
        await renderQuotaPolicy(db, N, mode, snapshot(), body(), '200', () => '');
        entered();
        await gate;
    });
    await ready;
    const stale = render(199);
    try {
        let locked = false;
        for (let attempt = 0; attempt < 100 && !locked; attempt++) {
            locked = (
                await prisma.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
                WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'INSERT INTO xera_quota_node_epochs%') AS locked`
            )[0].locked;
            if (!locked) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(locked, true);
    } finally {
        release();
    }
    await Promise.all([winner, stale]);
    assert.equal(
        (
            await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_node_epochs WHERE desired_revision=200 AND applied_revision=99`
        )[0].n,
        2402n,
    );
    console.log('PASS competing stale writer waits on actual row locks then rechecks revision CAS');

    await prisma.$executeRaw`INSERT INTO xera_quota_reserve_pools(kind,key,user_id,window_start,budget_epoch,expires_at,baseline_bytes,limit_bytes)
        SELECT kind,key,user_id,window_start,${R}::uuid,expires_at,baseline_bytes,limit_bytes FROM xera_quota_reserve_pools WHERE user_id=1000`;
    await prisma.$executeRaw`INSERT INTO xera_quota_reserves(kind,key,user_id,window_start,budget_epoch,node_uuid,instance_uuid,ceiling_bytes,registration_required)
        SELECT kind,key,user_id,window_start,${R}::uuid,${N}::uuid,${I}::uuid,50,false FROM xera_quota_reserve_pools WHERE user_id=1000 AND budget_epoch=${R}::uuid`;
    await prisma.$executeRaw`INSERT INTO xera_quota_budget_heads(kind,key,user_id,window_start,budget_epoch)
        SELECT kind,key,user_id,window_start,budget_epoch FROM xera_quota_reserve_pools WHERE user_id=1000 AND budget_epoch=${R}::uuid`;
    const resetMoney = await money();
    const resetPolicy = await render(201);
    assert.equal(
        (
            await prisma.$queryRaw`SELECT count(*) AS n FROM xera_quota_node_epochs WHERE user_id=1000 AND desired_epoch=${R}::uuid AND applied_epoch=${E}::uuid AND applied_revision=99`
        )[0].n,
        2n,
    );
    assert(groups.every((g) => resetPolicy.groups[g.key].reserves['1000'].ceiling === '50'));
    assert.deepEqual(await money(), resetMoney);
    console.log(
        'PASS reset epoch changes desired metadata only; old ACK and old financial reservations survive',
    );

    const { HostPolicyService } = load(
        path.join(__dirname, '../src/common/host-policy/host-policy.service.ts'),
        {
            '@common/database': {},
            '@common/axios': {},
            '@common/raw-cache': {},
            '@common/config/app-config/typed-config.service': {},
            '@common/utils/host-identity': load(
                path.join(__dirname, '../src/common/utils/host-identity.ts'),
            ),
        },
    );
    await prisma.$executeRaw`INSERT INTO xera_quota_node_modes(node_uuid,phase,instance_uuid) VALUES(${N}::uuid,'ACTIVE',${I}::uuid)`;
    await prisma.$executeRaw`INSERT INTO xera_node_policy_revisions(node_uuid,revision) VALUES(${N}::uuid,1000)`;
    const caps = {
        version: 'xera-host-policy-v2',
        supported: true,
        policyRevisionsSupported: true,
        policyRevision: '0',
        quotaReservesSupported: true,
        quotaFencesSupported: true,
        unreservedUsageSupported: true,
        routedDeviceSpeedLimitsSupported: true,
        quotaInstanceId: I,
        quotaWatermarksSupported: true,
        quotaJournalSequence: '0',
        coreProcessId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    };
    const sends = [],
        stats = [];
    const service = new HostPolicyService(
        db,
        {
            hostPolicy: async (_node, document) => {
                assert.equal(transactions.isTransactionActive(), false);
                if (!document) return { isOk: true, response: caps };
                sends.push(document);
                return { isOk: true, response: { version: caps.version, staged: true } };
            },
        },
        {
            get: async (key) => {
                if (key.startsWith('xera:host-policy:stats:')) stats.push(key);
                return null;
            },
            set: async () => {},
            del: async () => {},
        },
        { getOrThrow: () => 'fixture-secret' },
        transactions,
    );
    service.scopes = async () => snapshot();
    const node = { uuid: N, address: '127.0.0.1', port: 1 };
    resetQueries();
    await service.syncNode(node);
    assert.equal(
        queries.some((q) => q.sql.includes('CROSS JOIN LATERAL xera_limit_state')),
        false,
    );
    assert.equal(stats.length, 0);
    assert.equal(sends.length, 1);
    assert(
        groups.every(
            (g) => sends[0].groups[g.key].reserveRequired && !sends[0].groups[g.key].blockAll,
        ),
    );
    const beforeSendFailure = await epochRows();
    const revisions =
        await prisma.$queryRaw`SELECT revision FROM xera_node_policy_revisions WHERE node_uuid=${N}::uuid`;
    resetQueries();
    failBatch = 2;
    await assert.rejects(service.syncNode(node), /division by zero/);
    failBatch = 0;
    assert.equal(sends.length, 1);
    assert.deepEqual(await epochRows(), beforeSendFailure);
    assert.deepEqual(
        await prisma.$queryRaw`SELECT revision FROM xera_node_policy_revisions WHERE node_uuid=${N}::uuid`,
        revisions,
    );
    console.log(
        'PASS actual syncNode skips autonomous legacy meters/stats; partial SQL failure sends no policy and rolls back allocated revision',
    );

    await prisma.$executeRaw`DELETE FROM xera_quota_node_modes WHERE node_uuid=${N}::uuid`;
    await prisma.$executeRaw`INSERT INTO xera_host_quota_usage(user_id,host_uuid,node_id,total_bytes) VALUES(1000,${H}::uuid,901,2000)`;
    resetQueries();
    await service.syncNode(node);
    assert.equal(
        queries.filter((q) => q.sql.includes('CROSS JOIN LATERAL xera_limit_state')).length,
        2,
    );
    assert.equal(stats.length, 2);
    assert(
        groups.every(
            (g) =>
                sends.at(-1).groups[g.key].blockAll &&
                sends.at(-1).groups[g.key].blockedOwners['1000'],
        ),
    );
    console.log('PASS legacy mode still evaluates exhaustion and fails closed on missing stats');

    const peer = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await prisma.$executeRaw`INSERT INTO nodes(id,uuid,name,address) VALUES(903,${peer}::uuid,'native-discovery-peer','127.0.0.2')`;
    await prisma.$executeRaw`INSERT INTO config_profile_inbounds_to_nodes(config_profile_inbound_uuid,node_uuid)
        VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',${peer}::uuid)`;
    let releasePeer, enteredPeer;
    const peerGate = new Promise((resolve) => {
        releasePeer = resolve;
    });
    const peerStarted = new Promise((resolve) => {
        enteredPeer = resolve;
    });
    const hostPolicy = service.axios.hostPolicy;
    service.axios.hostPolicy = async (connection, document) =>
        connection.uuid === peer
            ? { isOk: false, code: 'NODE_HTTP_404' }
            : hostPolicy(connection, document);
    service.axios.getNodeHealth = async () => {
        assert.equal(transactions.isTransactionActive(), false);
        enteredPeer();
        await peerGate;
        return { isOk: true, response: { nodeVersion: '2.5.1' } };
    };
    delete service.scopes;
    const [connection] =
        await prisma.$queryRaw`SELECT uuid,address,port,proxy_url AS "proxyUrl" FROM nodes WHERE uuid=${N}::uuid`;
    const sentBeforeDiscovery = sends.length;
    const beforeDiscoveryMoney = await money();
    const discovery = service.withCompatibilitySnapshot([N], async () => {
        await service.syncNode(connection);
        const state = await service.scopes(undefined, N, false, { identities: false });
        assert(state.legacyInboundIds.has('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
    });
    await peerStarted;
    assert.equal(sends.length, sentBeforeDiscovery);
    releasePeer();
    await discovery;
    assert.equal(sends.length, sentBeforeDiscovery + 1);
    assert.deepEqual(sends.at(-1).protectedInbounds, []);
    assert.deepEqual(sends.at(-1).groups, {});
    assert.deepEqual(await money(), beforeDiscoveryMoney);
    console.log(
        'PASS real inventory/scopes SQL discovers shared native peer before custom policy; financial reservations unchanged',
    );
}
main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
