require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const ts = require('typescript');
const { Module, Global } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const cqrs = require('@nestjs/cqrs');
class PrismaService {}
class RawCacheService {}
class TypedConfigService {}
class FixtureCqrsModule {}
Module({ providers: [{ provide: cqrs.CommandBus, useValue: { execute: async () => ({ isOk: false }) } }], exports: [cqrs.CommandBus] })(FixtureCqrsModule);
const mocks = {
    '@common/database/prisma.service': { PrismaService }, '@common/raw-cache': { RawCacheService },
    '@common/config/app-config/typed-config.service': { TypedConfigService },
    '@nestjs/cqrs': { ...cqrs, CqrsModule: FixtureCqrsModule },
    '@common/utils/bytes': { prettyBytesUtil: String }, '@common/utils/certs': { deriveSni: () => 'fixture.invalid' },
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@common/utils/node-version': { nodeSupportsCompression: () => false },
    '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
    '@contract/constants': { ERRORS: {} },
    '../types': { ok: response => ({ isOk: true, response }), fail: error => ({ isOk: false, ...error }) },
};
const loaded = new Map();
function source(filename) {
    if (loaded.has(filename)) return loaded.get(filename);
    const ref = { exports: {} }; loaded.set(filename, ref.exports);
    const local = createRequire(filename);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true,
    } }).outputText;
    new Function('require', 'module', 'exports', compiled)(id => {
        if (Object.hasOwn(mocks, id)) return mocks[id];
        const relative = id.startsWith('.') ? path.resolve(path.dirname(filename), id + '.ts') : '';
        if (relative && fs.existsSync(relative)) return source(relative);
        const index = id.startsWith('.') ? path.resolve(path.dirname(filename), id, 'index.ts') : '';
        if (index && fs.existsSync(index)) return source(index);
        return local(id);
    }, ref, ref.exports);
    loaded.set(filename, ref.exports); return ref.exports;
}
const root = path.join(__dirname, '../src/common/axios');
const { AxiosModule } = source(path.join(root, 'axios.module.ts'));
const { AxiosService } = source(path.join(root, 'axios.service.ts'));
const { NodeRouteRegistryService } = source(path.join(root, 'node-route-registry.service.ts'));
const { NodeRouteRegistry } = source(path.join(root, 'node-control-route.ts'));
const uuid = '11111111-1111-4111-8111-111111111111';
function row() { return { uuid, address: 'primary.invalid', port: 2222, proxyUrl: null, ips: [{ ip: '192.0.2.1', status: 'MANAGEMENT' }], isDisabled: false }; }

test('actual AxiosModule Nest provider resolves registry; cache, edit fence and historical job isolation work', async t => {
    let rows = [row()], queries = 0;
    const values = new Map();
    const cache = { get: async key => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); } };
    const db = { nodes: { findMany: async () => { queries++; await new Promise(r => setImmediate(r)); return structuredClone(rows); } } };
    class Dependencies {}
    Global()(Dependencies);
    Module({ providers: [{ provide: PrismaService, useValue: db }, { provide: RawCacheService, useValue: cache },
        { provide: TypedConfigService, useValue: {} }], exports: [PrismaService, RawCacheService, TypedConfigService] })(Dependencies);
    class Root {}
    Module({ imports: [Dependencies, AxiosModule] })(Root);
    const app = await NestFactory.createApplicationContext(Root, { logger: false, abortOnError: false });
    t.after(() => app.close());
    const registry = app.get(NodeRouteRegistryService);
    assert.equal(app.get(NodeRouteRegistry), registry);
    assert.equal(app.get(AxiosService).routeRegistry, registry);
    const initial = await Promise.all(Array.from({ length: 30 }, () => registry.get({ uuid })));
    assert.equal(queries, 1); assert(initial.every(config => config.uuid === uuid));
    assert.equal(await registry.isCurrent(initial[0]), true); assert.equal(queries, 1);
    rows[0].address = 'edited.invalid'; await registry.invalidate();
    assert.equal(await registry.isCurrent(initial[0]), false); assert.equal(queries, 2);
    const changed = await registry.get({ uuid }); assert.equal(changed.address, 'edited.invalid');
    assert.equal(queries, 2);
    rows = [{ ...row(), uuid: '22222222-2222-4222-8222-222222222222' }]; await registry.invalidate();
    await assert.rejects(registry.get({ address: 'primary.invalid', port: 2222, proxyUrl: null }), /UUID required/);
    await assert.rejects(registry.get({ uuid }), /not registered/);
    rows = [{ ...row(), isDisabled: true }]; await registry.invalidate();
    const disabled = await registry.get({ uuid }); assert.equal(await registry.isCurrent(disabled), false);
    assert.equal(await registry.isCurrent(disabled, true), true);
    rows = [{ ...row(), ips: [null, 'invalid', { ip: 'dns.invalid', status: 'MANAGEMENT' }] }]; await registry.invalidate();
    assert.deepEqual((await registry.get({ uuid })).ips, []);
    rows = [{ ...row(), ips: null }]; await registry.invalidate();
    assert.deepEqual((await registry.get({ uuid })).ips, []);
    rows = [{ ...row(), address: 'https://user:secret@other.invalid/path' }]; await registry.invalidate();
    await assert.rejects(registry.get({ uuid }), /not registered/);
    rows = [row()]; await registry.invalidate();
    const beforeCollision = await registry.get({ uuid });
    rows.push({ ...row(), uuid: '22222222-2222-4222-8222-222222222222', address: '192.0.2.1', ips: [] });
    await registry.invalidate();
    assert.deepEqual((await registry.get({ uuid })).ips, []);
    assert.equal((await registry.get({ uuid: rows[1].uuid })).address, '192.0.2.1');
    assert.equal(await registry.isCurrent(beforeCollision), false);
    rows = [{ ...row(), address: '2001:db8::1', ips: [] },
        { ...row(), uuid: '22222222-2222-4222-8222-222222222222', address: '[2001:0db8:0:0:0:0:0:1]', ips: [] }];
    await registry.invalidate(); await assert.rejects(registry.get({ uuid }), /multiple registered nodes/);
    rows[1].port = 3333; await registry.invalidate(); assert.equal((await registry.get({ uuid })).uuid, uuid);
    rows = [{ ...row(), address: 'legacy.invalid', port: null, ips: [] },
        { ...row(), uuid: '22222222-2222-4222-8222-222222222222', address: 'LEGACY.INVALID', port: 80, ips: [] }];
    const prior = process.env.REMNACUST_LEGACY_HTTP_NODES;
    process.env.REMNACUST_LEGACY_HTTP_NODES = 'LEGACY.INVALID';
    try {
        await registry.invalidate();
        await assert.rejects(registry.get({ uuid }), /multiple registered nodes/);
    } finally { if (prior === undefined) delete process.env.REMNACUST_LEGACY_HTTP_NODES; else process.env.REMNACUST_LEGACY_HTTP_NODES = prior; }
});
