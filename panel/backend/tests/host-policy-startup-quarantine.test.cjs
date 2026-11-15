require('reflect-metadata');
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');

const { fixture } = require('./host-policy-startup-isolation.test.cjs');
const { autoselectRouteUuid } = load(
    path.join(__dirname, '../src/common/host-policy/autoselect-route-policy.ts'),
);
const { hostPolicyRetryKey, HOST_POLICY_QUARANTINED } = load(
    path.join(__dirname, '../src/common/host-policy/sync-host-policy-for-start.ts'),
);

function actual166() {
    const f = fixture();
    const owner = {
        ...f.host,
        uuid: '88888888-8888-4888-8888-888888888888',
        inboundUuid: '99999999-9999-4999-8999-999999999999',
        inboundTag: 'remote',
        boundNodes: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
        tags: ['LTE_LIMITER'],
    };
    const unrelated = {
        ...owner,
        uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        userSpeed: 5,
        trafficMultiplier: 2,
        tags: [],
    };
    const bases = [
        f.host,
        ...Array.from({ length: 5 }, (_, index) => ({
            ...f.host,
            uuid: '1000000' + index + '-1111-4111-8111-111111111111',
        })),
    ];
    f.state.extraHosts.push(...bases.slice(1), owner, unrelated);
    f.state.tags.push({ tag: 'LTE_LIMITER', userLimit: '1024', trafficMultiplier: 1 });
    const incoming = {
        uuid: autoselectRouteUuid(owner.uuid, f.host.uuid),
        ownerUuid: owner.uuid,
        sourceUuid: f.host.uuid,
    };
    f.state.routes.push(incoming, {
        uuid: autoselectRouteUuid(f.host.uuid, unrelated.uuid),
        ownerUuid: f.host.uuid,
        sourceUuid: unrelated.uuid,
    });
    const identity = {
        userId: '1',
        allowed: true,
        profileUuid: f.host.profileUuid,
        inboundTag: 'vless',
        hwid: null,
        parent: '77777777-7777-4777-8777-777777777777',
        expireAt: new Date('2099-01-01'),
    };
    f.state.identities = bases.map((host) => ({ ...identity, hostUuid: host.uuid }));
    f.state.identities.push({ ...identity, hostUuid: incoming.uuid, quotaHostUuid: owner.uuid });
    return { ...f, owner, unrelated, bases, incoming, retryKey: hostPolicyRetryKey(f.node.uuid) };
}

test('a basic legacy shared inbound cannot veto an independent modern inbound quota', async () => {
    const f = fixture();
    f.state.peerAvailable = true;
    const peerUuid = f.inventory[1].uuid;
    const health = f.policies.axios.getNodeHealth;
    f.policies.axios.getNodeHealth = async (...args) => {
        const result = await health(...args);
        return args[0].uuid === peerUuid && result.isOk
            ? { ...result, response: { ...result.response, nodeVersion: '3.4.3' } }
            : result;
    };
    const isolated = {
        ...f.host,
        uuid: '88888888-8888-4888-8888-888888888888',
        inboundUuid: '99999999-9999-4999-8999-999999999999',
        inboundTag: 'isolated',
        boundNodes: [f.node.uuid],
        userLimit: '1024',
    };
    f.state.extraHosts.push(isolated);
    f.inventory[0].inbounds.push(isolated.inboundUuid);
    f.node.activeInbounds.push({ uuid: isolated.inboundUuid, tag: 'isolated', protocol: 'vless' });
    f.values.set(`xera:host-policy:stats:${f.node.uuid}`, true);
    await f.run();
    assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    assert.deepEqual(f.posts[0].body.protectedInbounds, ['isolated']);
    assert.equal(f.posts[0].body.groups[`host:${isolated.uuid}`].blockAll, false);
    assert(!f.node.lastStatusMessage?.startsWith(HOST_POLICY_QUARANTINED));
    f.host.userLimit = '2048';
    await assert.rejects(
        f.policies.withCompatibilitySnapshot([f.node.uuid], () => f.policies.syncNode(f.node)),
        /Legacy credentials/,
    );
    assert.equal(
        f.posts.length,
        1,
        'A real restriction on the legacy inbound still forbids release',
    );
});

