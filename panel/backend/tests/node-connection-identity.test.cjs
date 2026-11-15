const assert = require('node:assert/strict');
const path = require('node:path');
const https = require('node:https');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { AxiosError } = require('axios');
const { GetNodeHealthCheckCommand } = require('@remnawave/node-contract');
const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');
const load = require('./load-typescript.cjs');

const root = path.join(__dirname, '../src/common');
const errors = {
    INTERNAL_SERVER_ERROR: { code: 'INTERNAL', message: 'internal' },
    NODE_ERROR_WITH_MSG: { withMessage: (message) => ({ code: 'NODE_ERROR', message }) },
    NODE_ERROR_500_WITH_MSG: { withMessage: (message) => ({ code: 'NODE_500', message }) },
};
const { AxiosService } = load(path.join(root, 'axios/axios.service.ts'), {
    '@common/config/app-config/typed-config.service': {},
    '@common/raw-cache': {},
    '@common/xray-mode/xray-mode.service': {},
    '@common/utils/bytes': { prettyBytesUtil: String },
    '@common/utils/certs': { deriveSni: () => 'fixture.invalid' },
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@common/utils/node-version': {
        nodeSupportsBulkUsers: () => false,
        nodeSupportsCompression: () => false,
        nodeSupportsPlugins: () => false,
        nodeSupportsWrappedConfig: () => false,
    },
    '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
    '@contract/constants': { ERRORS: errors },
    '../types': {
        ok: (response) => ({ isOk: true, response }),
        fail: (error) => ({ isOk: false, ...error }),
    },
});
const { NodeRouteRegistryService } = load(path.join(root, 'axios/node-route-registry.service.ts'), {
    './node-route-inventory.service': {},
    '../constants/nodes/ip-statuses': load(
        path.join(__dirname, '../libs/contract/constants/nodes/ip-statuses/index.ts'),
    ),
});
const node = '11111111-1111-4111-8111-111111111111';
const disabledNode = '22222222-2222-4222-8222-222222222222';
const instance = '33333333-3333-4333-8333-333333333333';
const savedProxy = 'socks5://fixture:synthetic-only@proxy.invalid:1080';
const registeredAddress = 'registered.fixture.invalid';

function row(overrides = {}) {
    return {
        uuid: node,
        address: 'sql-producer.fixture.invalid',
        port: 2222,
        proxyUrl: savedProxy,
        ips: [],
        controlAddresses: [{ address: registeredAddress, enabled: true }],
        isDisabled: false,
        ...overrides,
    };
}

function registeredControl(inventory = { nodes: { findMany: async () => [row()] } }) {
    const values = new Map();
    const cache = {
        get: async (key) => values.get(key) ?? null,
        set: async (key, value) => {
            values.set(key, value);
        },
    };
    const registry = new NodeRouteRegistryService({
        readRevision: async () => 'fixture-revision',
        ...inventory,
    });
    const service = new AxiosService({}, cache, {}, registry);
    const requests = [];
    const agents = [];
    const agent = new https.Agent({ rejectUnauthorized: true });
    service.mtlsOptions = {};
    service.logger = { error() {}, warn() {}, log() {} };
    service.resolveAgent = (proxyUrl, owner) => {
        agents.push({ proxyUrl, owner });
        return agent;
    };
    service.axiosInstance.get = async (url, config) => {
        requests.push({ url, config });
        return { data: { response: { applied: false } } };
    };
    service.axiosInstance.post = async () => {
        throw Error('Unexpected mutation request');
    };
    return { service, requests, agents, close: () => agent.destroy() };
}

