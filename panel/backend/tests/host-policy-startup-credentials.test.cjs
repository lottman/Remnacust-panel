require('reflect-metadata');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash } = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const { autoselectRouteUuid } = load(
    path.join(__dirname, '../src/common/host-policy/autoselect-route-policy.ts'),
);

const root = path.join(__dirname, '../src');
const targetUuid = '11111111-1111-4111-8111-111111111111';
const peerUuid = '22222222-2222-4222-8222-222222222222';
const inboundUuid = '33333333-3333-4333-8333-333333333333';
const hostUuid = '44444444-4444-4444-8444-444444444444';
const profileUuid = '55555555-5555-4555-8555-555555555555';
const unknownUuid = '66666666-6666-4666-8666-666666666666';
const parentUuid = '77777777-7777-4777-8777-777777777777';
const version = 'xera-host-policy-v2';
const ok = (response) => ({ isOk: true, response });
const capabilities = {
    version,
    supported: true,
    routedDeviceSpeedLimitsSupported: true,
    deviceSpeedLimitsSupported: true,
    destinationRulesSupported: true,
    policyRevisionsSupported: true,
    policyRevision: '0',
};
const quiet = { log() {}, debug() {}, warn() {}, error() {} };
const { HostPolicyService } = load(path.join(root, 'common/host-policy/host-policy.service.ts'), {
    '@common/database': {},
    '@common/axios': {},
    '@common/raw-cache': {},
    '@common/config/app-config/typed-config.service': {},
    '@common/utils/host-identity': load(path.join(root, 'common/utils/host-identity.ts')),
});
const { HostAccessService } = source('common/host-policy/host-access.service.ts', {
    './autoselect-route-policy': { autoselectRouteUuid },
    '@common/utils/bounded-work-queue': load(path.join(root, 'common/utils/bounded-work-queue.ts')),
    './identity-access-query': load(path.join(root, 'common/host-policy/identity-access-query.ts')),
});
const { UsersRepository } = source('modules/users/repositories/users.repository.ts', {
    '@common/host-policy/inbound-access-query': load(
        path.join(root, 'common/host-policy/inbound-access-query.ts'),
    ),
    '@common/helpers/kysely': { getKyselyUuid: (value) => k.sql`${value}::uuid` },
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
});
const { XRayConfig } = load(
    path.join(root, 'common/helpers/xray-config/xray-config.validator.ts'),
    {
        '@common/utils/certs': {
            readPemLines: () => assert.fail('No certificate file access in this fixture'),
        },
        '@common/utils/flow/get-vless-flow': load(
            path.join(root, 'common/utils/flow/get-vless-flow.ts'),
        ),
    },
);
const { GetConfigProfileByUuidQuery } = load(
    path.join(
        root,
        'modules/config-profiles/queries/get-config-profile-by-uuid/get-config-profile-by-uuid.query.ts',
    ),
);
const { GetSnippetsQuery } = load(
    path.join(root, 'modules/config-profiles/queries/get-snippets/get-snippets.query.ts'),
);
const { GetPreparedConfigWithUsersQuery } = load(
    path.join(
        root,
        'modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.query.ts',
    ),
);
const { GetPreparedConfigWithUsersHandler } = load(
    path.join(
        root,
        'modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.handler.ts',
    ),
    {
        '@common/helpers/xray-config/xray-config.validator': { XRayConfig },
        '@common/host-policy/host-access.service': { HostAccessService },
        '@common/types': { ok, fail: (error) => ({ isOk: false, ...error }) },
        '@libs/contracts/constants': { ERRORS: { INTERNAL_SERVER_ERROR: { code: 'A001' } } },
        '@modules/config-profiles/queries/get-config-profile-by-uuid': {
            GetConfigProfileByUuidQuery,
        },
        '@modules/config-profiles/queries/get-snippets': { GetSnippetsQuery },
        '@modules/hwid-user-devices/device-access.service': {},
        '@modules/users/repositories/users.repository': { UsersRepository },
    },
);

function capabilityKey(node) {
    return (
        `xera:host-policy:capabilities:v2:${node.uuid}:` +
        createHash('sha256')
            .update(JSON.stringify([node.address, node.port, node.proxyUrl]))
            .digest('hex')
    );
}

