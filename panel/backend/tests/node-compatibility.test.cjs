const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ts = require('typescript');
const zlib = require('node:zlib');
const { AxiosError } = require('axios');
const load = require('./load-typescript.cjs');
const contract = require('@remnawave/node-contract');
const fixtures = require('./fixtures/remnawave-node-contracts.json');
const versions = load(path.join(__dirname, '../src/common/utils/node-version.ts'));
const result = {
    ok: (response) => ({ isOk: true, response }),
    fail: (error) => ({ isOk: false, ...error }),
};
const { AxiosService } = load(path.join(__dirname, '../src/common/axios/axios.service.ts'), {
    '@nestjs/common': {
        Injectable: () => (value) => value,
        Logger: class {
            log() {}
            error() {}
            warn() {}
        },
    },
    '@common/utils/node-version': versions,
    '@common/utils/certs': { deriveSni: () => 'compatibility.invalid' },
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@common/utils/bytes': { prettyBytesUtil: String },
    '@contract/constants': {
        ERRORS: {
            INTERNAL_SERVER_ERROR: { code: 'INTERNAL', message: 'internal' },
            NODE_ERROR_WITH_MSG: { withMessage: (message) => ({ code: 'NODE_ERROR', message }) },
            NODE_ERROR_500_WITH_MSG: { withMessage: (message) => ({ code: 'NODE_500', message }) },
        },
    },
    '@common/raw-cache': {},
    '@common/config/app-config/typed-config.service': {},
    '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
    './mtls-agent': {},
    '../types': result,
});
const opts = { address: 'compatibility.invalid', port: 2222, proxyUrl: null };
const uuid = 'a5114651-f0e7-4a35-8a16-2db0fcfb22d9';
const config = {
    inbounds: [{ tag: 'vless', protocol: 'vless', settings: { clients: [{ id: uuid }] } }],
    outbounds: [],
};
const start = {
    xrayConfig: config,
    internals: { forceRestart: true, hashes: { emptyConfig: 'config', inbounds: [] } },
};
const sys = { memoryFree: 40, memoryUsed: 60, uptime: 200, loadAvg: [1, 2, 3], interface: null };
const info = {
    arch: 'x64',
    cpus: 2,
    cpuModel: 'test',
    memoryTotal: 100,
    hostname: 'test',
    platform: 'linux',
    release: 'test',
    type: 'Linux',
    version: 'test',
    networkInterfaces: [],
};
const xrayInfo = {
    numGoroutine: 1,
    numGC: 2,
    alloc: 3,
    totalAlloc: 4,
    sys: 5,
    mallocs: 6,
    frees: 7,
    liveObjects: 8,
    pauseTotalNs: 9,
    uptime: 120,
};

function official(profile) {
    const cache = new Map();
    function evaluate(name) {
        if (cache.has(name)) return cache.get(name).exports;
        const source = fixtures.sources[profile.files[name]];
        assert.ok(source, `missing official contract ${profile.version} ${name}`);
        const ref = { exports: {} };
        cache.set(name, ref);
        const compiled = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        new Function('require', 'module', 'exports', compiled)(
            (id) => {
                if (id === 'zod') return require(profile.zodMajor < 4 ? 'zod/v3' : 'zod');
                assert.ok(id.startsWith('.'), `unexpected official contract dependency ${id}`);
                const base = path.posix.normalize(path.posix.join(path.posix.dirname(name), id));
                const file = profile.files[base + '.ts'] ? base + '.ts' : base + '/index.ts';
                return evaluate(file);
            },
            ref,
            ref.exports,
        );
        return ref.exports;
    }
    return (basename) => {
        const file = Object.keys(profile.files).find(
            (name) => path.posix.basename(name) === basename,
        );
        return file ? evaluate(file) : null;
    };
}

