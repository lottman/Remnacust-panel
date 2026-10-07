const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const scopes = load(path.join(__dirname, '../src/common/host-policy/host-policy-scopes.ts'));
const identity = load(path.join(__dirname, '../src/common/utils/host-identity.ts'));
function fixture(usage = [], paused = []) {
    const sql = (parts) => ({
        execute: async () => ({ rows: parts.join('').includes('xera_limit_state') ? usage.map(row => ({effectiveLimit:'100', ...row})) : parts.join('').includes('AND paused') ? paused.map(userId=>({userId})) : [] }),
    });
    sql.join = (v) => v;
    const { HostPolicyService, normalizePolicyDomain } = load(
        path.join(__dirname, '../src/common/host-policy/host-policy.service.ts'),
        {
            kysely: { sql },
            '@common/axios': {},
            '@common/database': {},
            '@common/raw-cache': {},
            '@common/config/app-config/typed-config.service': { TypedConfigService: class {} },
            '@common/utils/host-identity': identity,
            './host-policy-scopes': scopes,
            './destination-rule': load(path.join(__dirname, '../src/common/host-policy/destination-rule.ts')),
        },
    );
    const calls = [];
    const missing = new Set();
    const db = { kysely: { transaction: () => ({ execute: (fn) => fn({}) }) } };
    const service = new HostPolicyService(
        db,
        {
            hostPolicy: async (node, policy) => {
                calls.push({ node, policy });
                return { isOk: true, response: { version: 'xera-host-policy-v2', staged: true } };
            },
        },
        { get: async (key) => !missing.has(key.split(':').at(-1)) },
        { getOrThrow: () => 'test-secret' },
        { withTransaction: async (options, fn) => fn() },
    );
    const a = {
        uuid: '11111111-1111-4111-8111-111111111111',
        inboundUuid: 'i',
        inboundTag: 'same',
        nodes: [],
        boundNodes: ['a', 'b'],
        domains: null,
    };
    const b = { ...a, uuid: '22222222-2222-4222-8222-222222222222' };
    const group = {
        key: 'host:a',
        hostUuids: [a.uuid],
        nodeUuids: ['a', 'b'],
        userLimit: '100',
        trafficMultiplier: 1,
        userSpeed: 8,
        totalSpeed: 16,
        anchor: new Date(),
        resetValue: 0,
        resetUnit: 'DAYS',
    };
    const state = {
        hosts: [a, b],
        protectedInboundIds: new Set(['i']),
        groups: [group],
        identities: [
            {
                userId: '42',
                hostUuid: a.uuid,
                hwid: null,
                parent: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                allowed: true,
            },
        ],
    };
    service.scopes = async () => state;
    return { service, calls, missing, state, normalizePolicyDomain };
}
test('per-user and aggregate budgets stay inside their host; unknown samples fail closed', async () => {
    const { service, calls, missing, state } = fixture([{ userId: '42', used: '150' }]);
    missing.add('b');
    await service.syncNode({ uuid: 'a' });
    let g = calls[0].policy.groups['host:a'];
    assert.equal(g.blockAll, true);
    assert.deepEqual(g.blockedOwners, { 42: true });
    assert.equal(g.bytesPerSecond, 500000);
    assert.equal(g.totalBytesPerSecond, 1000000);
    const neighbors = calls[0].policy.hosts[state.hosts[1].uuid.replaceAll('-', '')];
    assert.deepEqual(neighbors.groups, []);
    missing.clear();
    await service.syncNode({ uuid: 'a' });
    assert.equal(calls[1].policy.groups['host:a'].blockAll, false);
});
test('user traffic quotas never become a shared host volume cap; matching groups still apply', async () => {
    const { service, calls, state } = fixture([
        { userId: '42', used: '300' },
        { userId: '43', used: '250' },
    ]);
    state.groups.push({ ...state.groups[0], key: 'tag:shared' });
    await service.syncNode({ uuid: 'a' });
    assert.equal(calls[0].policy.groups['host:a'].blockAll, false);
    assert.deepEqual(calls[0].policy.groups['host:a'].blockedOwners, { 42: true, 43: true });
    assert.deepEqual(calls[0].policy.hosts[state.hosts[0].uuid.replaceAll('-', '')].groups, [
        'host:a',
        'tag:shared',
    ]);
});
test('domains normalize URLs and reject unsupported rules', () => {
    const { normalizePolicyDomain: normalize } = fixture();
    assert.equal(normalize('https://T.ME/a'), 't.me');
    assert.equal(normalize('*.example.org'), 'example.org');
    for (const invalid of ['regexp:.*', 'geosite:telegram', 'https://', 'a..b', '-test.org'])
        assert.throws(() => normalize(invalid));
});

test('individual pause reaches node enforcement even when host has unlimited quota', async()=>{
    const {service,calls,state}=fixture([],['42']);
    state.groups[0].userLimit=null;
    await service.syncNode({uuid:'a'});
    assert.deepEqual(calls.at(-1).policy.groups['host:a'].blockedOwners,{'42':true});
    assert.equal(calls.at(-1).policy.groups['host:a'].blockAll,false);
});