async function fixture(t, options = {}) {
    const context = new AsyncLocalStorage();
    const calls = [],
        posts = [],
        probes = [],
        values = new Map();
    const target = {
        uuid: targetUuid,
        address: 'target.invalid',
        port: 2222,
        proxyUrl: null,
        inbounds: [inboundUuid],
    };
    const peer = { ...target, uuid: peerUuid, address: 'peer.invalid' };
    const inventory = [target, peer];
    if (options.liveNative || options.freshModern)
        inventory.push({ ...peer, uuid: unknownUuid, address: 'unknown.invalid' });
    const host = {
        uuid: hostUuid,
        inboundUuid,
        inboundTag: 'vless',
        profileUuid,
        tags: [],
        nodes: [],
        boundNodes: inventory.map((node) => node.uuid),
        issued: true,
        managed: false,
        userLimit: null,
        userSpeed: 0,
        deviceSpeed: 0,
        totalSpeed: 0,
        trafficMultiplier: 1,
        alwaysAvailable: false,
        onlyWhenInactive: false,
        domains: null,
        anchor: new Date(0),
        resetValue: 0,
        resetUnit: 'DAYS',
    };
    const related = {
        ...host,
        uuid: '88888888-8888-4888-8888-888888888888',
        inboundUuid: '99999999-9999-4999-8999-999999999999',
        inboundTag: 'remote',
        boundNodes: [peerUuid],
        ...options.related,
    };
    const owner = options.outboundAlias ? host : related;
    const sourceHost = options.outboundAlias ? related : host;
    const route = {
        uuid: autoselectRouteUuid(owner.uuid, sourceHost.uuid),
        ownerUuid: owner.uuid,
        sourceUuid: sourceHost.uuid,
    };
    const hosts = options.alias ? [host, related] : [host];
    const routes = options.alias ? [route] : [];
    const user = {
        id: 1n,
        status: 'ACTIVE',
        expireAt: new Date('2099-01-01'),
        vlessUuid: parentUuid,
        trojanPassword: 'synthetic-parent-password',
        ssPassword: 'synthetic-parent-ss',
    };
    Object.defineProperty(user, 'hostIdentityContext', {
        value: { hwid: null, parentVlessUuid: parentUuid, preview: true },
    });
    const identity = {
        userId: '1',
        hostUuid,
        allowed: true,
        profileUuid,
        inboundTag: 'vless',
        hwid: null,
        parent: parentUuid,
        expireAt: user.expireAt,
    };
    const identities =
        options.alias && !options.outboundAlias
            ? [identity, { ...identity, hostUuid: route.uuid, quotaHostUuid: owner.uuid }]
            : [identity];
    let revision = 0;
    const client = {
        query: async (sql, parameters) => {
            calls.push({ sql, parameters });
            let rows;
            if (sql.includes('FROM nodes n LEFT JOIN config_profile_inbounds_to_nodes b'))
                rows = inventory;
            else if (sql.includes('pg_try_advisory_xact_lock')) rows = [{ acquired: true }];
            else if (sql.includes('xera_next_host_policy_revision'))
                rows = [{ revision: String(++revision) }];
            else if (sql.includes('FROM hosts h LEFT JOIN config_profile_inbounds')) rows = hosts;
            else if (sql.includes('FROM xera_autoselect_routes WHERE source_host_uuid'))
                rows = routes;
            else if (sql.includes('SELECT DISTINCT n.uuid,n.address,n.port,n.proxy_url'))
                rows = inventory;
            else if (sql.startsWith('WITH requested AS MATERIALIZED'))
                rows = [{ hostUuid, allowed: true }];
            else if (sql.startsWith('SELECT a.*')) rows = identities;
            else if (sql.startsWith('SELECT a."hostUuid"')) rows = [{ hostUuid, allowed: true }];
            else if (
                options.relatedAdjustment &&
                sql.includes('FROM xera_limit_user_adjustments') &&
                parameters.some(
                    (value) => Array.isArray(value) && value.includes(`host:${related.uuid}`),
                )
            )
                rows = [{ scope: `host:${related.uuid}`, userId: '1' }];
            else if (sql.startsWith('select "users"."id"'))
                rows = [
                    {
                        id: 1n,
                        vless_uuid: parentUuid,
                        trojan_password: user.trojanPassword,
                        ss_password: user.ssPassword,
                        tags: ['vless'],
                    },
                ];
            else if (
                [
                    'xera_quota_node_modes',
                    'xera_host_tag_limits',
                    'xera_autoselect_routes WHERE source_host_uuid',
                    'xera_limit_scopes',
                    'xera_limit_user_adjustments',
                ].some((table) => sql.includes(table))
            )
                rows = [];
            else assert.fail('Unexpected fixture SQL: ' + sql.slice(0, 200));
            return { command: 'SELECT', rowCount: rows.length, rows };
        },
        release() {},
    };
    const db = new k.Kysely({
        dialect: new k.PostgresDialect({
            pool: { connect: async () => client, end: async () => {} },
        }),
    });
    t.after(() => db.destroy());
    if (options.staleNative || options.freshModern || (options.liveNative && options.warm))
        values.set(capabilityKey(peer), {
            native: true,
            supported: false,
            checkedAt: Date.now() - 60001,
        });
    if (options.staleRouted)
        values.set(capabilityKey(peer), {
            ...capabilities,
            routedDeviceSpeedLimitsSupported: false,
            checkedAt: Date.now() - 60001,
        });
    if (options.warm) values.set(capabilityKey(target), { ...capabilities, checkedAt: Date.now() });
    const axios = {
        getNodeHealth: async (node) => {
            assert(!context.getStore(), 'No capability RPC inside the policy transaction');
            probes.push({ kind: 'health', uuid: node.uuid });
            if (
                node.uuid !== targetUuid &&
                !(node.uuid === peerUuid && (options.liveNative || options.freshModern))
            )
                return { isOk: false, code: 'ECONNRESET' };
            return ok({
                isAlive: true,
                nodeVersion:
                    node.uuid === peerUuid && options.liveNative ? '3.4.3' : '1.1.38-remnacust',
            });
        },
        hostPolicy: async (node, body) => {
            assert(!context.getStore(), 'No policy RPC inside the policy transaction');
            if (body) {
                assert.equal(node.uuid, targetUuid);
                posts.push(body);
                return ok({ version, staged: true, applied: false });
            }
            probes.push({ kind: 'capabilities', uuid: node.uuid });
            return node.uuid === targetUuid || (node.uuid === peerUuid && options.freshModern)
                ? ok(capabilities)
                : { isOk: false, code: 'ECONNRESET' };
        },
    };
    const policies = new HostPolicyService(
        { kysely: db },
        axios,
        {
            get: async (key) => values.get(key) ?? null,
            set: async (key, value) => values.set(key, value),
            del: async (key) => values.delete(key),
        },
        { getOrThrow: () => 'synthetic-startup-credentials-secret' },
        {
            isTransactionActive: () => !!context.getStore(),
            withTransaction: (_options, work) => context.run(true, work),
        },
    );
    policies.logger = quiet;
    const access = new HostAccessService({ kysely: db }, policies, axios);
    access.logger = quiet;
    const repository = new UsersRepository(
        {},
        { kysely: db.withPlugin(new k.CamelCasePlugin()) },
        {},
    );
    repository.logger = quiet;
    const handler = new GetPreparedConfigWithUsersHandler(
        repository,
        {
            execute: async (query) => {
                if (query instanceof GetConfigProfileByUuidQuery)
                    return ok({
                        config: {
                            inbounds: [
                                {
                                    tag: 'vless',
                                    listen: '127.0.0.1',
                                    port: 12345,
                                    protocol: 'vless',
                                    settings: { clients: [], decryption: 'none' },
                                },
                            ],
                            outbounds: [{ tag: 'direct', protocol: 'freedom' }],
                        },
                    });
                assert(query instanceof GetSnippetsQuery);
                return ok([]);
            },
        },
        access,
        { enabled: false },
    );
    handler.logger = quiet;
    if (options.warm) {
        const warm = await access.legacyInbounds();
        assert.equal(
            warm.has(inboundUuid),
            !!(options.staleNative || options.freshModern || options.liveNative),
        );
    }
    return {
        policies,
        access,
        handler,
        target,
        user,
        calls,
        posts,
        probes,
        values,
        peer,
        route,
        owner,
    };
}