test('registered control resolves the authoritative UUID instead of trusting supplied endpoint fields', async (t) => {
    const f = registeredControl();
    t.after(f.close);
    const opts = {
        uuid: node,
        address: 'unregistered.fixture.invalid',
        port: 3333,
        proxyUrl: null,
    };
    const before = structuredClone(opts);
    assert.equal((await f.service.hostPolicy(opts)).isOk, true);
    assert.deepEqual(opts, before);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, `https://${registeredAddress}:2222/node/xray/host-policy`);
    assert.deepEqual(f.agents, [{ proxyUrl: savedProxy, owner: node }]);
    assert.equal(f.requests[0].config.httpsAgent.options.rejectUnauthorized, true);
    assert.equal(f.requests[0].config.maxRedirects, 0);
});

test('missing and unknown UUIDs cannot borrow a registered address or use legacy HTTP permission', async (t) => {
    const f = registeredControl();
    t.after(f.close);
    const previous = process.env.REMNACUST_LEGACY_HTTP_NODES;
    process.env.REMNACUST_LEGACY_HTTP_NODES = `${registeredAddress}:2222`;
    try {
        for (const uuid of [undefined, randomUUID()]) {
            const result = await f.service.getNodeHealth({
                uuid,
                address: registeredAddress,
                port: 2222,
                proxyUrl: savedProxy,
            });
            assert.equal(result.isOk, false);
            assert.match(result.message, uuid ? /not registered/ : /UUID required/);
        }
    } finally {
        if (previous === undefined) delete process.env.REMNACUST_LEGACY_HTTP_NODES;
        else process.env.REMNACUST_LEGACY_HTTP_NODES = previous;
    }
    assert.equal(f.requests.length, 0);
    assert.equal(f.agents.length, 0);
});

test('legacy health fallback retains the registered identity, selected address and SOCKS proxy', async (t) => {
    const f = registeredControl();
    t.after(f.close);
    f.service.axiosInstance.get = async (url, config) => {
        f.requests.push({ url, config });
        if (url.endsWith(GetNodeHealthCheckCommand.url))
            throw new AxiosError('Synthetic legacy API', undefined, config, undefined, {
                status: 404,
            });
        assert.ok(url.endsWith('/node/xray/status'));
        return { data: { response: { isRunning: true, version: 'fixture' } } };
    };
    const result = await f.service.getNodeHealth({
        uuid: node,
        address: 'stale.invalid',
        port: 4444,
        proxyUrl: null,
    });
    assert.equal(result.isOk, true);
    assert.equal(result.response.xrayInternalStatusCached, true);
    assert.deepEqual(
        f.requests.map((request) => new URL(request.url).pathname),
        [GetNodeHealthCheckCommand.url, '/node/xray/status'],
    );
    assert.ok(f.requests.every((request) => new URL(request.url).hostname === registeredAddress));
    assert.deepEqual(f.agents, [
        { proxyUrl: savedProxy, owner: node },
        { proxyUrl: savedProxy, owner: node },
    ]);
});

test('a known UUID cannot send control traffic through a disabled node or an all-disabled address list', async (t) => {
    for (const overrides of [
        { isDisabled: true },
        { controlAddresses: [{ address: registeredAddress, enabled: false }] },
    ]) {
        const f = registeredControl({ nodes: { findMany: async () => [row(overrides)] } });
        t.after(f.close);
        assert.equal(
            (
                await f.service.hostPolicy({
                    uuid: node,
                    address: registeredAddress,
                    port: 2222,
                    proxyUrl: null,
                })
            ).isOk,
            false,
        );
        assert.equal(f.requests.length, 0);
    }
});

