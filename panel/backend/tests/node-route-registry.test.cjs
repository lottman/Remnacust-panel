require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const { Module, Global, Inject } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const cqrs = require('@nestjs/cqrs');
class PrismaService {}
class NodeRouteInventoryService {
    constructor(prisma) {
        this.prisma = prisma;
        this.nodes = prisma.nodes;
    }
    readRevision() {
        return this.prisma.readRevision();
    }
}
Inject(PrismaService)(NodeRouteInventoryService, undefined, 0);
class RawCacheService {}
class TypedConfigService {}
class FixtureCqrsModule {}
Module({
    providers: [{ provide: cqrs.CommandBus, useValue: { execute: async () => ({ isOk: false }) } }],
    exports: [cqrs.CommandBus],
})(FixtureCqrsModule);
const mocks = {
    './node-route-inventory.service': { NodeRouteInventoryService },
    '@common/database/prisma.service': { PrismaService },
    '@common/raw-cache': { RawCacheService },
    '@common/config/app-config/typed-config.service': { TypedConfigService },
    '@nestjs/cqrs': { ...cqrs, CqrsModule: FixtureCqrsModule },
    '@common/utils/bytes': { prettyBytesUtil: String },
    '@common/utils/certs': { deriveSni: () => 'fixture.invalid' },
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@common/utils/node-version': { nodeSupportsCompression: () => false },
    '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
    '@contract/constants': { ERRORS: {} },
    '../types': {
        ok: (response) => ({ isOk: true, response }),
        fail: (error) => ({ isOk: false, ...error }),
    },
};
const loaded = new Map();
function source(filename) {
    if (loaded.has(filename)) return loaded.get(filename);
    const ref = { exports: {} };
    loaded.set(filename, ref.exports);
    const local = createRequire(filename);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            esModuleInterop: true,
        },
    }).outputText;
    new Function('require', 'module', 'exports', compiled)(
        (id) => {
            if (Object.hasOwn(mocks, id)) return mocks[id];
            if (id.startsWith('@common/xray-mode/'))
                return source(
                    path.join(
                        __dirname,
                        '../src/common/xray-mode',
                        id.slice('@common/xray-mode/'.length) + '.ts',
                    ),
                );
            const relative = id.startsWith('.')
                ? path.resolve(path.dirname(filename), id + '.ts')
                : '';
            if (relative && fs.existsSync(relative)) return source(relative);
            const index = id.startsWith('.')
                ? path.resolve(path.dirname(filename), id, 'index.ts')
                : '';
            if (index && fs.existsSync(index)) return source(index);
            return local(id);
        },
        ref,
        ref.exports,
    );
    loaded.set(filename, ref.exports);
    return ref.exports;
}
const root = path.join(__dirname, '../src/common/axios');
const { XrayModeService } = source(
    path.join(__dirname, '../src/common/xray-mode/xray-mode.service.ts'),
);
mocks['@common/xray-mode/xray-mode.service'] = { XrayModeService };
const { AxiosModule } = source(path.join(root, 'axios.module.ts'));
const { AxiosService } = source(path.join(root, 'axios.service.ts'));
const { NodeRouteRegistryService } = source(path.join(root, 'node-route-registry.service.ts'));
const { NodeRouteRegistry, routeCandidates } = source(path.join(root, 'node-control-route.ts'));
const uuid = '11111111-1111-4111-8111-111111111111';
function row() {
    return {
        uuid,
        address: 'primary.invalid',
        port: 2222,
        proxyUrl: null,
        ips: [{ ip: '192.0.2.1', status: 'MANAGEMENT' }],
        controlAddresses: [
            { address: 'primary.invalid', enabled: true },
            { address: '192.0.2.1', enabled: true },
        ],
        isDisabled: false,
    };
}