test('disabled legacy domain rules do not prevent independent host limits from syncing', async () => {
    const { service, calls, state } = fixture();
    state.hosts[0].domains = { mode: 'OFF', domains: ['geosite:telegram'] };
    await service.syncNode({ uuid: 'a' });
    const host = calls[0].policy.hosts[state.hosts[0].uuid.replaceAll('-', '')];
    assert.equal(host.domainMode, 'OFF');
    assert.deepEqual(host.domains, []);
    assert.equal(calls[0].policy.groups['host:a'].bytesPerSecond, 500000);
});

test('tag speed is assigned per host while the aggregate speed and user quota stay shared', async () => {
    const { service, calls, state } = fixture([]);
    state.hosts[0] = {
        ...state.hosts[0],
        tags: ['shared'],
        userSpeed: 0,
        totalSpeed: 0,
        userLimit: null,
        trafficMultiplier: null,
    };
    state.hosts[1] = {
        ...state.hosts[1],
        tags: ['shared'],
        boundNodes: ['a'],
        userSpeed: 0,
        totalSpeed: 0,
        userLimit: null,
        trafficMultiplier: null,
    };
    state.groups = scopes.buildPolicyGroups(state.hosts, [
        {
            tag: 'shared',
            userSpeed: 2,
            totalSpeed: 20,
            userLimit: '1000',
            trafficMultiplier: 3,
            anchor: new Date(),
            resetValue: 0,
            resetUnit: 'DAYS',
        },
    ]);
    await service.syncNode({ uuid: 'a' });
    const groups = calls.at(-1).policy.groups;
    assert.equal(groups['tag:shared'].bytesPerSecond, 0);
    assert.equal(groups['tag:shared'].totalBytesPerSecond, 0);
    assert.equal(groups['tag-total:shared'].totalBytesPerSecond, 1250000);
    assert.equal(groups[`tag-host:shared:${state.hosts[0].uuid}`].bytesPerSecond, 125000);
    assert.equal(groups[`tag-host:shared:${state.hosts[1].uuid}`].bytesPerSecond, 250000);
    assert(
        !calls
            .at(-1)
            .policy.hosts[state.hosts[0].uuid.replaceAll('-', '')].groups.includes(
                `tag-host:shared:${state.hosts[1].uuid}`,
            ),
    );
});

test('tag switches isolate quota blocks, per-host user speed and shared speed independently', async () => {
    const { service, calls, state } = fixture([{userId:'42',used:'300'}]);
    const tag = {tag:'shared', userSpeed:2, totalSpeed:20, userLimit:'100', trafficMultiplier:1, anchor:new Date(), resetValue:0, resetUnit:'DAYS'};
    state.hosts = state.hosts.map((h, i) => ({...h, tags:['shared'], userLimit:null, userSpeed:0, totalSpeed:0,
        useTagTrafficLimit:i===1, useTagSpeedLimit:i===0, useTagTotalSpeedLimit:i===1}));
    state.groups = scopes.buildPolicyGroups(state.hosts,[tag]);
    await service.syncNode({uuid:'a'});
    const policy = calls.at(-1).policy;
    const a = policy.hosts[state.hosts[0].uuid.replaceAll('-','')];
    const b = policy.hosts[state.hosts[1].uuid.replaceAll('-','')];
    assert(!a.groups.includes('tag:shared'));
    assert(!a.groups.includes('tag-total:shared'));
    assert(a.groups.includes(`tag-host:shared:${state.hosts[0].uuid}`));
    assert(b.groups.includes('tag:shared'));
    assert(b.groups.includes('tag-total:shared'));
    assert(!b.groups.some(key=>key.startsWith('tag-host:')));
    assert.deepEqual(policy.groups['tag:shared'].blockedOwners,{'42':true});
    assert.deepEqual(policy.groups['tag-total:shared'].blockedOwners,{});
    state.hosts.forEach(h=>{h.tags=[]});
    state.groups=scopes.buildPolicyGroups(state.hosts,[tag]);
    await service.syncNode({uuid:'a'});
    assert(Object.keys(calls.at(-1).policy.groups).every(key=>key.startsWith('host:')),'no tag means no tag policy, even with saved switches');
});

test('an old node receives a closed host policy instead of silently ignoring IP restrictions', async () => {
    const { service, calls, state } = fixture();
    state.hosts[0].domains = { mode: 'DENY', domains: ['149.154.160.0/20'] };
    await service.syncNode({ uuid: 'a' });
    const policy = calls.findLast((call) => call.policy).policy;
    const host = policy.hosts[state.hosts[0].uuid.replaceAll('-', '')];
    assert.deepEqual(host.allowedIdentities, {});
    assert.equal(host.domainMode, 'ALLOW_ONLY');
    assert.deepEqual(host.domains, []);
});
