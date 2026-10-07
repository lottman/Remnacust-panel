const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const deferred = () => {
    let resolve;
    return { promise: new Promise((r) => (resolve = r)), resolve: (v) => resolve(v) };
};
function fixture() {
    const state = { allowed: true, denied: new Set(), queries: [], calls: [], active: 0, peak: 0 };
    const sql = (parts, ...args) => ({
        execute: async () => {
            state.queries.push(parts.join(''));
            return {
                rows: ['a', 'b'].map((hostUuid) => ({
                    hostUuid,
                    allowed: state.allowed && !state.denied.has(hostUuid),
                })),
            };
        },
    });
    sql.join = (v) => v;
    const { HostAccessService } = load(
        path.join(__dirname, '../src/common/host-policy/host-access.service.ts'),
        {
            kysely: { sql },
            '@common/axios': {},
            '@common/database': {},
            '@common/helpers/xray-config/ss-cipher': {},
            '@common/utils/flow': { getVlessFlow: () => '' },
            '@common/utils/settle-concurrent': load(
                path.join(__dirname, '../src/common/utils/settle-concurrent.ts'),
            ),
            '@common/utils/bounded-work-queue': load(
                path.join(__dirname, '../src/common/utils/bounded-work-queue.ts'),
            ),
            './host-policy.service': {},
        },
    );
    const hosts = [
        { uuid: 'a', nodes: ['online'], boundNodes: ['online', 'excluded'] },
        { uuid: 'b', nodes: [], boundNodes: ['unrelated'] },
    ];
    const identities = [
        {
            userId: '1',
            hostUuid: 'a',
            hwid: 'device',
            parent: 'parent',
            allowed: true,
            rawInbound: { protocol: 'vless' },
            inboundTag: 'in',
        },
        {
            userId: '1',
            hostUuid: 'b',
            hwid: 'old-device',
            parent: 'parent',
            allowed: true,
            rawInbound: { protocol: 'vless' },
            inboundTag: 'in',
        },
    ];
    const nodes = [
        { uuid: 'online', isConnected: true },
        { uuid: 'excluded', isConnected: false },
        { uuid: 'unrelated', isConnected: false },
    ];
    const policies = {
        scopes: async () => ({ hosts, identities, protectedInboundIds: new Set(['in']) }),
        keys: (k) => ({ username: k.hwid, vlessUuid: 'key' }),
        syncNode: async (n) => {
            state.calls.push('policy:' + n.uuid);
        },
    };
    const db = {
        kysely: { selectFrom: () => ({ select: () => ({ execute: async () => nodes }) }) },
    };
    const axios = {
        addUser: async (data, n) => {
            state.calls.push('add:' + n.uuid);
            return { isOk: true, response: { success: true } };
        },
        deleteUser: async () => ({
            isOk: true,
            response: { success: true, deviceRevocationSupported: true },
        }),
    };
    const service = new HostAccessService(db, policies, axios);
    const user = {
        id: 1n,
        vlessUuid: 'parent',
        hostIdentityContext: { hwid: 'device', parentVlessUuid: 'parent' },
    };
    const requested = [{ uuid: 'a', configProfileInboundUuid: 'in' }];
    return { service, state, policies, axios, user, requested, nodes, identities };
}
test('preparation synchronizes only requested hosts/device; full revoke still includes every bound node', async () => {
    const f = fixture();
    assert.equal((await f.service.prepare(f.user, f.requested)).size, 1);
    await Promise.all([...f.service.preparing.values()]);
    assert.deepEqual(f.state.calls, ['policy:online', 'add:online', 'policy:online']);
    assert.equal(await f.service.synchronizeUser(1n, undefined, true), false);
    assert.match(
        f.state.queries.find((q) => q.includes('INSERT')),
        /IS DISTINCT FROM/,
    );
});
test('overlapping requests share sync but each checks access after I/O', async () => {
    const f = fixture(),
        gate = deferred();
    let syncs = 0;
    f.service.synchronize = async () => {
        syncs++;
        await gate.promise;
        return { allSynchronized: true, readyHosts: new Set(['a']) };
    };
    const requests = [
        f.service.prepare(f.user, f.requested),
        f.service.prepare(f.user, f.requested),
    ];
    await new Promise((r) => setImmediate(r));
    assert.equal(syncs, 1);
    gate.resolve();
    await Promise.all(requests);
    assert.equal(f.state.queries.filter((q) => q.includes('AS "hostUuid"')).length, 4);
    await Promise.all([...f.service.preparing.values()]);
    assert.equal(f.service.preparing.size, 0);
});
test('block during issuance refuses keys and forces fresh synchronization', async () => {
    const f = fixture();
    let syncs = 0;
    f.service.synchronize = async () => {
        syncs++;
        f.state.allowed = false;
        return { allSynchronized: true, readyHosts: new Set(['a']) };
    };
    assert.equal((await f.service.prepare(f.user, f.requested)).get('a'), null);
    assert.equal(syncs, 2);
});
test('an offline protected host retains its scoped key without a shared credential fallback', async () => {
    const f = fixture();
    const online = (await f.service.prepare(f.user, f.requested)).get('a');
    await Promise.all([...f.service.preparing.values()]);
    f.state.calls.length = 0;
    f.nodes[0].isConnected = false;
    const offline = (await f.service.prepare(f.user, f.requested)).get('a');
    assert.equal(offline.vlessUuid, online.vlessUuid);
    assert.equal(offline.username, online.username);
    assert.notEqual(offline.vlessUuid, f.user.vlessUuid);
    assert(!f.state.calls.some((c) => c.startsWith('add:')));
});
test('one offline host does not prevent issuance for another connected host', async () => {
    const f = fixture();
    f.identities[1].hwid = 'device';
    f.requested.push({ uuid: 'b', configProfileInboundUuid: 'in' });
    const result = await f.service.prepare(f.user, f.requested);
    assert(result.get('a')?.vlessUuid);
    assert(result.get('b')?.vlessUuid);
    assert.equal(
        await f.service.synchronizeUser(1n, 'device', true),
        false,
        'revocation still requires all nodes',
    );
});
test('one denied host does not deny another authorized host', async () => {
    const f = fixture();
    f.state.denied.add('b');
    f.requested.push({ uuid: 'b', configProfileInboundUuid: 'in' });
    const result = await f.service.prepare(f.user, f.requested);
    assert(result.get('a')?.vlessUuid);
    assert.equal(result.get('b'), null);
});
test('a host backed by online and offline nodes remains available on its acknowledged node', async () => {
    const f = fixture();
    const state = await f.policies.scopes();
    state.hosts[0].nodes = [];
    assert((await f.service.prepare(f.user, f.requested)).get('a')?.vlessUuid);
    assert.equal(await f.service.synchronizeUser(1n, 'device'), false);
});
test('a node policy API failure does not remove authorized hosts', async () => {
    const f = fixture();
    f.nodes[2].isConnected = true;
    f.identities[1].hwid = 'device';
    f.requested.push({ uuid: 'b', configProfileInboundUuid: 'in' });
    f.policies.syncNode = async (n) => {
        if (n.uuid === 'unrelated') throw Error('unsupported');
    };
    const result = await f.service.prepare(f.user, f.requested);
    assert(result.get('a')?.vlessUuid);
    assert(result.get('b')?.vlessUuid);
});
test('a failed add acknowledgement retains the authorized scoped host key', async () => {
    const f = fixture();
    f.axios.addUser = async () => ({ isOk: true, response: { success: false } });
    const value = (await f.service.prepare(f.user, f.requested)).get('a');
    assert(value?.vlessUuid);
    assert.notEqual(value.vlessUuid, f.user.vlessUuid);
});
test('a failed final node policy refresh does not change host visibility', async () => {
    const f = fixture();
    let calls = 0;
    f.policies.syncNode = async () => {
        if (++calls === 2) throw Error('policy failed');
    };
    assert((await f.service.prepare(f.user, f.requested)).get('a')?.vlessUuid);
});