test('fresh database revisions fence routes independently of Redis and fail closed on inventory outages', async () => {
    const cache = { get: async () => null, set: async () => {} };
    let revision = randomUUID();
    const db = { readRevision: async () => revision, nodes: { findMany: async () => [row()] } };
    const registry = new NodeRouteRegistryService(new NodeRouteInventoryService(db));
    const initial = await registry.get({ uuid });
    const service = new AxiosService({}, cache, {}, registry);
    service.initialization = Promise.resolve();
    let dispatched = 0;
    service.axiosInstance.get = async () => {
        dispatched++;
        throw Error('Unexpected node request');
    };
    cache.get = async () => {
        throw Error('synthetic Redis connection outage');
    };
    assert.equal(await registry.isCurrent(initial), true);
    assert.equal((await service.getSystemStats({ uuid })).code, 'NODE_ROUTE_BUSY');
    cache.get = async () => null;
    db.readRevision = async () => {
        throw Error('synthetic database revision outage');
    };
    await assert.rejects(registry.isCurrent(initial), (error) => error.code === 'NODE_ROUTE_BUSY');
    db.readRevision = async () => revision;
    revision = randomUUID();
    db.nodes.findMany = async () => {
        throw Error('timeout exceeded when trying to connect');
    };
    await assert.rejects(registry.isCurrent(initial), (error) => error.code === 'NODE_ROUTE_BUSY');
    assert.equal((await service.getSystemStats({ uuid })).code, 'NODE_ROUTE_BUSY');
    assert.equal(dispatched, 0);
    db.nodes.findMany = async () => [
        { ...row(), controlAddresses: [{ address: 'changed.invalid', enabled: true }] },
    ];
    assert.equal(await registry.isCurrent(initial), false);
});

