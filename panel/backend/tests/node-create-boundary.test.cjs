const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { Prisma } = require('@prisma/client');
const { ERRORS } = require('../libs/contract/build/backend/constants/errors/errors.js');

const base = path.join(__dirname, '../src/modules/nodes');
function aliases(file) {
    return Object.fromEntries([...fs.readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)]
        .filter(match => match[1].startsWith('@common/') || match[1].startsWith('@modules/') ||
            match[1].startsWith('@queue/') || match[1].startsWith('@integration-'))
        .map(match => [match[1], {}]));
}
class Entity { constructor(value) { Object.assign(this, value); } }
class Response { constructor(node, system) { this.node = node; this.system = system; } }
const serviceFile = path.join(base, 'nodes.service.ts');
const { NodesService } = load(serviceFile, {
    ...aliases(serviceFile),
    '@contract/constants': { ERRORS, EVENTS: { NODE: { CREATED: 'node.created' } } },
    '@common/types': { ok: response => ({ isOk: true, response }), fail: error => ({ isOk: false, ...error }) },
    '@common/utils': { wrapBigInt: value => value == null ? value : BigInt(value), mapDefined: (v, fn) => v === undefined ? undefined : fn(v) },
    '@common/utils/nano': { toNano: value => BigInt(value * 1e9) },
    '@integration-modules/notifications/interfaces': { NodeEvent: Entity },
    '@modules/config-profiles/queries/get-config-profile-by-uuid': { GetConfigProfileByUuidQuery: Entity },
    './entities': { NodesEntity: Entity }, './models': { NodeResponseModel: Response },
    './repositories/nodes.repository': {}, './nodes-system-cache.service': {}, './dtos': {},
});
const body = () => ({ name: '  new-node  ', address: '  node.example  ', configProfile: {
    activeConfigProfileUuid: 'profile', activeInbounds: ['inbound'],
} });
function fixture() {
    const calls = [];
    const repository = { create: async (entity, inbounds) => {
        calls.push({ entity, inbounds }); return { ...entity, uuid: 'created' };
    } };
    const queues = { startNode: async () => {} };
    const queries = { execute: async () => ({ isOk: true, response: { inbounds: [{ uuid: 'inbound' }] } }) };
    const cache = { getOne: async () => ({ system: null, versions: null, xrayUptime: 0, onlineUsers: 0 }) };
    const events = { emit() {} };
    const service = new NodesService(repository, events, queues, queries, {}, cache);
    service.logger = { error() {}, warn() {} };
    return { service, repository, queues, queries, cache, events, calls };
}

test('missing profile or mismatched inbound cannot leave a node behind', async () => {
    for (const response of [
        { isOk: false, ...ERRORS.CONFIG_PROFILE_NOT_FOUND },
        { isOk: false, ...ERRORS.GET_CONFIG_PROFILE_BY_UUID_ERROR },
        { isOk: true, response: { inbounds: [{ uuid: 'other' }] } },
    ]) {
        const f = fixture(); f.queries.execute = async () => response;
        const result = await f.service.createNode(body());
        assert.equal(result.isOk, false); assert.equal(f.calls.length, 0);
        assert.equal(result.code, response.isOk
            ? ERRORS.CONFIG_PROFILE_INBOUND_NOT_FOUND_IN_SPECIFIED_PROFILE.code : response.code);
    }
});

test('valid create normalizes fields and writes selected inbounds in the same operation', async () => {
    const f = fixture(), input = body(); input.configProfile.activeInbounds.push('inbound');
    assert.equal((await f.service.createNode(input)).isOk, true);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].entity.name, 'new-node');
    assert.equal(f.calls[0].entity.address, 'node.example');
    assert.deepEqual(f.calls[0].inbounds, ['inbound']);
});

test('committed create remains successful when queue, notification and cache are unavailable', async () => {
    const f = fixture();
    f.queues.startNode = async () => { throw Error('queue unavailable'); };
    f.events.emit = () => { throw Error('notification unavailable'); };
    f.cache.getOne = async () => { throw Error('cache unavailable'); };
    const result = await f.service.createNode(body());
    assert.equal(result.isOk, true); assert.equal(f.calls.length, 1);
    assert.match(result.response.node.lastStatusMessage, /startup is pending/);
    assert.equal(result.response.system.system, null);
});

test('genuine name/address conflicts remain explicit; existing nodes are never overwritten', async () => {
    for (const [field, expected] of [['name', 'A033'], ['address', 'A034']]) {
        const f = fixture();
        f.repository.create = async () => { throw new Prisma.PrismaClientKnownRequestError('conflict', {
            code: 'P2002', clientVersion: '6.19.3', meta: { modelName: 'Nodes', target: [field] },
        }); };
        assert.equal((await f.service.createNode(body())).code, expected);
    }
});

test('repository sends one atomic nested write; it does not create inbound links afterwards', async () => {
    const file = path.join(base, 'repositories/nodes.repository.ts');
    const { NodesRepository } = load(file, {
        ...aliases(file), '../entities/nodes.entity': { NodesEntity: Entity },
        '../nodes.converter': {},
    });
    let request;
    const repository = new NodesRepository({ tx: { nodes: { create: async value => {
        request = value; return { uuid: 'created' };
    } } } }, {}, { fromEntityToPrismaModel: value => value });
    await repository.create({ name: 'new-node' }, ['inbound']);
    assert.deepEqual(request.data.configProfileInboundsToNodes, {
        createMany: { data: [{ configProfileInboundUuid: 'inbound' }] },
    });
    await repository.create({ name: 'legacy-call' });
    assert.equal(request.data.configProfileInboundsToNodes, undefined);
});