test('explicit recovery archive collection preserves the existing disabled-node capture contract', async (t) => {
    const stored = row({ isDisabled: true });
    const before = structuredClone(stored);
    const f = registeredControl({ nodes: { findMany: async () => [stored] } });
    t.after(f.close);
    const request = { generation: randomUUID(), requestId: randomUUID() };
    const response = { version: 'controlled-archive-fixture' };
    f.service.axiosInstance.post = async (url, body, config) => {
        f.requests.push({ url, body, config });
        assert.equal(new URL(url).pathname, '/node/xray/usage-receipts/archive');
        assert.deepEqual(body, request);
        return { data: { response } };
    };
    const result = await f.service.usageArchive(
        {
            uuid: node,
            address: stored.address,
            port: stored.port,
            proxyUrl: stored.proxyUrl,
        },
        request,
    );
    assert.equal(result.isOk, true, `Disabled-node archive capture is blocked: ${result.message}`);
    assert.deepEqual(result.response, response);
    assert.equal(f.requests.length, 1);
    assert.equal(new URL(f.requests[0].url).hostname, registeredAddress);
    assert.deepEqual(f.agents, [{ proxyUrl: savedProxy, owner: node }]);
    assert.deepEqual(stored, before, 'Reading an archive must not enable or modify the node');
});

test('archive collection cannot bypass registered identity even for a known disabled-node address', async (t) => {
    const f = registeredControl({ nodes: { findMany: async () => [row({ isDisabled: true })] } });
    t.after(f.close);
    f.service.axiosInstance.post = async (url, body, config) => {
        f.requests.push({ url, body, config });
        return { data: { response: { version: 'unexpected-archive-fixture' } } };
    };
    for (const uuid of [undefined, randomUUID()]) {
        const result = await f.service.usageArchive(
            {
                uuid,
                address: registeredAddress,
                port: 2222,
                proxyUrl: savedProxy,
            },
            { generation: randomUUID(), requestId: randomUUID() },
        );
        assert.equal(result.isOk, false);
        assert.match(result.message, uuid ? /not registered/ : /UUID required/);
    }
    assert.equal(f.requests.length, 0);
    assert.equal(f.agents.length, 0);
});

test('recovery archive collection cannot bypass an all-disabled canonical address list', async (t) => {
    for (const isDisabled of [false, true]) {
        const stored = row({
            isDisabled,
            controlAddresses: [{ address: registeredAddress, enabled: false }],
        });
        const before = structuredClone(stored);
        const f = registeredControl({ nodes: { findMany: async () => [stored] } });
        t.after(f.close);
        f.service.axiosInstance.post = async (url, body, config) => {
            f.requests.push({ url, body, config });
            return { data: { response: { version: 'unexpected-archive-fixture' } } };
        };
        const result = await f.service.usageArchive(
            {
                uuid: node,
                address: stored.address,
                port: stored.port,
                proxyUrl: stored.proxyUrl,
            },
            { generation: randomUUID(), requestId: randomUUID() },
        );
        assert.equal(result.isOk, false);
        assert.equal(f.requests.length, 0);
        assert.equal(f.agents.length, 0);
        assert.deepEqual(stored, before);
    }
});

function disposableDatabaseUrl(value) {
    const parsed = new URL(value);
    assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol));
    assert.equal(parsed.hostname, '127.0.0.1');
    assert.equal(parsed.port, '55439');
    assert.equal(parsed.pathname, '/remnacust_node_connection_identity_test');
    assert.equal(parsed.search, '');
    assert.equal(parsed.hash, '');
    return parsed.href;
}

test('the SQL identity fixture rejects remote, default-port, unrelated and parameterized database targets', () => {
    const valid = 'postgresql://postgres@127.0.0.1:55439/remnacust_node_connection_identity_test';
    assert.equal(disposableDatabaseUrl(valid), valid);
    for (const candidate of [
        valid.replace('127.0.0.1', 'db.invalid'),
        valid.replace('55439', '5432'),
        valid.replace('remnacust_node_connection_identity_test', 'postgres'),
        `${valid}?host=db.invalid`,
        `${valid}#other`,
        valid.replace('postgresql:', 'https:'),
    ])
        assert.throws(() => disposableDatabaseUrl(candidate));
});

