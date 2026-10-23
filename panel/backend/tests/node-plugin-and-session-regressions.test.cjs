const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const root = path.resolve(__dirname, '../src');
function mocked(file, overrides) {
    const mocks = {};
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g))
        if ((match[1].startsWith('@') && !match[1].startsWith('@nestjs/')) || match[1].startsWith('.')) mocks[match[1]] = {};
    return load(file, { ...mocks, ...overrides });
}

const { QueryNodesQueueProcessor } = mocked(path.join(root, 'queue/_nodes/processors/query-nodes.processor.ts'), {
    '@modules/nodes/queries/find-nodes-by-criteria': { FindNodesByCriteriaQuery: class {} },
    '../../queue.enum': { QUEUES_NAMES: { NODES: { QUERY_NODES: 'test' } } },
    '../constants': { NODES_JOB_NAMES: { CONNECTIONS_BY_USER: 'scan' } },
});
const nodes = ['A', 'B'].map((name, i) => ({ uuid: `00000000-0000-4000-8000-00000000000${i}`, name, address: name, port: 443, countryCode: 'US' }));
async function scan(responses, selected = nodes) {
    const progress = [];
    const worker = new QueryNodesQueueProcessor({ getIpsList: async (_data, opts) => {
        const result = responses[opts.address];
        if (result instanceof Error) throw result;
        return result;
    } }, { execute: async () => ({ isOk: true, response: selected }) }, {}, { getOrThrow: () => false });
    const result = await worker.process({ name: 'scan', data: { userId: 42 }, updateProgress: async p => progress.push(p) });
    return { result, progress };
}
test('all failed session polls fail instead of claiming no connections', async () => {
    const { result, progress } = await scan({ A: { isOk: false }, B: new Error('timeout') });
    assert.equal(result.success, false);
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(new Set(result.failedNodes.map(n => n.nodeName)), new Set(['A', 'B']));
    assert.equal(progress.at(-1).percent, 100);
});
test('partial session scans retain observations and explicitly identify failed nodes', async () => {
    const { result } = await scan({ A: { isOk: true, response: { ips: ['203.0.113.1'] } }, B: { isOk: false } });
    assert.equal(result.success, true);
    assert.equal(result.nodes[0].ips[0].ip, '203.0.113.1');
    assert.deepEqual(result.failedNodes, [{ nodeUuid: nodes[1].uuid, nodeName: 'B' }]);
});
test('successful empty session polls remain empty, malformed responses count as failures', async () => {
    const empty = { isOk: true, response: { ips: [] } };
    assert.equal((await scan({ A: empty, B: empty })).result.success, true);
    const { result } = await scan({ A: empty, B: { isOk: true, response: {} } });
    assert.equal(result.success, true);
    assert.deepEqual(result.nodes, []);
    assert.equal(result.failedNodes.length, 1);
    assert.equal((await scan({}, [])).result.success, true);
});

class NodeQuery {} class PluginQuery {} class ManagedQuery {}
const { NodePluginsProcessor } = mocked(path.join(root, 'queue/_nodes/processors/node-plugins.processor.ts'), {
    '@modules/nodes/queries/get-node-by-uuid': { GetNodeByUuidQuery: NodeQuery },
    '@modules/node-plugins/queries/get-plugin-by-uuid': { GetPluginByUuidQuery: PluginQuery },
    '@modules/nodes/queries/get-port-plan-node-uuids': { GetPortPlanNodeUuidsQuery: ManagedQuery },
    '../../queue.enum': { QUEUES_NAMES: { NODES: { PLUGINS: 'test' } } },
    '../constants': { NODES_JOB_NAMES: { SYNC_NODE_PLUGINS: 'sync' } },
});
test('legacy plugin delivery and removal never acknowledge rejected node application', async () => {
    for (const activePluginUuid of ['plugin', null]) for (const answer of [{ isOk: true, response: { accepted: false } }, { isOk: false, message: 'timeout' }]) {
        const worker = new NodePluginsProcessor({ syncNodePlugins: async () => answer }, { execute: async q => q instanceof ManagedQuery ? [] : { isOk: true, response: q instanceof NodeQuery ? { uuid: 'node', activePluginUuid } : { uuid: 'plugin', pluginConfig: {}, name: 'test' } } }, {}, {});
        const result = await worker.process({ name: 'sync', data: { nodeUuid: 'node' } });
        assert.equal(result.success, false);
        assert.ok(result.error);
    }
});
test('positive plugin ACK is accepted and managed nodes use the configuration coordinator', async () => {
    let applied = 0;
    const worker = new NodePluginsProcessor({ syncNodePlugins: async () => ({ isOk: true, response: { accepted: true } }) }, { execute: async q => q instanceof ManagedQuery ? [] : { isOk: true, response: q instanceof NodeQuery ? { uuid: 'node', activePluginUuid: 'plugin' } : { uuid: 'plugin', pluginConfig: {} } } }, {}, { apply: async () => applied++ });
    assert.equal((await worker.process({ name: 'sync', data: { nodeUuid: 'node' } })).success, true);
    worker.queryBus.execute = async () => ['node'];
    await worker.process({ name: 'sync', data: { nodeUuid: 'node' } });
    assert.equal(applied, 1);
});