async function observe(f) {
    let startup;
    await f.policies.withCompatibilitySnapshot(
        [targetUuid],
        async () => {
            const legacy = (await f.access.legacyInbounds()).has(inboundUuid);
            const routed = f.policies.compatibility.getStore().routed.has(inboundUuid);
            await f.policies.syncNode(f.target);
            const identities = await f.access.configIdentities(profileUuid);
            const prepared = await f.handler.execute(
                new GetPreparedConfigWithUsersQuery(profileUuid, [
                    { uuid: inboundUuid, tag: 'vless', protocol: 'vless' },
                ]),
            );
            assert.equal(prepared.isOk, true, prepared.message);
            startup = { legacy, routed, identities, prepared: prepared.response };
        },
        false,
        'configuration',
    );
    const legacy = (await f.access.legacyInbounds()).has(inboundUuid);
    const overrides = await f.access.prepare(f.user, [
        { uuid: hostUuid, configProfileInboundUuid: inboundUuid },
    ]);
    assert.notEqual(overrides.get(hostUuid), null);
    return { startup, legacy, overrides, selected: overrides.get(hostUuid) ?? f.user };
}

function assertCredentials(f, result, legacy, routed = legacy) {
    assert.equal(
        result.startup.legacy,
        legacy,
        'startup classification matches the subscription credential family',
    );
    assert.equal(result.legacy, legacy, 'global classification retains the same credential family');
    assert.equal(result.startup.routed, routed);
    assert.equal(f.posts.length, 1);
    const body = f.posts[0];
    assert.equal(body.protectedInbounds.includes('vless'), !legacy);
    const clients = result.startup.prepared.config.inbounds.find(
        (inbound) => inbound.tag === 'vless',
    ).settings.clients;
    assert(
        clients.some((client) => client.id === result.selected.vlessUuid),
        'the subscribed credential is present in the actual rendered user list',
    );
    const bulk = f.calls.filter((call) => call.sql.startsWith('select "users"."id"'));
    assert.equal(bulk.length, 1, 'actual getUsersForConfigStream executed once');
    assert.equal(
        bulk[0].sql.includes('c.inbound_uuid NOT IN'),
        legacy,
        'bulk authorization receives the snapshot legacy set',
    );
    if (legacy) {
        assert.equal(result.overrides.has(hostUuid), false);
        assert.equal(result.selected.vlessUuid, parentUuid);
        assert.equal(result.startup.identities.length, 0);
    } else {
        assert(result.overrides.has(hostUuid));
        assert.notEqual(result.selected.vlessUuid, parentUuid);
        assert.equal(result.startup.identities.length, 1);
        const scoped = result.startup.identities[0];
        assert.equal(scoped.vlessUuid, result.selected.vlessUuid);
        assert.equal(body.hosts[hostUuid.replaceAll('-', '')].allowedIdentities[scoped.id], true);
        assert(
            clients.some((client) => client.id === scoped.vlessUuid && client.email === scoped.id),
        );
    }
}