const databaseUrl = process.env.NODE_CONNECTION_IDENTITY_TEST_DATABASE_URL;
test(
    'real PostgreSQL endpoint producers reach registered control with their authoritative node UUID',
    {
        skip:
            !databaseUrl &&
            'Set NODE_CONNECTION_IDENTITY_TEST_DATABASE_URL to the dedicated empty fixture database',
        timeout: 20000,
    },
    async (t) => {
        const pool = new Pool({
            connectionString: disposableDatabaseUrl(databaseUrl),
            max: 1,
            connectionTimeoutMillis: 3000,
            statement_timeout: 5000,
            query_timeout: 6000,
        });
        const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
        t.after(() => db.destroy());
        assert.equal(
            (await sql`SELECT current_database() AS name`.execute(db)).rows[0].name,
            'remnacust_node_connection_identity_test',
        );
        assert.equal(
            (
                await sql`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'`.execute(
                    db,
                )
            ).rows[0].count,
            0,
            'A fresh disposable database is required; existing application tables must not be touched',
        );
        await sql`CREATE TEMP TABLE nodes (
        uuid uuid PRIMARY KEY, id bigint, address text, port integer, proxy_url text,
        is_disabled boolean NOT NULL, ips jsonb NOT NULL, control_addresses jsonb NOT NULL
    )`.execute(db);
        await sql`CREATE TEMP TABLE xera_quota_node_modes (node_uuid uuid PRIMARY KEY, instance_uuid uuid)`.execute(
            db,
        );
        await sql`INSERT INTO nodes VALUES
        (${node}::uuid,901,'sql-producer.fixture.invalid',2222,${savedProxy},false,'[]',
         ${JSON.stringify([{ address: registeredAddress, enabled: true }])}::jsonb),
        (${disabledNode}::uuid,902,'disabled.fixture.invalid',3333,NULL,true,'[]',
         '[{"address":"disabled.fixture.invalid","enabled":true}]')`.execute(db);
        await sql`INSERT INTO xera_quota_node_modes VALUES (${node}::uuid,${instance}::uuid)`.execute(
            db,
        );
        const f = registeredControl({
            nodes: {
                findMany: () =>
                    db
                        .selectFrom('nodes')
                        .select([
                            'uuid',
                            'address',
                            'port',
                            'proxy_url as proxyUrl',
                            'is_disabled as isDisabled',
                            'ips',
                            'control_addresses as controlAddresses',
                        ])
                        .execute(),
            },
        });
        t.after(f.close);
        const producers = [
            ['quota-exposure-closure', 'QuotaExposureClosureService', 'endpoint', /NODE_MISSING/],
            ['quota-recovery-release', 'QuotaRecoveryReleaseService', 'endpoint', /NOT_READY/],
            ['quota-recovery-policy', 'QuotaRecoveryPolicyService', 'node'],
            ['quota-recovery-receipt', 'QuotaRecoveryReceiptService', 'node'],
            ['quota-recovery-tail', 'QuotaRecoveryTailService', 'node'],
            ['quota-release-delivery', 'QuotaReleaseDeliveryService', 'endpoint', /SOURCE_CHANGED/],
        ];
        for (const [file, name, method, missing] of producers) {
            await t.test(file, async () => {
                const Type = load(path.join(root, 'host-policy', `${file}.service.ts`), {
                    '@common/database': {},
                    '@common/axios': {},
                })[name];
                const endpoint = (uuid) =>
                    Type.prototype[method].call({ db: { kysely: db } }, uuid);
                const opts = await endpoint(node);
                const result = await f.service.hostPolicy(opts);
                assert.equal(
                    result.isOk,
                    true,
                    `${file}: SQL identity must survive the real registered request path`,
                );
                assert.equal(opts.uuid, node);
                const request = f.requests.at(-1);
                assert.equal(new URL(request.url).hostname, registeredAddress);
                assert.deepEqual(f.agents.at(-1), { proxyUrl: savedProxy, owner: node });
                for (const absent of [disabledNode, randomUUID()]) {
                    if (missing) await assert.rejects(endpoint(absent), missing);
                    else assert.equal(await endpoint(absent), undefined);
                }
            });
        }
        assert.equal(f.requests.length, producers.length);
    },
);
