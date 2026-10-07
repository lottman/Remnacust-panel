// Run only against the dedicated disposable PostgreSQL on loopback port 55439.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { PrismaClient } = require('@prisma/client');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const {
    PrismaTxDriver,
} = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const scopes = load(path.join(__dirname, '../src/common/host-policy/host-policy-scopes.ts'));
const identity = load(path.join(__dirname, '../src/common/utils/host-identity.ts'));
const common = {
    '@common/database': {},
        '@common/axios': {},
        '@common/utils/bounded-work-queue': load(path.join(__dirname, '../src/common/utils/bounded-work-queue.ts')),
    '@common/raw-cache': {},
    '@common/config/app-config': {},
    '@common/config/app-config/typed-config.service': {},
    '@common/utils/host-identity': identity,
    './host-policy-scopes': scopes,
    './destination-rule': load(
        path.join(__dirname, '../src/common/host-policy/destination-rule.ts'),
    ),
};
const { HostPolicyService } = load(
    path.join(__dirname, '../src/common/host-policy/host-policy.service.ts'),
    common,
);
const { HostUsageService } = load(
    path.join(__dirname, '../src/common/host-policy/host-usage.service.ts'),
    common,
);
const { HostTagLimitsRepository } = load(
    path.join(__dirname, '../src/modules/hosts/repositories/host-tag-limits.repository.ts'),
    common,
);
const { HostAccessService } = load(
    path.join(__dirname, '../src/common/host-policy/host-access.service.ts'),
    {
        ...common,
        '@common/utils/flow': { getVlessFlow: () => '' },
        '@common/utils/settle-concurrent': load(
            path.join(__dirname, '../src/common/utils/settle-concurrent.ts'),
        ),
        '@common/helpers/xray-config/ss-cipher': {},
        '@modules/users/entities/user.entity': {},
        './host-policy.service': { HostPolicyService },
    },
);
const { CustomCamelCasePlugin, JSON_COLUMNS } = load(
    path.join(__dirname, '../src/common/database/camel-case.plugin.ts'),
);
async function main() {
    const prisma = new PrismaClient({
        datasourceUrl: process.env.HOST_POLICY_TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55439/postgres',
    });
    const cls = new AsyncLocalStorage();
    const transactions = {
        get tx() {
            return cls.getStore() ?? prisma;
        },
        withTransaction: async (options, fn) =>
            prisma.$transaction((tx) => cls.run(tx, fn), options),
    };
    const db = {
        kysely: new k.Kysely({
            dialect: {
                createDriver: () => new PrismaTxDriver(transactions),
                createAdapter: () => new k.PostgresAdapter(),
                createIntrospector: (db) => new k.PostgresIntrospector(db),
                createQueryCompiler: () => new k.PostgresQueryCompiler(),
            },
            plugins: [new CustomCamelCasePlugin({ excludeColumns: JSON_COLUMNS })],
        }),
    };
    const pending = {};
    let failAck = false;
    const cache = {
        get: async () => true,
        hsetJson: async (key, id, batch) => {
            (pending[key] ??= {})[id] = batch;
        },
        hgetallParsed: async (key) => pending[key] ?? {},
        createPipeline: () => {
            let remove;
            return {
                hdel: (key, id) => {
                    remove = () => delete pending[key][id];
                },
                exec: async () => {
                    if (failAck) return [[new Error('connection lost')]];
                    remove();
                    return [[null, 1]];
                },
            };
        },
    };
    const calls = [];
    const axios = {
        hostPolicy: async (node, policy) => {
            calls.push({ node, policy });
            return { isOk: true, response: { version: 'xera-host-policy-v2', applied: true } };
        },
        addUser: async () => ({ isOk: true, response: { success: true } }),
        deleteUser: async () => ({
            isOk: true,
            response: { success: true, deviceRevocationSupported: true },
        }),
    };
    try {
        await prisma.$executeRawUnsafe(
            'CREATE TABLE IF NOT EXISTS xera_host_usage_receipts(id UUID PRIMARY KEY,node_id BIGINT REFERENCES nodes(id) ON DELETE CASCADE,created_at TIMESTAMPTZ DEFAULT now())',
        );
        const seed = fs
            .readFileSync(
                path.join(__dirname, 'fixtures/host-policy-seed.sql'),
                'utf8',
            )
            .split('DO $$ BEGIN')[0]
            .replace('BEGIN;', '');
        for (const statement of seed.split(';').filter((s) => s.trim()))
            await prisma.$executeRawUnsafe(statement);
        await prisma.$executeRawUnsafe('UPDATE nodes SET is_connected=true WHERE id=901');
        const service = new HostPolicyService(
            db,
            axios,
            cache,
            { getOrThrow: () => 'test-secret' },
            transactions,
        );
        let state = await service.scopes();
        assert.equal(state.hosts.length, 2);
        assert(state.protectedInboundIds.has('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
        const access = new HostAccessService(db, service, axios);
        const user = { id: 901n, vlessUuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
        const keys = await access.prepare(user, [
            {
                uuid: '11111111-1111-4111-8111-111111111111',
                configProfileInboundUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            },
        ]);
        assert(keys.get('11111111-1111-4111-8111-111111111111').vlessUuid !== user.vlessUuid);
        await Promise.all([...access.preparing.values()]);
        const config = await access.configIdentities('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        assert.equal(config.length, 1);
        assert(config[0].id.includes('~h'));
        assert(
            calls.at(-1).policy.hosts['11111111111141118111111111111111'].allowedIdentities[
                config[0].id
            ],
        );
        const usage = new HostUsageService(db, cache, transactions);
        failAck = true;
        await assert.rejects(
            usage.record(901n, [{ username: config[0].id, uplink: 100, downlink: 200 }]),
        );
        failAck = false;
        await usage.record(901n, []);
        const totals = await prisma.$queryRawUnsafe(
            'SELECT sum(total_bytes)::text AS bytes FROM xera_host_quota_usage',
        );
        assert.equal(totals[0].bytes, '300', 'replay must not double charge');
        const tags = new HostTagLimitsRepository(db, transactions);
        await tags.set('alpha', 2000n, 0, 'DAYS', 2, 20, 3);
        await tags.set('beta', 0n, 0, 'DAYS', null, null, 1);
        await prisma.$executeRawUnsafe(
            "INSERT INTO xera_legacy_tag_quota_usage(tag,user_id,node_id,created_at,total_bytes) VALUES ('alpha',901,901,current_date,400)",
        );
        await prisma.$executeRawUnsafe(
            "UPDATE hosts SET user_traffic_limit_bytes=500,traffic_multiplier=2,total_speed_limit_mbps=20 WHERE uuid='11111111-1111-4111-8111-111111111111'",
        );
        await prisma.$executeRawUnsafe(
            "INSERT INTO xera_host_quota_usage(user_id,host_uuid,node_id,created_at,total_bytes) VALUES (901,'22222222-2222-4222-8222-222222222222',901,current_date,100),(902,'22222222-2222-4222-8222-222222222222',901,current_date,10000)",
        );
        const groupUsage = await tags.usageForUser(901n);
        assert.equal(
            groupUsage.find((g) => g.tag === 'alpha').usedBytes,
            2100n,
            'legacy and attributed traffic must share the group budget',
        );
        assert.equal(
            groupUsage.find((g) => g.tag === 'beta').usedBytes,
            600n,
            'overlapping group only contains its own history',
        );
        await service.syncNode({
            uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            address: '127.0.0.1',
            port: 2222,
        });
        const policy = calls.at(-1).policy;
        assert.equal(policy.groups['tag:alpha'].blockAll, false);
        assert.equal(policy.groups['tag:alpha'].blockedOwners['901'], true);
        assert.equal(policy.groups['tag:alpha'].bytesPerSecond, 0);
        assert.equal(
            policy.groups['tag-host:alpha:11111111-1111-4111-8111-111111111111'].bytesPerSecond,
            250000,
        );
        assert.equal(
            policy.groups['tag-host:alpha:22222222-2222-4222-8222-222222222222'].bytesPerSecond,
            250000,
        );
        assert.equal(policy.groups['tag:beta'].blockAll, false);
        assert.equal(
            policy.groups['host:11111111-1111-4111-8111-111111111111'].blockedOwners['901'],
            true,
        );
        assert.equal(policy.groups['host:11111111-1111-4111-8111-111111111111'].blockAll, false);
        assert.equal(
            policy.groups['host:11111111-1111-4111-8111-111111111111'].totalBytesPerSecond,
            2500000,
        );
        await tags.set('alpha', 2000n, 0, 'DAYS', 2, 20, 0.5);
        await prisma.$executeRawUnsafe(
            "UPDATE hosts SET traffic_multiplier=1.25 WHERE uuid='11111111-1111-4111-8111-111111111111'",
        );
        const fractional = await tags.usageForUser(901n);
        assert.equal(fractional.find((g) => g.tag === 'alpha').usedBytes, 625n);
        const rawAfter = await prisma.$queryRawUnsafe(
            'SELECT sum(total_bytes)::text AS bytes FROM xera_host_quota_usage WHERE user_id=901',
        );
        assert.equal(
            rawAfter[0].bytes,
            '400',
            'quota factors must never rewrite raw traffic or compound',
        );
        await service.syncNode({
            uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            address: '127.0.0.1',
            port: 2222,
        });
        assert.deepEqual(calls.at(-1).policy.groups['tag:alpha'].blockedOwners, { 902: true });
        await prisma.$executeRawUnsafe(
            "UPDATE hosts SET use_tag_traffic_limit=false,use_tag_speed_limit=false WHERE uuid='11111111-1111-4111-8111-111111111111'",
        );
        const optedOut = await tags.usageForUser(901n);
        assert.equal(
            optedOut.find((g) => g.tag === 'alpha').usedBytes,
            250n,
            'excluded host no longer contributes to shared quota; legacy history remains',
        );
        assert.equal(optedOut.find((g) => g.tag === 'beta').usedBytes, 0n);
        await service.syncNode({ uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
        const isolated = calls.at(-1).policy.hosts['11111111111141118111111111111111'];
        assert(!isolated.groups.includes('tag:alpha'));
        assert(!isolated.groups.some((g) => g.startsWith('tag-host:')));
        assert(isolated.groups.includes('tag-total:alpha'));
        const own = await prisma.$queryRawUnsafe(
            "SELECT * FROM xera_limit_state('HOST','11111111-1111-4111-8111-111111111111',901)",
        );
        assert.equal(own[0].used_bytes, 375n, 'own quota and multiplier survive tag opt-out');
        await prisma.$executeRawUnsafe('UPDATE hosts SET use_tag_traffic_limit=false');
        const entitled = await prisma.$queryRawUnsafe(
            "SELECT xera_limit_entitled('TAG','alpha',901) AS allowed",
        );
        assert.equal(
            entitled[0].allowed,
            false,
            'quota actions exclude users without participating hosts',
        );
        await service.syncNode({ uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
        assert(
            !calls.at(-1).policy.groups['tag:alpha'],
            'empty quota membership produces no SQL IN () or accidental group block',
        );
        await prisma.$executeRawUnsafe(
            'UPDATE hosts SET use_tag_traffic_limit=true,use_tag_speed_limit=true',
        );
        assert.equal(
            (await tags.usageForUser(901n)).find((g) => g.tag === 'alpha').usedBytes,
            625n,
            'reenabling recomputes the period without erasing raw usage',
        );
        const removed = await prisma.$queryRawUnsafe(
            "SELECT column_name FROM information_schema.columns WHERE table_name IN ('hosts','xera_host_tag_limits') AND column_name='total_traffic_limit_bytes'",
        );
        assert.equal(removed.length, 0, 'aggregate volume quota must not remain in the data model');
        await prisma.$executeRawUnsafe("UPDATE users SET status='EXPIRED' WHERE id=901");
        assert.equal(await access.synchronizeUser(901n), true);
        assert.deepEqual(
            calls.at(-1).policy.hosts['11111111111141118111111111111111'].allowedIdentities,
            {},
        );
        assert.equal(
            (await access.configIdentities('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).length,
            0,
        );
        assert.equal(
            (
                await access.prepare(user, [
                    {
                        uuid: '11111111-1111-4111-8111-111111111111',
                        configProfileInboundUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    },
                ])
            ).get('11111111-1111-4111-8111-111111111111'),
            null,
        );
        console.log(
            'PASS: actual Prisma/Kysely transactions, SQL, scoped credentials, restart, revocation, usage replay, overlapping groups, per-host tag speeds, weighted user quotas, host overrides and preserved history',
        );
    } finally {
        await prisma.$executeRawUnsafe('DELETE FROM xera_host_usage_receipts WHERE node_id=901');
        await prisma.$executeRawUnsafe('DELETE FROM users WHERE id IN(901,902)');
        await prisma.$executeRawUnsafe('DELETE FROM hosts');
        await prisma.$executeRawUnsafe('DELETE FROM nodes WHERE id=901');
        await prisma.$executeRawUnsafe('DELETE FROM internal_squads');
        await prisma.$executeRawUnsafe('DELETE FROM config_profiles');
        await prisma.$executeRawUnsafe(
            "DELETE FROM xera_host_tag_limits WHERE tag IN ('alpha','beta')",
        );
        await prisma.$disconnect();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