for (const warm of [false, true]) {
    const cache = warm ? 'warmed' : 'cold';
    test(`${cache} legacy inventory: failed peer retains last-known native credentials consistently`, async (t) => {
        const f = await fixture(t, { warm, staleNative: true });
        const original = structuredClone(f.values.get(capabilityKey(f.peer)));
        assertCredentials(f, await observe(f), true);
        assert.deepEqual(
            f.values.get(capabilityKey(f.peer)),
            original,
            'offline legacy proof is retained',
        );
        await assert.rejects(
            f.policies.withCompatibilitySnapshot([targetUuid], async () =>
                assert.fail('strict work entered'),
            ),
            /capabilities unavailable/,
        );
    });
    test(`${cache} legacy inventory: failed unknown peer never invents native credentials`, async (t) => {
        const f = await fixture(t, { warm });
        assertCredentials(f, await observe(f), false);
        assert.equal(f.values.has(capabilityKey(f.peer)), false);
    });
    test(`${cache} legacy inventory: live known native plus failed unknown uses parent credentials`, async (t) => {
        const f = await fixture(t, { warm, liveNative: true });
        assertCredentials(f, await observe(f), true);
        assert.equal(f.values.get(capabilityKey(f.peer)).native, true);
    });
    test(`${cache} legacy inventory: failed older custom proof preserves routed classification only`, async (t) => {
        const f = await fixture(t, { warm, staleRouted: true });
        assertCredentials(f, await observe(f), false, true);
        assert.equal(f.values.get(capabilityKey(f.peer)).native, undefined);
    });
}

test('fresh positive modern capability supersedes warmed native proof without changing credential families mid-start', async (t) => {
    const f = await fixture(t, { warm: true, freshModern: true });
    assertCredentials(f, await observe(f), false);
    assert.equal(f.values.get(capabilityKey(f.peer)).native, false);
});

test('proof for a different peer endpoint cannot relax current credentials', async (t) => {
    const f = await fixture(t);
    f.values.set(capabilityKey({ ...f.peer, address: 'old-peer.invalid' }), {
        native: true,
        supported: false,
        checkedAt: Date.now() - 60001,
    });
    assertCredentials(f, await observe(f), false);
});

test('warmed native classification and isolated startup remain coherent after shared proof eviction', async (t) => {
    const f = await fixture(t, { warm: true, staleNative: true });
    f.values.delete(capabilityKey(f.peer));
    const result = await observe(f);
    assert.equal(
        result.startup.legacy,
        result.legacy,
        'proof eviction cannot split startup and subscription credentials',
    );
    assertCredentials(f, result, result.legacy);
});

