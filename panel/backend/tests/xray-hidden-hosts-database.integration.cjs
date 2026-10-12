// Real PostgreSQL authorization -> repository -> scoped credentials -> resolver -> Xray JSON.
// Network delivery is replaced; authorization and subscription generation use production code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { PrismaClient } = require('@prisma/client');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const { PrismaTxDriver } = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const constants = {
    ...load(path.join(__dirname, '../libs/contract/constants/hosts/internal-squads-mode.ts')),
    ...load(path.join(__dirname, '../libs/contract/constants/hosts/security-layers.ts')),
    ...load(path.join(__dirname, '../libs/contract/constants/users/status/status.constant.ts')),
    ...load(path.join(__dirname, '../libs/contract/constants/subscription-template/template-type/template-type.constant.ts')),
};
const flow = source('common/utils/flow/get-vless-flow.ts');
const common = {
    '@common/utils/host-identity': source('common/utils/host-identity.ts'),
    '@common/utils/flow': flow,
    '@common/utils/bounded-work-queue': source('common/utils/bounded-work-queue.ts'),
    '@common/utils/settle-concurrent': source('common/utils/settle-concurrent.ts'),
    './host-policy-scopes': source('common/host-policy/host-policy-scopes.ts'),
    './destination-rule': source('common/host-policy/destination-rule.ts'),
};
const { HostPolicyService } = source('common/host-policy/host-policy.service.ts', common);
const { HostAccessService } = source('common/host-policy/host-access.service.ts', common);
const { CustomCamelCasePlugin, JSON_COLUMNS } = source('common/database/camel-case.plugin.ts');
const { HostsRepository } = source('modules/hosts/repositories/hosts.repository.ts', {
    '@libs/contracts/constants': constants,
});
const { HostsEntity } = source('modules/hosts/entities/hosts.entity.ts', {
    '@contract/constants': constants,
});
const { HostWithRawInbound } = source('modules/hosts/entities/host-with-inbound-tag.entity.ts', {
    './hosts.entity': { HostsEntity },
});
const { ResolveProxyConfigService } = source('modules/subscription-template/resolve-proxy/resolve-proxy-config.service.ts', {
    '@libs/contracts/constants': constants,
    '@common/utils/flow': flow,
    '@common/utils/vless-route': source('common/utils/vless-route/set-vless-route-for-uuid.util.ts'),
    '@modules/hosts/utils/host-traffic-limit': source('modules/hosts/utils/host-traffic-limit.ts'),
    '@modules/subscription/utils/compose-status-hwid-remarks': source('modules/subscription/utils/compose-status-hwid-remarks.ts'),
    '@common/utils/templates/replace-templates-values': {
        TemplateEngine: { createUserValueMap: () => ({}), replace: text => text },
    },
    // The fixture uses TLS, without Reality or custom VLESS encryption.
    '@common/helpers/xray-config': {
        resolveInboundAndPublicKey: async () => new Map(),
        resolveInboundAndMlDsa65PublicKey: async () => new Map(),
        resolveEncryptionFromDecryption: async () => new Map(),
    },
    './utils': {
        ...source('modules/subscription-template/resolve-proxy/utils/override.util.ts'),
        ...source('modules/subscription-template/resolve-proxy/utils/to-non-empty-record.util.ts'),
    },
});
const { XrayJsonGeneratorService } = source('modules/subscription-template/generators/xray-json.generator.service.ts', {
    '../host-mapper': { applyHostMapper: outbound => outbound },
    '@common/utils': { isNonEmptyObject: value => value && Object.keys(value).length > 0 },
});
const recipient = '11111111-1111-4111-8111-111111111111';
const vk = '22222222-2222-4222-8222-222222222222';
const yc = '33333333-3333-4333-8333-333333333333';
const inboundUuid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const template = {
    outbounds: [{ tag: 'direct', protocol: 'freedom' }, { tag: 'block', protocol: 'blackhole' }],
    remnawave: { injectHosts: [{ selector: { type: 'uuids', values: [vk, yc] }, tagPrefix: 'g' }] },
    burstObservatory: { subjectSelector: ['g'] },
};