function assertPartial(f) {
    assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    assert.equal(f.starts[0].body.internals.forceRestart, false);
    assert.equal(f.node.isConnected, true);
    assert(f.node.lastStatusMessage.startsWith(HOST_POLICY_QUARANTINED));
    assert(f.values.get(f.retryKey) > Date.now());
    const body = f.posts[0].body;
    assert.equal(body.groups['tag:LTE_LIMITER'].blockAll, true);
    assert.equal(body.groups['host:' + f.host.uuid].blockAll, false);
    assert.equal(body.groups['host:' + f.unrelated.uuid], undefined);
    assert.deepEqual(body.hosts[f.incoming.uuid.replaceAll('-', '')].allowedIdentities, {});
    for (const host of f.bases) {
        const key = f.policies.keys(
            f.state.identities.find((row) => row.hostUuid === host.uuid),
        ).username;
        assert.equal(body.hosts[host.uuid.replaceAll('-', '')].allowedIdentities[key], true);
    }
    assert(body.protectedInbounds.includes('vless'));
}

test('actual166: six basic hosts start while incoming LTE alias is denied and remote speed is irrelevant', async () => {
    const f = actual166();
    await f.run();
    assertPartial(f);
});

test('zero-only independent configuration does not claim quarantined access', async () => {
    const f = fixture();
    await f.run();
    assert.equal(f.starts.length, 1);
    assert.equal(f.node.lastStatusMessage, null);
    assert.equal(f.posts[0].body.groups['host:' + f.host.uuid].blockAll, false);
});

test('an unchanged applied ACK still retains actual quarantine and retry', async () => {
    const f = actual166();
    const send = f.policies.axios.hostPolicy;
    f.policies.axios.hostPolicy = async (opts, body) => {
        const result = await send(opts, body);
        return body
            ? {
                  isOk: true,
                  response: { version: 'xera-host-policy-v2', applied: true, unchanged: true },
              }
            : result;
    };
    await f.run();
    assertPartial(f);
});

test('strict callers cannot use configuration quarantine to grant financial policy', async () => {
    const f = actual166();
    await assert.rejects(
        f.policies.withCompatibilitySnapshot([f.node.uuid], () => f.policies.syncNode(f.node)),
        /capabilities unavailable/,
    );
    assert.equal(f.posts.length, 0);
    assert.equal(f.state.revisions, 0);
});

test('a subsequent default sync cannot overwrite the saved deny without peer proof', async () => {
    const f = actual166();
    await f.run();
    assertPartial(f);
    await assert.rejects(f.policies.syncNode(f.node), /peer proof unavailable/);
    assert.equal(f.posts.length, 1);
    assert.equal(f.state.revisions, 1);
    assert(f.values.get(f.retryKey) > Date.now());
});

test('a second worker and an evicted peer cache cannot reopen the partial policy', async () => {
    const first = actual166();
    await first.run();
    const second = actual166();
    for (const [key, value] of first.values) second.values.set(key, value);
    await assert.rejects(second.policies.syncNode(second.node), /peer proof unavailable/);
    assert.equal(second.posts.length, 0);
    assert.equal(second.state.revisions, 0);
});

test('cache outage preserves deny and cannot claim successful restoration', async () => {
    const f = actual166();
    await f.run();
    const retryAt = f.values.get(f.retryKey);
    f.policies.cache.get = async () => {
        throw Error('Synthetic cache outage');
    };
    await assert.rejects(f.policies.syncNode(f.node), /cache outage/);
    assert.equal(f.posts.length, 1);
    assert.equal(f.values.get(f.retryKey), retryAt);
    assert(f.node.lastStatusMessage.startsWith(HOST_POLICY_QUARANTINED));
});

test('full peer proof and acknowledged policy restore alias and clear partial retry status', async () => {
    const f = actual166();
    await f.run();
    assertPartial(f);
    f.state.peerAvailable = true;
    for (const uuid of [f.node.uuid, f.inventory[1].uuid, ...f.owner.boundNodes])
        f.values.set('xera:host-policy:stats:' + uuid, {});
    await f.run();
    assert.equal(f.starts.length, 2);
    assert.equal(f.posts.length, 2);
    assert.equal(f.posts[1].body.groups['tag:LTE_LIMITER'].blockAll, false);
    const key = f.policies.keys(
        f.state.identities.find((row) => row.hostUuid === f.incoming.uuid),
    ).username;
    assert.equal(
        f.posts[1].body.hosts[f.incoming.uuid.replaceAll('-', '')].allowedIdentities[key],
        true,
    );
    assert.equal(f.node.lastStatusMessage, null);
    assert.equal(f.values.has(f.retryKey), false);
});

test('fresh immutable peer proof survives cache eviction between discovery and SQL lock', async () => {
    const f = actual166();
    f.state.peerAvailable = true;
    const crypto = require('node:crypto');
    const peer = f.inventory[1];
    const connection = crypto
        .createHash('sha256')
        .update(JSON.stringify([peer.address, peer.port, peer.proxyUrl]))
        .digest('hex');
    const peerKey = 'xera:host-policy:capabilities:v2:' + peer.uuid + ':' + connection;
    let locked = false,
        peerCacheReads = 0;
    const get = f.policies.cache.get;
    f.policies.cache.get = async (key) => {
        if (locked && key === peerKey) peerCacheReads++;
        return get(key);
    };
    f.state.beforeTransaction = () => {
        locked = true;
        f.values.delete(peerKey);
    };
    await f.run();
    assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    assert.equal(f.posts.length, 1);
    assert.equal(f.node.lastStatusMessage, null);
    assert.equal(peerCacheReads, 0);
});