test('basic autoselect alias retains the same routed credentials in subscription, policy and rendered clients', async (t) => {
    const f = await fixture(t, { alias: true });
    let prepared;
    await f.policies.withCompatibilitySnapshot(
        [targetUuid],
        async () => {
            await f.policies.syncNode(f.target);
            prepared = await f.handler.execute(
                new GetPreparedConfigWithUsersQuery(profileUuid, [
                    { uuid: inboundUuid, tag: 'vless', protocol: 'vless' },
                ]),
            );
            assert.equal(prepared.isOk, true, prepared.message);
        },
        false,
        'configuration',
    );
    const selected = (
        await f.access.prepareAutoselect(f.user, f.owner.uuid, [
            { uuid: hostUuid, configProfileInboundUuid: inboundUuid },
        ])
    ).get(hostUuid);
    assert(selected);
    assert.notEqual(selected.vlessUuid, parentUuid);
    const scoped = f.policies.keys({
        userId: '1',
        hostUuid: f.route.uuid,
        quotaHostUuid: f.owner.uuid,
        hwid: null,
        parent: parentUuid,
    });
    assert.equal(selected.vlessUuid, scoped.vlessUuid);
    assert.equal(f.posts[0].routedIdentities, true);
    assert.equal(
        f.posts[0].hosts[f.route.uuid.replaceAll('-', '')].allowedIdentities[scoped.username],
        true,
    );
    assert(
        prepared.response.config.inbounds[0].settings.clients.some(
            (client) => client.id === selected.vlessUuid && client.email === scoped.username,
        ),
    );
});

for (const [label, related, relatedAdjustment] of [
    ['quota', { userLimit: '1' }],
    ['speed', { userSpeed: 1 }],
    ['billing multiplier', { trafficMultiplier: 2 }],
    ['destination rules', { domains: { mode: 'ALLOW_ONLY', domains: ['example.test'] } }],
    ['managed scope', { managed: true }],
    ['user adjustment', {}, true],
])
    test(`autoselect ${label} follows target policy membership and quarantines the relevant incoming alias`, async (t) => {
        const f = await fixture(t, {
            alias: true,
            outboundAlias: true,
            related,
            relatedAdjustment,
        });
        assertCredentials(f, await observe(f), false);
        assert.equal(f.posts[0].hosts[f.route.uuid.replaceAll('-', '')], undefined);
        assert.equal(f.posts[0].groups[`host:${f.route.sourceUuid}`], undefined);
        assert.equal(f.posts[0].groups[`host:${hostUuid}`].blockAll, false);
        assert.equal(f.posts[0].groups[`host:${hostUuid}`].bytesPerSecond, 0);

        const incoming = await fixture(t, { alias: true, related, relatedAdjustment });
        const result = await observe(incoming);
        const body = incoming.posts[0];
        assert.equal(incoming.posts.length, 1);
        assert.equal(body.routedIdentities, true);
        assert(body.protectedInbounds.includes('vless'));
        const own = incoming.policies.keys({
            userId: '1',
            hostUuid,
            hwid: null,
            parent: parentUuid,
        });
        assert.equal(result.selected.vlessUuid, own.vlessUuid);
        assert.equal(
            body.hosts[hostUuid.replaceAll('-', '')].allowedIdentities[own.username],
            true,
        );
        assert.equal(body.groups[`host:${hostUuid}`].blockAll, false);
        const denied = body.hosts[incoming.route.uuid.replaceAll('-', '')];
        assert.deepEqual(denied.allowedIdentities, {});
        if (['quota', 'speed', 'billing multiplier', 'user adjustment'].includes(label))
            assert.equal(body.groups[`host:${incoming.owner.uuid}`].blockAll, true);
        const alias = (
            await incoming.access.prepareAutoselect(incoming.user, incoming.owner.uuid, [
                { uuid: hostUuid, configProfileInboundUuid: inboundUuid },
            ])
        ).get(hostUuid);
        assert(alias);
        assert.notEqual(alias.vlessUuid, parentUuid);
        const scoped = incoming.policies.keys({
            userId: '1',
            hostUuid: incoming.route.uuid,
            quotaHostUuid: incoming.owner.uuid,
            hwid: null,
            parent: parentUuid,
        });
        assert.equal(alias.vlessUuid, scoped.vlessUuid);
        const clients = result.startup.prepared.config.inbounds.find(
            (inbound) => inbound.tag === 'vless',
        ).settings.clients;
        assert(
            clients.some((client) => client.id === own.vlessUuid && client.email === own.username),
        );
        assert(
            clients.some(
                (client) => client.id === alias.vlessUuid && client.email === scoped.username,
            ),
            'quarantine denies the installed scoped alias without replacing its credentials',
        );
        assert.equal(Object.hasOwn(denied.allowedIdentities, scoped.username), false);
    });