async function main() {
    const databaseUrl = process.env.XRAY_INJECTION_TEST_DATABASE_URL;
    assert(databaseUrl, 'Set XRAY_INJECTION_TEST_DATABASE_URL to an owned disposable PostgreSQL');
    const target = new URL(databaseUrl);
    assert(['127.0.0.1', 'localhost'].includes(target.hostname), 'Test database must be on loopback');
    assert(['/remnacust_xray_injection_test', '/remnacust_xray_injection_fresh'].includes(target.pathname) ||
        (target.port === '55439' && target.pathname === '/postgres'), 'Use the dedicated test database');
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const cls = new AsyncLocalStorage();
    const transactions = {
        get tx() { return cls.getStore() ?? prisma; },
        withTransaction: (options, fn) => prisma.$transaction(tx => cls.run(tx, fn), options),
    };
    const db = { kysely: new k.Kysely({
        dialect: {
            createDriver: () => new PrismaTxDriver(transactions),
            createAdapter: () => new k.PostgresAdapter(),
            createIntrospector: db => new k.PostgresIntrospector(db),
            createQueryCompiler: () => new k.PostgresQueryCompiler(),
        },
        plugins: [new CustomCamelCasePlugin({ excludeColumns: JSON_COLUMNS })],
    }) };
    const axios = {
        hostPolicy: async () => ({ isOk: true, response: { version: 'xera-host-policy-v2', applied: true } }),
        addUser: async () => ({ isOk: true, response: { success: true } }),
        deleteUser: async () => ({ isOk: true, response: { success: true, deviceRevocationSupported: true } }),
    };
    const policies = new HostPolicyService(db, axios, { get: async () => true },
        { getOrThrow: () => 'hidden-injection-fixture-secret' }, transactions);
    const access = new HostAccessService(db, policies, axios);
    const repository = new HostsRepository(transactions, db, {});
    const resolver = new ResolveProxyConfigService({ getOrThrow: () => 'subscriptions.example' }, access);
    const generator = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => structuredClone(template) });
    const rawInbound = {
        protocol: 'vless', tag: 'shared', settings: { clients: [], decryption: 'none' },
        streamSettings: { network: 'xhttp', security: 'tls',
            tlsSettings: { alpn: ['h2', 'http/1.1'], fingerprint: 'firefox' },
            xhttpSettings: { mode: 'packet-up', path: '/tunnel' } },
    };
    const settings = { isShowCustomRemarks: false, customRemarks: { emptyHosts: [] } };
    const execute = (sql, ...args) => prisma.$executeRawUnsafe(sql, ...args);
    const user = () => prisma.users.findUniqueOrThrow({ where: { id: 901n } });
    async function allowed(host, who, hwid = null, parent) {
        who ??= await user();
        parent ??= who.vlessUuid;
        const [row] = await prisma.$queryRawUnsafe(
            'SELECT xera_host_identity_allowed($1::bigint,$2::uuid,$3::text,$4::uuid) AS allowed',
            who.id, host, hwid, parent);
        return row.allowed;
    }
    async function render() {
        const rows = await repository.findActiveHostsByUserId(901n, false, true);
        const hosts = rows.map(row => Object.assign(new HostWithRawInbound({
            ...row, alwaysAvailable: row.alwaysAvailable && row.eligibleAlwaysAvailable,
            rawInbound, inboundTag: 'shared', mapper: {},
            xrayJsonTemplate: row.uuid === recipient ? structuredClone(template) : null,
        }), {
            usedBytes: row.usedBytes, trafficPaused: Boolean(row.trafficPaused),
            effectiveLimitBytes: BigInt(row.effectiveLimitBytes),
        }));
        const resolved = await resolver.resolveProxyConfig({ hosts, user: await user(), subscriptionSettings: settings });
        const configs = JSON.parse(await generator.generateConfig({ hosts: resolved, isExtendedClient: false }));
        assert.equal(configs.length, 1, 'Hidden sources must not create standalone profiles');
        return configs[0];
    }
    let seeded = false;
    try {
        const [existing] = await prisma.$queryRawUnsafe(
            'SELECT count(*)::int AS count FROM users WHERE id IN (901,902)');
        assert.equal(existing.count, 0, 'Fixture IDs are already in use');
        const seed = fs.readFileSync(path.join(__dirname, 'fixtures/host-policy-seed.sql'), 'utf8').replace('BEGIN;', '');
        seeded = true;
        for (const statement of seed.split(';').filter(s => s.trim())) await execute(statement);
        await execute('UPDATE config_profile_inbounds SET raw_inbound=$1::jsonb WHERE uuid=$2::uuid', JSON.stringify(rawInbound), inboundUuid);
        await execute('UPDATE hosts SET user_traffic_limit_bytes=1000 WHERE uuid=$1::uuid', recipient);
        await execute("UPDATE hosts SET is_hidden=true,always_available=false,only_when_inactive=false,remark='LTE-VKCDN',address='vkcdn.example' WHERE uuid=$1::uuid", vk);
        await execute(`INSERT INTO hosts(uuid,remark,address,port,config_profile_uuid,config_profile_inbound_uuid,is_hidden,internal_squads_mode)
            SELECT $1::uuid,'LTE-YCCDN','yccdn.example',443,config_profile_uuid,config_profile_inbound_uuid,true,'ALLOW_ONLY'
            FROM hosts WHERE uuid=$2::uuid`, yc, vk);
        await execute(`INSERT INTO internal_squad_host_links(host_uuid,squad_uuid)
            SELECT $1::uuid,squad_uuid FROM internal_squad_host_links WHERE host_uuid=$2::uuid`, yc, vk);
        assert((await policies.scopes()).protectedInboundIds.has(inboundUuid), 'Fixture must exercise protected access');
        const config = await render();
        assert.deepEqual(config.outbounds.map(o => o.tag), ['g', 'g-2', 'direct', 'block'],
            'Both hidden sources must survive real database authorization and injection');
        assert.deepEqual(config.outbounds.slice(0, 2).map(o => o.settings.vnext[0].address), ['vkcdn.example', 'yccdn.example']);
        assert(config.outbounds.slice(0, 2).every(o => o.streamSettings.network === 'xhttp' && o.streamSettings.security === 'tls'));
        const keys = config.outbounds.slice(0, 2).map(o => o.settings.vnext[0].users[0].id);
        assert.equal(new Set(keys).size, 2);
        assert(keys.every(key => key !== 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 'Never fall back to unrestricted credentials');
        assert.equal(config.remnawave, undefined);
        assert.deepEqual(config.burstObservatory.subjectSelector, ['g']);
        assert.deepEqual((await repository.findActiveHostsByUserId(901n)).map(h => h.uuid), [recipient],
            'Ordinary subscriptions must still omit hidden hosts');
        assert.deepEqual((await render()).outbounds.slice(0, 2).map(o => o.settings.vnext[0].users[0].id), keys,
            'Offline node and repeated refresh must preserve scoped outbounds');

        await execute('UPDATE hosts SET is_disabled=true WHERE uuid=$1::uuid', vk);
        assert.equal(await allowed(vk), false);
        assert.deepEqual((await render()).outbounds.map(o => o.tag), ['g', 'direct', 'block']);
        await execute('UPDATE hosts SET is_disabled=false WHERE uuid=$1::uuid', vk);
        const outside = await prisma.users.findUniqueOrThrow({ where: { id: 902n } });
        assert.equal(await allowed(vk, outside), false, 'Inbound access alone cannot bypass host squad links');
        await execute('DELETE FROM internal_squad_host_links WHERE host_uuid=$1::uuid', yc);
        assert.equal(await allowed(yc), false);
        assert.deepEqual((await render()).outbounds.map(o => o.tag), ['g', 'direct', 'block']);
        await execute("UPDATE hosts SET internal_squads_mode='EXCLUDE' WHERE uuid=$1::uuid", yc);
        assert.equal(await allowed(yc), true, 'EXCLUDE must retain its original semantics');
        await execute("INSERT INTO internal_squad_host_links(host_uuid,squad_uuid) VALUES ($1::uuid,'11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa')", yc);
        assert.equal(await allowed(yc), false);
        await execute("UPDATE hosts SET internal_squads_mode='ALLOW_ONLY' WHERE uuid=$1::uuid", yc);

        const original = await user();
        await execute('UPDATE users SET vless_uuid=$1::uuid WHERE id=901', 'ffffffff-ffff-4fff-8fff-ffffffffffff');
        assert.equal(await allowed(vk, original), false, 'Old subscription parent must remain invalid after rotation');
        assert.equal(await allowed(vk), true);
        await execute('UPDATE users SET vless_uuid=$1::uuid WHERE id=901', original.vlessUuid);
        await execute("INSERT INTO hwid_user_devices(user_id,hwid,blocked) VALUES (901,'hidden-injection-device',true)");
        assert.equal(await allowed(vk), false, 'Legacy credentials cannot bypass a blocked HWID');
        assert.equal(await allowed(vk, await user(), 'hidden-injection-device'), false);
        await execute("UPDATE hwid_user_devices SET blocked=false WHERE user_id=901");
        assert.equal(await allowed(vk, await user(), 'hidden-injection-device'), true);
        assert.equal(await allowed(vk, await user(), 'unknown-device'), false);
        await execute('DELETE FROM hwid_user_devices WHERE user_id=901');
        await execute('INSERT INTO xera_hwid_registration_policy(user_id,registration_allowed) VALUES (901,false)');
        assert.equal(await allowed(vk), false, 'Deny-new-device policy must remain enforced');
        await execute('DELETE FROM xera_hwid_registration_policy WHERE user_id=901');

        await execute("UPDATE users SET status='EXPIRED',expire_at=now()-interval '1 day' WHERE id=901");
        assert.equal(await allowed(vk), false);
        await execute('UPDATE hosts SET always_available=true WHERE uuid=$1::uuid', vk);
        assert.equal(await allowed(vk), true, 'Explicitly free hidden source may serve an inactive user');
        const [available] = await prisma.$queryRawUnsafe('SELECT era_host_available(901,$1::uuid) AS allowed', inboundUuid);
        assert.equal(available.allowed, true, 'Hidden free host must count toward inbound availability');
        assert.equal((await repository.findActiveHostsByUserId(901n, false, true)).find(h => h.uuid === vk).eligibleAlwaysAvailable, true);
        await execute('UPDATE hosts SET is_disabled=true WHERE uuid=$1::uuid', vk);
        assert.equal(await allowed(vk), false);
        const [disabled] = await prisma.$queryRawUnsafe('SELECT era_host_available(901,$1::uuid) AS allowed', inboundUuid);
        assert.equal(disabled.allowed, false);
        await execute('UPDATE hosts SET is_disabled=false,always_available=true,only_when_inactive=true WHERE uuid=$1::uuid', vk);
        await execute("UPDATE users SET status='ACTIVE',expire_at=now()+interval '1 day' WHERE id=901");
        assert.equal(await allowed(vk), false, 'Inactive-only host is still forbidden for active subscriptions');
        await execute('UPDATE hosts SET always_available=false,only_when_inactive=false,user_traffic_limit_bytes=100 WHERE uuid=$1::uuid', vk);
        await execute('INSERT INTO xera_host_quota_usage(user_id,host_uuid,node_id,total_bytes) VALUES (901,$1::uuid,901,100)', vk);
        assert.deepEqual((await render()).outbounds.slice(0, 1).map(o => o.settings.vnext[0].address), ['yccdn.example'],
            'Exhausted hidden host must still be removed by the quota filter');
        console.log('PASS hidden VK/YCCDN injection: real SQL/repository/scoped credentials/resolver/JSON, visibility, offline node, disabled host, squads, EXCLUDE, rotated parent, HWID, registration, expiry, free sources, quota');
    } finally {
        await Promise.all([...access.preparing.values()]);
        if (seeded) {
            await execute('DELETE FROM users WHERE id IN (901,902)');
            await execute('DELETE FROM hosts WHERE uuid IN ($1::uuid,$2::uuid,$3::uuid)', recipient, vk, yc);
            await execute('DELETE FROM nodes WHERE id=901');
            await execute("DELETE FROM internal_squads WHERE uuid IN ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa')");
            await execute("DELETE FROM config_profiles WHERE uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'");
        }
        await prisma.$disconnect();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