test('all node APIs may be offline while every authorized host remains listed', async () => {
    const f = fixture();
    f.identities[1].hwid = 'device';
    f.requested.push({ uuid: 'b', configProfileInboundUuid: 'in' });
    for (const node of f.nodes) node.isConnected = false;
    const result = await f.service.prepare(f.user, f.requested);
    assert(result.get('a')?.vlessUuid);
    assert(result.get('b')?.vlessUuid);
    assert.deepEqual(f.state.calls, []);
});

test('denied hosts remain excluded during a complete node API outage', async () => {
    const f = fixture();
    f.state.denied.add('a');
    for (const node of f.nodes) node.isConnected = false;
    assert.equal((await f.service.prepare(f.user, f.requested)).get('a'), null);
    assert.deepEqual(f.state.calls, []);
});
test('unprotected hosts keep normal upstream credentials without node synchronization', async () => {
    const f = fixture();
    f.requested[0].configProfileInboundUuid = 'ordinary';
    assert.equal((await f.service.prepare(f.user, f.requested)).size, 0);
    assert.deepEqual(f.state.calls, []);
});


test('a pending node synchronization cannot delay subscription credentials', async () => {
    const f = fixture(), gate = deferred();
    f.service.synchronize = async () => {
        await gate.promise;
        return { allSynchronized: true, readyHosts: new Set(['a']) };
    };
    let timer;
    try {
        const result = await Promise.race([
            f.service.prepare(f.user, f.requested),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('subscription waited for a node')), 200); })
        ]);
        assert(result.get('a')?.vlessUuid);
        assert.notEqual(result.get('a').vlessUuid, f.user.vlessUuid);
        assert.equal(f.service.preparing.size, 1, 'synchronization continues after response');
    } finally { clearTimeout(timer); gate.resolve(); await Promise.all([...f.service.preparing.values()]); }
});

