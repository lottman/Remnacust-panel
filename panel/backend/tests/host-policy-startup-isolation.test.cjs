const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { AsyncLocalStorage } = require('node:async_hooks');
const load = require('./load-typescript.cjs');

const source = path.join(__dirname, '../src');
const targetUuid = '11111111-1111-4111-8111-111111111111';
const peerUuid = '22222222-2222-4222-8222-222222222222';
const inboundUuid = '33333333-3333-4333-8333-333333333333';
const hostUuid = '44444444-4444-4444-8444-444444444444';
const profileUuid = '55555555-5555-4555-8555-555555555555';
const revision = '66666666-6666-4666-8666-666666666666';
class Logger {
    log() {}
    warn() {}
    error() {}
}
const ok = (response) => ({ isOk: true, response });
const classFor = (name) =>
    ({
        [name]: class {
            constructor(data) {
                this.data = data;
            }
        },
    })[name];

function fixture() {
    const context = new AsyncLocalStorage();
    const values = new Map(),
        probes = [],
        posts = [],
        starts = [],
        updates = [],
        queries = [];
    const node = {
        uuid: targetUuid,
        name: 'cold-native',
        id: 1,
        address: 'target.invalid',
        port: 2222,
        proxyUrl: null,
        controlRevision: revision,
        isDisabled: false,
        isConnected: false,
        activeConfigProfileUuid: profileUuid,
        activePluginUuid: null,
        integrationUuids: [],
        tags: [],
        activeInbounds: [{ uuid: inboundUuid, tag: 'vless', protocol: 'vless' }],
    };
    const inventory = [
        { ...node, inbounds: [inboundUuid] },
        { ...node, uuid: peerUuid, address: 'peer.invalid', inbounds: [inboundUuid] },
    ];
    const host = {
        uuid: hostUuid,
        inboundUuid,
        inboundTag: 'vless',
        profileUuid,
        tags: [],
        nodes: [],
        boundNodes: [targetUuid, peerUuid],
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
    const state = {
        host,
        tags: [],
        controls: [],
        routes: [],
        extraHosts: [],
        identities: null,
        quotaMode: null,
        failTarget: false,
        peerAvailable: false,
        targetNative: false,
        failSql: false,
        policyStage: true,
        pluginCalls: 0,
        configReads: 0,
        revisions: 0,
        beforeTransaction: null,
        caps: {
            version: 'xera-host-policy-v2',
            supported: true,
            routedDeviceSpeedLimitsSupported: true,
            deviceSpeedLimitsSupported: true,
            destinationRulesSupported: true,
            policyRevisionsSupported: true,
            policyRevision: '0',
        },
    };
    const sql = (parts, ...args) => ({
        execute: async () => {
            const text = parts.join('');
            queries.push(text);
            if (state.failSql) throw Error('Synthetic SQL outage');
            if (text.includes('FROM nodes n LEFT JOIN config_profile_inbounds_to_nodes b'))
                return { rows: inventory };
            if (text.includes('AND n.uuid<>'))
                return {
                    rows: inventory.filter(
                        (row) =>
                            row.uuid !== targetUuid &&
                            row.inbounds.some((inbound) => inventory[0].inbounds.includes(inbound)),
                    ),
                };
            if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
            if (text.includes('xera_next_host_policy_revision')) {
                state.revisions++;
                return { rows: [{ revision: String(state.revisions) }] };
            }
            if (text.includes('FROM xera_quota_node_modes'))
                return { rows: state.quotaMode ? [state.quotaMode] : [] };
            if (text.includes('FROM hosts h LEFT JOIN config_profile_inbounds'))
                return { rows: [host, ...state.extraHosts] };
            if (text.includes('FROM xera_host_tag_limits')) return { rows: state.tags };
            if (text.includes('FROM xera_autoselect_routes WHERE source_host_uuid'))
                return { rows: state.routes };
            if (text.includes('SELECT a.*'))
                return {
                    rows: state.identities ?? [
                        {
                            userId: '1',
                            hostUuid,
                            allowed: true,
                            profileUuid,
                            inboundTag: 'vless',
                            hwid: null,
                            parent: '77777777-7777-4777-8777-777777777777',
                            expireAt: new Date('2099-01-01'),
                        },
                    ],
                };
            if (
                text.includes('FROM xera_limit_scopes') ||
                text.includes('FROM xera_limit_user_adjustments')
            )
                return {
                    rows: state.controls
                        .filter(
                            (control) =>
                                !control.kind ||
                                args.some(
                                    (value) =>
                                        Array.isArray(value) &&
                                        value.includes(
                                            `${control.kind.toLowerCase()}:${control.key}`,
                                        ),
                                ),
                        )
                        .map((control) => ({
                            ...control,
                            scope:
                                control.scope ??
                                (control.kind
                                    ? `${control.kind.toLowerCase()}:${control.key}`
                                    : args.find(Array.isArray)?.[0]),
                        })),
                };
            return { rows: [] };
        },
    });
    sql.join = (value) => value;
    const policyAxios = {
        getNodeHealth: async (opts) => {
            assert(!context.getStore(), 'Capability RPC inside SQL transaction');
            probes.push({ kind: 'health', uuid: opts.uuid, proxyUrl: opts.proxyUrl });
            if (
                (opts.uuid === targetUuid && state.failTarget) ||
                (opts.uuid === peerUuid && !state.peerAvailable)
            )
                return { isOk: false, code: 'ECONNRESET' };
            return {
                ...ok({
                    isAlive: true,
                    xrayInternalStatusCached: false,
                    nodeVersion:
                        opts.uuid === targetUuid && state.targetNative
                            ? '3.4.3'
                            : '1.1.37-remnacust',
                }),
                nodeControlRevision: opts.controlRevision,
            };
        },
        hostPolicy: async (opts, body) => {
            assert(!context.getStore(), 'Policy RPC inside SQL transaction');
            if (body) {
                posts.push({ uuid: opts.uuid, body, proxyUrl: opts.proxyUrl });
                return {
                    ...ok({
                        version: state.caps.version,
                        staged: state.policyStage,
                        applied: false,
                    }),
                    nodeControlRevision: opts.controlRevision,
                };
            }
            probes.push({ kind: 'capabilities', uuid: opts.uuid, proxyUrl: opts.proxyUrl });
            if (
                (opts.uuid === targetUuid && state.failTarget) ||
                (opts.uuid === peerUuid && !state.peerAvailable)
            )
                return { isOk: false, code: 'ECONNRESET' };
            return { ...ok(state.caps), nodeControlRevision: opts.controlRevision };
        },
    };
    const cache = {
        get: async (key) => values.get(key) ?? null,
        set: async (key, value) => values.set(key, value),
        del: async (key) => values.delete(key),
        delMany: async (keys) => keys.forEach((key) => values.delete(key)),
        setMany: async () => {},
    };
    const { HostPolicyService } = load(
        path.join(source, 'common/host-policy/host-policy.service.ts'),
        {
            kysely: { sql },
            '@common/database': {},
            '@common/axios': {},
            '@common/raw-cache': {},
            '@common/config/app-config/typed-config.service': {},
            '@common/utils/host-identity': load(path.join(source, 'common/utils/host-identity.ts')),
        },
    );
    const policies = new HostPolicyService(
        { kysely: {} },
        policyAxios,
        cache,
        { getOrThrow: () => 'synthetic-fixture-secret' },
        {
            isTransactionActive: () => !!context.getStore(),
            withTransaction: async (_options, work) => {
                if (state.beforeTransaction) state.beforeTransaction();
                return context.run(true, work);
            },
        },
    );
    const queryNames = [
        'GetNodeByUuidQuery',
        'GetPreparedNodePortsQuery',
        'GetDeviceStateRevisionQuery',
        'GetPreparedConfigWithUsersQuery',
        'GetResolvedIntegrationsQuery',
        'GetPluginByUuidQuery',
    ];
    const types = Object.fromEntries(queryNames.map((name) => [name, classFor(name)]));
    const queryBus = {
        execute: async (query) => {
            switch (query.constructor.name) {
                case 'GetNodeByUuidQuery':
                    return ok(node);
                case 'GetPreparedNodePortsQuery':
                    return null;
                case 'GetDeviceStateRevisionQuery':
                    return '1';
                case 'GetPreparedConfigWithUsersQuery':
                    state.configReads++;
                    return ok({
                        config: { inbounds: [] },
                        hashesPayload: { emptyConfig: 'fixture', inbounds: [] },
                    });
                case 'GetResolvedIntegrationsQuery':
                    return ok(new Map());
                default:
                    throw Error(`Unexpected query ${query.constructor.name}`);
            }
        },
    };
    const configurationFile = path.join(source, 'queue/_nodes/node-configuration.service.ts');
    const mocks = Object.fromEntries(
        [...fs.readFileSync(configurationFile, 'utf8').matchAll(/from '([^']+)'/g)]
            .filter((match) => !match[1].startsWith('node:'))
            .map((match) => [match[1], {}]),
    );
    const leaseTypes = load(path.join(source, 'queue/_nodes/port-plan-lease.service.ts'));
    const { NodeConfigurationService } = load(configurationFile, {
        ...mocks,
        '@nestjs/common': { Injectable: () => (value) => value, Logger },
        '@common/utils/node-version': load(path.join(source, 'common/utils/node-version.ts')),
        '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
        '@common/utils/node-reconciliation': { nodeReconciliationEnrollment: () => undefined },
        '@common/host-policy/sync-host-policy-for-start': load(
            path.join(source, 'common/host-policy/sync-host-policy-for-start.ts'),
        ),
        '@libs/contracts/constants': {
            CACHE_KEYS: Object.fromEntries(
                [
                    'NODE_SYSTEM_STATS',
                    'NODE_USERS_ONLINE',
                    'NODE_XRAY_UPTIME',
                    'NODE_TELEMETRY_SNAPSHOT',
                    'NODE_SYSTEM_INFO',
                    'NODE_VERSIONS',
                ].map((name) => [name, (id) => `${name}:${id}`]),
            ),
            CACHE_KEYS_TTL: {},
            EVENTS: { NODE: { CONNECTION_RESTORED: 'restored' } },
        },
        '@integration-modules/notifications/interfaces': { NodeEvent: class {} },
        '@modules/nodes/commands/update-node': {
            UpdateNodeCommand: class {
                constructor(data) {
                    this.data = data;
                }
            },
        },
        '@modules/nodes/commands/record-port-plan-result': {
            RecordPortPlanResultCommand: class {},
        },
        '@modules/nodes/profile-port-plan': load(
            path.join(source, 'modules/nodes/profile-port-plan.ts'),
        ),
        '@modules/node-integrations/utils': { mergeNodeIntegrations: () => ({}) },
        './constants/nodes-job-name.constant': { NODES_JOB_NAMES: { START_NODE: 'start-node' } },
        './port-plan-lease.service': leaseTypes,
        ...Object.fromEntries(
            [
                ['@modules/nodes/queries/get-node-by-uuid', 'GetNodeByUuidQuery'],
                ['@modules/nodes/queries/get-prepared-node-ports', 'GetPreparedNodePortsQuery'],
                ['@modules/nodes/queries/get-device-state-revision', 'GetDeviceStateRevisionQuery'],
                [
                    '@modules/users/queries/get-prepared-config-with-users',
                    'GetPreparedConfigWithUsersQuery',
                ],
                [
                    '@modules/node-integrations/queries/get-resolved-integrations',
                    'GetResolvedIntegrationsQuery',
                ],
                ['@modules/node-plugins/queries/get-plugin-by-uuid', 'GetPluginByUuidQuery'],
            ].map(([id, name]) => [id, { [name]: types[name] }]),
        ),
    });
    const axios = {
        ...policyAxios,
        getNodeHealth: () => policyAxios.getNodeHealth(node),
        syncNodePlugins: async () => {
            state.pluginCalls++;
            return ok({ accepted: true });
        },
        startXray: async (body, opts) => {
            starts.push({ body, opts });
            return ok({
                isStarted: true,
                error: null,
                nodeInformation: { version: '1.1.37-remnacust' },
                version: '26.11.9',
            });
        },
    };
    const configuration = new NodeConfigurationService(
        axios,
        {},
        queryBus,
        { emit() {} },
        {
            execute: async (command) => {
                updates.push(command.data);
                Object.assign(node, command.data);
                return ok(node);
            },
        },
        cache,
        policies,
        {
            acquire: async () => null,
            withLifecycle: async (_id, work) => work(async () => {}),
            commitLifecycleStatus: async (_node, work) => work(),
        },
    );
    const run = () => configuration.apply({ nodeUuid: targetUuid });
    return {
        state,
        node,
        host,
        inventory,
        policies,
        configuration,
        values,
        probes,
        posts,
        starts,
        updates,
        queries,
        run,
    };
}

function defineTests() {
    test('cold Node37 starts a basic configuration despite an unreachable shared-inbound peer', async () => {
        const f = fixture();
        await f.run();
        assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
        assert.equal(f.starts[0].body.internals.forceRestart, false);
        assert.equal(f.posts.length, 1);
        assert.equal(f.posts[0].body.groups[`host:${hostUuid}`].bytesPerSecond, 0);
        assert(f.posts[0].body.protectedInbounds.includes('vless'));
        assert.equal(f.node.isConnected, true);
        assert.equal(f.values.get(`remnacust:node-compatibility:${targetUuid}`), null);
    });

    test('isolated startup retains the target SOCKS route for policy and configuration', async () => {
        const f = fixture();
        f.node.proxyUrl = 'socks5://fixture.invalid:1080';
        f.inventory[0].proxyUrl = f.node.proxyUrl;
        await f.run();
        assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
        assert.equal(f.starts[0].opts.proxyUrl, f.node.proxyUrl);
        assert(
            f.probes
                .filter((probe) => probe.uuid === targetUuid)
                .every((probe) => probe.proxyUrl === f.node.proxyUrl),
        );
        assert.equal(f.posts[0].proxyUrl, f.node.proxyUrl);
    });

    for (const [name, change] of [
        [
            'host quota',
            (f) => {
                f.host.userLimit = '1024';
            },
        ],
        [
            'host speed',
            (f) => {
                f.host.userSpeed = 1;
            },
        ],
        [
            'device speed',
            (f) => {
                f.host.deviceSpeed = 1;
            },
        ],
        [
            'shared speed',
            (f) => {
                f.host.totalSpeed = 1;
            },
        ],
        [
            'billing multiplier',
            (f) => {
                f.host.trafficMultiplier = 2;
            },
        ],
        [
            'IP rules',
            (f) => {
                f.host.domains = { mode: 'ALLOW_ONLY', domains: ['192.0.2.0/24'] };
            },
        ],
        [
            'always available',
            (f) => {
                f.host.alwaysAvailable = true;
            },
        ],
        [
            'inactive-only access',
            (f) => {
                f.host.onlyWhenInactive = true;
            },
        ],
        [
            'managed scope',
            (f) => {
                f.host.managed = true;
            },
        ],
        [
            'tag quota',
            (f) => {
                f.host.tags = ['metered'];
                f.state.tags = [{ tag: 'metered', userLimit: '1', trafficMultiplier: 1 }];
            },
        ],
        [
            'tag device cap',
            (f) => {
                f.host.tags = ['limited'];
                f.state.tags = [{ tag: 'limited', deviceSpeed: 1, trafficMultiplier: 1 }];
            },
        ],
        [
            'pause or adjustment',
            (f) => {
                f.state.controls = [{ paused: true }];
            },
        ],
        [
            'quota coordinator',
            (f) => {
                f.state.quotaMode = { phase: 'ACTIVE', instance: 'fixture' };
            },
        ],
    ])
        test(`unknown shared peer retains strict ${name} barrier and configuration denial`, async () => {
            const f = fixture();
            change(f);
            await assert.rejects(
                f.policies.withCompatibilitySnapshot([targetUuid], () =>
                    f.policies.syncNode(f.node),
                ),
                /capabilities unavailable/,
            );
            assert.equal(f.posts.length, 0);
            assert.equal(f.state.revisions, 0);
            await f.run();
            if (name === 'quota coordinator') {
                assert.equal(f.starts.length, 0);
                assert.equal(f.posts.length, 0);
                assert.equal(f.state.revisions, 0);
            } else {
                assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
                assert.equal(f.posts.length, 1);
                assert.deepEqual(
                    f.posts[0].body.hosts[hostUuid.replaceAll('-', '')].allowedIdentities,
                    {},
                );
                assert(f.posts[0].body.protectedInbounds.includes('vless'));
                assert.match(f.node.lastStatusMessage, /^\[HOST_POLICY_QUARANTINED\]/);
            }
        });

    test('unknown target capability never becomes legacy or enters configuration', async () => {
        const f = fixture();
        f.state.failTarget = true;
        await f.run();
        assert.equal(f.starts.length, 0);
        assert.equal(f.posts.length, 0);
        assert.equal(f.state.pluginCalls, 0);
        assert.match(f.node.lastStatusMessage, /HOST_POLICY_PENDING/);
        assert(![...f.values.values()].some((value) => value?.native === true));
    });

    test('strict compatibility callers keep the full peer dependency barrier', async () => {
        const f = fixture();
        let entered = false;
        await assert.rejects(
            f.policies.withCompatibilitySnapshot([targetUuid], async () => {
                entered = true;
            }),
            /capabilities unavailable/,
        );
        assert.equal(entered, false);
    });

    test('a newly introduced restriction is denied under SQL ownership before configuration delivery', async () => {
        const f = fixture();
        f.state.beforeTransaction = () => {
            f.host.userLimit = '4096';
        };
        await f.run();
        assert.equal(f.starts.length, 1);
        assert.equal(f.posts[0].body.groups['host:' + hostUuid].blockAll, true);
        assert.deepEqual(f.posts[0].body.hosts[hostUuid.replaceAll('-', '')].allowedIdentities, {});
    });

    test('failed policy staging cannot grant startup after peer isolation', async () => {
        const f = fixture();
        f.state.policyStage = false;
        await f.run();
        assert.equal(f.starts.length, 0);
        assert.equal(f.posts.length, 1);
        assert.match(f.node.lastStatusMessage, /HOST_POLICY_PENDING/);
    });

    function routedFixture(direction = 'outgoing') {
        const f = fixture();
        const other = {
            ...f.host,
            uuid: '88888888-8888-4888-8888-888888888888',
            inboundUuid: '99999999-9999-4999-8999-999999999999',
            nodes: [peerUuid],
            boundNodes: [peerUuid],
        };
        f.state.extraHosts.push(other);
        const { autoselectRouteUuid } = load(
            path.join(source, 'common/host-policy/autoselect-route-policy.ts'),
        );
        f.state.routes.push({
            uuid: autoselectRouteUuid(
                direction === 'outgoing' ? hostUuid : other.uuid,
                direction === 'outgoing' ? other.uuid : hostUuid,
            ),
            ownerUuid: direction === 'outgoing' ? hostUuid : other.uuid,
            sourceUuid: direction === 'outgoing' ? other.uuid : hostUuid,
        });
        return { ...f, other };
    }

    for (const direction of ['outgoing', 'incoming'])
        test(`a zero-policy ${direction} alias permits startup with an unavailable shared peer`, async () => {
            const f = routedFixture(direction);
            await f.run();
            assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
            assert.equal(f.posts.length, 1);
            assert.equal(f.starts[0].body.internals.forceRestart, false);
            assert.equal(f.state.revisions, 1);
        });

    test('an outgoing remote source quota does not become a local owner quota', async () => {
        const f = routedFixture();
        f.other.userLimit = '1024';
        await f.run();
        assert.equal(f.starts.length, 1);
        assert.equal(f.posts[0].body.groups['host:' + hostUuid].blockAll, false);
        assert.equal(f.posts[0].body.groups['host:' + f.other.uuid], undefined);
    });

    for (const direction of ['incoming', 'outgoing'])
        for (const [restriction, change] of [
            [
                'device cap',
                (f) => {
                    f.other.deviceSpeed = 1;
                },
            ],
            [
                'shared cap',
                (f) => {
                    f.other.totalSpeed = 1;
                },
            ],
            [
                'availability rule',
                (f) => {
                    f.other.alwaysAvailable = true;
                },
            ],
            [
                'inactive rule',
                (f) => {
                    f.other.onlyWhenInactive = true;
                },
            ],
            [
                'domain rule',
                (f) => {
                    f.other.domains = { mode: 'DENY', domains: ['example.test'] };
                },
            ],
            [
                'managed scope',
                (f) => {
                    f.other.managed = true;
                },
            ],
            [
                'tag quota',
                (f) => {
                    f.other.tags = ['remote'];
                    f.state.tags = [{ tag: 'remote', userLimit: '1', trafficMultiplier: 1 }];
                },
            ],
            [
                'tag speed',
                (f) => {
                    f.other.tags = ['remote'];
                    f.state.tags = [{ tag: 'remote', userSpeed: 1, trafficMultiplier: 1 }];
                },
            ],
            [
                'host adjustment',
                (f) => {
                    f.state.controls = [{ kind: 'HOST', key: f.other.uuid, paused: false }];
                },
            ],
            [
                'tag pause',
                (f) => {
                    f.other.tags = ['remote'];
                    f.state.tags = [{ tag: 'remote', trafficMultiplier: 1 }];
                    f.state.controls = [{ kind: 'TAG', key: 'remote', paused: true }];
                },
            ],
        ])
            test(`a remote ${direction} ${restriction} keeps its effective policy boundary`, async () => {
                const f = routedFixture(direction);
                change(f);
                await assert.rejects(
                    f.policies.withCompatibilitySnapshot([targetUuid], () =>
                        f.policies.syncNode(f.node),
                    ),
                    /capabilities unavailable/,
                );
                assert.equal(f.state.revisions, 0);
                await f.run();
                assert.equal(f.starts.length, 1);
                if (direction === 'incoming') {
                    const alias = f.state.routes[0].uuid.replaceAll('-', '');
                    assert.deepEqual(f.posts.at(-1).body.hosts[alias].allowedIdentities, {});
                    assert.match(f.node.lastStatusMessage, /^\[HOST_POLICY_QUARANTINED\]/);
                } else {
                    const body = f.posts.at(-1).body;
                    assert.equal(body.groups['host:' + f.other.uuid], undefined);
                    assert.equal(body.groups['host:' + hostUuid].blockAll, false);
                    assert(
                        Object.values(
                            body.hosts[hostUuid.replaceAll('-', '')].allowedIdentities,
                        ).includes(true),
                    );
                    assert.equal(f.node.lastStatusMessage, null);
                }
            });

    test('a transitive remote own quota is excluded from the target policy', async () => {
        const f = routedFixture();
        const third = { ...f.other, uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userLimit: '1' };
        f.state.extraHosts.push(third);
        const { autoselectRouteUuid } = load(
            path.join(source, 'common/host-policy/autoselect-route-policy.ts'),
        );
        f.state.routes.push({
            uuid: autoselectRouteUuid(f.other.uuid, third.uuid),
            ownerUuid: f.other.uuid,
            sourceUuid: third.uuid,
        });
        await f.run();
        assert.equal(f.starts.length, 1);
        assert.equal(f.posts[0].body.groups['host:' + third.uuid], undefined);
        assert.equal(f.posts[0].body.groups['host:' + hostUuid].blockAll, false);
    });

    test('a restriction introduced on an incoming owner is denied under SQL ownership', async () => {
        const f = routedFixture('incoming');
        f.state.beforeTransaction = () => {
            f.other.userSpeed = 1;
        };
        await f.run();
        assert.equal(f.starts.length, 1);
        assert.equal(f.posts[0].body.groups['host:' + f.other.uuid].blockAll, true);
        assert.deepEqual(
            f.posts[0].body.hosts[f.state.routes[0].uuid.replaceAll('-', '')].allowedIdentities,
            {},
        );
    });

    test('a zero-policy alias cycle remains bounded and unrelated restrictions stay outside the proof', async () => {
        const f = routedFixture();
        const { autoselectRouteUuid } = load(
            path.join(source, 'common/host-policy/autoselect-route-policy.ts'),
        );
        f.state.routes.push({
            uuid: autoselectRouteUuid(f.other.uuid, hostUuid),
            ownerUuid: f.other.uuid,
            sourceUuid: hostUuid,
        });
        f.state.extraHosts.push({
            ...f.other,
            uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            userLimit: '1',
        });
        await f.run();
        assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
        assert.equal(f.posts.length, 1);
    });

    test('nested strict work cannot inherit configuration isolation', async () => {
        const f = fixture();
        let entered = false;
        await f.policies.withCompatibilitySnapshot(
            [targetUuid],
            async () => {
                await assert.rejects(
                    f.policies.withCompatibilitySnapshot([targetUuid], async () => {
                        entered = true;
                    }),
                    /capabilities unavailable/,
                );
                await f.policies.syncNode(f.node);
            },
            false,
            'configuration',
        );
        assert.equal(entered, false);
        assert.equal(f.posts.length, 1);
    });

    test('an expired native cache entry preserves legacy credentials only in the independent configuration scope', async () => {
        const f = fixture();
        const { createHash } = require('node:crypto');
        const peer = f.inventory[1];
        const connection = createHash('sha256')
            .update(JSON.stringify([peer.address, peer.port, peer.proxyUrl]))
            .digest('hex');
        f.values.set(`xera:host-policy:capabilities:v2:${peerUuid}:${connection}`, {
            native: true,
            supported: false,
            checkedAt: Date.now() - 60_001,
        });
        await f.policies.withCompatibilitySnapshot(
            [targetUuid],
            async () => {
                assert.equal((await f.policies.legacyInbounds()).has(inboundUuid), true);
                await f.policies.syncNode(f.node);
            },
            false,
            'configuration',
        );
        assert(!f.posts[0].body.protectedInbounds.includes('vless'));
        assert.equal(f.values.get(`remnacust:node-compatibility:${targetUuid}`), null);
    });

    for (const [name, change] of [
        [
            'unsupported',
            (f) => {
                f.state.caps.supported = false;
            },
        ],
        [
            'wrong policy version',
            (f) => {
                f.state.caps.version = 'unknown';
            },
        ],
        [
            'missing routed identity support',
            (f) => {
                f.state.caps.routedDeviceSpeedLimitsSupported = false;
            },
        ],
        [
            'SQL outage',
            (f) => {
                f.state.failSql = true;
            },
        ],
    ])
        test(`${name} cannot authorize isolated configuration`, async () => {
            const f = fixture();
            change(f);
            await f.run();
            assert.equal(f.starts.length, 0);
            assert.equal(f.posts.length, 0);
            assert.equal(f.state.pluginCalls, 0);
        });

    test('known legacy native targets retain their existing basic compatibility path', async () => {
        const f = fixture();
        f.state.targetNative = true;
        await f.run();
        assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
        assert.equal(f.posts.length, 0);
        assert.equal(
            f.values.get(`remnacust:node-compatibility:${targetUuid}`),
            '[NODE_NATIVE_COMPATIBILITY]',
        );
    });

    test('inapplicable tag quota does not become a target financial dependency', async () => {
        const f = fixture();
        f.host.tags = ['not-used'];
        f.host.useTagTrafficLimit = false;
        f.state.tags.push({ tag: 'not-used', userLimit: '1024', trafficMultiplier: 1 });
        await f.run();
        assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    });

    test('a peer on another inbound does not block an otherwise required target speed policy', async () => {
        const f = fixture();
        f.inventory[1].inbounds = ['99999999-9999-4999-8999-999999999999'];
        f.host.boundNodes = [targetUuid];
        f.host.userSpeed = 1;
        await f.run();
        assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
        assert.equal(
            f.probes.some((probe) => probe.uuid === peerUuid),
            false,
        );
        assert(f.posts[0].body.groups[`host:${hostUuid}`].bytesPerSecond > 0);
    });
}

module.exports = { fixture };
if (require.main === module) defineTests();