test('plugin transport converts a negative ACK to failure for every caller', async () => {
    const { AxiosService } = mocked(path.join(root, 'common/axios/axios.service.ts'), {
        '@contract/constants': { ERRORS: { NODE_ERROR_WITH_MSG: { withMessage: message => ({ message }) } } },
        '@remnawave/node-contract': { SyncCommand: { url: '/sync' }, GetNodeHealthCheckCommand: { url: '/health' } },
        '@common/utils/node-version': { nodeSupportsPlugins: version => version === 'supported' },
        '../types': { ok: response => ({ isOk: true, response }), fail: error => ({ isOk: false, ...error }) },
    });
    const service = Object.create(AxiosService.prototype);
    service.nodeVersions = new Map();
    service.getNodeVersion = async () => ({ isOk: true, response: 'supported' });
    for (const accepted of [true, false, undefined]) {
        service.request = async () => ({ isOk: true, response: { accepted } });
        assert.equal((await service.syncNodePlugins({ plugin: {} }, {})).isOk, accepted === true);
    }
    service.request = async () => ({ isOk: true, response: { accepted: false } });
    assert.equal((await service.syncNodePlugins({ plugin: null }, {})).isOk, true, 'Retain the historical already-absent response');
    service.nodeVersions.set(service.connectionKey({}), { strictPluginAck: true });
    assert.equal((await service.syncNodePlugins({ plugin: null }, {})).isOk, false, 'A strict node rejection must never be normalized');
    service.getNodeVersion = AxiosService.prototype.getNodeVersion;
    service.versionRequests = new Map();
    for (const strict of [true, false]) {
        service.nodeVersions.clear();
        service.request = async ({ label }) => label === 'GET NODE HEALTH'
            ? { isOk: true, response: { isAlive: true, nodeVersion: 'supported', ...(strict ? { pluginSyncAckSupported: true } : {}) } }
            : { isOk: true, response: { accepted: false } };
        assert.equal((await service.syncNodePlugins({ plugin: null }, {})).isOk, !strict, 'Health capability must control compatibility, not a guessed release number');
    }
    service.getNodeVersion = async () => ({ isOk: true, response: 'old' });
    service.request = async () => assert.fail('Unsupported nodes must not receive this request');
    assert.equal((await service.syncNodePlugins({ plugin: null }, {})).isOk, true);
    assert.equal((await service.syncNodePlugins({ plugin: {} }, {})).isOk, false);
});

test('torrent reports map device credentials to their owner while preserving raw Xray evidence', async () => {
    class UserQuery { constructor(where) { this.where = where; } }
    class CreateReport { constructor(entity) { this.entity = entity; } }
    class ReportEntity { constructor(value) { Object.assign(this, value); } }
    const { UserEventsQueueProcessor } = mocked(path.join(root, 'queue/_users/processors/user-events.processor.ts'), {
        '@common/utils/device-identity': load(path.join(root, 'common/utils/device-identity.ts')),
        '@modules/users/queries/get-user-by-unique-field': { GetUserByUniqueFieldQuery: UserQuery },
        '@modules/nodes/queries/get-node-by-uuid': { GetNodeByUuidQuery: NodeQuery },
        '@modules/node-plugins/commands/create-torrent-report': { CreateTorrentReportCommand: CreateReport },
        '@modules/node-plugins/entities': { BaseTorrentBlockerReportEntity: ReportEntity },
        '@libs/contracts/constants/events/events': { EVENTS: { TORRENT_BLOCKER: { REPORT: 'report' } } },
        '@integration-modules/notifications/interfaces': { TorrentBlockerEvent: class {} },
        '@queue/queue.enum': { QUEUES_NAMES: { USERS: { USER_EVENTS: 'test' } } },
        '../constants/users-job-name.constant': { USERS_JOB_NAMES: { FIRE_TORRENT_BLOCKER_EVENT: 'torrent' } },
    });
    const commands = [], queries = [];
    const worker = new UserEventsQueueProcessor({ execute: async query => { queries.push(query); return { isOk: true, response: { id: query instanceof UserQuery ? query.where.id : 7n } }; } }, { execute: async command => commands.push(command) }, {}, { emit() {} }, {});
    for (const id of ['42', `42~${'a'.repeat(24)}`, `42~${'a'.repeat(24)}~h${'b'.repeat(32)}`]) {
        const report = { actionReport: { userId: id }, xrayReport: { email: id } };
        await worker.process({ name: 'torrent', data: { id, event: 'report', nodeUuid: 'node', report } });
        const saved = commands.at(-1).entity;
        assert.equal(saved.userId, 42n);
        assert.equal(saved.report.actionReport.userId, '42');
        assert.equal(saved.report.xrayReport.email, id);
        assert.equal(report.actionReport.userId, id, 'Do not mutate raw queued input');
    }
    const before = queries.length;
    for (const id of ['42~bad', 'custom', '42suffix']) await worker.process({ name: 'torrent', data: { id, event: 'report' } });
    assert.equal(queries.length, before);
    assert.equal(commands.length, 3);
});