function client(profile, { failPath, status = 500 } = {}) {
    const schema = official(profile);
    const calls = [];
    const nodeCache = new Map();
    const service = new AxiosService(
        {
            execute: async () => ({
                isOk: true,
                response: {
                    jwtToken: 'synthetic-test-jwt',
                    caCert: '',
                    clientCert: '',
                    clientKey: '',
                    jwtPublicKey: '',
                },
            }),
        },
        {
            setMany: async (values) => {
                for (const { key, value } of values) nodeCache.set(key, value);
            },
            get: async (key) => nodeCache.get(key),
        },
        { getOrThrow: () => true },
    );
    const error = (status) =>
        new AxiosError(`HTTP ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, {
            status,
            data: { message: 'test failure' },
        });
    const call = async (method, url, data, options) => {
        const route = new URL(url).pathname;
        const compressed = options.headers?.['Content-Encoding'] === 'zstd';
        const body = compressed ? JSON.parse(zlib.zstdDecompressSync(data).toString()) : data;
        calls.push({ method, url, route, body, compressed, options });
        assert.equal(options.maxRedirects, 0);
        assert.equal(
            service.axiosInstance.defaults.headers.common.Authorization,
            'Bearer synthetic-test-jwt',
        );
        assert.equal(options.httpsAgent.options.rejectUnauthorized, true);
        if (route === failPath) throw error(status);
        let response;
        if (route === contract.GetNodeHealthCheckCommand.url) {
            const health = schema('get-node-health-check.command.ts');
            if (!health) throw error(404);
            response = health.GetNodeHealthCheckCommand.ResponseSchema.parse({
                response: {
                    isAlive: true,
                    xrayInternalStatusCached: true,
                    xrayVersion: '26.9.30',
                    nodeVersion: profile.version,
                },
            }).response;
        } else if (route === '/node/xray/status')
            response = { isRunning: true, version: '26.9.30' };
        else if (route === contract.StartXrayCommand.url) {
            const startSchema = schema('start.command.ts').StartXrayCommand;
            startSchema.RequestSchema.parse(body);
            response = startSchema.ResponseSchema.parse({
                response: {
                    isStarted: true,
                    version: '26.9.30',
                    error: null,
                    systemInformation: { cpuCores: 2, cpuModel: 'test', memoryTotal: '100' },
                    nodeInformation: { version: profile.version },
                    system: { info, stats: sys },
                },
            }).response;
        } else if (route === contract.GetSystemStatsCommand.url) {
            response = schema(
                'get-system-stats.command.ts',
            ).GetSystemStatsCommand.ResponseSchema.parse({
                response: profile.xrayInfo
                    ? {
                          xrayInfo,
                          plugins: { torrentBlocker: { reportsCount: 0 } },
                          system: { stats: sys },
                      }
                    : xrayInfo,
            }).response;
        } else if (route === contract.GetCombinedStatsCommand.url) {
            if (!profile.combined) throw error(404);
            response = {
                inbounds: [{ inbound: 'in', uplink: 10, downlink: 20 }],
                outbounds: [{ outbound: 'out', uplink: 10, downlink: 20 }],
            };
        } else if (route === contract.GetAllInboundsStatsCommand.url)
            response = { inbounds: [{ inbound: 'in', uplink: 10, downlink: 20 }] };
        else if (route === contract.GetAllOutboundsStatsCommand.url)
            response = { outbounds: [{ outbound: 'out', uplink: 10, downlink: 20 }] };
        else if (route === contract.SyncCommand.url) {
            contract.SyncCommand.RequestSchema.parse(body);
            response = { accepted: true };
        } else {
            const names = {
                [contract.AddUserCommand.url]: ['add-user.command.ts', 'AddUserCommand'],
                [contract.AddUsersCommand.url]: ['add-users.command.ts', 'AddUsersCommand'],
                [contract.RemoveUserCommand.url]: ['remove-user.command.ts', 'RemoveUserCommand'],
                [contract.RemoveUsersCommand.url]: [
                    'remove-users.command.ts',
                    'RemoveUsersCommand',
                ],
            };
            const [file, symbol] = names[route] ?? [];
            assert.ok(file, `unexpected route ${route}`);
            if (!schema(file)[symbol].RequestSchema.safeParse(body).success) throw error(400);
            response = { success: true, error: null };
        }
        return { data: { response } };
    };
    service.axiosInstance.get = (url, options) => call('get', url, undefined, options);
    service.axiosInstance.post = (url, data, options) => call('post', url, data, options);
    return { service, calls };
}

for (const profile of fixtures.profiles)
    test(`official Remnawave ${profile.version}: start, health, accounting and user operations`, async () => {
        const { service, calls } = client(profile);
        const started = await service.startXray(start, opts);
        assert.equal(started.isOk, true, started.message);
        assert.equal(started.response.isStarted, true);
        const request = calls.find((call) => call.route === contract.StartXrayCommand.url);
        assert.deepEqual(profile.zstd ? request.body.xrayConfig : request.body, config);
        assert.equal(request.compressed, profile.zstd);
        assert.equal(started.response.system !== null, profile.xrayInfo);
        const stats = await service.getSystemStats(opts);
        assert.equal(stats.isOk, true, stats.message);
        assert.equal(stats.response.xrayInfo.uptime, 120);
        assert.equal(stats.response.system !== null, profile.xrayInfo);
        const traffic = await service.getCombinedStats({ reset: true }, opts);
        assert.equal(traffic.isOk, true, traffic.message);
        assert.equal(traffic.response.outbounds[0].uplink, 10);
        assert.equal(
            calls.filter((call) => call.route === contract.GetAllOutboundsStatsCommand.url).length,
            profile.combined ? 0 : 1,
        );
        const added = await service.addUser(
            {
                data: [
                    { type: 'vless', tag: 'vless', username: '7', uuid, flow: '' },
                    { type: 'trojan', tag: 'trojan', username: '7', password: 'test' },
                    {
                        type: 'shadowsocks',
                        tag: 'ss',
                        username: '7',
                        password: 'test',
                        cipherType: 5,
                        ivCheck: false,
                    },
                ],
                hashData: { vlessUuid: uuid },
            },
            opts,
        );
        assert.equal(added.isOk, true, added.message);
        const bulk = await service.addUsers(
            {
                affectedInboundTags: ['vless', 'trojan'],
                users: [
                    {
                        userData: {
                            userId: '7',
                            hashUuid: uuid,
                            vlessUuid: uuid,
                            trojanPassword: 'test',
                            ssPassword: 'test',
                        },
                        inboundData: [
                            { type: 'vless', tag: 'vless', flow: '' },
                            { type: 'trojan', tag: 'trojan' },
                        ],
                    },
                ],
            },
            opts,
        );
        assert.equal(bulk.isOk, true, bulk.message);
        const removed = await service.deleteUsers(
            { users: [{ userId: '7', hashUuid: uuid }] },
            opts,
        );
        assert.equal(removed.isOk, true, removed.message);
    });

test('accounting never retries destructive resets after a server error', async () => {
    const { service, calls } = client(fixtures.profiles.at(-1), {
        failPath: contract.GetCombinedStatsCommand.url,
    });
    assert.equal((await service.getCombinedStats({ reset: true }, opts)).isOk, false);
    assert.equal(calls.length, 1);
});

test('TLS/authentication errors never cause a legacy health or HTTP fallback', async () => {
    const { service, calls } = client(fixtures.profiles[0], {
        failPath: contract.GetNodeHealthCheckCommand.url,
        status: 403,
    });
    assert.equal((await service.getNodeHealth(opts)).isOk, false);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith('https://'));
});

test('HTTP is opt-in for an exact legacy endpoint; the neighbouring port stays on HTTPS', async () => {
    const previous = process.env.REMNACUST_LEGACY_HTTP_NODES;
    process.env.REMNACUST_LEGACY_HTTP_NODES = '127.0.0.1:12222';
    try {
        const { service, calls } = client(fixtures.profiles[0]);
        assert.equal(
            (await service.getNodeHealth({ ...opts, address: '127.0.0.1', port: 12222 })).isOk,
            true,
        );
        assert.ok(calls.every((call) => call.url.startsWith('http://127.0.0.1:12222/')));
        await service.getNodeHealth({ ...opts, address: '127.0.0.1', port: 12223 });
        assert.ok(calls.at(-1).url.startsWith('https://127.0.0.1:12223/'));
    } finally {
        if (previous === undefined) delete process.env.REMNACUST_LEGACY_HTTP_NODES;
        else process.env.REMNACUST_LEGACY_HTTP_NODES = previous;
    }
});

test('bulk legacy removal stops on a failed acknowledgement without claiming success', async () => {
    const { service } = client(fixtures.profiles[0]);
    let removed = 0;
    service.deleteUser = async () => {
        removed++;
        return result.ok({ success: false, error: 'not removed' });
    };
    const response = await service.deleteUsers(
        { users: Array.from({ length: 20 }, (_, i) => ({ userId: String(i), hashUuid: uuid })) },
        opts,
    );
    assert.equal(response.isOk && response.response.success, false);
    assert.equal(removed, 8);
});

test('concurrent compatibility discovery issues one authenticated health request', async () => {
    const { service, calls } = client(fixtures.profiles.at(-1));
    const results = await Promise.all(
        Array.from({ length: 20 }, () => service.startXray(start, opts)),
    );
    assert.ok(results.every((response) => response.isOk));
    assert.equal(
        calls.filter((call) => call.route === contract.GetNodeHealthCheckCommand.url).length,
        1,
    );
});

test('our independent release numbering retains the modern node API', async () => {
    const profile = { ...fixtures.profiles.at(-1), version: '1.1.1-remnacust' };
    const { service, calls } = client(profile);
    const response = await service.startXray(start, opts);
    assert.equal(response.isOk, true);
    assert.equal(response.response.nodeInformation.version, '1.1.1-remnacust');
    assert.equal(
        calls.find((call) => call.route === contract.StartXrayCommand.url).compressed,
        true,
    );
});

test('old nodes skip clearing absent plugins and reject assigning an unsupported plugin', async () => {
    const { service, calls } = client(fixtures.profiles[0]);
    assert.equal((await service.syncNodePlugins({ plugin: null }, opts)).isOk, true);
    const assigned = await service.syncNodePlugins(
        { plugin: { uuid, name: 'test', config: {} } },
        opts,
    );
    assert.equal(assigned.isOk, false);
    assert.match(assigned.message, /does not support plugins/);
    assert.equal(calls.filter((call) => call.route === contract.SyncCommand.url).length, 0);
});

test('ordinary deletion never invents confirmed revocation on upstream nodes', async () => {
    const { service } = client(fixtures.profiles[0]);
    const response = await service.deleteUsers({ users: [{ userId: '7', hashUuid: uuid }] }, opts);
    assert.equal(response.isOk, true);
    assert.equal(response.response.deviceRevocationSupported, undefined);
});

const cacheKeys = Object.fromEntries(
    [
        'NODE_SYSTEM_STATS',
        'NODE_SYSTEM_INFO',
        'NODE_USERS_ONLINE',
        'NODE_XRAY_UPTIME',
        'NODE_VERSIONS',
    ].map((name) => [name, (id) => `${name}:${id}`]),
);
const classMock = (name) =>
    ({
        [name]: class {
            constructor(data) {
                this.data = data;
            }
        },
    })[name];
const queryTypes = Object.fromEntries(
    [
        'GetNodeByUuidQuery',
        'GetDeviceStateRevisionQuery',
        'GetPreparedConfigWithUsersQuery',
        'GetPreparedNodePortsQuery',
        'GetPortPlanNodeUuidsQuery',
        'GetResolvedIntegrationsQuery',
        'GetAllPluginsQuery',
        'FindNodesByCriteriaQuery',
        'GetPluginByUuidQuery',
    ].map((name) => [name, classMock(name)]),
);
const UpdateNodeCommand = classMock('UpdateNodeCommand');
class RecordPortPlanResultCommand {
    constructor(nodeUuid,revision,applied){Object.assign(this,{nodeUuid,revision,applied});}
}
const processorMocks = {
    '@nestjs/bullmq': { Processor: () => (value) => value, WorkerHost: class {} },
    '@nestjs/common': {
        Injectable: () => value => value,
        Logger: class {
            log() {}
            error() {}
            warn() {}
        },
        Scope: { REQUEST: 'request' },
    },
    '@nestjs/cqrs': {},
    '@nestjs/event-emitter': {},
    '@common/utils/node-version': versions,
    '@common/utils/node-reconciliation': load(path.join(__dirname, '../src/common/utils/node-reconciliation.ts')),
    '@common/axios': {},
    '@common/axios/axios.service': {},
    '@common/axios/axios.interfaces': {},
    '@common/host-policy/host-policy.service': {},
    '@common/host-policy/sync-host-policy-for-start': load(path.join(__dirname, '../src/common/host-policy/sync-host-policy-for-start.ts')),
    '@common/raw-cache': {},
    '@common/types': result,
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@libs/contracts/constants': {
        CACHE_KEYS: cacheKeys,
        CACHE_KEYS_TTL: {},
        EVENTS: { NODE: { CONNECTION_RESTORED: 'restored' } },
    },
    '@integration-modules/notifications/interfaces': { NodeEvent: class {} },
    '@modules/node-integrations/queries/get-resolved-integrations': {
        GetResolvedIntegrationsQuery: queryTypes.GetResolvedIntegrationsQuery,
    },
    '@modules/node-integrations/utils': { mergeNodeIntegrations: () => ({}) },
    '@modules/node-plugins/queries/get-plugin-by-uuid': {
        GetPluginByUuidQuery: queryTypes.GetPluginByUuidQuery,
    },
    '@modules/node-plugins/queries/get-all-plugins': {
        GetAllPluginsQuery: queryTypes.GetAllPluginsQuery,
    },
    '@modules/nodes/commands/update-node': { UpdateNodeCommand },
    '@modules/nodes/commands/record-port-plan-result': { RecordPortPlanResultCommand },
    '@modules/nodes/profile-port-plan': load(path.join(__dirname,'../src/modules/nodes/profile-port-plan.ts')),
    '@modules/nodes/queries/get-prepared-node-ports': { GetPreparedNodePortsQuery: queryTypes.GetPreparedNodePortsQuery },
    '@modules/nodes/queries/get-port-plan-node-uuids': { GetPortPlanNodeUuidsQuery: queryTypes.GetPortPlanNodeUuidsQuery },
    '@modules/nodes/queries/get-node-by-uuid': {
        GetNodeByUuidQuery: queryTypes.GetNodeByUuidQuery,
    },
    '@modules/nodes/queries/get-device-state-revision': {
        GetDeviceStateRevisionQuery: queryTypes.GetDeviceStateRevisionQuery,
    },
    '@modules/nodes/queries/find-nodes-by-criteria': {
        FindNodesByCriteriaQuery: queryTypes.FindNodesByCriteriaQuery,
    },
    '@modules/nodes/queries/find-nodes-by-criteria/find-nodes-by-criteria.query': load(path.join(__dirname,'../src/modules/nodes/queries/find-nodes-by-criteria/find-nodes-by-criteria.query.ts')),
    '@modules/users/queries/get-prepared-config-with-users': {
        GetPreparedConfigWithUsersQuery: queryTypes.GetPreparedConfigWithUsersQuery,
    },
    '@modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.query': {
        GetPreparedConfigWithUsersQuery: queryTypes.GetPreparedConfigWithUsersQuery,
    },
    '@queue/queue.enum': { QUEUES_NAMES: { NODES: {} } },
    '../../queue.enum': { QUEUES_NAMES: { NODES: {} } },
    '../constants': { NODES_JOB_NAMES: { START_ALL_BY_PROFILE: 'start-profile' } },
    '../constants/nodes-job-name.constant': { NODES_JOB_NAMES: {} },
    'p-map': { __esModule: true, default: async (items, fn) => Promise.all(items.map(fn)) },
};
const leaseContract=load(path.join(__dirname,'../src/queue/_nodes/port-plan-lease.service.ts'));
processorMocks['./port-plan-lease.service']=leaseContract;
const { NodeConfigurationService } = load(
    path.join(__dirname, '../src/queue/_nodes/node-configuration.service.ts'),
    processorMocks,
);
const { StartNodeProcessor } = load(
    path.join(__dirname, '../src/queue/_nodes/processors/start-node.processor.ts'),
    processorMocks,
);
const { StartAllNodesByProfileQueueProcessor } = load(
    path.join(__dirname, '../src/queue/_nodes/processors/start-all-nodes-by-profile.processor.ts'),
    processorMocks,
);
const { NodeHealthCheckQueueProcessor } = load(
    path.join(__dirname, '../src/queue/_nodes/processors/node-health-check.processor.ts'),
    {
        ...processorMocks,
        '@modules/nodes/node-health-log.service': {},
        '@common/axios/profile-traffic.schema': load(path.join(__dirname, '../src/common/axios/profile-traffic.schema.ts')),
    },
);

for (const version of ['1.0.0', '1.6.4', '2.6.1', '3.4.1'])
    test(`queue startup and health remain connected for ${version}`, async () => {
        const profile = fixtures.profiles.find((item) => item.version === version);
        const node = {
            ...opts,
            uuid,
            name: 'test',
            id: 1,
            countryCode: 'US',
            tags: [],
            integrationUuids: [],
            activeConfigProfileUuid: 'profile',
            activePluginUuid: null,
            isConnecting: false,
            isConnected: false,
            activeInbounds: [{ tag: 'vless', protocol: 'vless' }],
        };
        const { service, calls } = client(profile);
        const updates = [],
            records = [];
        const commandBus = {
            execute: async (command) => {
                updates.push(command.data);
                return result.ok(node);
            },
        };
        const queryBus = {
            execute: async (query) => {
                switch (query.constructor.name) {
                    case 'GetDeviceStateRevisionQuery': return '1';
                    case 'GetPreparedNodePortsQuery': return null;
                    case 'GetPortPlanNodeUuidsQuery': return [];
                    case 'GetNodeByUuidQuery':
                        return result.ok(node);
                    case 'FindNodesByCriteriaQuery':
                        return result.ok([node]);
                    case 'GetPreparedConfigWithUsersQuery':
                        return result.ok({ config, hashesPayload: start.internals.hashes });
                    case 'GetResolvedIntegrationsQuery':
                        return result.ok(new Map());
                    case 'GetAllPluginsQuery':
                        return result.ok([]);
                    default:
                        throw Error(`unexpected query ${query.constructor.name}`);
                }
            },
        };
        let resumed = 0;
        const queues = {
            queues: {
                startNode: { pause: async () => {}, resume: async () => resumed++ },
                startAllNodes: { pause: async () => {}, resume: async () => resumed++ },
            },
            startNode: async () => {},
            collectReports: async () => assert.fail('legacy nodes have no plugin reports'),
        };
        const cache = { delMany: async () => {}, setMany: async () => {}, get: async () => null, set: async () => {} };
        const policies = { syncNode: async () => {} };
        const configurations = new NodeConfigurationService(
            service,
            queues,
            queryBus,
            { emit: () => {} },
            commandBus,
            cache,
            policies,
            {acquire:async()=>null},
        );
        const single = new StartNodeProcessor(configurations);
        await single.process({ data: { nodeUuid: uuid } });
        assert.equal(updates.at(-1).isConnected, true, JSON.stringify(updates));
        const bulk = new StartAllNodesByProfileQueueProcessor(
            service,
            policies,
            queues,
            queryBus,
            commandBus,
            cache,
            configurations,
        );
        await bulk.process({ name: 'start-profile', data: { profileUuid: 'profile' } });
        assert.equal(updates.at(-1).isConnected, true, JSON.stringify(updates));
        assert.equal(resumed, 2);
        if (!profile.plugins)
            assert.equal(calls.filter((call) => call.route === contract.SyncCommand.url).length, 0);
        const health = new NodeHealthCheckQueueProcessor(
            commandBus,
            { emit: () => {} },
            service,
            queues,
            cache,
            { record: async (record) => records.push(record) },
        );
        await health.process({ data: { nodeUuid: uuid, connectionOpts: opts, isConnected: true } });
        assert.equal(records.at(-1).status, 'ok', JSON.stringify(records));
        assert.equal(records.at(-1).metrics.xrayUptime, 120);
        assert.equal(records.at(-1).metrics.memoryUsed, profile.xrayInfo ? 60 : null);
    });

function pendingFixture() {
    const nodes = ['pending', 'ordinary'].map((id) => ({
        ...opts, uuid:id, name:id, id:1, countryCode:'US', tags:[],
        integrationUuids:[], activeConfigProfileUuid:'profile', activePluginUuid:null,
        isConnecting:false, isConnected:true, activeInbounds:[{tag:'vless',protocol:'vless'}],
    }));
    const byId = new Map(nodes.map(node=>[node.uuid,node]));
    const values=new Map(), starts=[], queued=[], updates=[], planResults=[], failures=new Set(['pending']);
    let running=true, available=true, configReads=0;
    const cache={get:async key=>values.get(key)??null,set:async(key,value)=>values.set(key,value),
        delMany:async keys=>keys.forEach(key=>values.delete(key)),setMany:async()=>{},setManyFenced:async()=>true};
    const commandBus={execute:async command=>{
        if(command instanceof RecordPortPlanResultCommand){planResults.push(command);return true;}
        updates.push(command.data);const node=byId.get(command.data.uuid);
        Object.assign(node,command.data);return result.ok(node);
    }};
    const queryBus={execute:async query=>{
        switch(query.constructor.name){
            case 'GetDeviceStateRevisionQuery':return '1';
            case 'GetPreparedNodePortsQuery':return null;
            case 'GetPortPlanNodeUuidsQuery':return [];
            case 'GetNodeByUuidQuery':return result.ok(byId.get(query.data));
            case 'FindNodesByCriteriaQuery':return result.ok(nodes);
            case 'GetPreparedConfigWithUsersQuery':configReads++;return result.ok({config,hashesPayload:start.internals.hashes});
            case 'GetResolvedIntegrationsQuery':return result.ok(new Map());
            case 'GetAllPluginsQuery':return result.ok([]);
            default:throw Error('Unexpected query');
        }
    }};
    const axios={
        hostPolicy:async()=>({isOk:false,code:'NODE_HTTP_404'}),
        syncNodePlugins:async()=>result.ok({accepted:true}),
        getNodeHealth:async()=>available?result.ok({isAlive:true,nodeVersion:'1.0.0',xrayInternalStatusCached:running}):{isOk:false},
        startXray:async(payload,node)=>{starts.push({payload,node});return result.ok({isStarted:true,error:null,nodeInformation:{version:'1.0.0'},version:'test'})},
        getSystemStats:async()=>available&&running?result.ok({xrayInfo,system:null}):{isOk:false,message:'Core statistics unavailable'},
    };
    const policies={syncNode:async node=>{if(failures.has(node.uuid))throw Object.assign(Error('unsupported host policy; secret must not leak'),{code:'HOST_POLICY_NOT_APPLIED'})}};
    const queues={queues:{startNode:{pause:async()=>{},resume:async()=>{}},startAllNodes:{pause:async()=>{},resume:async()=>{}}},
        startNode:async payload=>queued.push(payload)};
    const configurations=new NodeConfigurationService(axios,queues,queryBus,{emit:()=>{}},commandBus,cache,policies,{acquire:async()=>null});
    return {nodes,values,starts,queued,updates,planResults,failures,axios,policies,queryBus,commandBus,
        setRunning:value=>running=value,setAvailable:value=>available=value,
        configReads:()=>configReads,
        single:new StartNodeProcessor(configurations),
        bulk:new StartAllNodesByProfileQueueProcessor(axios,policies,queues,queryBus,commandBus,cache,configurations),
        health:new NodeHealthCheckQueueProcessor(commandBus,{emit:()=>{}},axios,queues,cache,{record:async()=>{}}),
    };
}

function portPlanFixture({supported=true,force=false,responseError=null,transportError=false}={}) {
    const f=pendingFixture();f.failures.clear();
    const plan={config:{...config,outbounds:[{tag:'port-profile:second:o:direct',protocol:'freedom'}]},
        hashesPayload:{emptyConfig:'prepared-port-plan',inbounds:[]},portPlanRevision:'7'};
    const execute=f.queryBus.execute;
    f.queryBus.execute=async query=>query.constructor.name==='GetPreparedNodePortsQuery'?plan:execute(query);
    f.axios.getNodeHealth=async()=>result.ok({isAlive:true,nodeVersion:'1.1.9-remnacust',
        xrayInternalStatusCached:true,nativePortPlansSupported:supported,portPlanDeliverySupported:true,portPlanDeliveryEpoch:'0'});
    const lease={revision:'7',delivery:{epoch:'1',owner:'aaaaaaaa-1111-4111-8111-111111111111'},assert:async()=>{},commit:async fn=>fn(),close:async()=>{}};
    f.single.configurations.leases.acquire=async()=>lease;
    f.lease=lease;
    const start=f.axios.startXray;
    f.axios.startXray=async(payload,node)=>{
        if(transportError){f.starts.push({payload,node});return {isOk:false,message:'Transport unavailable'};}
        const value=await start(payload,node);value.response.error=responseError;return value;
    };
    return {...f,plan,run:()=>f.single.process({data:{nodeUuid:'pending',force}})};
}

test('a native port plan uses its prepared profiles and requires live application before reporting applied',async()=>{
    const f=portPlanFixture();await f.run();
    assert.equal(f.starts.length,1);assert.equal(f.configReads(),0);
    assert.deepEqual(f.starts[0].payload.xrayConfig,f.plan.config);
    assert.equal(f.starts[0].payload.internals.requireLiveApply,true);
    assert.equal(f.starts[0].payload.internals.forceRestart,false);
    assert.deepEqual(f.starts[0].payload.internals.portPlan,{revision:'7',enabled:true,delivery:f.lease.delivery});
    assert.deepEqual(f.planResults.map(r=>[r.nodeUuid,r.revision,r.applied]),[['pending','7',true]]);
    assert.equal(f.nodes[0].isConnected,true);assert.equal(f.nodes[0].lastStatusMessage,null);
});

test('an incompatible node rejects a port plan before plugin changes while retaining its running status',async()=>{
    const f=portPlanFixture({supported:false});
    f.axios.syncNodePlugins=async()=>assert.fail('Must not mutate plugins before capability check');
    await f.run();assert.equal(f.starts.length,0);assert.equal(f.configReads(),0);
    assert.equal(f.nodes[0].isConnected,true);assert.equal(f.nodes[0].isConnecting,false);
    assert.equal(f.planResults.at(-1).applied,false);
    assert.match(f.nodes[0].lastStatusMessage,/Update the node/);
});

test('a rejected live port plan never becomes applied just because the old core is still running',async()=>{
    const f=portPlanFixture({responseError:'Port is occupied'});await f.run();
    assert.equal(f.starts.length,1);assert.equal(f.nodes[0].isConnected,true);
    assert.equal(f.nodes[0].lastStatusMessage,'Port is occupied');
    assert.deepEqual(f.planResults.map(r=>r.applied),[false]);
});

test('a lost port-plan transport acknowledgement cannot report a successful apply or retry with force',async()=>{
    const f=portPlanFixture({transportError:true});await f.run();
    assert.equal(f.starts.length,1);assert.equal(f.starts[0].payload.internals.forceRestart,false);
    assert.deepEqual(f.planResults.map(r=>r.applied),[false]);assert.equal(f.nodes[0].isConnecting,false);
});

test('only an explicit maintenance restart bypasses mandatory live apply for a port plan',async()=>{
    const f=portPlanFixture({force:true});await f.run();
    assert.equal(f.starts.length,1);assert.equal(f.starts[0].payload.internals.forceRestart,true);
    assert.equal(f.starts[0].payload.internals.requireLiveApply,undefined);
    assert.deepEqual(f.starts[0].payload.internals.portPlan,{revision:'7',enabled:true,delivery:f.lease.delivery});
    assert.equal(f.planResults.at(-1).applied,true);
});

test('the reconciliation clock precedes port preparation so concurrent saves are not acknowledged early',async()=>{
    const f=portPlanFixture();const execute=f.queryBus.execute;let currentRevision='10';
    const previousDomain=process.env.PANEL_DOMAIN,previousSecret=process.env.APP_SECRET;
    process.env.PANEL_DOMAIN='https://reconciliation.invalid';process.env.APP_SECRET='synthetic-reconciliation-secret';
    try{
        f.queryBus.execute=async query=>{
            if(query.constructor.name==='GetDeviceStateRevisionQuery')return currentRevision;
            if(query.constructor.name==='GetPreparedNodePortsQuery')currentRevision='11';
            return execute(query);
        };
        await f.run();assert.equal(f.starts.length,1);
        const enrolled=f.starts[0].payload.internals.reconciliation.revision;
        assert.equal(enrolled,'10');assert.notEqual(enrolled,currentRevision,'The next node poll must still detect the concurrent save');
    }finally{
        if(previousDomain===undefined)delete process.env.PANEL_DOMAIN;else process.env.PANEL_DOMAIN=previousDomain;
        if(previousSecret===undefined)delete process.env.APP_SECRET;else process.env.APP_SECRET=previousSecret;
    }
});

test('a failed status write after a live ACK clears connecting and retains the confirmed running core',async()=>{
    const f=portPlanFixture();const execute=f.commandBus.execute;
    f.commandBus.execute=async command=>{
        if(command instanceof RecordPortPlanResultCommand)throw Error('Status database unavailable');
        return execute(command);
    };
    await f.run();assert.equal(f.starts.length,1);
    assert.equal(f.nodes[0].isConnecting,false);assert.equal(f.nodes[0].isConnected,true);
    assert.match(f.nodes[0].lastStatusMessage,/Status database unavailable/);
    assert.equal(f.planResults.length,0);
});

function managedBulkFixture(options={}){
    const f=portPlanFixture(options);const execute=f.queryBus.execute;
    f.nodes[0].activeConfigProfileUuid='another-primary';
    f.nodes[0].activeInbounds=[{uuid:'secondary-inbound',profileUuid:'profile',tag:'secondary',protocol:'vless'}];
    f.queryBus.execute=async query=>{
        if(query.constructor.name==='GetPortPlanNodeUuidsQuery')return ['pending'];
        if(query.constructor.name==='FindNodesByCriteriaQuery'){
            assert.deepEqual(query.data.OR,[{activeConfigProfileUuid:'profile'},
                {configProfileInboundsToNodes:{some:{configProfileInbounds:{profileUuid:'profile'}}}}]);
        }
        if(query.constructor.name==='GetPreparedNodePortsQuery')return query.data==='pending'?f.plan:null;
        return execute(query);
    };
    return {...f,runBulk:(force=false)=>f.bulk.process({name:'start-profile',data:{profileUuid:'profile',force}})};
}

test('bulk apply includes secondary profiles and never sends their node a shared single-profile config',async()=>{
    const f=managedBulkFixture();await f.runBulk();assert.equal(f.starts.length,2);
    const managed=f.starts.find(item=>item.payload.internals.metadata.uuid==='pending').payload;
    const legacy=f.starts.find(item=>item.payload.internals.metadata.uuid==='ordinary').payload;
    assert.deepEqual(managed.xrayConfig,f.plan.config);assert.equal(managed.internals.requireLiveApply,true);
    assert.deepEqual(legacy.xrayConfig,config);assert.equal(legacy.internals.requireLiveApply,undefined);
    assert.deepEqual(f.planResults.map(r=>[r.nodeUuid,r.revision,r.applied]),[['pending','7',true]]);
    assert.equal(f.configReads(),1,'Only the legacy path prepares the shared profile');
});

test('bulk live rejection keeps that node online and does not prevent applying the ordinary node',async()=>{
    const f=managedBulkFixture();const start=f.axios.startXray;
    f.axios.startXray=async(payload,node)=>{const response=await start(payload,node);
        if(payload.internals.requireLiveApply)response.response.error='Listener occupied';return response;};
    await f.runBulk();assert.equal(f.starts.length,2);assert.equal(f.nodes[0].isConnected,true);
    assert.equal(f.nodes[0].lastStatusMessage,'Listener occupied');assert.equal(f.nodes[1].lastStatusMessage,null);
    assert.equal(f.planResults.at(-1).applied,false);
});

test('legacy bulk preparation failure cannot suppress an independently prepared port plan',async()=>{
    const f=managedBulkFixture();const execute=f.queryBus.execute;
    f.queryBus.execute=async query=>query.constructor.name==='GetAllPluginsQuery'?{isOk:false,message:'Unavailable'}:execute(query);
    await f.runBulk();assert.equal(f.starts.length,1);
    assert.deepEqual(f.starts[0].payload.xrayConfig,f.plan.config);assert.equal(f.planResults.at(-1).applied,true);
    assert(f.nodes.every(node=>!node.isConnecting));
});

test('an explicitly requested bulk maintenance restart reaches the complete port plan',async()=>{
    const f=managedBulkFixture();await f.runBulk(true);
    const managed=f.starts.find(item=>item.payload.internals.metadata.uuid==='pending').payload;
    assert.deepEqual(managed.xrayConfig,f.plan.config);assert.equal(managed.internals.forceRestart,true);
    assert.equal(managed.internals.requireLiveApply,undefined);
});

test('a port-managed node disabled after bulk discovery cannot be started by stale discovery',async()=>{
    const f=managedBulkFixture();const execute=f.queryBus.execute;
    f.queryBus.execute=async query=>{if(query.constructor.name==='GetNodeByUuidQuery')f.nodes[0].isDisabled=true;return execute(query);};
    await f.runBulk();assert.equal(f.starts.length,1);
    assert.equal(f.starts[0].payload.internals.metadata.uuid,'ordinary');assert.equal(f.planResults.length,0);
});

test('a failed preparation records its version as failed without touching plugins or the running core',async()=>{
    const f=pendingFixture();f.failures.clear();const execute=f.queryBus.execute;
    const {PortPlanPreparationError}=processorMocks['@modules/nodes/profile-port-plan'];
    f.queryBus.execute=async query=>{if(query.constructor.name==='GetPreparedNodePortsQuery')throw new PortPlanPreparationError('INBOUND_MISSING','8');return execute(query);};
    f.axios.syncNodePlugins=async()=>assert.fail('No plugin mutation for an invalid port plan');
    await f.single.process({data:{nodeUuid:'pending'}});
    assert.equal(f.starts.length,0);assert.equal(f.nodes[0].isConnected,true);assert.equal(f.nodes[0].isConnecting,false);
    assert.deepEqual(f.planResults.map(r=>[r.revision,r.applied]),[['8',false]]);
});

test('a confirmed versioned profile mode can update on a node whose selected core lacks native ports',async()=>{
    const f=portPlanFixture({supported:false});f.plan.portPlanEnabled=false;
    f.axios.getNodeHealth=async()=>result.ok({isAlive:true,nodeVersion:'1.1.9-remnacust',xrayInternalStatusCached:true,nativePortPlansSupported:false,portPlanStateSupported:true,portPlanDeliverySupported:true,portPlanDeliveryEpoch:'0'});
    await f.run();assert.equal(f.starts.length,1);assert.deepEqual(f.starts[0].payload.internals.portPlan,{revision:'7',enabled:false,delivery:f.lease.delivery});
    assert.equal(f.starts[0].payload.internals.requireLiveApply,undefined);assert.equal(f.planResults.at(-1).applied,true);
});

test('an unavailable assigned plugin clears the connecting state and permits a later retry',async()=>{
    const f=pendingFixture();
    f.failures.clear();
    f.nodes[0].activePluginUuid='assigned-plugin';
    f.axios.getNodeHealth=async()=>result.ok({isAlive:true,nodeVersion:'3.4.1',xrayInternalStatusCached:true});
    const execute=f.queryBus.execute;
    let available=false;
    f.queryBus.execute=async query=>query.constructor.name==='GetPluginByUuidQuery'
        ? available?result.ok({uuid:'assigned-plugin',name:'test',pluginConfig:{}}):{isOk:false,message:'not found'}
        : execute(query);
    await f.single.process({data:{nodeUuid:'pending'}});
    assert.equal(f.nodes[0].isConnecting,false);
    assert.equal(f.nodes[0].isConnected,true);
    assert.match(f.nodes[0].lastStatusMessage,/plugin/i);
    assert.equal(f.starts.length,0);
    available=true;
    await f.single.process({data:{nodeUuid:'pending'}});
    assert.equal(f.starts.length,1);
    assert.equal(f.nodes[0].isConnected,true);
    assert.equal(f.nodes[0].isConnecting,false);
});

for(const failedQuery of ['GetAllPluginsQuery','GetResolvedIntegrationsQuery','GetPreparedConfigWithUsersQuery'])
    test(`bulk preparation failure in ${failedQuery} permits a later retry`,async()=>{
        const f=pendingFixture();f.failures.clear();
        const execute=f.queryBus.execute;
        f.queryBus.execute=async query=>query.constructor.name===failedQuery?{isOk:false,message:'unavailable'}:execute(query);
        await f.bulk.process({name:'start-profile',data:{profileUuid:'profile'}});
        assert(f.nodes.every(node=>!node.isConnecting));
        assert.equal(f.starts.length,0);
        f.queryBus.execute=execute;
        await f.bulk.process({name:'start-profile',data:{profileUuid:'profile'}});
        assert.equal(f.starts.length,2);
        assert(f.nodes.every(node=>node.isConnected&&!node.isConnecting));
    });

test('a missing plugin or thrown transport error on one node does not abort other bulk starts',async()=>{
    for(const mode of ['plugin','transport']){
        const f=pendingFixture();f.failures.clear();
        if(mode==='plugin')f.nodes[0].activePluginUuid='removed-plugin';
        f.axios.getNodeHealth=async opts=>{
            if(mode==='transport'&&opts.address===f.nodes[0].address&&opts.port===f.nodes[0].port){
                // Fixture nodes share their address; fail only the first probe.
                f.axios.getNodeHealth=async()=>result.ok({isAlive:true,nodeVersion:'3.4.1',xrayInternalStatusCached:true});
                throw Error('transport unavailable');
            }
            return result.ok({isAlive:true,nodeVersion:'3.4.1',xrayInternalStatusCached:true});
        };
        await f.bulk.process({name:'start-profile',data:{profileUuid:'profile'}});
        assert(f.nodes.every(node=>!node.isConnecting));
        assert.match(f.nodes[0].lastStatusMessage,/plugin|start failed/i);
        assert.equal(f.starts.length,1);
        assert.equal(f.nodes[1].isConnected,true);
        assert.equal(f.nodes[1].lastStatusMessage,null);
    }
});

test('bulk startup never starts a node that was just disabled for having no active inbounds',async()=>{
    const f=pendingFixture();f.failures.clear();f.nodes[0].activeInbounds=[];
    const stopped=[];
    f.bulk.nodesQueuesService.stopNode=async payload=>stopped.push(payload.nodeUuid);
    await f.bulk.process({name:'start-profile',data:{profileUuid:'profile'}});
    assert.deepEqual(stopped,['pending']);
    assert.equal(f.nodes[0].isDisabled,true);
    assert.equal(f.nodes[0].isConnected,false);
    assert.equal(f.starts.length,1);
    assert.equal(f.nodes[1].isConnected,true);
});

test('a failed pause still releases both queues, including when one resume fails',async()=>{
    const f=pendingFixture();const resumed=[];
    f.bulk.nodesQueuesService.queues.startAllNodes.pause=async()=>{throw Error('pause failed')};
    f.bulk.nodesQueuesService.queues.startNode.resume=async()=>{resumed.push('single');throw Error('resume failed')};
    f.bulk.nodesQueuesService.queues.startAllNodes.resume=async()=>resumed.push('bulk');
    await f.bulk.process({name:'start-profile',data:{profileUuid:'profile'}});
    assert.deepEqual(resumed,['single','bulk']);
    assert.equal(f.starts.length,0);
    assert(f.nodes.every(node=>!node.isConnecting));
});

test('failed host policy keeps a confirmed running node online and never sends unchecked credentials',async()=>{
    const f=pendingFixture();await f.single.process({data:{nodeUuid:'pending'}});
    assert.equal(f.nodes[0].isConnected,true);assert.equal(f.nodes[0].isConnecting,false);
    assert.match(f.nodes[0].lastStatusMessage,/^\[HOST_POLICY_UPGRADE_REQUIRED\]/);
    assert(!f.nodes[0].lastStatusMessage.includes('secret'));
    assert.equal(f.starts.length,0);assert.equal(f.configReads(),1);
    assert(f.values.has('remnacust:host-policy:retry:pending'));
});

test('a stopped or unreachable core is never declared healthy after a policy failure',async()=>{
    for(const available of [true,false]){
        const f=pendingFixture();f.setRunning(false);f.setAvailable(available);
        await f.single.process({data:{nodeUuid:'pending'}});
        assert.equal(f.nodes[0].isConnected,false);assert.equal(f.starts.length,0);
    }
});

test('bulk startup isolates a policy failure without changing its config or blocking another node',async()=>{
    const f=pendingFixture();await f.bulk.process({name:'start-profile',data:{profileUuid:'profile'}});
    assert.equal(f.nodes[0].isConnected,true);assert.match(f.nodes[0].lastStatusMessage,/HOST_POLICY_UPGRADE_REQUIRED/);
    assert.equal(f.starts.length,1);assert.equal(f.starts[0].payload.internals.metadata.uuid,'ordinary');
    assert.equal(f.nodes[1].lastStatusMessage,null);
});

test('health retries pending configuration at its deadline and clears the warning after successful apply',async()=>{
    const f=pendingFixture();await f.single.process({data:{nodeUuid:'pending'}});
    const job={data:{nodeUuid:'pending',isConnected:true,connectionOpts:opts}};
    await f.health.process(job);assert.equal(f.queued.length,0);
    f.values.set('remnacust:host-policy:retry:pending',Date.now()-1);
    await f.health.process(job);assert.deepEqual(f.queued,[{nodeUuid:'pending'}]);
    assert.equal(f.nodes[0].isConnected,true);
    f.failures.clear();await f.single.process({data:{nodeUuid:'pending'}});
    assert.equal(f.starts.length,1);assert.equal(f.nodes[0].lastStatusMessage,null);
    assert(!f.values.has('remnacust:host-policy:retry:pending'));
    await f.health.process(job);assert.equal(f.queued.length,1);
});

test('database failures and transport outages on our modern node never demand a custom node upgrade',async()=>{
    for(const cause of ['database','transport']){
        const f=pendingFixture();
        if(cause==='database') f.policies.syncNode=async()=>{throw Error('database unavailable')};
        else {
            f.axios.getNodeHealth=async()=>result.ok({isAlive:true,nodeVersion:'1.1.1-remnacust',xrayInternalStatusCached:true});
            f.axios.hostPolicy=async()=>({isOk:false,code:'ECONNRESET'});
        }
        await f.single.process({data:{nodeUuid:'pending'}});
        assert.match(f.nodes[0].lastStatusMessage,/^\[HOST_POLICY_PENDING\]/);
        assert.equal(f.nodes[0].isConnected,true);assert.equal(f.starts.length,0);
    }
});

test('a stopped core waits for the policy deadline and preserves its upgrade notice',async()=>{
    const f=pendingFixture();f.setRunning(false);
    await f.single.process({data:{nodeUuid:'pending'}});
    const notice=f.nodes[0].lastStatusMessage;
    const job={data:{nodeUuid:'pending',isConnected:false,connectionOpts:opts}};
    await f.health.process(job);await f.health.process(job);
    assert.equal(f.queued.length,0);
    assert.equal(f.nodes[0].isConnected,false);
    assert.equal(f.nodes[0].lastStatusMessage,notice);
    f.values.set('remnacust:host-policy:retry:pending',Date.now()-1);
    await f.health.process(job);
    assert.deepEqual(f.queued,[{nodeUuid:'pending'}]);
    assert.equal(f.nodes[0].lastStatusMessage,notice);
});

test('reconnection keeps a future policy deadline, while an ordinary failure retries immediately',async()=>{
    const f=pendingFixture();f.setRunning(false);
    await f.single.process({data:{nodeUuid:'pending'}});
    f.setRunning(true);
    await f.health.process({data:{nodeUuid:'pending',isConnected:false,connectionOpts:opts}});
    assert.equal(f.nodes[0].isConnected,true);
    assert.equal(f.queued.length,0);
    assert.match(f.nodes[0].lastStatusMessage,/HOST_POLICY_UPGRADE_REQUIRED/);
    const ordinary=pendingFixture();ordinary.setRunning(false);
    await ordinary.health.process({data:{nodeUuid:'ordinary',isConnected:true,connectionOpts:opts}});
    assert.equal(ordinary.nodes[1].isConnected,false);
    assert.deepEqual(ordinary.queued,[{nodeUuid:'ordinary'}]);
    assert.equal(ordinary.nodes[1].lastStatusMessage,'Core statistics unavailable');
});


test('owned delivery recovers an abandoned connecting flag without waiting for a health timestamp',async()=>{
    const f=portPlanFixture();f.nodes[0].isConnecting=true;await f.run();
    assert.equal(f.starts.length,1);assert.equal(f.nodes[0].isConnecting,false);assert.equal(f.planResults.at(-1).applied,true);
});
test('a busy delivery leaves the current owner untouched',async()=>{
    const f=portPlanFixture();f.nodes[0].isConnecting=true;f.single.configurations.leases.acquire=async()=> 'busy';
    await f.run();assert.equal(f.starts.length,0);assert.equal(f.updates.length,0);assert.equal(f.nodes[0].isConnecting,true);
});
test('late native response from a lost owner cannot acknowledge the plan or clear a new owner status',async()=>{
    const f=portPlanFixture(),start=f.axios.startXray;
    f.axios.startXray=async(...args)=>{
        const response=await start(...args);f.nodes[0].lastStatusMessage='new-owner';
        f.lease.assert=async()=>{throw new leaseContract.PortPlanLeaseLostError();};return response;
    };
    await f.run();assert.equal(f.starts.length,1);assert.equal(f.planResults.length,0);
    assert.equal(f.nodes[0].isConnecting,true);assert.equal(f.nodes[0].lastStatusMessage,'new-owner');
});
test('native port capability without delivery fencing rejects managed mutations before plugins',async()=>{
    const f=portPlanFixture(),health=f.axios.getNodeHealth;
    f.axios.getNodeHealth=async()=>{const response=await health();delete response.response.portPlanDeliverySupported;return response;};
    f.axios.syncNodePlugins=async()=>assert.fail('Must not change plugins without delivery fencing');
    await f.run();assert.equal(f.starts.length,0);assert.equal(f.nodes[0].isConnected,true);assert.match(f.nodes[0].lastStatusMessage,/Update the node/);
});
test('standalone plugin updates for port-managed nodes use the same owned executor',async()=>{
    const {NodePluginsProcessor}=load(path.join(__dirname,'../src/queue/_nodes/processors/node-plugins.processor.ts'),{
        ...processorMocks,'@libs/contracts/constants/events/events':{EVENTS:{}},'@queue/_users/users-queues.service':{},
    });
    const calls=[],processor=new NodePluginsProcessor({syncNodePlugins:async()=>assert.fail('No unversioned sync')},
        {execute:async query=>{assert.equal(query.constructor.name,'GetPortPlanNodeUuidsQuery');return ['managed'];}},
        {},{apply:async payload=>calls.push(payload)});
    await processor.handleSyncNodePlugins({data:{nodeUuid:'managed'}});assert.deepEqual(calls,[{nodeUuid:'managed'}]);
});