test('a failed restoration ACK retains quarantine and retry without another core start', async () => {
    const f = actual166();
    await f.run();
    f.state.peerAvailable = true;
    f.state.policyStage = false;
    await f.run();
    assert.equal(f.starts.length, 1);
    assert(f.values.get(f.retryKey) > Date.now());
    assert.equal(f.posts.length, 2);
});

test('late LTE restriction is quarantined under node SQL ownership before delivery', async () => {
    const f = actual166();
    f.state.tags[0].userLimit = '0';
    f.state.beforeTransaction = () => {
        f.state.tags[0].userLimit = '1024';
    };
    await f.run();
    assertPartial(f);
});

test('a quota coordinator beginning under ownership still prevents isolated configuration', async () => {
    const f = actual166();
    f.state.beforeTransaction = () => {
        f.state.quotaMode = { phase: 'FENCING', instance: 'test' };
    };
    await f.run();
    assert.equal(f.starts.length, 0);
    assert.equal(f.posts.length, 0);
    assert.equal(f.state.revisions, 0);
});

test('unknown parent attribution on a legacy shared inbound denies the entire inbound', async () => {
    const f = actual166();
    const crypto = require('node:crypto');
    const peer = f.inventory[1];
    const connection = crypto
        .createHash('sha256')
        .update(JSON.stringify([peer.address, peer.port, peer.proxyUrl]))
        .digest('hex');
    f.values.set('xera:host-policy:capabilities:v2:' + peer.uuid + ':' + connection, {
        native: true,
        supported: false,
        checkedAt: Date.now() - 60001,
    });
    await f.run();
    assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    assert(f.posts[0].body.protectedInbounds.includes('vless'));
    assert.deepEqual(f.posts[0].body.hosts, {});
    assert(f.node.lastStatusMessage.startsWith(HOST_POLICY_QUARANTINED));
    assert(f.values.get(f.retryKey) > Date.now());
});

test('a fresh native peer cannot clear financial denial while parent attribution remains ambiguous', async () => {
    const f = actual166();
    await f.run();
    const peer = f.inventory[1];
    const health = f.policies.axios.getNodeHealth;
    f.policies.axios.getNodeHealth = async (opts) =>
        opts.uuid === peer.uuid
            ? {
                  isOk: true,
                  nodeControlRevision: peer.controlRevision,
                  response: { isAlive: true, nodeVersion: '3.4.3' },
              }
            : health(opts);
    await f.policies.discoverCapabilities(peer, true);
    await assert.rejects(f.policies.syncNode(f.node), /Legacy credentials/);
    assert.equal(f.posts.length, 1);
    assert(f.values.get(f.retryKey) > Date.now());
});

test('a changed peer revision and fallback route cannot release an older modern proof', async () => {
    const f = actual166();
    await f.run();
    f.state.peerAvailable = true;
    const peer = f.inventory[1];
    const r1 = peer.controlRevision;
    const proof = await f.policies.discoverCapabilities(peer, true);
    assert.equal(proof.proofRevision, r1);
    peer.controlRevision = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    peer.controlAddresses = [{ address: 'new-peer.invalid', enabled: true }];
    const probes = f.probes.filter((probe) => probe.uuid === peer.uuid).length;
    await assert.rejects(f.policies.syncNode(f.node), /peer proof unavailable/);
    assert.equal(f.posts.length, 1);
    assert.equal(f.probes.filter((probe) => probe.uuid === peer.uuid).length, probes);
    const health = f.policies.axios.getNodeHealth;
    f.policies.axios.getNodeHealth = async (opts) =>
        opts.uuid === peer.uuid
            ? {
                  isOk: true,
                  nodeControlRevision: peer.controlRevision,
                  response: { isAlive: true, nodeVersion: '3.4.3' },
              }
            : health(opts);
    const current = await f.policies.discoverCapabilities(peer);
    assert.equal(current.native, true);
    assert.equal(current.proofRevision, peer.controlRevision);
    assert.notEqual(current.proofContext, proof.proofContext);
});

test('an immutable snapshot cannot release after its peer routing revision changes under the lock', async () => {
    const f = actual166();
    f.state.peerAvailable = true;
    f.state.beforeTransaction = () => {
        f.inventory[1].controlRevision = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    };
    await f.run();
    assert.equal(f.posts.length, 0);
    assert.equal(f.starts.length, 0);
    assert.equal(f.state.revisions, 0);
});

