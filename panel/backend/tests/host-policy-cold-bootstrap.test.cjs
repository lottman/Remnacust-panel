const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const { fixture } = require('./host-policy-startup-isolation.test.cjs');

const root = path.join(__dirname, '../src/common/host-policy');
const CORE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INSTANCE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RESERVES = 'remnacust-quota-reserves-v1';

function coldFixture() {
    const f = fixture();
    Object.assign(f.state.caps, {
        quotaReservesSupported: true,
        quotaRegistrationsSupported: true,
        quotaWatermarksSupported: true,
        quotaFencesSupported: true,
        usageReceiptsSupported: true,
        coreIncarnationSupported: true,
        userQuotaReservesSupported: true,
        unreservedUsageSupported: true,
        offlineReserves: null,
        coreProcessId: null,
        quotaInstanceId: null,
        userQuotaRequired: false,
    });
    const { QuotaCoordinatorService } = load(path.join(root, 'quota-coordinator.service.ts'), {
        '@common/database': {},
        '@common/axios': {},
        './host-policy.service': { HOST_POLICY_VERSION: f.state.caps.version },
        './durable-usage.service': {},
        './quota-cutover.service': {},
        './quota-transition.service': {},
        './usage-effects.service': {},
    });
    f.coordinator = new QuotaCoordinatorService(
        {},
        {},
        f.policies.axios,
        f.policies,
        {},
        {},
        {},
        {},
    );
    f.evidence = () => f.coordinator.preflightEvidence({ ...f.node, phase: null, instance: null });
    f.sync = () =>
        f.policies.withCompatibilitySnapshot(
            [f.node.uuid],
            () => f.policies.syncNode(f.node),
            false,
            'configuration',
        );
    return f;
}

function assertLegacyBody(f) {
    assert.equal(f.posts.length, 1);
    const body = f.posts[0].body;
    assert.equal(body.version, 'xera-host-policy-v2');
    assert.match(body.revision, /^[1-9][0-9]*$/);
    for (const field of ['offlineReserves', 'userQuota', 'registrations', 'quotaCheckpoint'])
        assert.equal(Object.hasOwn(body, field), false, field);
    assert.equal(f.state.quotaMode, null);
    return body;
}

function stockPeer(f) {
    const health = f.policies.axios.getNodeHealth;
    f.policies.axios.getNodeHealth = async (node) =>
        node.uuid === f.node.uuid
            ? health(node)
            : {
                  isOk: true,
                  nodeControlRevision: node.controlRevision,
                  response: {
                      isAlive: true,
                      xrayInternalStatusCached: true,
                      nodeVersion: '3.4.6',
                  },
              };
}

test('actual cold applyNodePolicy can stage legacy isolation before coordinator has a core identity', async () => {
    const f = coldFixture();
    await assert.rejects(f.evidence(), (error) => error.code === 'NODE_UPGRADE_REQUIRED');
    await f.sync();
    const body = assertLegacyBody(f);
    assert(body.protectedInbounds.includes('vless'));
    const identity = f.policies.keys({
        userId: '1',
        hostUuid: f.host.uuid,
        hwid: null,
        parent: '77777777-7777-4777-8777-777777777777',
    });
    assert.equal(
        body.hosts[f.host.uuid.replaceAll('-', '')].allowedIdentities[identity.username],
        true,
    );
    assert.equal(f.starts.length, 0);
});

test('actual configuration START does not wait for quota preflight and then supplies live core evidence', async () => {
    const f = coldFixture();
    const start = f.configuration.axios.startXray;
    f.configuration.axios.startXray = async (...args) => {
        assertLegacyBody(f);
        const result = await start(...args);
        f.state.caps.coreProcessId = CORE;
        return result;
    };
    await assert.rejects(f.evidence(), (error) => error.code === 'NODE_UPGRADE_REQUIRED');
    await f.run();
    assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    assertLegacyBody(f);
    assert.deepEqual(await f.evidence(), { core: CORE, instance: null });
    assert.equal(f.state.quotaMode, null);
});

test('confirmed stock shared-inbound peer preserves basic cold bootstrap without fleet activation', async () => {
    const f = coldFixture();
    stockPeer(f);
    await f.run();
    assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    assertLegacyBody(f);
    assert.equal(f.values.get(`remnacust:node-compatibility:${f.node.uuid}`), null);
});

