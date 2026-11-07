const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const { legacyAutoselectPolicy } = load(path.join(__dirname, '../src/common/host-policy/legacy-autoselect-policy.ts'));

test('legacy projection retains source limits and removes only routed identity ownership', () => {
    const state = {
        hosts: [
            { uuid: 'owner', nodes: [], boundNodes: ['owner-node'] },
            { uuid: 'source', nodes: ['source-node'], boundNodes: ['source-node', 'unselected'] },
            { uuid: 'route', quotaHostUuid: 'owner', sourceHostUuid: 'source', nodes: [], boundNodes: ['source-node'] },
        ],
        groups: [
            { key: 'host:owner', hostUuids: ['owner', 'route'], nodeUuids: ['owner-node', 'source-node'], userLimit: '300' },
            { key: 'host:source', hostUuids: ['source'], nodeUuids: ['source-node'], userLimit: '100', userSpeed: 7 },
        ],
        identities: [{ hostUuid: 'source', allowed: false }, { hostUuid: 'route', quotaHostUuid: 'owner', allowed: true }],
        protectedInboundIds: new Set(['inbound']),
    };
    const original = structuredClone(state);
    const legacy = legacyAutoselectPolicy(state);
    assert.deepEqual(legacy.hosts.map(host => host.uuid), ['owner', 'source']);
    assert.deepEqual(legacy.groups[0].nodeUuids, ['owner-node']);
    assert.equal(legacy.groups[1].userLimit, '100');
    assert.equal(legacy.groups[1].userSpeed, 7);
    assert.deepEqual(legacy.identities, [{ hostUuid: 'source', allowed: false }]);
    assert.deepEqual(legacy.protectedInboundIds, new Set(['inbound']));
    assert.deepEqual(state, original);
});

test('legacy cores receive source credentials without creating routed aliases', async () => {
    const { HostAccessService } = source('common/host-policy/host-access.service.ts');
    const service = Object.create(HostAccessService.prototype);
    service.policies = { routedIdentitySupport: async () => false };
    const user = { id: 1n };
    const hosts = [{ uuid: 'source', configProfileInboundUuid: 'inbound' }];
    const expected = new Map([['source', { vlessUuid: 'ordinary-source-key' }]]);
    service.prepare = async (...args) => { assert.deepEqual(args, [user, hosts]); return expected; };
    service.db = { get kysely() { return assert.fail('legacy autoselect must not insert routed identities'); } };
    assert.equal(await service.prepareAutoselect(user, 'owner', hosts), expected);
});

test('configuration identities omit aliases that are not supported by the selected fleet', async () => {
    const { HostAccessService } = source('common/host-policy/host-access.service.ts');
    const service = Object.create(HostAccessService.prototype);
    service.policies = {
        scopes: async () => ({ hosts: [{ uuid: 'source', inboundUuid: 'ordinary' }, { uuid: 'native-host', inboundUuid: 'native' }],
            legacyInboundIds: new Set(['native']), identities: ['source', 'native-host', 'unsupported-route']
                .map(hostUuid => ({ hostUuid, allowed: true, profileUuid: 'profile', inboundTag: 'in' })) }),
        keys: identity => ({ username: identity.hostUuid, vlessUuid: identity.hostUuid }),
    };
    assert.deepEqual((await service.configIdentities('profile')).map(value => value.id), ['source']);
});