test('actual AxiosModule Nest provider resolves canonical registry with DB edit fences and historical job isolation', async (t) => {
    let rows = [row()],
        queries = 0,
        revisionReads = 0,
        revision = randomUUID();
    const values = new Map();
    const cache = {
        get: async (key) => values.get(key) ?? null,
        set: async (key, value) => {
            values.set(key, value);
        },
    };
    const db = {
        $queryRaw: async () => [{ mode: 'custom', revision: 1 }],
        readRevision: async () => {
            revisionReads++;
            return revision;
        },
        nodes: {
            findMany: async (args) => {
                queries++;
                assert.equal(args.select.controlAddresses, true);
                await new Promise((r) => setImmediate(r));
                return structuredClone(rows);
            },
        },
    };
    const edited = () => {
        revision = randomUUID();
    };
    class Dependencies {}
    Global()(Dependencies);
    Module({
        providers: [
            { provide: PrismaService, useValue: db },
            { provide: RawCacheService, useValue: cache },
            { provide: TypedConfigService, useValue: {} },
            XrayModeService,
        ],
        exports: [PrismaService, RawCacheService, TypedConfigService, XrayModeService],
    })(Dependencies);
    class Root {}
    Module({ imports: [Dependencies, AxiosModule] })(Root);
    const app = await NestFactory.createApplicationContext(Root, {
        logger: false,
        abortOnError: false,
    });
    t.after(() => app.close());
    const registry = app.get(NodeRouteRegistryService);
    assert.equal(app.get(NodeRouteRegistry), registry);
    assert.equal(app.get(AxiosService).routeRegistry, registry);
    assert.equal(app.get(AxiosService).xrayModes, app.get(XrayModeService));
    assert.deepEqual(await app.get(XrayModeService).get(), { mode: 'custom', revision: 1 });
    const initial = await Promise.all(Array.from({ length: 30 }, () => registry.get({ uuid })));
    assert.equal(queries, 1);
    assert(initial.every((config) => config.uuid === uuid));
    const priorReads = revisionReads;
    assert.equal(await registry.isCurrent(initial[0]), true);
    assert.equal(queries, 1);
    assert(revisionReads > priorReads);
    rows[0].controlAddresses = [{ address: 'edited.invalid', enabled: true }];
    edited();
    assert.equal(await registry.isCurrent(initial[0]), false);
    assert.equal(queries, 2);
    const changed = await registry.get({ uuid });
    assert.equal(changed.address, 'primary.invalid');
    assert.deepEqual(routeCandidates(changed), ['edited.invalid']);
    assert.equal(queries, 2);
    rows = [{ ...row(), uuid: '22222222-2222-4222-8222-222222222222' }];
    edited();
    await assert.rejects(
        registry.get({ address: 'primary.invalid', port: 2222, proxyUrl: null }),
        /UUID required/,
    );
    await assert.rejects(registry.get({ uuid }), /not registered/);
    rows = [{ ...row(), isDisabled: true }];
    edited();
    const disabled = await registry.get({ uuid });
    assert.equal(await registry.isCurrent(disabled), false);
    assert.equal(await registry.isCurrent(disabled, true), true);
    rows = [{ ...row(), ips: [null, 'invalid', { ip: 'dns.invalid', status: 'MANAGEMENT' }] }];
    edited();
    assert.deepEqual((await registry.get({ uuid })).ips, []);
    assert.deepEqual(routeCandidates(await registry.get({ uuid })), [
        'primary.invalid',
        '192.0.2.1',
    ]);
    rows = [{ ...row(), ips: null }];
    edited();
    assert.deepEqual((await registry.get({ uuid })).ips, []);
    rows = [
        {
            ...row(),
            controlAddresses: [{ address: 'https://invalid.invalid/path', enabled: true }],
        },
    ];
    edited();
    assert.deepEqual(routeCandidates(await registry.get({ uuid })), []);
    rows = [row()];
    edited();
    const beforeCollision = await registry.get({ uuid });
    rows.push({
        ...row(),
        uuid: '22222222-2222-4222-8222-222222222222',
        address: '192.0.2.1',
        ips: [],
        controlAddresses: [{ address: '192.0.2.1', enabled: true }],
    });
    edited();
    assert.deepEqual((await registry.get({ uuid })).ips, []);
    assert.deepEqual(routeCandidates(await registry.get({ uuid })), ['primary.invalid']);
    assert.equal((await registry.get({ uuid: rows[1].uuid })).address, '192.0.2.1');
    assert.equal(await registry.isCurrent(beforeCollision), false);
    rows = [
        {
            ...row(),
            address: '2001:db8::1',
            ips: [],
            controlAddresses: [{ address: '2001:db8::1', enabled: true }],
        },
        {
            ...row(),
            uuid: '22222222-2222-4222-8222-222222222222',
            address: '[2001:0db8:0:0:0:0:0:1]',
            ips: [],
            controlAddresses: [{ address: '[2001:0db8:0:0:0:0:0:1]', enabled: true }],
        },
    ];
    edited();
    await assert.rejects(registry.get({ uuid }), /multiple registered nodes/);
    rows[1].port = 3333;
    edited();
    assert.equal((await registry.get({ uuid })).uuid, uuid);
    rows = [
        {
            ...row(),
            address: 'legacy.invalid',
            port: null,
            ips: [],
            controlAddresses: [{ address: 'legacy.invalid', enabled: true }],
        },
        {
            ...row(),
            uuid: '22222222-2222-4222-8222-222222222222',
            address: 'LEGACY.INVALID',
            port: 80,
            ips: [],
            controlAddresses: [{ address: 'LEGACY.INVALID', enabled: true }],
        },
    ];
    const prior = process.env.REMNACUST_LEGACY_HTTP_NODES;
    process.env.REMNACUST_LEGACY_HTTP_NODES = 'LEGACY.INVALID';
    try {
        edited();
        await assert.rejects(registry.get({ uuid }), /multiple registered nodes/);
    } finally {
        if (prior === undefined) delete process.env.REMNACUST_LEGACY_HTTP_NODES;
        else process.env.REMNACUST_LEGACY_HTTP_NODES = prior;
    }
});