test('routing addresses changing without the same revision cannot reuse the old proof', async () => {
    const f = actual166();
    await f.run();
    f.state.peerAvailable = true;
    await f.policies.discoverCapabilities(f.inventory[1], true);
    f.inventory[1].controlAddresses = [{ address: 'new-peer.invalid', enabled: true }];
    await assert.rejects(f.policies.syncNode(f.node), /peer proof unavailable/);
    assert.equal(f.posts.length, 1);
});

test('SQL JSON and actual NodeEntity normalization share the same proof context', () => {
    const f = actual166();
    const { NodesEntity } = load(
        path.join(__dirname, '../src/modules/nodes/entities/nodes.entity.ts'),
        {
            '@modules/config-profiles/entities': {},
            '@modules/infra-billing/entities': {},
        },
    );
    const raw = {
        ...f.node,
        ips: [],
        controlAddresses: [{ enabled: true, address: 'TARGET.INVALID.' }],
    };
    const entity = new NodesEntity(raw);
    assert.equal(f.policies.proofContext(raw), f.policies.proofContext(entity));
    assert.equal(
        f.policies.proofContext({ ...raw, ips: undefined }),
        f.policies.proofContext(entity),
    );
});

test('actual HostAccess grant carries routing context and reuses cached proof for both policy syncs', async () => {
    const f = actual166();
    f.state.peerAvailable = true;
    await f.run();
    for (const row of f.state.identities) row.rawInbound = { protocol: 'vless', settings: {} };
    let fields;
    const query = {
        select(value) {
            fields = value;
            return this;
        },
        execute: async () => [Object.fromEntries(fields.map((field) => [field, f.node[field]]))],
    };
    const { HostAccessService } = require('./upstream-filter-fixture.cjs').source(
        'common/host-policy/host-access.service.ts',
        {
            '@common/utils/bounded-work-queue': load(
                path.join(__dirname, '../src/common/utils/bounded-work-queue.ts'),
            ),
            '@common/utils/settle-concurrent': load(
                path.join(__dirname, '../src/common/utils/settle-concurrent.ts'),
            ),
            '@common/utils/flow': load(
                path.join(__dirname, '../src/common/utils/flow/get-vless-flow.ts'),
            ),
        },
    );
    const access = new HostAccessService({ kysely: { selectFrom: () => query } }, f.policies, {
        addUser: async () => ({ isOk: true, response: { success: true } }),
        deleteUser: async () => assert.fail('No revoked users in this grant'),
    });
    const probes = f.probes.length,
        posts = f.posts.length;
    assert.equal(await access.synchronizeUser(1n), true);
    assert.equal(f.probes.length, probes);
    assert.equal(f.posts.length, posts + 2);
    assert(
        fields.includes('controlRevision') &&
            fields.includes('controlAddresses') &&
            fields.includes('ips'),
    );
});

test('a delayed old reply remains bound to its locally observed revision', async () => {
    const f = actual166();
    await f.run();
    f.state.peerAvailable = true;
    const peer = f.inventory[1],
        r1 = peer.controlRevision;
    const send = f.policies.axios.hostPolicy;
    f.policies.axios.hostPolicy = async (opts, body) => {
        const result = await send(opts, body);
        if (!body && opts.uuid === peer.uuid) {
            peer.controlRevision = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
            result.response.proofRevision = peer.controlRevision;
            result.nodeControlRevision = r1;
        }
        return result;
    };
    const proof = await f.policies.discoverCapabilities(peer, true);
    assert.equal(proof.proofRevision, r1);
    await assert.rejects(f.policies.syncNode(f.node), /peer proof unavailable/);
    assert.equal(f.posts.length, 1);
});

test('quarantine requires acknowledged revision and routed modern capabilities', async () => {
    for (const field of [
        'policyRevisionsSupported',
        'routedDeviceSpeedLimitsSupported',
        'supported',
    ]) {
        const f = actual166();
        f.state.caps[field] = false;
        await f.run();
        assert.equal(f.starts.length, 0, field);
        assert.equal(f.posts.length, 0, field);
    }
});

test('scheduler restores an evicted retry marker from durable partial status without clearing deny', async () => {
    const f = actual166();
    await f.run();
    f.values.delete(f.retryKey);
    const query = {
        select() {
            return this;
        },
        where() {
            return this;
        },
        execute: async () => [f.node],
    };
    f.policies.db.kysely.selectFrom = () => query;
    await f.policies.syncConnected();
    assert(f.values.get(f.retryKey) > Date.now());
    assert.equal(f.posts.length, 1);
});