test('successful synchronization is reused briefly while every request rechecks permission', async () => {
    const f = fixture(); let syncs = 0;
    f.service.synchronize = async () => { syncs++; return { allSynchronized: true, readyHosts: new Set(['a']) }; };
    assert((await f.service.prepare(f.user, f.requested)).get('a')?.vlessUuid);
    await Promise.all([...f.service.preparing.values()]);
    assert((await f.service.prepare(f.user, f.requested)).get('a')?.vlessUuid);
    assert.equal(syncs, 1);
    f.state.denied.add('a');
    assert.equal((await f.service.prepare(f.user, f.requested)).get('a'), null, 'sync cache cannot grant denied access');
    f.state.denied.clear();
    for (const key of f.service.synchronizedUntil.keys()) f.service.synchronizedUntil.set(key, 0);
    await f.service.prepare(f.user, f.requested); await Promise.all([...f.service.preparing.values()]);
    assert.equal(syncs, 2, 'expired success retries synchronization');
});

test('failed background synchronization is handled and retried without hiding a host', async () => {
    const f = fixture(); let syncs = 0;
    f.service.synchronize = async () => { syncs++; throw new Error('node unavailable'); };
    assert((await f.service.prepare(f.user, f.requested)).get('a')?.vlessUuid);
    await Promise.all([...f.service.preparing.values()]);
    assert.equal(f.service.synchronizedUntil.size, 0);
    assert((await f.service.prepare(f.user, f.requested)).get('a')?.vlessUuid);
    await Promise.all([...f.service.preparing.values()]);
    assert.equal(syncs, 2);
});

test('a burst of distinct subscribers keeps node work bounded without delaying delivery', async () => {
    const f = fixture(), gate = deferred();
    let active = 0, peak = 0, completed = 0;
    f.service.synchronize = async () => {
        active++; peak = Math.max(peak, active);
        try { await gate.promise; completed++; return { allSynchronized: true, readyHosts: new Set(['a']) }; }
        finally { active--; }
    };
    try {
        const results = await Promise.all(Array.from({length: 80}, (_, i) =>
            f.service.prepare({...f.user, id: BigInt(i + 1)}, f.requested)));
        assert(results.every(r => r.get('a')?.vlessUuid));
        assert(peak <= 4, `distinct subscribers started ${peak} parallel fleet synchronizations`);
        gate.resolve();
        await Promise.all([...f.service.preparing.values()]);
        assert.equal(completed, 80);
        assert.equal(f.service.preparing.size, 0);
    } finally { gate.resolve(); await Promise.all([...f.service.preparing.values()]); }
});