test('confirmed stock shared-inbound credentials cannot bypass required host quotas during bootstrap', async () => {
    const f = coldFixture();
    stockPeer(f);
    f.host.userLimit = '1024';
    await assert.rejects(f.sync(), /Legacy credentials cannot safely enforce/);
    assert.equal(f.posts.length, 0);
    assert.equal(f.state.revisions, 0);
    await f.run();
    assert.equal(f.starts.length, 0);
    assert.equal(f.posts.length, 0);
    assert.match(f.node.lastStatusMessage, /^\[HOST_POLICY_PENDING\]/);
});

for (const [label, restrict] of [
    ['host quota', (f) => (f.host.userLimit = '1024')],
    ['billing multiplier', (f) => (f.host.trafficMultiplier = 2)],
    ['user pause', (f) => f.state.controls.push({ paused: true })],
])
    test(`cold bootstrap quarantines ${label} with an unknown shared peer`, async () => {
        const f = coldFixture();
        restrict(f);
        await f.run();
        assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
        const body = assertLegacyBody(f);
        assert.equal(body.groups[`host:${f.host.uuid}`].blockAll, true);
        assert.deepEqual(body.hosts[f.host.uuid.replaceAll('-', '')].allowedIdentities, {});
        assert.match(f.node.lastStatusMessage, /^\[HOST_POLICY_QUARANTINED\]/);
    });

test('strict legacy bootstrap keeps quota groups closed until every node has fresh statistics', async () => {
    const f = coldFixture();
    f.state.peerAvailable = true;
    f.host.userLimit = '1024';
    await f.run();
    assert.equal(f.starts.length, 1, f.node.lastStatusMessage);
    const body = assertLegacyBody(f);
    assert.equal(body.groups[`host:${f.host.uuid}`].blockAll, true);
    for (const node of f.inventory) f.values.set(`xera:host-policy:stats:${node.uuid}`, true);
    await f.run();
    assert.equal(f.starts.length, 2, f.node.lastStatusMessage);
    assert.equal(f.posts[1].body.groups[`host:${f.host.uuid}`].blockAll, false);
    assert.equal(Object.hasOwn(f.posts[1].body, 'offlineReserves'), false);
});

for (const running of [false, true])
    test(`saved autonomous policy without DB mode cannot be replaced, running=${running}`, async () => {
        const f = coldFixture();
        f.state.peerAvailable = true;
        f.state.caps.offlineReserves = RESERVES;
        f.state.caps.coreProcessId = running ? CORE : null;
        f.state.caps.quotaInstanceId = INSTANCE;
        const health = f.policies.axios.getNodeHealth;
        f.policies.axios.getNodeHealth = async (node) => {
            const result = await health(node);
            if (result.isOk) result.response.xrayInternalStatusCached = running;
            return result;
        };
        await assert.rejects(f.sync(), (error) => error.code === 'QUOTA_COORDINATION_REQUIRED');
        assert.equal(f.posts.length, 0);
        assert.equal(f.state.revisions, 0);
        await f.run();
        assert.equal(f.starts.length, 0);
        assert.equal(f.posts.length, 0);
        assert.match(f.node.lastStatusMessage, /^\[HOST_POLICY_PENDING\]/);
        assert.equal(f.node.isConnected, running);
    });

test('the locked second guard refuses autonomous replacement if DB mode disappears during discovery', async () => {
    const f = coldFixture();
    f.state.peerAvailable = true;
    f.state.caps.offlineReserves = RESERVES;
    f.state.caps.quotaInstanceId = INSTANCE;
    f.state.quotaMode = { phase: 'FENCING', instance: INSTANCE, userQuota: true };
    f.state.beforeTransaction = () => {
        f.state.quotaMode = null;
    };
    await assert.rejects(f.sync(), /quota coordinator state must be recovered/);
    assert.equal(f.posts.length, 0);
    assert.equal(f.state.revisions, 0);
});

test('a quota mode committed during bootstrap discovery cannot fall back to legacy policy', async () => {
    const f = coldFixture();
    f.state.beforeTransaction = () => {
        f.state.quotaMode = { phase: 'FENCING', instance: null, userQuota: true };
    };
    await assert.rejects(f.sync(), /capabilities unavailable/);
    assert.equal(f.posts.length, 0);
    assert.equal(f.state.revisions, 0);
});
